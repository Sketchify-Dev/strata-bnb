import { NextResponse } from "next/server";
import {
  BinanceApiError,
  binanceConfig,
  binanceMode,
  liveApi,
} from "@/lib/binance";

// Dev diagnostic: proves the API key + secret sign a real request end to end.
// Hit GET /api/binance/health. Never returns the credentials themselves.
export async function GET() {
  if (!binanceConfig.hasCredentials) {
    return NextResponse.json({
      ok: false,
      mode: binanceMode,
      reason:
        "Set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY in .env.local, then restart the dev server.",
    });
  }

  try {
    const chains = await liveApi.getSupportedChains();
    const count = Array.isArray(chains) ? chains.length : 0;
    return NextResponse.json({
      ok: true,
      mode: "live",
      supportedChainCount: count,
      sample: Array.isArray(chains) ? chains.slice(0, 3) : chains,
    });
  } catch (err) {
    const e = err as BinanceApiError;
    return NextResponse.json({
      ok: false,
      mode: "live",
      code: e.code,
      httpStatus: e.httpStatus,
      message: e.message,
    });
  }
}
