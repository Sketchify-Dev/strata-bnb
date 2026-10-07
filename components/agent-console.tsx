"use client";

// Live agent console. Runs the REAL rebalance planner (lib/agent/rebalance) in
// the browser, reactively, as the operator changes the drift threshold. Positions
// are derived server-side from live 24h price moves (see the agent page), so the
// drift shown is computed from real market data, not mocked. "Dry run" calls the
// real executor in simulate mode: a live quote + guardrail + planned steps, no
// broadcast. Autonomous live execution is gated server-side (the agent's own key).

import { useMemo, useState, type ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import type { Holding } from "@/lib/baskets";
import { planRebalance, type Position } from "@/lib/agent/rebalance";
import type { AgentStatus } from "@/lib/agent/preflight";
import type {
  ExecutionResult,
  ExecOutcome,
  StepStatus,
} from "@/lib/agent/executor";
import { usd } from "@/lib/format";

const UP = "#16c784";
const DOWN = "#f6465d";
const GOLD = "#f0b90b";
const MUTED = "#8b8f9a";

const THRESHOLDS = [3, 5, 10]; // percentage points of weight drift
const CADENCES = ["Hourly", "Daily", "Weekly"] as const;
type Cadence = (typeof CADENCES)[number];

export interface AgentEntry {
  holding: Holding;
  /** Current value in USDT (server-derived from the live 24h move). */
  valueUsdt: number;
  changePct24h: number | null;
}

interface AgentConsoleProps {
  entries: AgentEntry[];
  basketId: string;
  basketCode: string;
  notionalUsdt: number;
  mode: "live" | "mock";
  marketStatus: string | null;
  agentStatus: AgentStatus;
}

export function AgentConsole({
  entries,
  basketId,
  basketCode,
  notionalUsdt,
  mode,
  marketStatus,
  agentStatus,
}: AgentConsoleProps) {
  const [thresholdPoints, setThresholdPoints] = useState(5);
  const [cadence, setCadence] = useState<Cadence>("Daily");

  const positions = useMemo<Position[]>(
    () => entries.map((e) => ({ holding: e.holding, valueUsdt: e.valueUsdt })),
    [entries],
  );
  const plan = useMemo(
    () => planRebalance(positions, thresholdPoints),
    [positions, thresholdPoints],
  );

  const scale = Math.max(thresholdPoints * 2, plan.maxDriftPoints, 4);
  const topLeg = plan.legs.reduce((a, b) =>
    Math.abs(b.driftPoints) > Math.abs(a.driftPoints) ? b : a,
  );
  const sells = plan.legs.filter((l) => l.action === "sell").length;
  const buys = plan.legs.filter((l) => l.action === "buy").length;
  const hasDriftData = entries.some((e) => e.changePct24h !== null);

  const [dryRun, setDryRun] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dryErr, setDryErr] = useState<string | null>(null);
  const { address: connectedAddress } = useWallet();

  // The agent would BUY the most-underweight leg; dry-run that one (fall back to
  // the top-drift leg when the basket is already balanced).
  const buyLegs = plan.legs.filter((l) => l.action === "buy");
  const dryTarget = buyLegs.length
    ? buyLegs.reduce((a, b) => (b.tradeUsdt > a.tradeUsdt ? b : a))
    : topLeg;
  const dryUsdt =
    dryTarget.action === "buy"
      ? Math.max(Math.round(dryTarget.tradeUsdt), 25)
      : 100;

  async function runDryRun() {
    setRunning(true);
    setDryErr(null);
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basketId,
          symbol: dryTarget.symbol,
          orderUsdt: dryUsdt,
          walletAddress: connectedAddress ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.reason ?? `Dry run failed (HTTP ${res.status}).`);
      }
      setDryRun(data.result as ExecutionResult);
    } catch (e) {
      setDryErr(e instanceof Error ? e.message : "Dry run failed.");
      setDryRun(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rule */}
        <div className="rounded-card border border-line bg-surface p-6">
          <p className="text-sm font-medium text-ink">Rule</p>

          <label className="mt-5 block text-xs text-ink-secondary">
            Rebalance when any holding drifts past
          </label>
          <div className="mt-2 flex gap-2">
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={thresholdPoints === t}
                onClick={() => setThresholdPoints(t)}
                className="tnum rounded-lg border px-4 py-2 text-sm transition-colors"
                style={
                  thresholdPoints === t
                    ? { borderColor: `${GOLD}80`, backgroundColor: `${GOLD}1a`, color: GOLD }
                    : undefined
                }
              >
                {t} pts
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-muted">
            Percentage points of weight away from target.
          </p>

          <label className="mt-6 block text-xs text-ink-secondary">
            Check cadence
          </label>
          <div className="mt-2 flex gap-2">
            {CADENCES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cadence === c}
                onClick={() => setCadence(c)}
                className="rounded-lg border px-4 py-2 text-sm transition-colors"
                style={
                  cadence === c
                    ? { borderColor: `${GOLD}80`, backgroundColor: `${GOLD}1a`, color: GOLD }
                    : undefined
                }
              >
                {c}
              </button>
            ))}
          </div>

          {/* Agent wallet status: honest about configured / funded / mode */}
          <div className="mt-8 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink-muted">
                agent wallet
              </span>
              <span
                className="font-mono text-[11px]"
                style={{ color: agentStatus.configured ? UP : MUTED }}
              >
                {agentStatus.configured
                  ? shortAddr(agentStatus.address)
                  : "not configured"}
              </span>
            </div>
            {agentStatus.configured && (
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-ink-muted">
                <span>{fmtBal(agentStatus.usdt)} USDT</span>
                <span>{fmtBal(agentStatus.bnb)} BNB gas</span>
              </div>
            )}
            <div
              className="mt-1.5 font-mono text-[10px]"
              style={{ color: agentStatus.mode === "live" ? GOLD : MUTED }}
            >
              mode: {agentStatus.mode}
              {agentStatus.mode === "simulate" ? " · no broadcast" : ""}
            </div>
          </div>

          <button
            type="button"
            disabled
            title="Autonomous live execution runs server-side with the agent's own key; the hosted demo is simulate-only"
            className="mt-3 flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-gold text-sm font-semibold text-black opacity-50"
          >
            Enable autonomous execution
          </button>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-muted">
            The agent holds its own key and pays its own gas. It can act, but it
            can never custody your funds.
          </p>
        </div>

        {/* Live drift + plan */}
        <div className="rounded-card border border-line bg-surface p-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <p className="text-sm font-medium text-ink">
              Live drift · {basketCode}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge tone={mode === "live" ? "live" : "muted"}>
                {mode === "live" ? "LIVE" : "SAMPLE"}
              </Badge>
              {marketStatus && (
                <Badge tone="muted">{marketStatus.toUpperCase()}</Badge>
              )}
            </div>
          </div>

          {/* Verdict */}
          <div
            className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
            style={{
              borderColor: plan.needsRebalance ? `${GOLD}55` : `${UP}44`,
              backgroundColor: plan.needsRebalance ? `${GOLD}12` : `${UP}0d`,
              color: plan.needsRebalance ? GOLD : UP,
            }}
          >
            {plan.needsRebalance ? (
              <>
                Rebalance triggered · {topLeg.onchainSymbol} is{" "}
                {fmtDrift(topLeg.driftPoints)} pts{" "}
                {topLeg.driftPoints > 0 ? "over" : "under"} target
                {" "}(threshold {thresholdPoints} pts).
              </>
            ) : (
              <>
                Within tolerance · max drift {plan.maxDriftPoints.toFixed(1)} pts,
                under the {thresholdPoints} pt threshold. Monitoring.
              </>
            )}
          </div>

          {/* Per-holding drift */}
          <div className="mt-4">
            {plan.legs.map((l, i) => (
              <div key={l.symbol} className="border-b border-line py-3 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink">
                      {l.onchainSymbol}
                    </span>
                    {entries[i].changePct24h !== null && (
                      <span
                        className="font-mono text-[10px]"
                        style={{
                          color:
                            (entries[i].changePct24h as number) >= 0 ? UP : DOWN,
                        }}
                      >
                        24h {fmtSigned(entries[i].changePct24h as number)}%
                      </span>
                    )}
                  </div>
                  <ActionTag action={l.action} tradeUsdt={l.tradeUsdt} />
                </div>

                <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-ink-muted">
                  <span>
                    target {(l.targetWeight * 100).toFixed(1)}% → now{" "}
                    {(l.currentWeight * 100).toFixed(1)}%
                  </span>
                  <span style={{ color: driftColor(l.driftPoints) }}>
                    {fmtDrift(l.driftPoints)} pts
                  </span>
                </div>

                <DriftBar drift={l.driftPoints} scale={scale} />
              </div>
            ))}
          </div>

          {/* Turnover + execution preview */}
          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
            {plan.needsRebalance ? (
              <div className="space-y-2 font-mono text-[12px]">
                <Step k="check">
                  max drift {fmtDrift(topLeg.driftPoints)} pts {">"}{" "}
                  {thresholdPoints} pt threshold
                </Step>
                <Step k="quote">
                  {sells} sell / {buys} buy · each leg guardrail-gated
                </Step>
                <Step k="simulate">gas from its own wallet</Step>
                <Step k="broadcast">
                  <span className="text-ink-muted">
                    enable + fund to run · turnover {usd(plan.turnoverUsdt)}
                  </span>
                </Step>
              </div>
            ) : (
              <p className="font-mono text-[12px] text-ink-secondary">
                <span className="text-ink-muted">monitoring</span> · next{" "}
                {cadence.toLowerCase()} check · no action while within tolerance
              </p>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Before any trade, each leg is re-quoted and gated by the liquidity
            guardrail: off-market (no live RFQ maker) or high-impact legs are
            skipped, never force-filled.
          </p>

          {/* Dry run: runs the real executor (simulate) on the leg the agent
              would buy, and renders every step it takes. */}
          <button
            type="button"
            onClick={runDryRun}
            disabled={running}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running
              ? "Running dry run…"
              : `Dry run: buy ${dryTarget.onchainSymbol}`}
          </button>
          {dryErr && (
            <p className="mt-2 font-mono text-[11px]" style={{ color: DOWN }}>
              {dryErr}
            </p>
          )}
          {dryRun && <DryRunPanel result={dryRun} />}
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] text-ink-muted">
        {hasDriftData
          ? `Simulated from live 24h moves on a ${usd(notionalUsdt, true)} basket entered at target weights. Drift and trades are computed by the real planner; execution is disabled until the agent is funded.`
          : `Live 24h moves unavailable right now, so the basket shows at target weights with no drift to act on.`}
      </p>
    </>
  );
}

function DriftBar({ drift, scale }: { drift: number; scale: number }) {
  const half = Math.min(50, (Math.abs(drift) / scale) * 50);
  const over = drift > 0;
  return (
    <div className="relative mt-2 h-1 w-full rounded-full bg-surface-3">
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-ink-muted opacity-50" />
      {half > 0 && (
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: over ? "50%" : `${50 - half}%`,
            width: `${half}%`,
            backgroundColor: over ? DOWN : UP,
          }}
        />
      )}
    </div>
  );
}

function ActionTag({
  action,
  tradeUsdt,
}: {
  action: "buy" | "sell" | "hold";
  tradeUsdt: number;
}) {
  if (action === "hold") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        Hold
      </span>
    );
  }
  const color = action === "buy" ? UP : DOWN;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wider"
      style={{ color }}
    >
      {action} {usd(Math.abs(tradeUsdt))}
    </span>
  );
}

function Step({ k, children }: { k: string; children: ReactNode }) {
  return (
    <p className="text-ink-secondary">
      <span className="text-ink-muted">{k}</span> {children}
    </p>
  );
}

type Tone = "live" | "muted";
function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const color = tone === "live" ? GOLD : MUTED;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider"
      style={{ color, borderColor: `${color}55` }}
    >
      {children}
    </span>
  );
}

function driftColor(driftPoints: number): string {
  if (driftPoints > 0) return DOWN; // overweight -> trim
  if (driftPoints < 0) return UP; // underweight -> add
  return MUTED;
}

function fmtDrift(points: number): string {
  const sign = points > 0 ? "+" : points < 0 ? "-" : "";
  return `${sign}${Math.abs(points).toFixed(1)}`;
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function shortAddr(a: string | null): string {
  if (!a) return "-";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtBal(n: number | null): string {
  if (n === null) return "-";
  // Small gas balances (fractions of a BNB) need more precision than 2dp,
  // otherwise ~0.0005 BNB reads as "0".
  if (n > 0 && n < 1) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function stepColor(status: StepStatus): string {
  switch (status) {
    case "done":
      return UP;
    case "planned":
      return GOLD;
    case "blocked":
      return DOWN;
    default:
      return MUTED; // skipped | pending
  }
}

function outcomeColor(outcome: ExecOutcome): string {
  switch (outcome) {
    case "dry_run_complete":
    case "submitted":
      return UP;
    case "blocked":
      return DOWN;
    default:
      return MUTED; // not_configured
  }
}

function outcomeLabel(outcome: ExecOutcome): string {
  switch (outcome) {
    case "dry_run_complete":
      return "dry run complete";
    case "submitted":
      return "submitted";
    case "blocked":
      return "held";
    default:
      return "wallet not set";
  }
}

function DryRunPanel({ result }: { result: ExecutionResult }) {
  const accent = outcomeColor(result.outcome);
  const held =
    result.outcome === "blocked" || result.outcome === "not_configured";
  return (
    <div
      className="mt-3 overflow-hidden rounded-lg border bg-surface-2"
      style={{ borderColor: `${accent}44` }}
    >
      {/* header: what ran, mode, verdict */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: `${accent}12` }}
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-muted">
            DRY RUN
          </span>
          <span className="font-mono text-[11px] text-ink">
            buy {result.onchainSymbol}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {result.mode === "simulate" && (
            <span
              className="rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-wider"
              style={{ color: GOLD, borderColor: `${GOLD}55` }}
            >
              SIMULATE
            </span>
          )}
          <span
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: accent }}
          >
            {outcomeLabel(result.outcome)}
          </span>
        </span>
      </div>

      {/* step timeline */}
      <div className="px-3 py-3">
        {result.steps.map((s, i) => {
          const c = stepColor(s.status);
          const last = i === result.steps.length - 1;
          return (
            <div key={s.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: c }}
                />
                {!last && (
                  <span
                    className="w-px flex-1 bg-line"
                    style={{ minHeight: 10 }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink">
                    {s.label}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider"
                    style={{ color: c }}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] leading-snug text-ink-muted">
                  {s.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* footer: what it proves */}
      <div className="border-t border-line px-3 py-2">
        {result.outcome === "submitted" && result.txHash ? (
          <p className="font-mono text-[10px] leading-snug text-ink-muted">
            Executed on BSC from the agent&apos;s own wallet.{" "}
            <a
              href={`https://bscscan.com/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2"
              style={{ color: UP }}
            >
              {shortAddr(result.txHash)} ↗
            </a>
          </p>
        ) : (
          <p className="font-mono text-[10px] leading-snug text-ink-muted">
            {held
              ? "The agent stopped safely. Nothing was signed, approved, or broadcast."
              : "Pipeline clear. In live mode it proceeds to approve and swap, each behind your explicit go-ahead."}
          </p>
        )}
      </div>
    </div>
  );
}
