import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BuyPanel } from "@/components/buy-panel";
import { BASKETS, getBasket } from "@/lib/baskets";
import { priceBasket } from "@/lib/binance/pricing";
import { direction, pct, usd, weightPct } from "@/lib/format";

export function generateStaticParams() {
  return BASKETS.map((b) => ({ id: b.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const basket = getBasket(id);
  if (!basket) return {};
  return {
    title: `${basket.name} basket - Strata`,
    description: basket.thesis,
  };
}

// Binance semantic palette for price deltas and the live-market dot.
const UP = "#16c784";
const DOWN = "#f6465d";

// Example order size used to illustrate the per-holding split before a wallet
// is connected. Live quotes replace this once the buy flow is wired.
const EXAMPLE_ORDER = 1000;

export default async function BasketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const basket = getBasket(id);
  if (!basket) notFound();

  // Live per-share prices + market status from the Binance Web3 RWA data API.
  // Degrades per holding: a missing price shows a dash, never blanks the table.
  const priced = await priceBasket(basket.holdings, EXAMPLE_ORDER);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Link
          href="/app"
          className="text-sm text-ink-secondary transition-colors hover:text-ink"
        >
          Back to baskets
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_0.6fr]">
          {/* Composition */}
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs tracking-[0.2em] text-ink-muted">
                {basket.code}
              </span>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: basket.accent }}
              />
              <span className="font-mono text-[11px] text-ink-secondary">
                {basket.sector}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {basket.name}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-secondary">
              {basket.thesis}
            </p>

            <div className="mt-5">
              <MarketBadge open={priced.marketOpen} status={priced.marketStatus} />
            </div>

            <div className="mt-8 flex h-3 w-full gap-px overflow-hidden rounded-full bg-surface-2">
              {basket.holdings.map((h, i) => (
                <div
                  key={h.symbol}
                  title={`${h.symbol} ${weightPct(h.weight)}`}
                  style={{
                    width: `${h.weight * 100}%`,
                    backgroundColor: basket.accent,
                    opacity: 1 - i * 0.1,
                  }}
                />
              ))}
            </div>

            {/* Holdings table */}
            <div className="mt-8 overflow-hidden rounded-card border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] tracking-wider text-ink-muted">
                    <th className="px-4 py-3 font-normal">TOKEN</th>
                    <th className="px-4 py-3 font-normal">PROVIDER</th>
                    <th className="px-4 py-3 text-right font-normal">PRICE / SHARE</th>
                    <th className="px-4 py-3 text-right font-normal">TARGET</th>
                    <th className="px-4 py-3 text-right font-normal">
                      ALLOCATION
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {priced.holdings.map((h) => (
                    <tr
                      key={h.symbol}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs text-ink">
                            {h.onchainSymbol}
                          </span>
                          <span className="text-ink-secondary">{h.name}</span>
                          {h.multiplier !== null && h.multiplier >= 1.5 && (
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                              {Math.round(h.multiplier)}× shares
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                        {h.provider}
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono text-xs text-ink">
                        {h.price === null ? (
                          <span className="text-ink-muted">-</span>
                        ) : (
                          <div className="flex flex-col items-end leading-tight">
                            <span>{usd(h.price)}</span>
                            {h.changePct24h !== null && (
                              <span
                                className="text-[10px]"
                                style={{ color: deltaColor(h.changePct24h) }}
                              >
                                {pct(h.changePct24h)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono text-xs text-ink">
                        {weightPct(h.weight, 1)}
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono text-xs text-ink-secondary">
                        {usd(h.allocation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono text-[11px] text-ink-muted">
              Allocation shown for an example {usd(EXAMPLE_ORDER, true)} order.{" "}
              {priced.mode === "live"
                ? "Prices are live on-chain marks from the Binance Web3 RWA feed (Ondo), shown per underlying share."
                : "Sample prices shown; live feed momentarily unavailable."}
            </p>
          </div>

          {/* Buy panel */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BuyPanel
              basketId={basket.id}
              holdingsCount={basket.holdings.length}
              defaultOrderSize={EXAMPLE_ORDER}
            />

            <div className="mt-4 rounded-card border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">Hand it to the agent</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                After you buy, let the rebalancer keep this basket within its
                target weights, 24/7, in self-custody.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function deltaColor(changePct: number): string | undefined {
  const d = direction(changePct);
  if (d === "up") return UP;
  if (d === "down") return DOWN;
  return undefined;
}

function marketLabel(open: boolean | null, status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "regular":
      return "US market open · regular hours";
    case "premarket":
      return "US market open · pre-market";
    case "postmarket":
      return "US market open · after hours";
    case "overnight":
      return "US market · overnight";
    case "closed":
      return "US market closed";
    case "pause":
      return "US market paused";
  }
  if (open === true) return "US market open";
  if (open === false) return "US market closed";
  return "Market status unavailable";
}

function MarketBadge({
  open,
  status,
}: {
  open: boolean | null;
  status: string | null;
}) {
  const session = (status ?? "").toLowerCase();
  const live =
    open === true ||
    ["regular", "premarket", "postmarket", "overnight"].includes(session);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[11px] text-ink-secondary">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: live ? UP : "#6b7280" }}
      />
      {marketLabel(open, status)}
    </span>
  );
}
