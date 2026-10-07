// Rebalance planner: the decision core the autonomous agent runs on.
//
// Pure, deterministic, and side-effect free - no network, no signing, no funds.
// Given a basket's live positions (current USDT value per holding) and its target
// weights, it computes per-holding drift and, when any holding breaches the drift
// threshold, the exact set of buy/sell trades that returns the basket to target.
//
// This is deliberately decoupled from execution. The agent loop calls
// planRebalance() to decide WHETHER and WHAT to trade, then hands the resulting
// trades to the quote/guardrail + execution layer to decide HOW (and to refuse a
// leg with no live route). Keeping the math pure means it is trivially testable
// and identical whether it runs in a server route, the agent runtime, or the UI.

import type { Holding } from "@/lib/baskets";

/** A live position: a target holding plus the current market value of the tokens held. */
export interface Position {
  holding: Holding;
  /** Current on-chain value of this holding, in USDT. */
  valueUsdt: number;
}

export type RebalanceAction = "buy" | "sell" | "hold";

export interface RebalanceLeg {
  symbol: string;
  onchainSymbol: string;
  address: string;
  /** Target weight, 0..1. */
  targetWeight: number;
  /** Current weight, 0..1 (share of total portfolio value). */
  currentWeight: number;
  /** Current value of the holding, in USDT. */
  valueUsdt: number;
  /** Value the holding should have at target, in USDT. */
  targetValueUsdt: number;
  /** Signed drift in percentage points: (currentWeight - targetWeight) * 100. */
  driftPoints: number;
  /** Signed drift relative to target: (current - target) / target * 100. */
  driftRelPct: number;
  /** What the plan does to this leg. */
  action: RebalanceAction;
  /** Signed trade size in USDT: positive to buy, negative to sell, 0 to hold. */
  tradeUsdt: number;
}

export interface RebalancePlan {
  /** Total portfolio value across all holdings, in USDT. */
  totalValueUsdt: number;
  /** The drift threshold that triggers a rebalance, in percentage points. */
  thresholdPoints: number;
  /** Largest absolute per-holding drift, in percentage points. */
  maxDriftPoints: number;
  /** True when maxDriftPoints >= thresholdPoints (i.e. the agent should act). */
  needsRebalance: boolean;
  /** Total USDT bought (equals total sold): the turnover this plan incurs. */
  turnoverUsdt: number;
  legs: RebalanceLeg[];
  createdAt: string;
}

export interface PlanOptions {
  /**
   * Minimum absolute trade size, in USDT. Trades smaller than this are dropped to
   * "hold" so a rebalance never emits dust legs the guardrail/fees would swamp.
   */
  dustUsdt?: number;
}

/**
 * Compute a rebalance plan for a set of live positions against their target weights.
 *
 * Threshold rebalancing: if ANY holding's absolute drift reaches `thresholdPoints`
 * (percentage points off its target weight), every holding is traded back toward
 * its target; otherwise the plan holds everything. Weights are read from each
 * holding, so a mis-summing basket still produces a coherent plan (targets are
 * applied to the actual total value, not assumed to be 100%).
 */
export function planRebalance(
  positions: Position[],
  thresholdPoints: number,
  opts: PlanOptions = {},
): RebalancePlan {
  const dustUsdt = opts.dustUsdt ?? 1;
  // Negative or non-finite values can't be held; floor them at 0 for the totals.
  const safeValue = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const totalValueUsdt = positions.reduce(
    (sum, p) => sum + safeValue(p.valueUsdt),
    0,
  );

  // First pass: drift + the ideal (dust-agnostic) trade to reach target.
  const draft = positions.map((p) => {
    const valueUsdt = safeValue(p.valueUsdt);
    const targetWeight = p.holding.weight;
    const currentWeight = totalValueUsdt > 0 ? valueUsdt / totalValueUsdt : 0;
    const targetValueUsdt = targetWeight * totalValueUsdt;
    const driftPoints = (currentWeight - targetWeight) * 100;
    const driftRelPct =
      targetWeight > 0 ? ((currentWeight - targetWeight) / targetWeight) * 100 : 0;
    return {
      symbol: p.holding.symbol,
      onchainSymbol: p.holding.onchainSymbol,
      address: p.holding.address,
      targetWeight,
      currentWeight,
      valueUsdt,
      targetValueUsdt,
      driftPoints,
      driftRelPct,
      idealTradeUsdt: targetValueUsdt - valueUsdt, // +buy, -sell
    };
  });

  const maxDriftPoints = draft.reduce(
    (max, l) => Math.max(max, Math.abs(l.driftPoints)),
    0,
  );
  const needsRebalance =
    totalValueUsdt > 0 && maxDriftPoints >= thresholdPoints;

  // Second pass: commit trades only when we're rebalancing and the trade clears dust.
  const legs: RebalanceLeg[] = draft.map((l) => {
    let action: RebalanceAction = "hold";
    let tradeUsdt = 0;
    if (needsRebalance && Math.abs(l.idealTradeUsdt) >= dustUsdt) {
      action = l.idealTradeUsdt > 0 ? "buy" : "sell";
      tradeUsdt = l.idealTradeUsdt;
    }
    return {
      symbol: l.symbol,
      onchainSymbol: l.onchainSymbol,
      address: l.address,
      targetWeight: l.targetWeight,
      currentWeight: l.currentWeight,
      valueUsdt: l.valueUsdt,
      targetValueUsdt: l.targetValueUsdt,
      driftPoints: l.driftPoints,
      driftRelPct: l.driftRelPct,
      action,
      tradeUsdt,
    };
  });

  const turnoverUsdt = legs
    .filter((l) => l.action === "buy")
    .reduce((sum, l) => sum + l.tradeUsdt, 0);

  return {
    totalValueUsdt,
    thresholdPoints,
    maxDriftPoints,
    needsRebalance,
    turnoverUsdt,
    legs,
    createdAt: new Date().toISOString(),
  };
}
