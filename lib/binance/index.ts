// Public entrypoint for the Binance Web3 integration.
// `getBinanceApi()` returns the signed live client when credentials are present
// and a deterministic mock otherwise, so the app runs either way. Public RWA
// market data (Ondo tokenized stocks) is keyless and always live — see ./rwa.

import { binanceMode } from "./config";
import { liveApi } from "./live";
import { mockApi } from "./mock";
import type { BinanceApi } from "./types";

export function getBinanceApi(): BinanceApi {
  return binanceMode === "live" ? liveApi : mockApi;
}

export { binanceConfig, binanceMode } from "./config";
export { liveApi } from "./live";
export { mockApi } from "./mock";
export * from "./types";
export * from "./rwa";
