// Server-side configuration for the Binance Web3 (Build) API.
// Never import this from a Client Component: it reads secret credentials.
// (Env vars without a NEXT_PUBLIC_ prefix are undefined in the browser anyway,
//  but we also hard-guard against accidental client bundling.)

if (typeof window !== "undefined") {
  throw new Error("lib/binance/config is server-only and must not run in the browser.");
}

const apiKey = process.env.BINANCE_WEB3_API_KEY ?? "";
const secretKey = process.env.BINANCE_WEB3_SECRET_KEY ?? "";
const baseUrl =
  process.env.BINANCE_WEB3_BASE_URL ?? "https://web3.binance.com/build";

export const binanceConfig = {
  apiKey,
  secretKey,
  baseUrl,
  /** True only when we can actually sign a live request. */
  hasCredentials: apiKey.length > 0 && secretKey.length > 0,
} as const;

export type BinanceMode = "live" | "mock";

/** Live when fully credentialed, otherwise fall back to deterministic mocks. */
export const binanceMode: BinanceMode = binanceConfig.hasCredentials
  ? "live"
  : "mock";
