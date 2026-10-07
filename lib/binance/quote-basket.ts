// Basket quote engine + liquidity guardrail. Server-only.
//
// This is the shared execution primitive under BOTH the one-tap buy flow and the
// rebalancing agent. For an order of `orderSizeUsdt` USDT into a basket, it:
//   1. splits the order across holdings by target weight,
//   2. asks the signed aggregator for an executable route per leg (USDT -> token),
//   3. cross-checks every route against the LIVE RWA reference price and its own
//      priceImpact/honeypot flags, and marks each leg ok | warn | rejected.
//
// Why the cross-check matters: Ondo tokenized stocks settle by RFQ, and a maker
// is not always quoting. When none is, the aggregator silently falls back to a
// junk multi-hop AMM route with a nonsensical output (observed live: MSFTon came
// back at ~1e-7 tokens for $100). Executing that would burn the order. Comparing
// the effective price (USDT in / tokens out) to the RWA on-chain reference price
// catches it: the deviation blows past the reject threshold and the leg is held.
//
// Both the reference token price and the quote's per-token price are on the SAME
// basis (USD per whole on-chain token, multiplier included), so no shares-
// multiplier conversion is needed here - that only matters for per-share display.

import { getBinanceApi } from "./index";
import { getRwaDynamic, getRwaMarketStatus } from "./rwa";
import { USDT, BSC_CHAIN_ID } from "./tokens";
import type { QuoteRoute } from "./types";
import type { Basket, Holding } from "@/lib/baskets";

// Guardrail thresholds, as percent values. Tuned against live premarket RFQ
// quotes (2026-09-29): liquid names quote within ~0.05% of the on-chain
// reference, thinner names run a few percent wide. A junk RFQ fallback (no live
// maker) deviates by orders of magnitude, so any reject bound catches it; the
// bounds flag genuinely wide fills without false-rejecting a leg that is merely
// wide in premarket.
const WARN_DEVIATION_PCT = 2;
const REJECT_DEVIATION_PCT = 10;
const WARN_PRICE_IMPACT_PCT = 2;
const REJECT_PRICE_IMPACT_PCT = 6;

/** Default slippage sent to the aggregator (percent, as a string). */
const DEFAULT_SLIPPAGE = "0.5";

/** Signed quotes fired at once; the aggregator rate-limits larger bursts. */
const QUOTE_CONCURRENCY = 3;

export type LegStatus = "ok" | "warn" | "rejected" | "no_route" | "error";

export interface HoldingQuote {
  // identity
  symbol: string;
  onchainSymbol: string;
  name: string;
  address: string;
  weight: number;

  // order sizing
  allocationUsdt: number;
  /** USDT amount sent to the aggregator, in smallest units (18 decimals). */
  amountInBaseUnits: string;

  // executable quote (null when no acceptable route came back)
  quoteId: string | null;
  vendorName: string | null;
  tokensOut: number | null;
  /** Effective USD paid per whole token = USDT in / tokens out. */
  executablePrice: number | null;
  /** Live RWA on-chain reference price (USD per whole token), or null. */
  referencePrice: number | null;
  /** Signed % gap of executable vs reference; +ve means paying above reference. */
  deviationPct: number | null;
  priceImpactPct: number | null;
  /** ERC-20 spender the USDT must be approved to before the swap. */
  approveTarget: string | null;
  isHoneyPot: boolean;

  // guardrail verdict
  status: LegStatus;
  reasons: string[];
  mock: boolean;
}

export interface BasketQuote {
  basketId: string;
  basketCode: string;
  orderSizeUsdt: number;
  userWalletAddress: string;
  mode: "live" | "mock";
  marketOpen: boolean | null;
  marketStatus: string | null;
  holdings: HoldingQuote[];
  /** Sum of allocations for legs that got an ok or warn route. */
  tradableUsdt: number;
  /** Sum of allocations for legs that are rejected / no route / errored. */
  blockedUsdt: number;
  /** True when every leg is ok (no warns, no rejects). */
  allClear: boolean;
  createdAt: string;
}

// --- unit helpers (BigInt-exact, no float drift at 18 decimals) --------------

/** Human amount -> integer base units string, e.g. 180 @ 18dp -> "180000...". */
export function toBaseUnits(human: number, decimals: number): string {
  if (!Number.isFinite(human) || human < 0) return "0";
  const fixed = human.toFixed(decimals);
  const [whole, frac = ""] = fixed.split(".");
  const combined = whole + frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(combined || "0").toString();
}

/** Integer base units string -> human number (fine for display quantities). */
function fromBaseUnits(base: string, decimals: number): number {
  if (!/^\d+$/.test(base)) return NaN;
  const padded = base.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  return Number(`${padded.slice(0, cut)}.${padded.slice(cut)}`);
}

export function toNum(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Pick the aggregator's recommended route, else the first one. */
export function bestRoute(routes: QuoteRoute[]): QuoteRoute | undefined {
  return routes.find((r) => r.isBest) ?? routes[0];
}

/**
 * Run `task` over `items` at most `limit` at a time, preserving input order and
 * never rejecting (each slot resolves to fulfilled/rejected like allSettled).
 * The signed aggregator rate-limits bursts, so quotes go out in small batches
 * rather than all at once.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await task(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** rejected beats warn beats ok; used to fold multiple signals into one verdict. */
function escalate(current: LegStatus, next: LegStatus): LegStatus {
  const rank: Record<LegStatus, number> = {
    ok: 0,
    warn: 1,
    no_route: 2,
    error: 2,
    rejected: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

/** The outcome of running one route through the liquidity guardrail. */
export interface RouteEvaluation {
  tokensOut: number;
  executablePrice: number | null;
  /** Reference actually used for the deviation check (RWA feed, else route mark). */
  referenceUsed: number | null;
  deviationPct: number | null;
  priceImpactPct: number | null;
  isHoneyPot: boolean;
  mock: boolean;
  status: LegStatus;
  reasons: string[];
}

/**
 * The liquidity guardrail for a SINGLE route, factored out so the one-tap buy
 * flow and the rebalancing agent's executor gate every route through exactly one
 * implementation. Pure and side-effect free. `allocationUsdt` is the USDT going
 * into this leg; `referencePrice` is the live on-chain mark (or null).
 */
export function evaluateRoute(
  route: QuoteRoute,
  referencePrice: number | null,
  allocationUsdt: number,
): RouteEvaluation {
  const mock = route.mock === true;
  const toDecimals = toNum(route.toToken?.decimal) ?? 18;
  const tokensOut = fromBaseUnits(route.toTokenAmount ?? "0", toDecimals);
  const executablePrice = tokensOut > 0 ? allocationUsdt / tokensOut : null;
  // Despite the name, the aggregator returns priceImpactPercent as a FRACTION
  // (0.0442 = 4.42%, verified live against the independent reference gap).
  const rawImpact = toNum(route.priceImpactPercent);
  const priceImpactPct = rawImpact === null ? null : rawImpact * 100;
  const isHoneyPot = route.toToken?.isHoneyPot === true;

  // Prefer the live RWA feed, fall back to the aggregator's own per-token mark.
  const referenceUsed = referencePrice ?? toNum(route.toToken?.tokenUnitPrice);
  const deviationPct =
    executablePrice !== null && referenceUsed
      ? ((executablePrice - referenceUsed) / referenceUsed) * 100
      : null;

  const reasons: string[] = [];
  let status: LegStatus = "ok";

  if (mock) {
    reasons.push("Illustrative mock route (no live credentials).");
  } else {
    if (isHoneyPot) {
      status = escalate(status, "rejected");
      reasons.push("Destination token flagged as a honeypot.");
    }

    if (deviationPct !== null) {
      const mag = Math.abs(deviationPct);
      if (mag >= REJECT_DEVIATION_PCT) {
        status = escalate(status, "rejected");
        reasons.push(
          `Executable price is ${mag.toFixed(1)}% off the reference mark (limit ${REJECT_DEVIATION_PCT}%). Likely no live RFQ maker; holding this leg.`,
        );
      } else if (mag >= WARN_DEVIATION_PCT) {
        status = escalate(status, "warn");
        reasons.push(
          `Executable price is ${mag.toFixed(1)}% off the reference mark.`,
        );
      }
    } else {
      status = escalate(status, "warn");
      reasons.push("No reference price to validate this quote against.");
    }

    if (priceImpactPct !== null) {
      if (priceImpactPct >= REJECT_PRICE_IMPACT_PCT) {
        status = escalate(status, "rejected");
        reasons.push(
          `Price impact ${priceImpactPct.toFixed(2)}% exceeds the ${REJECT_PRICE_IMPACT_PCT}% limit.`,
        );
      } else if (priceImpactPct >= WARN_PRICE_IMPACT_PCT) {
        status = escalate(status, "warn");
        reasons.push(`Price impact ${priceImpactPct.toFixed(2)}%.`);
      }
    }
  }

  return {
    tokensOut,
    executablePrice,
    referenceUsed,
    deviationPct,
    priceImpactPct,
    isHoneyPot,
    mock,
    status,
    reasons,
  };
}

/**
 * Quote a whole basket for a given USDT order size and trader wallet, applying
 * the liquidity guardrail per leg. Never rejects: a failing leg degrades to an
 * `error`/`no_route` status so the caller can render the whole basket honestly.
 *
 * `userWalletAddress` is REQUIRED: Ondo legs are RFQ and the aggregator refuses
 * to quote them without a wallet.
 */
export async function quoteBasket(
  basket: Basket,
  orderSizeUsdt: number,
  userWalletAddress: string,
): Promise<BasketQuote> {
  const api = getBinanceApi();
  const holdings = basket.holdings;

  // One quote + one reference-price read per holding, plus a single basket-level
  // market-status read. The signed quotes are throttled (the aggregator
  // rate-limits bursts); the keyless RWA reads hit a different API and run fully
  // parallel.
  const quotesP = mapWithConcurrency(holdings, QUOTE_CONCURRENCY, (h) =>
    api.getQuote({
      chainId: BSC_CHAIN_ID,
      fromTokenAddress: USDT.address,
      toTokenAddress: h.address,
      amount: toBaseUnits(h.weight * orderSizeUsdt, USDT.decimals),
      slippage: DEFAULT_SLIPPAGE,
      userWalletAddress,
    }),
  );
  const refsP = Promise.allSettled(holdings.map((h) => getRwaDynamic(h.address)));
  const marketP = getRwaMarketStatus().catch(() => null);

  const [quotes, refs, market] = await Promise.all([quotesP, refsP, marketP]);

  let tradableUsdt = 0;
  let blockedUsdt = 0;
  let liveCount = 0;
  let sessionLabel: string | null = null;
  let sessionOpen: boolean | null = null;

  const legs: HoldingQuote[] = holdings.map((h: Holding, i) => {
    const allocationUsdt = h.weight * orderSizeUsdt;
    const amountInBaseUnits = toBaseUnits(allocationUsdt, USDT.decimals);

    // Reference price + per-asset session, best-effort.
    let referencePrice: number | null = null;
    const ref = refs[i];
    if (ref.status === "fulfilled") {
      referencePrice = toNum(ref.value.tokenInfo?.price);
      if (sessionLabel === null && ref.value.statusInfo?.marketStatus) {
        sessionLabel = ref.value.statusInfo.marketStatus;
      }
      if (
        sessionOpen === null &&
        typeof ref.value.statusInfo?.openState === "boolean"
      ) {
        sessionOpen = ref.value.statusInfo.openState;
      }
    }

    const base: HoldingQuote = {
      symbol: h.symbol,
      onchainSymbol: h.onchainSymbol,
      name: h.name,
      address: h.address,
      weight: h.weight,
      allocationUsdt,
      amountInBaseUnits,
      quoteId: null,
      vendorName: null,
      tokensOut: null,
      executablePrice: null,
      referencePrice,
      deviationPct: null,
      priceImpactPct: null,
      approveTarget: null,
      isHoneyPot: false,
      status: "ok",
      reasons: [],
      mock: false,
    };

    const q = quotes[i];
    if (q.status === "rejected") {
      blockedUsdt += allocationUsdt;
      return {
        ...base,
        status: "error",
        reasons: [
          q.reason instanceof Error ? q.reason.message : "Quote request failed.",
        ],
      };
    }

    const routes = q.value;
    if (!Array.isArray(routes) || routes.length === 0) {
      blockedUsdt += allocationUsdt;
      return {
        ...base,
        status: "no_route",
        reasons: ["No route returned by the aggregator for this leg."],
      };
    }

    const route = bestRoute(routes);
    if (!route) {
      blockedUsdt += allocationUsdt;
      return { ...base, status: "no_route", reasons: ["No usable route."] };
    }

    const evaluation = evaluateRoute(route, referencePrice, allocationUsdt);
    if (!evaluation.mock) liveCount++;
    if (evaluation.status === "rejected") blockedUsdt += allocationUsdt;
    else tradableUsdt += allocationUsdt;

    return {
      ...base,
      quoteId: route.quoteId ?? null,
      vendorName: route.vendorName ?? null,
      tokensOut: evaluation.tokensOut,
      executablePrice: evaluation.executablePrice,
      deviationPct: evaluation.deviationPct,
      priceImpactPct: evaluation.priceImpactPct,
      approveTarget: route.approveTarget ?? null,
      isHoneyPot: evaluation.isHoneyPot,
      status: evaluation.status,
      reasons: evaluation.reasons,
      mock: evaluation.mock,
    };
  });

  const mode: "live" | "mock" =
    api.mode === "live" && liveCount > 0 ? "live" : "mock";

  return {
    basketId: basket.id,
    basketCode: basket.code,
    orderSizeUsdt,
    userWalletAddress,
    mode,
    marketOpen: sessionOpen ?? (market ? market.openState : null),
    marketStatus: sessionLabel,
    holdings: legs,
    tradableUsdt,
    blockedUsdt,
    allClear: legs.every((l) => l.status === "ok"),
    createdAt: new Date().toISOString(),
  };
}
