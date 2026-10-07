import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AgentConsole, type AgentEntry } from "@/components/agent-console";
import { BASKETS, getBasket } from "@/lib/baskets";
import { priceBasket } from "@/lib/binance/pricing";
import { getAgentStatus } from "@/lib/agent/preflight";

export const metadata = { title: "Agent - Strata" };

// Notional used to turn live weights + 24h moves into a concrete, honest drift
// scenario the planner can act on before a real position exists.
const NOTIONAL = 10_000;

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ basket?: string }>;
}) {
  const sp = await searchParams;
  const basket = getBasket(sp.basket ?? "") ?? BASKETS[0];

  // Live per-share prices + 24h moves. Positions are simulated as if the basket
  // were entered at target weights ~24h ago, so today's differential returns
  // produce real drift the planner can react to.
  const priced = await priceBasket(basket.holdings, NOTIONAL);
  const entries: AgentEntry[] = basket.holdings.map((h, i) => {
    const change = priced.holdings[i]?.changePct24h ?? null;
    const valueUsdt = h.weight * NOTIONAL * (1 + (change ?? 0) / 100);
    return { holding: h, valueUsdt, changePct24h: change };
  });

  // The agent's own wallet + funding status (honest when unconfigured).
  const agentStatus = await getAgentStatus();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <span className="font-mono text-xs tracking-[0.2em] text-gold">
          THE AGENT LAYER
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          Rebalance agent
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Set a rule once. The agent watches drift and rebalances on BSC, 24/7,
          funding its own gas from its own wallet. It can act, but it can never
          custody.
        </p>

        {/* Target basket */}
        <div className="mt-8">
          <p className="text-xs text-ink-secondary">Target basket</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BASKETS.map((b) => {
              const active = b.id === basket.id;
              return (
                <Link
                  key={b.id}
                  href={`/app/agent?basket=${b.id}`}
                  scroll={false}
                  className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
                  style={
                    active
                      ? {
                          borderColor: "#f0b90b80",
                          backgroundColor: "#f0b90b1a",
                          color: "#f0b90b",
                        }
                      : undefined
                  }
                >
                  {b.code}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <AgentConsole
            entries={entries}
            basketId={basket.id}
            basketCode={basket.code}
            notionalUsdt={NOTIONAL}
            mode={priced.mode}
            marketStatus={priced.marketStatus}
            agentStatus={agentStatus}
          />
        </div>
      </main>
    </div>
  );
}
