import { AppHeader } from "@/components/app-header";
import { BasketCard } from "@/components/basket-card";
import { BASKETS } from "@/lib/baskets";

export default function AppHome() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {/* Portfolio summary (empty state until a wallet is connected) */}
        <section className="rounded-card border border-line bg-surface p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-ink-muted">
                PORTFOLIO VALUE
              </p>
              <p className="tnum mt-2 text-4xl font-semibold tracking-tight text-ink">
                $0.00
              </p>
              <p className="mt-1 text-sm text-ink-secondary">
                Connect a BSC wallet to see your baskets here.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                <p className="font-mono text-[11px] text-ink-muted">BASKETS</p>
                <p className="tnum mt-1 text-xl font-semibold text-ink">0</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                <p className="font-mono text-[11px] text-ink-muted">AGENT</p>
                <p className="mt-1 text-xl font-semibold text-ink-secondary">
                  Off
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-12 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Baskets
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              One tap owns the whole theme. Every holding settles to your wallet
              on BNB Chain.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BASKETS.map((b) => (
            <BasketCard key={b.id} basket={b} />
          ))}
        </div>
      </main>
    </div>
  );
}
