import Link from "next/link";
import { type Basket, basketProviders } from "@/lib/baskets";

export function BasketCard({ basket }: { basket: Basket }) {
  const providers = basketProviders(basket);

  return (
    <Link
      href={`/app/baskets/${basket.id}`}
      className="group relative flex flex-col rounded-card border border-line bg-surface p-5 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
    >
      <span
        className="pointer-events-none absolute inset-x-4 -top-px h-px opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${basket.accent}, transparent)`,
        }}
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-[0.2em] text-ink-muted">
          {basket.code}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
          {basket.holdings.length} holdings
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink">
        {basket.name}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
        {basket.tagline}
      </p>

      <div className="mt-4 flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-2">
        {basket.holdings.map((h, i) => (
          <div
            key={h.symbol}
            title={`${h.symbol} ${Math.round(h.weight * 100)}%`}
            style={{
              width: `${h.weight * 100}%`,
              backgroundColor: basket.accent,
              opacity: 1 - i * 0.12,
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {basket.holdings.slice(0, 4).map((h) => (
          <span
            key={h.symbol}
            className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-ink-secondary"
          >
            {h.onchainSymbol}
          </span>
        ))}
        {basket.holdings.length > 4 && (
          <span className="rounded-md px-2 py-1 font-mono text-xs text-ink-muted">
            +{basket.holdings.length - 4}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="font-mono text-[11px] text-ink-muted">
          {providers.join(" / ")}
        </span>
        <span className="text-sm font-medium text-ink transition-colors group-hover:text-gold">
          Buy in one tap
        </span>
      </div>
    </Link>
  );
}
