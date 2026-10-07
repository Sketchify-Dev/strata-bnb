// scripts/agent-approve.mjs
//
// Broadcasts ONE real on-chain transaction from the agent's burner wallet: an
// ERC-20 approve of USDT to the aggregator router. This needs no market maker
// and no USDT minimum, only a cent of BNB gas, so it is a guaranteed real
// BscScan hash proving the agent transacts autonomously from its own wallet.
//
// It simulates first and refuses if there is no BNB for gas. Running THIS script
// is the explicit go-ahead; nothing broadcasts unless you run it.
//
// Run from repo root WITH your tunnel (WARP) on:
//   node scripts/agent-approve.mjs
// Optional: APPROVE_USDT=5  (allowance to set, default 5)

import { readFileSync } from "node:fs";
import dns from "node:dns";
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  erc20Abi,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

dns.setDefaultResultOrder("ipv4first"); // WSL+WARP: avoid IPv6 connect hangs

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

const PK = process.env.AGENT_WALLET_PRIVATE_KEY ?? "";
if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) {
  console.error("AGENT_WALLET_PRIVATE_KEY missing/invalid in .env.local");
  process.exit(1);
}
// Try several BSC RPCs so a flaky tunnel or a dead node rolls to the next.
const RPCS = [
  process.env.BSC_RPC_URL,
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://binance.llamarpc.com",
  "https://1rpc.io/bnb",
  "https://bsc.drpc.org",
].filter((u, i, a) => !!u && a.indexOf(u) === i);
const USDT = "0x55d398326f99059fF775485246999027B3197955";
// Aggregator router / approve target, observed stable across every Ondo leg.
const SPENDER = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const AMOUNT = BigInt(process.env.APPROVE_USDT ?? "5") * 10n ** 18n;

const account = privateKeyToAccount(PK);
const transport = fallback(
  RPCS.map((u) => http(u, { timeout: 10000, retryCount: 1, retryDelay: 500 })),
  { rank: false },
);
const publicClient = createPublicClient({ chain: bsc, transport });
const walletClient = createWalletClient({ account, chain: bsc, transport });

console.log(`=== agent approve (BSC) ===`);
console.log(`wallet: ${account.address}`);
console.log(`rpcs: ${RPCS.length} endpoints (fallback)`);
console.log(`approve ${formatUnits(AMOUNT, 18)} USDT -> ${SPENDER}\n`);

// Preflight: confirm there is gas, or abort before touching the chain.
const [bnbWei, usdtBase] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
]);
console.log(`balance: ${formatUnits(bnbWei, 18)} BNB (gas) | ${formatUnits(usdtBase, 18)} USDT`);
if (bnbWei === 0n) {
  console.error("No BNB for gas. Send a little BNB to the wallet first.");
  process.exit(1);
}

// Simulate, then broadcast.
const { request } = await publicClient.simulateContract({
  account,
  address: USDT,
  abi: erc20Abi,
  functionName: "approve",
  args: [SPENDER, AMOUNT],
});
console.log("\nsimulation ok, broadcasting...");
const hash = await walletClient.writeContract(request);
console.log(`tx: ${hash}`);
console.log(`bscscan: https://bscscan.com/tx/${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`status: ${receipt.status} (block ${receipt.blockNumber})`);
console.log("\n=== done ===");
