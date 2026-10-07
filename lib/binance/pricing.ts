// Turns a basket's holdings into live, priced positions using the public RWA
// data API (Ondo tokenized stocks). Server-only.
//
// Honest per-share price = tokenInfo.price / sharesMultiplier. Each token can
// represent more than one share (dividend accrual; some are stock-split tokens
// with a 5x/10x multiplier), and the multiplier is read LIVE per the skill's
// guidance, never hardcoded.
//
// Per-holding resilience: one holding failing must not blank the basket, so each
// call is independent and failures degrade to null. If every live call fails
// (e.g. offline), deterministic sample prices keep the UI legible, and `mode`
// flips to "mock" so the surface can say so honestly.

import { getRwaDynamic, getRwaMarketStatus } from "./rwa";
import type { Holding } from "@/lib/baskets";

export interface PricedHolding extends Holding {
  /** Per-share reference price in USD (tokenInfo.price / multiplier), or null. */
  price: number | null;
  /** Raw on-chain token price in USD (before the shares multiplier), or null. */
  tokenPrice: number | null;
  /** Live shares-per-token multiplier, or null. */
  multiplier: number | null;
  /** 24h price change as a percentage value (1.2 means +1.2%), or null. */
  changePct24h: number | null;
  /** On-chain holder count, or null. */
  holders: number | null;
  /** Target dollar allocation for the order size. */
  allocation: number;
}

export interface PricedBasket {
  holdings: PricedHolding[];
  /** True when at least one live price came back. */
  priced: boolean;
  /** "live" when prices came from the API, "mock" when the fallback was used. */
  mode: "live" | "mock";
  /** Whether the tokenized-equity market is currently open, or null if unknown. */
  marketOpen: boolean | null;
  /** Session label: regular | premarket | postmarket | closed | ... or null. */
  marketStatus: string | null;
}

function num(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Deterministic fallback so a network hiccup during a demo never blanks the
// table. Sample data only, used solely when every live call fails.
const FALLBACK_PRICES: Record<string, number> = {
  AAPL: 232.14, MSFT: 428.9, GOOGL: 178.32, AMZN: 201.55, NVDA: 121.4,
  META: 561.2, TSLA: 248.5, AVGO: 168.7, AMD: 158.3, TSM: 190.1, ASML: 720.4,
  MU: 105.2, AXP: 268.5, BAC: 42.1, KO: 68.4, CVX: 152.7, OXY: 51.3,
  ORCL: 168.2, CRM: 268.9, NOW: 912.5, ADBE: 512.4, SNOW: 118.6,
};

/**
 * Fetch a live price per holding and compute each one's dollar allocation for a
 * given order size. Runs the calls in parallel and never rejects.
 */
export async function priceBasket(
  holdings: Holding[],
  orderSize: number,
): Promise<PricedBasket> {
  // Basket-level market status: best-effort, cheap, canonical fallback.
  const statusP = getRwaMarketStatus().catch(() => null);

  const results = await Promise.allSettled(
    holdings.map((h) => getRwaDynamic(h.address)),
  );

  let sessionLabel: string | null = null;
  let sessionOpen: boolean | null = null;
  let liveCount = 0;

  let pricedHoldings: PricedHolding[] = holdings.map((h, i) => {
    const r = results[i];
    const allocation = h.weight * orderSize;
    if (r.status === "fulfilled") {
      const d = r.value;
      const tokenPrice = num(d.tokenInfo?.price);
      const multiplier = num(d.tokenInfo?.sharesMultiplier) ?? 1;
      const perShare =
        tokenPrice !== null && multiplier ? tokenPrice / multiplier : null;
      if (perShare !== null) liveCount++;
      if (sessionLabel === null && d.statusInfo?.marketStatus) {
        sessionLabel = d.statusInfo.marketStatus;
      }
      if (sessionOpen === null && typeof d.statusInfo?.openState === "boolean") {
        sessionOpen = d.statusInfo.openState;
      }
      return {
        ...h,
        price: perShare,
        tokenPrice,
        multiplier,
        changePct24h: num(d.tokenInfo?.priceChangePct24h),
        holders: num(d.tokenInfo?.totalHolders),
        allocation,
      };
    }
    return {
      ...h,
      price: null,
      tokenPrice: null,
      multiplier: null,
      changePct24h: null,
      holders: null,
      allocation,
    };
  });

  let mode: "live" | "mock" = "live";
  if (liveCount === 0) {
    mode = "mock";
    pricedHoldings = holdings.map((h) => {
      const price = FALLBACK_PRICES[h.symbol] ?? null;
      return {
        ...h,
        price,
        tokenPrice: price,
        multiplier: 1,
        changePct24h: null,
        holders: null,
        allocation: h.weight * orderSize,
      };
    });
  }

  const status = await statusP;
  return {
    holdings: pricedHoldings,
    priced: liveCount > 0,
    mode,
    marketOpen: sessionOpen ?? (status ? status.openState : null),
    marketStatus: sessionLabel,
  };
}
