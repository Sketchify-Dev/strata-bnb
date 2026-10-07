"use client";

// Lightweight injected-wallet (EIP-1193) connection, shared across components
// via a module-level external store so the header's Connect button and the buy
// panel stay in sync without a Context provider or a layout refactor. Connect
// only reads the account and best-effort switches to BSC; settlement is the
// agent's job server-side (lib/agent/executor), never a browser broadcast here.

import { useEffect, useSyncExternalStore } from "react";

const BSC_CHAIN_ID_HEX = "0x38"; // 56

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
}

let state: WalletState = { address: null, connecting: false, error: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setState(patch: Partial<WalletState>): void {
  state = { ...state, ...patch };
  emit();
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

let bound = false;
function bindEvents(p: Eip1193Provider): void {
  if (bound || typeof p.on !== "function") return;
  bound = true;
  p.on("accountsChanged", (...args: unknown[]) => {
    const accounts = (args[0] as string[] | undefined) ?? [];
    setState({ address: accounts[0] ?? null });
  });
}

export async function connectWallet(): Promise<void> {
  const p = getProvider();
  if (!p) {
    setState({
      error: "No Web3 wallet found. Install Binance Web3 Wallet or MetaMask.",
    });
    return;
  }
  setState({ connecting: true, error: null });
  try {
    const accounts = (await p.request({
      method: "eth_requestAccounts",
    })) as string[];
    bindEvents(p);
    // Best-effort switch to BSC. If the user declines or the chain is not added,
    // the address is still fine for quoting, so this is not a hard failure.
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID_HEX }],
      });
    } catch {
      /* ignore */
    }
    setState({ address: accounts?.[0] ?? null, connecting: false });
  } catch (e) {
    setState({
      connecting: false,
      error: e instanceof Error ? e.message : "Connection failed.",
    });
  }
}

export function disconnectWallet(): void {
  // EIP-1193 has no programmatic disconnect; clear local state only.
  setState({ address: null, error: null });
}

let eagerTried = false;
async function eagerCheck(): Promise<void> {
  if (eagerTried) return;
  eagerTried = true;
  const p = getProvider();
  if (!p) return;
  try {
    // eth_accounts is silent (no prompt): repopulates the address after a reload
    // if the wallet is still authorized, so a returning judge stays connected.
    const accounts = (await p.request({ method: "eth_accounts" })) as string[];
    if (accounts?.[0]) {
      bindEvents(p);
      setState({ address: accounts[0] });
    }
  } catch {
    /* no prior authorization */
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): WalletState {
  return state;
}
function getServerSnapshot(): WalletState {
  return { address: null, connecting: false, error: null };
}

export function useWallet() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void eagerCheck();
  }, []);
  return { ...s, connect: connectWallet, disconnect: disconnectWallet };
}
