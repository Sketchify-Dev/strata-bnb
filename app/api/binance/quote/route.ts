import { NextResponse } from "next/server";
import { getBasket } from "@/lib/baskets";
import { quoteBasket } from "@/lib/binance/quote-basket";
import { BinanceApiError } from "@/lib/binance";

// POST /api/binance/quote
// Body: { basketId: string, orderSizeUsdt: number, userWalletAddress: string }
//
// Server-signed basket quote with the per-leg liquidity guardrail. The signing
// secret lives only on the server, so quoting always runs here, never in the
// browser. Ondo legs settle by RFQ and the aggregator refuses to quote them
// without a wallet, so userWalletAddress is required and validated up front.

// Uses Node crypto for HMAC signing; pin the Node runtime and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ORDER_USDT = 1_000_000;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface QuoteBody {
  basketId?: unknown;
  orderSizeUsdt?: unknown;
  userWalletAddress?: unknown;
}

function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(request: Request) {
  let body: QuoteBody;
  try {
    body = (await request.json()) as QuoteBody;
  } catch {
    return bad("Request body must be JSON.");
  }

  const { basketId, orderSizeUsdt, userWalletAddress } = body;

  if (typeof basketId !== "string" || basketId.length === 0) {
    return bad("basketId is required.");
  }
  const basket = getBasket(basketId);
  if (!basket) {
    return bad(`Unknown basket "${basketId}".`, 404);
  }

  const size = Number(orderSizeUsdt);
  if (!Number.isFinite(size) || size <= 0) {
    return bad("orderSizeUsdt must be a positive number.");
  }
  if (size > MAX_ORDER_USDT) {
    return bad(`orderSizeUsdt exceeds the ${MAX_ORDER_USDT} cap.`);
  }

  if (typeof userWalletAddress !== "string" || !ADDRESS_RE.test(userWalletAddress)) {
    return bad(
      "userWalletAddress must be a 0x-prefixed 20-byte address (required for RFQ quoting).",
    );
  }

  try {
    const quote = await quoteBasket(basket, size, userWalletAddress);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    if (err instanceof BinanceApiError) {
      return NextResponse.json(
        { ok: false, reason: err.message, code: err.code },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Quote failed.";
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}
