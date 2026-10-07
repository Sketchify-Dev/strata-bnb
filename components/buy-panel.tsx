"use client";

// Live buy panel. Calls the server-signed quote route (/api/binance/quote) and
// renders the per-leg liquidity guardrail verdict: which legs are ready, which
// are wide, and which the guardrail is holding back (e.g. no live RFQ maker, so
// the aggregator fell back to a junk route). You can connect an injected wallet
// to quote against your own address; settlement is handled by the agent, which
// signs and broadcasts from its own key server-side (see lib/agent/executor).

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import type {
  BasketQuote,
  HoldingQuote,
  LegStatus,
} from "@/lib/binance/quote-basket";
import { usd } from "@/lib/format";

// Binance semantic palette.
const UP = "#16c784";
const DOWN = "#f6465d";
const GOLD = "#f0b90b";
const MUTED = "#8b8f9a";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// A recognizable placeholder so the live guardrail can be demoed without a
// wallet connected. RFQ quoting is open to any address and moves no funds; a
// real connected wallet replaces this once execution lands.
const DEMO_ADDRESS = "0x000000000000000000000000000000000000dEaD";

const STATUS_META: Record<LegStatus, { label: string; color: string }> = {
  ok: { label: "Ready", color: UP },
  warn: { label: "Wide", color: GOLD },
  rejected: { label: "Held", color: DOWN },
  no_route: { label: "No route", color: MUTED },
  error: { label: "Error", color: MUTED },
};

interface BuyPanelProps {
  basketId: string;
  holdingsCount: number;
  defaultOrderSize?: number;
}

export function BuyPanel({
  basketId,
  holdingsCount,
  defaultOrderSize = 1000,
}: BuyPanelProps) {
  const [orderSize, setOrderSize] = useState(String(defaultOrderSize));
  const [address, setAddress] = useState("");
  const [quote, setQuote] = useState<BasketQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: connectedAddress, connect, connecting } = useWallet();

  useEffect(() => {
    if (connectedAddress) setAddress(connectedAddress);
  }, [connectedAddress]);

  const size = Number(orderSize);
  const sizeValid = Number.isFinite(size) && size > 0;
  const addressValid = ADDRESS_RE.test(address.trim());
  const canQuote = sizeValid && addressValid && !loading;

  async function getQuote() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/binance/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basketId,
          orderSizeUsdt: size,
          userWalletAddress: address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.reason ?? `Quote failed (HTTP ${res.status}).`);
      }
      setQuote(data.quote as BasketQuote);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote failed.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-line-strong bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="font-mono text-xs tracking-[0.2em] text-ink-muted">
        BUY BASKET
      </p>

      {/* Order size */}
      <label className="mt-4 block text-xs text-ink-secondary">You pay</label>
      <div className="mt-1.5 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-3 focus-within:border-line-strong">
        <input
          value={orderSize}
          onChange={(e) => setOrderSize(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          aria-label="Order size in USDT"
          className="tnum w-full bg-transparent text-xl font-semibold text-ink outline-none placeholder:text-ink-muted"
          placeholder="1000"
        />
        <span className="ml-2 shrink-0 rounded-md bg-surface-3 px-2 py-1 font-mono text-xs text-ink-secondary">
          USDT
        </span>
      </div>

      {/* Wallet address (required for RFQ quoting) */}
      <div className="mt-4 flex items-center justify-between">
        <label className="text-xs text-ink-secondary">Wallet address</label>
        <div className="flex items-center gap-3">
          {connectedAddress ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-up">
              <span className="h-1 w-1 rounded-full bg-up" />
              connected
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="font-mono text-[10px] text-ink-secondary underline decoration-dotted underline-offset-2 transition-colors hover:text-ink disabled:opacity-50"
            >
              {connecting ? "connecting…" : "connect wallet"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAddress(DEMO_ADDRESS)}
            className="font-mono text-[10px] text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink-secondary"
          >
            use demo address
          </button>
        </div>
      </div>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        spellCheck={false}
        aria-label="BSC wallet address"
        className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-line-strong"
        style={
          address.length > 0 && !addressValid ? { borderColor: DOWN } : undefined
        }
        placeholder="0x… BSC address"
      />
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-ink-muted">
        {address.length > 0 && !addressValid
          ? "Enter a valid 0x BSC address."
          : connectedAddress
            ? "Using your connected wallet. Settlement runs through the agent."
            : "Required for RFQ quoting. Connect your wallet or paste a BSC address."}
      </p>

      {/* Summary rows */}
      <div className="mt-4 space-y-2 text-sm">
        <Row k="Holdings" v={`${holdingsCount} tokens`} />
        <Row k="Route" v="Web3 aggregator (RFQ + AMM)" />
        <Row k="Network" v="BNB Smart Chain" />
      </div>

      {/* Primary action */}
      <button
        type="button"
        onClick={getQuote}
        disabled={!canQuote}
        className="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Checking live routes…" : "Get live quote"}
      </button>

      {error && (
        <p
          className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{
            color: DOWN,
            borderColor: `${DOWN}55`,
            backgroundColor: `${DOWN}0d`,
          }}
        >
          {error}
        </p>
      )}

      {/* Live quote result */}
      {quote && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={quote.mode === "live" ? "live" : "muted"}>
              {quote.mode === "live" ? "LIVE" : "ILLUSTRATIVE"}
            </Badge>
            {quote.marketStatus && (
              <Badge tone="muted">{quote.marketStatus.toUpperCase()}</Badge>
            )}
            {quote.allClear ? (
              <Badge tone="up">ALL LEGS READY</Badge>
            ) : (
              <Badge tone="down">
                {quote.holdings.filter((h) => h.status === "rejected").length}{" "}
                HELD
              </Badge>
            )}
          </div>

          {/* Per-leg guardrail verdict */}
          <div className="mt-3">
            {quote.holdings.map((h) => (
              <LegRow key={h.symbol} h={h} />
            ))}
          </div>

          {/* Tradable / blocked split */}
          <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-muted">Tradable now</span>
              <span className="tnum font-mono" style={{ color: UP }}>
                {usd(quote.tradableUsdt)}
              </span>
            </div>
            {quote.blockedUsdt > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Held by guardrail</span>
                <span className="tnum font-mono" style={{ color: DOWN }}>
                  {usd(quote.blockedUsdt)}
                </span>
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Every leg is checked against the live on-chain reference price. Routes
            that are off-market (usually no live RFQ maker) or high-impact are
            held, not executed.
          </p>

          <Link
            href={`/app/agent?basket=${basketId}`}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Hand to the rebalance agent →
          </Link>
          <p className="mt-2 text-center font-mono text-[11px] text-ink-muted">
            Quote and guardrail are live. The agent executes and rebalances on-chain.
          </p>
        </div>
      )}
    </div>
  );
}

function LegRow({ h }: { h: HoldingQuote }) {
  const meta = STATUS_META[h.status];
  const showMetrics =
    (h.status === "ok" || h.status === "warn") && h.tokensOut !== null;
  const showReasons =
    h.reasons.length > 0 && h.status !== "ok" && !h.mock;

  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="font-mono text-xs text-ink">{h.onchainSymbol}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="tnum font-mono text-xs text-ink-secondary">
            {usd(h.allocationUsdt)}
          </span>
          <span
            className="w-14 text-right font-mono text-[10px] uppercase tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {showMetrics && (
        <div className="mt-1 pl-3.5 font-mono text-[10px] text-ink-muted">
          ≈ {fmtTokens(h.tokensOut as number)} {h.onchainSymbol}
          {h.deviationPct !== null && <> · {fmtDev(h.deviationPct)} vs mark</>}
          {h.priceImpactPct !== null && (
            <> · {h.priceImpactPct.toFixed(2)}% impact</>
          )}
        </div>
      )}

      {showReasons && (
        <ul className="mt-1 space-y-0.5 pl-3.5">
          {h.reasons.map((r, i) => (
            <li
              key={i}
              className="text-[11px] leading-snug"
              style={{ color: h.status === "rejected" ? DOWN : MUTED }}
            >
              {tidyReason(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{k}</span>
      <span className="text-ink-secondary">{v}</span>
    </div>
  );
}

type Tone = "up" | "down" | "live" | "muted";

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const color =
    tone === "up"
      ? UP
      : tone === "down"
        ? DOWN
        : tone === "live"
          ? GOLD
          : MUTED;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider"
      style={{ color, borderColor: `${color}55` }}
    >
      {children}
    </span>
  );
}

// --- display helpers ---------------------------------------------------------

/** Cap absurd magnitudes so a junk-route deviation reads cleanly, not like a bug. */
function tidyReason(s: string): string {
  return s.replace(/(\d[\d,]*(?:\.\d+)?)%/g, (m, num: string) => {
    const v = Number(num.replace(/,/g, ""));
    return Number.isFinite(v) && v >= 10000 ? ">10,000%" : m;
  });
}

function fmtDev(pct: number): string {
  const a = Math.abs(pct);
  if (a >= 10000) return `${pct < 0 ? "-" : "+"}>10,000%`;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function fmtTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
