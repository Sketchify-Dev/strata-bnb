"use client";

// Header wallet control. Dead no more: connects an injected Web3 wallet (Binance
// Web3 Wallet / MetaMask) and shows the connected address. Renders the same
// label on the server and first client paint (address starts null both sides),
// so there is no hydration mismatch; feedback for a missing wallet is in title.

import { useWallet } from "@/lib/wallet";

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { address, connecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        title={`${address} (click to disconnect)`}
        className="flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-2 font-mono text-xs text-ink transition-colors hover:bg-surface"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-up" />
        {truncate(address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void connect()}
      disabled={connecting}
      title={error ?? "Connect Binance Web3 Wallet or MetaMask"}
      className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
