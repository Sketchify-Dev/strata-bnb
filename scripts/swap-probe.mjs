// scripts/swap-probe.mjs
//
// One-shot discovery: what does the aggregator's /dex/aggregator/swap endpoint
// return as the executable transaction? We already know /quote gives a quoteId;
// swap needs that quoteId plus slippagePercent (NOT slippage). This runs both
// back-to-back (quoteId TTL ~30s) and prints the full swap response so we can
// wire the real approve -> sign -> broadcast path to the exact field names.
//
// Mirrors lib/binance signing. Run from repo root WITH your VPN/WARP on:
//   node scripts/swap-probe.mjs
// Reads credentials + agent wallet from .env.local (never commit that file).

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import dns from "node:dns";

// WSL + WARP: Node/undici otherwise tries IPv6 through the tunnel and hangs,
// even though curl (IPv4) works. Force IPv4-first so the connect succeeds.
dns.setDefaultResultOrder("ipv4first");

function loadEnv(path) {
  try {
    const txt = readFileSync(path, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    /* rely on real env */
  }
}
loadEnv(new URL("../.env.local", import.meta.url).pathname);

const API_KEY = process.env.BINANCE_WEB3_API_KEY ?? "";
const SECRET = process.env.BINANCE_WEB3_SECRET_KEY ?? "";
const BASE =
  process.env.BINANCE_WEB3_BASE_URL ?? "https://web3.binance.com/build";
if (!API_KEY || !SECRET) {
  console.error("Missing BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY in .env.local");
  process.exit(1);
}

const API_PREFIX = "/api/v1";
const CHAIN = 56;
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18n;
// Default to METAon (what the dry run used); override with PROBE_TOKEN / PROBE_USDT.
const TOKEN = process.env.PROBE_TOKEN || "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6";
const USDT_IN = process.env.PROBE_USDT || "100";

// Use the real agent wallet if we can derive it (so the tx is realistic), else
// a random address (fine for discovering the response shape).
let WALLET = process.env.PROBE_WALLET || "";
if (!WALLET) {
  const pk = process.env.AGENT_WALLET_PRIVATE_KEY;
  if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk)) {
    try {
      const { privateKeyToAccount } = await import("viem/accounts");
      WALLET = privateKeyToAccount(pk).address;
    } catch {
      /* viem unavailable: fall through to random */
    }
  }
}
if (!WALLET) WALLET = "0x" + randomBytes(20).toString("hex");

function sign(ts, method, requestPath, body = "") {
  const pre = `${ts}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac("sha256", SECRET).update(pre).digest("base64");
}

// Clock handling for a laggy WARP tunnel: keep a server-time offset (survives WSL
// drift), bias the timestamp slightly into the PAST so variable latency never
// pushes it into the server's future-reject zone, and send the max recv_window
// (60s) so lag is absorbed. recv_window is a header, not part of the signature.
let clockOffsetMs = 0;
const SKEW_SAFETY_MS = 3000;
const RECV_WINDOW_MS = 60000;
const nowIso = () =>
  new Date(Date.now() + clockOffsetMs - SKEW_SAFETY_MS).toISOString();

async function signedGet(path, attempts = 10) {
  const requestPath = `/build${API_PREFIX}${path}`;
  const url = `${BASE}${API_PREFIX}${path}`;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ts = nowIso(); // offset-corrected + past-biased; re-signed each attempt
    try {
      const res = await fetch(url, {
        headers: {
          "X-OC-APIKEY": API_KEY,
          "X-OC-TIMESTAMP": ts,
          "X-OC-RECV-WINDOW": String(RECV_WINDOW_MS),
          "X-OC-SIGN": sign(ts, "GET", requestPath),
        },
      });
      let body;
      try {
        body = await res.json();
      } catch {
        body = { parseError: true };
      }
      // Keep the offset fresh from the server's own clock.
      const serverMs = Number(body?.timestamp);
      if (Number.isFinite(serverMs) && serverMs > 0) {
        clockOffsetMs = serverMs - Date.now();
      }
      if (body?.code === 40103) {
        console.log(`  (40103 skew; offset now ${clockOffsetMs}ms, retrying)`);
        continue;
      }
      return { http: res.status, body };
    } catch (e) {
      lastErr = e;
      const code = e?.cause?.code ?? e?.message ?? e;
      console.log(`  (attempt ${i + 1}/${attempts} failed: ${code}; retrying in 2s)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr ?? new Error("request failed");
}

console.log(`=== swap probe (BSC), wallet ${WALLET} ===\n`);

// Scan a few MAG7 names at small sizes for one with live RFQ liquidity right now,
// then run the swap on it to reveal the executable transaction shape. Override
// with PROBE_TOKEN / PROBE_USDT to force a specific pair.
const SCAN_TOKENS = [
  ["NVDAon", "0xa9ee28c80f960b889dfbd1902055218cba016f75"],
  ["AAPLon", "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4"],
  ["METAon", "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6"],
  ["MSFTon", "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3"],
];
const tokens = process.env.PROBE_TOKEN
  ? [["token", process.env.PROBE_TOKEN]]
  : SCAN_TOKENS;
const amounts = process.env.PROBE_USDT ? [process.env.PROBE_USDT] : ["25", "5"];

const qs = (obj) => new URLSearchParams(obj).toString();

let found = false;
outer: for (const [name, addr] of tokens) {
  for (const usdt of amounts) {
    const amount = (BigInt(usdt) * 10n ** USDT_DECIMALS).toString();
    const q = await signedGet(
      `/dex/aggregator/quote?${qs({
        binanceChainId: String(CHAIN),
        fromTokenAddress: USDT,
        toTokenAddress: addr,
        amount,
        slippage: "0.5",
        userWalletAddress: WALLET,
      })}`,
    );
    const route = Array.isArray(q.body?.data)
      ? q.body.data.find((r) => r.isBest) ?? q.body.data[0]
      : null;
    if (!route?.quoteId) {
      console.log(
        `quote ${name} ${usdt} USDT -> code=${q.body?.code} ${q.body?.msg ?? ""}`,
      );
      continue;
    }
    console.log(
      `quote ${name} ${usdt} USDT -> OK (quoteId ${route.quoteId}, out ${route.toTokenAmount})`,
    );
    const s = await signedGet(
      `/dex/aggregator/swap?${qs({
        binanceChainId: String(CHAIN),
        fromTokenAddress: USDT,
        toTokenAddress: addr,
        amount,
        slippagePercent: "0.5",
        userWalletAddress: WALLET,
        quoteId: route.quoteId,
      })}`,
    );
    console.log(
      `\n===== SWAP ${name} ${usdt} USDT  http=${s.http} code=${s.body?.code} msg=${s.body?.msg ?? ""} =====`,
    );
    console.log(JSON.stringify(s.body, null, 2));
    found = true;
    break outer;
  }
}
if (!found) {
  console.log(
    "\nNo liquid (token, amount) combo right now. Try again during US market hours, or force one with PROBE_TOKEN / PROBE_USDT.",
  );
}
console.log("\n=== done ===");
