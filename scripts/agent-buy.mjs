// scripts/agent-buy.mjs
//
// One real tokenized-stock BUY from the agent's burner wallet, standalone (no dev
// server). Mirrors the app executor: signed quote -> signed swap -> eth_call
// simulate -> broadcast. Reuses the hardened signing (server-clock offset + retry
// + 60s recv window + IPv4-first) and a viem RPC fallback. The allowance is
// assumed already set by scripts/agent-approve.mjs.
//
// Running THIS is the explicit go-ahead; it broadcasts a real swap.
// Run from repo root WITH WARP on:  node scripts/agent-buy.mjs
// Optional: BUY_TOKEN=0x...  BUY_USDT=1

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import dns from "node:dns";
import { createPublicClient, createWalletClient, http, fallback } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

dns.setDefaultResultOrder("ipv4first");

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
const BASE = process.env.BINANCE_WEB3_BASE_URL ?? "https://web3.binance.com/build";
const PK = process.env.AGENT_WALLET_PRIVATE_KEY ?? "";
if (!API_KEY || !SECRET || !/^0x[0-9a-fA-F]{64}$/.test(PK)) {
  console.error("Missing credentials or AGENT_WALLET_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const account = privateKeyToAccount(PK);
const API_PREFIX = "/api/v1";
const CHAIN = 56;
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18n;
const TOKEN = process.env.BUY_TOKEN || "0xa9ee28c80f960b889dfbd1902055218cba016f75"; // NVDAon
const USDT_IN = process.env.BUY_USDT || "1";
// Decimal-safe: the maker floor is 5 USD, and 5 USDT is only ~4.998 USD, so a
// BUY_USDT like 5.2 (not a whole number) is often what clears it.
function toBaseUnits(human, decimals) {
  const [whole, frac = ""] = String(human).split(".");
  const combined = whole + frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(combined || "0").toString();
}
const amount = toBaseUnits(USDT_IN, Number(USDT_DECIMALS));

// Slippage tolerance (percent) sent to both endpoints. A touch wider than the
// quote's default so a small move between simulate and inclusion can't revert.
const SLIPPAGE = process.env.BUY_SLIPPAGE || "1";
// Headroom over the quote's estimated gas: eth_call ignores the cap, so a tx
// that simulates fine can still run out of gas at the quote's exact limit.
const GAS_BUFFER = 200000n;

// --- Signed GET: server-clock offset + retry + 60s recv window ----------------
let clockOffsetMs = 0;
const SKEW_SAFETY_MS = 3000;
const RECV_WINDOW_MS = 60000;
const nowIso = () => new Date(Date.now() + clockOffsetMs - SKEW_SAFETY_MS).toISOString();
const sign = (ts, m, rp) =>
  createHmac("sha256", SECRET).update(`${ts}${m.toUpperCase()}${rp}`).digest("base64");

async function signedGet(path, attempts = 8) {
  const requestPath = `/build${API_PREFIX}${path}`;
  const url = `${BASE}${API_PREFIX}${path}`;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ts = nowIso();
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
      const serverMs = Number(body?.timestamp);
      if (Number.isFinite(serverMs) && serverMs > 0) clockOffsetMs = serverMs - Date.now();
      if (body?.code === 40103) {
        console.log(`  (40103 skew; offset ${clockOffsetMs}ms, retrying)`);
        continue;
      }
      return { http: res.status, body };
    } catch (e) {
      lastErr = e;
      console.log(`  (attempt ${i + 1}/${attempts} failed: ${e?.cause?.code ?? e?.message}; retrying 2s)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr ?? new Error("request failed");
}

// --- viem chain client with RPC fallback --------------------------------------
const RPCS = [
  process.env.BSC_RPC_URL,
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://binance.llamarpc.com",
  "https://1rpc.io/bnb",
  "https://bsc.drpc.org",
].filter((u, i, a) => !!u && a.indexOf(u) === i);
const transport = fallback(
  RPCS.map((u) => http(u, { timeout: 10000, retryCount: 1, retryDelay: 500 })),
  { rank: false },
);
const publicClient = createPublicClient({ chain: bsc, transport });
const walletClient = createWalletClient({ account, chain: bsc, transport });

const qs = (o) => new URLSearchParams(o).toString();
console.log(`=== agent buy: ${USDT_IN} USDT -> ${TOKEN} on BSC ===`);
console.log(`wallet: ${account.address}\n`);

// 1. Quote for a fresh quoteId.
const q = await signedGet(
  `/dex/aggregator/quote?${qs({
    binanceChainId: String(CHAIN),
    fromTokenAddress: USDT,
    toTokenAddress: TOKEN,
    amount,
    slippage: SLIPPAGE,
    userWalletAddress: account.address,
  })}`,
);
const route = Array.isArray(q.body?.data)
  ? q.body.data.find((r) => r.isBest) ?? q.body.data[0]
  : null;
if (!route?.quoteId) {
  console.log(`quote failed: code=${q.body?.code} ${q.body?.msg ?? ""}`);
  console.log("(If 40374 'insufficient liquidity', no maker at this size - the approve tx stands as proof.)");
  process.exit(1);
}
console.log(`quote ok: quoteId ${route.quoteId}, out ${route.toTokenAmount}`);

// 2. Swap -> executable tx.
const s = await signedGet(
  `/dex/aggregator/swap?${qs({
    binanceChainId: String(CHAIN),
    fromTokenAddress: USDT,
    toTokenAddress: TOKEN,
    amount,
    slippagePercent: SLIPPAGE,
    userWalletAddress: account.address,
    quoteId: route.quoteId,
  })}`,
);
const tx = s.body?.data?.tx;
if (!tx?.to || !tx?.data) {
  console.log(`swap failed: code=${s.body?.code} ${s.body?.msg ?? ""}`);
  process.exit(1);
}
console.log(`swap tx: to ${tx.to}, value ${tx.value}, gas ${tx.gas}`);

// 3. Simulate with the SAME gas limit we will broadcast with, so an out-of-gas
//    failure is caught here (eth_call without a cap would hide it).
const gasLimit = (tx.gas ? BigInt(tx.gas) : 450000n) + GAS_BUFFER;
try {
  await publicClient.call({
    account,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value ?? "0"),
    gas: gasLimit,
  });
  console.log(`simulation ok (gas ${gasLimit})`);
} catch (e) {
  console.log(`simulation reverted, NOT broadcasting: ${e?.shortMessage ?? e?.message ?? e}`);
  process.exit(1);
}

// 4. Broadcast + wait.
console.log("\nbroadcasting...");
const hash = await walletClient.sendTransaction({
  account,
  chain: bsc,
  to: tx.to,
  data: tx.data,
  value: BigInt(tx.value ?? "0"),
  gas: gasLimit,
});
console.log(`tx: ${hash}`);
console.log(`bscscan: https://bscscan.com/tx/${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`status: ${receipt.status} (block ${receipt.blockNumber})`);
if (receipt.status !== "success") {
  // Replay at the parent block to surface the actual revert reason.
  try {
    await publicClient.call({
      account,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value ?? "0"),
      gas: gasLimit,
      blockNumber: receipt.blockNumber - 1n,
    });
    console.log("revert reason: none returned");
  } catch (e) {
    console.log(`revert reason: ${e?.shortMessage ?? e?.message ?? e}`);
  }
}
console.log("\n=== done ===");
