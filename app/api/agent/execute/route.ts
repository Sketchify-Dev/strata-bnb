import { NextResponse } from "next/server";
import { getBasket } from "@/lib/baskets";
import { executeLeg } from "@/lib/agent/executor";

// POST /api/agent/execute
// Body: { basketId, symbol, orderUsdt, goAhead? }
//
// Runs the executor. A live broadcast needs BOTH the server in live mode
// (AGENT_EXECUTION_MODE=live with a funded burner key) AND goAhead: true here.
// With goAhead omitted/false, or the server in simulate mode (the default), this
// is side-effect free: a signed quote, the guardrail, and read-only chain calls.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ORDER_USDT = 100_000;

interface Body {
  basketId?: unknown;
  symbol?: unknown;
  orderUsdt?: unknown;
  goAhead?: unknown;
  walletAddress?: unknown;
}

function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Request body must be JSON.");
  }

  const { basketId, symbol, orderUsdt, goAhead, walletAddress } = body;

  if (typeof basketId !== "string" || basketId.length === 0) {
    return bad("basketId is required.");
  }
  const basket = getBasket(basketId);
  if (!basket) return bad(`Unknown basket "${basketId}".`, 404);

  if (typeof symbol !== "string" || symbol.length === 0) {
    return bad("symbol is required.");
  }
  const holding = basket.holdings.find(
    (h) => h.symbol === symbol || h.onchainSymbol === symbol,
  );
  if (!holding) return bad(`No holding "${symbol}" in this basket.`, 404);

  const size = Number(orderUsdt);
  if (!Number.isFinite(size) || size <= 0) {
    return bad("orderUsdt must be a positive number.");
  }
  if (size > MAX_ORDER_USDT) {
    return bad(`orderUsdt exceeds the ${MAX_ORDER_USDT} cap.`);
  }

  try {
    const result = await executeLeg({
      basket,
      holding,
      orderUsdt: size,
      goAhead: goAhead === true,
      previewAddress:
        typeof walletAddress === "string" ? walletAddress : undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dry run failed.";
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}
