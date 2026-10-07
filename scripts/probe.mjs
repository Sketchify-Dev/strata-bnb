// One-shot live API probe, round 4. Central question: do tokenized equities
// exist on BSC (chain 56) via this API at all? Approaches, all read-only:
//   1. Try token SEARCH endpoints (symbol/keyword) that don't need an address.
//   2. Re-try all-tokens across several chains + param spellings to see if ANY
//      chain returns a non-empty list (proves the endpoint works, locates RWAs).
//   3. Look for a dedicated tokenized-securities / RWA path.
// Reuses the verified HMAC scheme. Run: `node scripts/probe.mjs`.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const raw = readFileSync(resolve(here, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = loadEnv();
const API_KEY = env.BINANCE_WEB3_API_KEY;
const SECRET = env.BINANCE_WEB3_SECRET_KEY;
const BASE = env.BINANCE_WEB3_BASE_URL ?? "https://web3.binance.com/build";
const PREFIX = "/api/v1";

async function signedGet(path, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  const requestPath = `/build${PREFIX}${path}${qs}`;
  const url = `${BASE}${PREFIX}${path}${qs}`;
  const timestamp = new Date().toISOString();
  const preHash = `${timestamp}GET${requestPath}`;
  const sign = createHmac("sha256", SECRET).update(preHash).digest("base64");
  try {
    const res = await fetch(url, {
      headers: { "X-OC-APIKEY": API_KEY, "X-OC-TIMESTAMP": timestamp, "X-OC-SIGN": sign },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
    return { http: res.status, ...json };
  } catch (e) { return { http: 0, error: String(e) }; }
}

const dlen = (d) => (Array.isArray(d) ? `array(${d.length})` : d && typeof d === "object" ? `object{${Object.keys(d).join(",")}}` : String(d));

const run = async () => {
  console.log("=== 1. TOKEN SEARCH by symbol/keyword (no address needed) ===");
  const searchPaths = [
    "/dex/aggregator/search-token",
    "/dex/aggregator/token/search",
    "/dex/aggregator/tokens/search",
    "/dex/token/search",
    "/dex/aggregator/token-info",
    "/dex/aggregator/token",
  ];
  for (const p of searchPaths) {
    for (const q of [{ binanceChainId: 56, keyword: "AAPL" }, { binanceChainId: 56, symbol: "AAPL" }]) {
      const r = await signedGet(p, q);
      if (r.http !== 404) console.log(`${p} ${JSON.stringify(q)} -> http=${r.http} code=${r.code} msg=${r.msg} data=${dlen(r.data)}`);
    }
  }

  console.log("\n=== 2. all-tokens across chains + param spellings ===");
  // If ANY chain returns a non-empty list, the endpoint works and we can see RWAs.
  for (const chain of [56, 1, 8453, 501]) {
    for (const key of ["binanceChainId", "chainId", "chainIndex"]) {
      const r = await signedGet("/dex/aggregator/all-tokens", { [key]: chain });
      const n = Array.isArray(r.data) ? r.data.length : -1;
      if (r.code === 0 && n > 0) {
        console.log(`HIT ${key}=${chain} -> ${n} tokens. first: ${JSON.stringify(r.data[0])}`);
      } else {
        console.log(`${key}=${chain} -> code=${r.code} msg=${r.msg} data=${dlen(r.data)}`);
      }
    }
  }

  console.log("\n=== 3. dedicated tokenized-securities / RWA path probes ===");
  const rwaPaths = [
    "/dex/tokenized-securities/list",
    "/dex/tokenized-stock/list",
    "/dex/rwa/list",
    "/dex/rwa/tokens",
    "/dex/aggregator/rwa",
    "/dex/aggregator/tokenized-securities",
    "/dex/market/tokenized-securities",
  ];
  for (const p of rwaPaths) {
    for (const q of [{ binanceChainId: 56 }, { binanceChainId: 56, type: 2 }]) {
      const r = await signedGet(p, q);
      if (r.http !== 404) console.log(`${p} ${JSON.stringify(q)} -> http=${r.http} code=${r.code} msg=${r.msg} data=${dlen(r.data)}`);
    }
  }
  console.log("\n(paths that 404'd are omitted above)");
};

run();
