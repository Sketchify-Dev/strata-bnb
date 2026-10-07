import { binanceConfig } from "./config";
import { buildPreHash, signHmac } from "./sign";
import { BinanceApiError, type OCResult } from "./types";
import dns from "node:dns";

// WSL / VPN tunnels: Node's fetch (undici) otherwise tries IPv6 first and hangs
// on connect even though IPv4 works. Force IPv4-first for every lookup.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* older Node without the API */
}

const API_PREFIX = "/api/v1";

type Primitive = string | number | boolean;
type Query = Record<string, Primitive | undefined | null>;

/** Deterministic query string; empty when there are no meaningful params. */
function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface SignedRequest {
  method: "GET" | "POST";
  /** Path after `/api/v1`, e.g. "/dex/market/price". */
  path: string;
  query?: Query;
  body?: unknown;
  /** X-OC-RECV-WINDOW in ms (default 60000, max 60000). */
  recvWindow?: number;
}

/** Attempts per signed request (covers 429s AND transient network/clock errors). */
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 4000;
// Max recv window on purpose: a laggy VPN can delay a request several seconds,
// and a wide window keeps the timestamp valid despite that.
const DEFAULT_RECV_WINDOW = 60000;
// Bias the signed timestamp into the past so tunnel latency never pushes it into
// the server's future-reject zone.
const SKEW_SAFETY_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backoff for a retry. Honors a Retry-After header (seconds) when present,
 * otherwise exponential with full jitter, capped. `attempt` is 0-based.
 */
function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && Number.isFinite(retryAfterSec)) {
    return Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS);
  }
  const ceil = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.floor(ceil / 2 + Math.random() * (ceil / 2)); // full jitter
}

// Offset between our clock and Binance server time (ms), learned from responses.
// Keeps signing valid through WSL clock drift without any manual resync.
let clockOffsetMs = 0;

function signedTimestamp(): string {
  return new Date(Date.now() + clockOffsetMs - SKEW_SAFETY_MS).toISOString();
}

function noteServerTime(serverMs: unknown): void {
  const ms = Number(serverMs);
  if (Number.isFinite(ms) && ms > 0) clockOffsetMs = ms - Date.now();
}

/** The underlying network cause code (ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, ...). */
function causeCode(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      return String((cause as { code: unknown }).code);
    }
    return err.message;
  }
  return "fetch failed";
}

/**
 * Signs and sends one request, then unwraps the OCResult envelope. Resilient to
 * the realities of running behind a flaky VPN on WSL: retries transient network
 * failures and rate limits, self-corrects clock skew from the server's own time,
 * and sends a wide recv window.
 */
export async function signedFetch<T>(req: SignedRequest): Promise<T> {
  if (!binanceConfig.hasCredentials) {
    throw new BinanceApiError(
      "Binance Web3 credentials missing: set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY.",
      -1,
      0,
    );
  }

  const { method, path, query, body, recvWindow } = req;
  const qs = method === "GET" ? buildQuery(query) : "";
  const requestPath = `/build${API_PREFIX}${path}${qs}`;
  const url = `${binanceConfig.baseUrl}${API_PREFIX}${path}${qs}`;
  const bodyStr =
    method === "POST" && body !== undefined ? JSON.stringify(body) : "";
  const recv = recvWindow ?? DEFAULT_RECV_WINDOW;

  let lastError: BinanceApiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Re-sign every attempt: the timestamp is part of the signature, and the
    // offset/clock may have been corrected since the last try.
    const timestamp = signedTimestamp();
    const signature = signHmac(
      buildPreHash({ timestamp, method, requestPath, body: bodyStr }),
      binanceConfig.secretKey,
    );

    const headers: Record<string, string> = {
      "X-OC-APIKEY": binanceConfig.apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-RECV-WINDOW": String(recv),
      "X-OC-SIGN": signature,
    };
    if (method === "POST") headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? bodyStr : undefined,
        cache: "no-store", // Build API responses must never be cached.
      });
    } catch (err) {
      // Network error (tunnel flap / connect timeout): back off and retry.
      lastError = new BinanceApiError(
        `Network error reaching Binance Web3 API (${causeCode(err)})`,
        -1,
        0,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      lastError = new BinanceApiError("Rate limited", 42900, 429, retryAfter);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      throw lastError;
    }

    let payload: OCResult<T> | null = null;
    try {
      payload = (await res.json()) as OCResult<T>;
    } catch {
      payload = null;
    }

    if (!payload) {
      lastError = new BinanceApiError(
        `Non-JSON response (HTTP ${res.status})`,
        -1,
        res.status,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    // Learn the server clock from every response (incl. errors) to self-correct.
    noteServerTime(payload.timestamp);

    // Clock skew: the offset was just corrected above; retry with it applied.
    if (payload.code === 40103) {
      lastError = new BinanceApiError(
        payload.msg || "Timestamp outside recv_window",
        40103,
        res.status,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(150);
        continue;
      }
      throw lastError;
    }

    // Several namespaces always answer HTTP 200 and signal errors via `code`,
    // so the envelope is the source of truth, not the HTTP status.
    if (payload.code !== 0 || payload.success === false) {
      throw new BinanceApiError(
        payload.msg || `Binance API error (code ${payload.code})`,
        payload.code,
        res.status,
      );
    }
    return payload.data;
  }

  throw lastError ?? new BinanceApiError("Request failed after retries", -1, 0);
}

/** GET a signed endpoint. */
export function binanceGet<T>(path: string, query?: Query, recvWindow?: number) {
  return signedFetch<T>({ method: "GET", path, query, recvWindow });
}

/** POST a signed endpoint. */
export function binancePost<T>(path: string, body?: unknown, recvWindow?: number) {
  return signedFetch<T>({ method: "POST", path, body, recvWindow });
}
