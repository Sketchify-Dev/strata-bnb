import Link from "next/link";
import { Logo, Wordmark } from "@/components/logo";
import { BasketCard } from "@/components/basket-card";
import { BASKETS, getBasket } from "@/lib/baskets";
import { weightPct } from "@/lib/format";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Agent", href: "#agent" },
  { label: "Stack", href: "#stack" },
];

const TICKER = Array.from(
  new Set(BASKETS.flatMap((b) => b.holdings.map((h) => h.onchainSymbol))),
);

export default function Home() {
  const hero = getBasket("mag7")!;

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <div className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-ink-secondary transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </div>
          <Link
            href="/app"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            Open app
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Tokenized equity baskets on BNB Chain
            </span>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Buy the whole sector in{" "}
              <span className="text-gradient-gold">one tap.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-secondary">
              Strata turns Ondo tokenized stocks into self-custodied baskets,
              then hands each one to an agent with its own wallet. It rebalances
              24/7 on BNB Chain, and refuses any trade the market can&apos;t fill
              honestly.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/app"
                className="inline-flex h-12 items-center justify-center rounded-full bg-gold px-6 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
              >
                Explore baskets
              </Link>
              <a
                href="#how"
                className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 text-sm font-medium text-ink transition-colors hover:bg-surface"
              >
                See how it works
              </a>
            </div>
            <p className="mt-6 font-mono text-xs text-ink-muted">
              Powered by Binance Web3 Wallet · Ondo tokenized stocks · BNB Smart
              Chain
            </p>
          </div>

          {/* Hero product panel */}
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-6 rounded-[32px] opacity-30 blur-2xl"
              style={{
                background: `radial-gradient(60% 60% at 70% 20%, ${hero.accent}, transparent)`,
              }}
            />
            <div className="relative rounded-card border border-line-strong bg-surface p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs tracking-[0.2em] text-ink-muted">
                    {hero.code}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                    tokenized
                  </span>
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-up">
                  <span className="h-1.5 w-1.5 rounded-full bg-up" />
                  BSC mainnet
                </span>
              </div>

              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                {hero.name}
              </h3>
              <p className="mt-1 text-sm text-ink-secondary">{hero.tagline}</p>

              <div className="mt-5 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-2">
                {hero.holdings.map((h, i) => (
                  <div
                    key={h.symbol}
                    style={{
                      width: `${h.weight * 100}%`,
                      backgroundColor: hero.accent,
                      opacity: 1 - i * 0.12,
                    }}
                  />
                ))}
              </div>

              <ul className="mt-5 space-y-2.5">
                {hero.holdings.slice(0, 5).map((h) => (
                  <li
                    key={h.symbol}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-xs text-ink-muted">
                        {h.onchainSymbol}
                      </span>
                      <span className="text-ink-secondary">{h.name}</span>
                    </span>
                    <span className="tnum font-mono text-xs text-ink">
                      {weightPct(h.weight)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-up" />
                <span className="font-mono text-[11px] leading-tight text-ink-secondary">
                  Guardrail on. Every route is checked against the live on-chain
                  price.
                </span>
              </div>
              <button className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-black">
                Buy basket
              </button>
              <p className="mt-3 text-center font-mono text-[11px] text-ink-muted">
                One approval. Simulated, then settled on BNB Chain.
              </p>
            </div>
          </div>
        </div>

        {/* Ticker strip */}
        <div className="relative flex overflow-hidden border-t border-line py-3">
          <div className="animate-ticker flex shrink-0 items-center gap-8 pr-8">
            {[...TICKER, ...TICKER].map((sym, i) => (
              <span
                key={`${sym}-${i}`}
                className="font-mono text-sm text-ink-muted"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The edge: the liquidity guardrail (real mainnet capture) */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <span className="font-mono text-xs tracking-[0.2em] text-gold">
                THE EDGE
              </span>
              <h2 className="mt-3 text-4xl text-ink sm:text-5xl">
                It knows when{" "}
                <span className="italic text-gradient-gold">not</span> to trade.
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-secondary">
                Tokenized-stock liquidity is intermittent. When no market maker
                is quoting a name, naive routers still fill, at any price. Strata
                prices every route against the live on-chain mark and holds the
                leg when the fill is a trap. The rest of the basket executes
                normally.
              </p>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-muted">
                Below is a real quote captured on BSC mainnet. Most agents would
                have taken this fill.
              </p>
            </div>

            {/* Money-shot: the held leg */}
            <div className="rounded-card border border-line-strong bg-surface p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs tracking-[0.2em] text-ink">
                    MSFTon
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                    USDT → MSFTon
                  </span>
                </span>
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-wider"
                  style={{
                    color: "var(--down)",
                    borderColor:
                      "color-mix(in oklab, var(--down) 45%, transparent)",
                  }}
                >
                  HELD
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="font-mono text-[10px] tracking-wider text-ink-muted">
                    ROUTER WOULD FILL AT
                  </div>
                  <div
                    className="tnum mt-1 font-mono text-xl text-down line-through"
                    style={{
                      textDecorationColor:
                        "color-mix(in oklab, var(--down) 50%, transparent)",
                    }}
                  >
                    $1,030,453,124
                  </div>
                  <div className="font-mono text-[10px] text-ink-muted">
                    per token
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-wider text-ink-muted">
                    LIVE ON-CHAIN PRICE
                  </div>
                  <div className="tnum mt-1 font-mono text-xl text-ink">
                    $511.52
                  </div>
                  <div className="font-mono text-[10px] text-ink-muted">
                    per token
                  </div>
                </div>
              </div>

              <div
                className="mt-6 flex items-center justify-between rounded-lg border px-3 py-2.5"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--down) 30%, transparent)",
                  backgroundColor:
                    "color-mix(in oklab, var(--down) 8%, transparent)",
                }}
              >
                <span className="font-mono text-xs text-ink-secondary">
                  Deviation from mark
                </span>
                <span
                  className="tnum font-mono text-sm font-medium"
                  style={{ color: "var(--down)" }}
                >
                  201,448,575%
                </span>
              </div>

              <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-muted">
                No live RFQ maker for MSFTon at quote time, so Strata held this
                leg and executed the other six. A router that trusts the quote
                burns the order.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / thesis */}
      <section className="border-b border-line" id="product">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Owning a theme shouldn&apos;t mean buying seven tickers.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                t: "Themes, not tickers",
                d: "You believe in AI, not in timing NVDA against AMD. A basket lets you own the whole idea and skip the spreadsheet.",
              },
              {
                t: "Markets close. On-chain doesn't.",
                d: "Tokenized equities settle on BSC around the clock, so a weekend headline is a position you can act on, not one you wait on.",
              },
              {
                t: "Your keys, your basket",
                d: "Every holding sits in your own wallet, never a broker's ledger. The agent can rebalance, but it can never custody.",
              },
            ].map((c) => (
              <div key={c.t}>
                <div className="mb-4 h-8 w-8 rounded-lg border border-line bg-surface" />
                <h3 className="text-lg font-medium text-ink">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {c.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Baskets grid */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="flex items-end justify-between">
            <div>
              <span className="font-mono text-xs tracking-[0.2em] text-gold">
                THE BASKETS
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Curated themes, tokenized.
              </h2>
            </div>
            <Link
              href="/app"
              className="hidden text-sm font-medium text-ink-secondary transition-colors hover:text-ink sm:block"
            >
              View all in app
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {BASKETS.map((b) => (
              <BasketCard key={b.id} basket={b} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-line" id="how">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <span className="font-mono text-xs tracking-[0.2em] text-gold">
            HOW IT WORKS
          </span>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From a theme to a settled position in three steps.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Pick a theme",
                d: "Choose a basket like Magnificent 7 or AI Chips. Every holding is a tokenized equity you actually own.",
              },
              {
                n: "02",
                t: "Buy in one tap",
                d: "Strata routes each leg through the Binance Web3 aggregator, simulates the full transaction, then broadcasts on BSC. One approval, one basket.",
              },
              {
                n: "03",
                t: "The agent takes over",
                d: "An on-chain agent watches drift and rebalances on your rules, 24/7, funding its own gas. You never leave self-custody.",
              },
            ].map((s) => (
              <div key={s.n} className="bg-surface p-8">
                <span className="font-mono text-sm text-gold">{s.n}</span>
                <h3 className="mt-4 text-lg font-medium text-ink">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent */}
      <section className="border-b border-line" id="agent">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="font-mono text-xs tracking-[0.2em] text-gold">
              THE AGENT LAYER
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Set the rule once. It runs while you sleep.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-secondary">
              Strata&apos;s rebalancer executes through the Binance Web3 Wallet
              aggregator on BNB Chain. Give it a drift threshold and a cadence;
              it quotes every leg, checks each route against the live on-chain
              price, and rebalances only the legs the market can actually fill,
              paying its own gas from its own wallet. Every action is a signed
              transaction you can audit.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-6">
              {[
                ["24/7", "Runs against always-on tokenized markets"],
                ["Self-custody", "The agent acts, you hold the keys"],
                ["Auditable", "Every rebalance is a signed on-chain tx"],
                ["Self-funding", "Holds its own BNB, pays its own gas"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-base font-medium text-ink">{k}</dt>
                  <dd className="mt-1 text-sm text-ink-secondary">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Logo className="h-4 w-4 text-ink" />
                Rebalance agent
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-up">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />
                active
              </span>
            </div>
            <div className="space-y-3 py-4 font-mono text-[13px]">
              <p className="text-ink-secondary">
                <span className="text-ink-muted">rule</span> keep MAG7 within{" "}
                <span className="text-gold">5%</span> of target
              </p>
              <p className="text-ink-secondary">
                <span className="text-ink-muted">check</span> NVDAon drift{" "}
                <span className="text-up">+6.2%</span> {">"} threshold
              </p>
              <p className="text-ink-secondary">
                <span className="text-ink-muted">quote</span> 6 legs ok ·{" "}
                <span className="text-down">MSFTon held</span> (no live maker)
              </p>
              <p className="text-ink-secondary">
                <span className="text-ink-muted">simulate</span> ok / gas from
                its own wallet
              </p>
              <p className="text-ink">
                <span className="text-ink-muted">broadcast</span>{" "}
                <span className="text-up">0x9f3a…c21 confirmed</span>
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink-muted">
              Illustrative run. Rebalanced the tradable legs in one transaction
              and skipped the one with no live maker. Basket back within target,
              and you held the keys the whole time.
            </div>
          </div>
        </div>
      </section>

      {/* Stack */}
      <section id="stack">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="rounded-card border border-line bg-surface p-8 sm:p-12">
            <span className="font-mono text-xs tracking-[0.2em] text-ink-muted">
              BUILT ON
            </span>
            <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Binance Web3 Wallet for routing. On-chain reads for the truth.
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["RWA data", "Binance keyless feed: Ondo equities, reference price"],
                ["Routing", "Binance aggregator: cross-venue quotes"],
                ["Swap build", "Binance aggregator: executable transaction"],
                ["Simulate", "On-chain eth_call before any broadcast"],
                ["Wallet", "On-chain balances and allowance, via viem"],
              ].map(([k, v]) => (
                <div key={k} className="border-t border-line pt-4">
                  <div className="text-sm font-medium text-ink">{k}</div>
                  <div className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center text-center">
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              The index fund, rebuilt as something you own.
            </h2>
            <Link
              href="/app"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-gold px-8 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
            >
              Open Strata
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Wordmark />
          <p className="font-mono text-xs text-ink-muted">
            Built for BNB Hack: Tokenized Stocks Edition. Spot only. BSC
            mainnet. Not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
