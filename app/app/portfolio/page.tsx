import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export const metadata = { title: "Portfolio - Strata" };

export default function Portfolio() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Your tokenized baskets, held in your own wallet on BNB Chain.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2">
            <span className="h-4 w-4 rounded-sm bg-gold" />
          </div>
          <h2 className="mt-5 text-lg font-medium text-ink">No positions yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-secondary">
            Connect a BSC wallet and buy your first basket. Balances and the
            on-chain vs reference price of every holding load from the Wallet and
            Market APIs.
          </p>
          <Link
            href="/app"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gold px-6 text-sm font-semibold text-black"
          >
            Explore baskets
          </Link>
        </div>
      </main>
    </div>
  );
}
