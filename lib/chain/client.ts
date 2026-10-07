// Server-only BSC chain clients, built on viem. This is the ONLY module that
// reads the agent's private key, and it exists solely to produce a signer; the
// key is never returned, logged, or sent anywhere. Do NOT import this from a
// client component: it would pull the key path into the browser bundle.

import dns from "node:dns";
import { createPublicClient, createWalletClient, http, fallback } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { getExecutionConfig } from "@/lib/agent/exec-config";

// WSL / VPN: force IPv4-first so viem's RPC calls don't hang on an IPv6 connect.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* older Node without the API */
}

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

// A spread of BSC RPCs so a flaky tunnel or a dead node just rolls to the next.
// Mixes the Binance node (reachable through WARP) with non-Binance providers.
const FALLBACK_RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
  "https://binance.llamarpc.com",
  "https://1rpc.io/bnb",
  "https://bsc.drpc.org",
];

function bscTransport() {
  const { rpcUrl } = getExecutionConfig();
  const urls = [rpcUrl, ...FALLBACK_RPCS].filter(
    (u, i, a) => !!u && a.indexOf(u) === i,
  );
  return fallback(
    urls.map((u) => http(u, { timeout: 10000, retryCount: 1, retryDelay: 500 })),
    { rank: false },
  );
}

function createPublic() {
  return createPublicClient({ chain: bsc, transport: bscTransport() });
}

// A public client is read-only and cheap to hold onto across requests.
let cachedPublic: ReturnType<typeof createPublic> | null = null;

export function getPublicClient() {
  if (!cachedPublic) cachedPublic = createPublic();
  return cachedPublic;
}

/** The burner agent account, or null when no valid key is configured. */
export function getAgentAccount() {
  const key = process.env.AGENT_WALLET_PRIVATE_KEY?.trim();
  if (!key || !KEY_RE.test(key)) return null;
  return privateKeyToAccount(key as `0x${string}`);
}

export function getAgentAddress(): `0x${string}` | null {
  return getAgentAccount()?.address ?? null;
}

/** A wallet client bound to the agent account, or null when unconfigured. */
export function getWalletClient() {
  const account = getAgentAccount();
  if (!account) return null;
  return createWalletClient({ account, chain: bsc, transport: bscTransport() });
}
