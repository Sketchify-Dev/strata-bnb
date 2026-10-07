// scripts/quote-probe.mjs
//
// Standalone diagnostic: can the Binance Web3 (Build) aggregator route a swap
// from USDT into Ondo tokenized-stock tokens on BNB Smart Chain? This is the
// question that gates the whole "buy basket" flow (the tokens may be
// market-hours-gated or mint/redeem-only rather than DEX-routable).
//
// No app imports. Mirrors lib/binance/sign.ts + client.ts signing exactly so a
// success here means the app's live client will work too.
//
// Run from the repo root:  node scripts/quote-probe.mjs
// Reads credentials from .env.local (never commit that file).

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// --- Load .env.local (simple KEY=VALUE parser; does not override real env) ----
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
    /* no .env.local -> rely on real env */
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

// RFQ (Ondo) quotes are wallet-bound. Use PROBE_WALLET if set, else a random
// well-formed address. A quote is a read: no funds move, nothing is signed.
const WALLET = process.env.PROBE_WALLET || "0x" + randomBytes(20).toString("hex");

const API_PREFIX = "/api/v1";
const CHAIN = 56;
// BSC USDT (BEP-20) uses 18 decimals, not 6.
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18n;

// WBNB is a control: a blue-chip pair that MUST route if the aggregator works.
// If the control routes but the tokenized stocks don't, they aren't DEX-tradable.
const TOKENS = [
  ["WBNB (control)", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"],
  ["AAPLon", "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4"],
  ["NVDAon", "0xa9ee28c80f960b889dfbd1902055218cba016f75"],
  ["MSFTon", "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3"],
];

function sign(timestamp, method, requestPath, body = "") {
  const pre = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac("sha256", SECRET).update(pre).digest("base64");
}

async function quote(toAddr, usdtWhole) {
  const amount = (BigInt(usdtWhole) * 10n ** USDT_DECIMALS).toString();
  // Build the query once; sign and send use the identical string.
  const qs = new URLSearchParams({
    binanceChainId: String(CHAIN),
    fromTokenAddress: USDT,
    toTokenAddress: toAddr,
    amount,
    slippage: "0.5",
    userWalletAddress: WALLET,
  }).toString();
  const path = `/dex/aggregator/quote?${qs}`;
  const requestPath = `/build${API_PREFIX}${path}`;
  const url = `${BASE}${API_PREFIX}${path}`;
  const ts = new Date().toISOString();
  const res = await fetch(url, {
    headers: {
      "X-OC-APIKEY": API_KEY,
      "X-OC-TIMESTAMP": ts,
      "X-OC-SIGN": sign(ts, "GET", requestPath),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { parseError: true };
  }
  return { http: res.status, body };
}

console.log("=== Aggregator quote probe: USDT -> Ondo tokenized stocks (BSC) ===");
console.log(`base: ${BASE}`);
console.log(`wallet: ${WALLET}  |  quoting 100 USDT in\n`);

for (const [name, addr] of TOKENS) {
  try {
    const { http, body } = await quote(addr, 100);
    const code = body?.code;
    const ok = code === 0 && body?.success !== false;
    console.log(`--- ${name}  ${addr}`);
    console.log(
      `    http=${http} code=${code} success=${body?.success} msg=${body?.msg ?? ""}`,
    );
    if (ok) {
      console.log("    DATA: " + JSON.stringify(body.data).slice(0, 1400));
    } else {
      console.log("    raw:  " + JSON.stringify(body).slice(0, 700));
    }
  } catch (e) {
    console.log(`--- ${name}: EXCEPTION ${e?.message ?? e}`);
  }
  console.log("");
}
console.log("=== done ===");
