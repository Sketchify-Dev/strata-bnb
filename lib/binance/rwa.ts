// Public Binance Web3 RWA data API (Ondo tokenized US stocks).
//
// This is a DIFFERENT service from the signed aggregator/wallet API in
// ./client: these are public `bapi` endpoints on www.binance.com that need NO
// authentication. Source of truth: the official binance-tokenized-securities-info
// skill (binance/binance-skills-hub). Success envelope uses a STRING code
// "000000" (not the aggregator's numeric code === 0).
//
// Call these from server code: browser calls are cross-origin and CORS-bound.

const RWA_BASE = "https://www.binance.com/bapi/defi";
const RWA_HEADERS: Record<string, string> = {
  // The skill specifies these exactly.
  "Accept-Encoding": "identity",
  "User-Agent": "binance-web3/1.1 (Skill)",
};

// Ondo tokens are deployed on Ethereum (1) and BSC (56); Strata trades on BSC.
export const BSC_CHAIN_ID = 56;

/** One row of the Ondo token list (API 1). */
export interface RwaTokenListItem {
  chainId: string;
  contractAddress: string;
  /** Token symbol, ticker + "on" suffix, e.g. AAPLon. */
  symbol: string;
  /** Underlying US stock ticker, e.g. AAPL. */
  ticker: string;
  /** Platform type: 1 = Ondo. */
  type: number;
  /** Shares-per-token multiplier as a decimal string. */
  multiplier: string;
}

/** On-chain token data (subset of API 5 `tokenInfo`). */
export interface RwaTokenInfo {
  /** On-chain token price (USD), per token — divide by sharesMultiplier for per-share. */
  price?: string;
  priceChange24h?: string;
  /** 24h change as a percentage value (0.35 means 0.35%). */
  priceChangePct24h?: string;
  totalHolders?: string;
  sharesMultiplier?: string;
  marketCap?: string;
  circulatingSupply?: string;
  [k: string]: unknown;
}

/** US stock fundamentals (subset of API 5 `stockInfo`). */
export interface RwaStockInfo {
  price?: string | null;
  priceHigh52w?: string;
  priceLow52w?: string;
  priceToEarnings?: string;
  /** Dividend yield as a percentage value (0.27 means 0.27%). */
  dividendYield?: string;
  [k: string]: unknown;
}

/** Market / asset trading status (API 4 shape, also nested in API 5). */
export interface RwaStatusInfo {
  openState?: boolean | null;
  /** premarket | regular | postmarket | overnight | closed | pause */
  marketStatus?: string | null;
  /** TRADING | MARKET_CLOSED | ASSET_PAUSED | ASSET_LIMITED | ... */
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | null;
  nextCloseTime?: number | null;
}

/** Full real-time data for one token (API 5, RWA Dynamic V2). */
export interface RwaDynamic {
  symbol: string;
  ticker: string;
  tokenInfo: RwaTokenInfo;
  stockInfo: RwaStockInfo;
  statusInfo: RwaStatusInfo;
}

/** Overall Ondo market status (API 3). */
export interface RwaMarketStatus {
  openState: boolean;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpen?: string;
  nextClose?: string;
  nextOpenTime?: number;
  nextCloseTime?: number;
}

interface RwaEnvelope<T> {
  code: string;
  data: T;
  success: boolean;
  message?: string | null;
}

async function rwaGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  // Prices move; always fetch fresh (this also keeps a market view out of full
  // static caching, which is what we want).
  const res = await fetch(`${RWA_BASE}${path}${qs}`, {
    headers: RWA_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RWA ${path} -> HTTP ${res.status}`);
  const body = (await res.json()) as RwaEnvelope<T>;
  if (!body.success || body.code !== "000000") {
    throw new Error(`RWA ${path} -> code=${body.code} msg=${body.message ?? ""}`);
  }
  return body.data;
}

const V1 = "/v1/public/wallet-direct/buw/wallet/market/token/rwa";
const V2 = "/v2/public/wallet-direct/buw/wallet/market/token/rwa";

/** API 1: all Ondo tokenized stocks (across chains) with contract + multiplier. */
export function getOndoTokenList(): Promise<RwaTokenListItem[]> {
  return rwaGet<RwaTokenListItem[]>(`${V1}/stock/detail/list/ai`, { type: 1 });
}

/** API 5: full real-time data (price, fundamentals, status) for one token. */
export function getRwaDynamic(
  contractAddress: string,
  chainId: number = BSC_CHAIN_ID,
): Promise<RwaDynamic> {
  return rwaGet<RwaDynamic>(`${V2}/dynamic/ai`, { chainId, contractAddress });
}

/** API 3: overall Ondo market open/closed status. */
export function getRwaMarketStatus(): Promise<RwaMarketStatus> {
  return rwaGet<RwaMarketStatus>(`${V1}/market/status/ai`);
}

/** API 4: per-asset trading status (corporate-action aware). */
export function getRwaAssetStatus(
  contractAddress: string,
  chainId: number = BSC_CHAIN_ID,
): Promise<RwaStatusInfo> {
  return rwaGet<RwaStatusInfo>(`${V1}/asset/market/status/ai`, {
    chainId,
    contractAddress,
  });
}
