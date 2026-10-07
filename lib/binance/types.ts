// Shared types for the Binance Web3 (Build) API — the SIGNED aggregator/wallet
// service at web3.binance.com/build. Public RWA market data (Ondo tokenized
// stocks) is keyless and has its own client and types in ./rwa.
//
// Response shapes for trading/transaction endpoints are refined against real
// payloads as each call is wired; the reads below are what we rely on first.

/** Every Build API response is wrapped in this envelope. */
export interface OCResult<T> {
  code: number;
  msg: string;
  data: T;
  timestamp: number;
  success: boolean;
}

/** Thrown for both transport failures and non-zero `code` envelopes. */
export class BinanceApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  readonly retryAfter?: number;
  constructor(
    message: string,
    code: number,
    httpStatus: number,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "BinanceApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfter = retryAfter;
  }
}

// --- Domain types (loose where the exact schema is still TODO) ---------------

// Confirmed against a live /dex/aggregator/supported/chain response 2026-09-27:
// chain id arrives as a STRING, with name/shortName/logoUrl.
export interface SupportedChain {
  binanceChainId: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  [k: string]: unknown;
}

export interface TokenBalance {
  tokenContractAddress?: string;
  symbol?: string;
  balance?: string;
  decimals?: number;
  [k: string]: unknown;
}

export interface QuoteParams {
  chainId?: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  /** Amount in the smallest unit of the from-token. */
  amount: string;
  slippage?: string;
  /**
   * Trader wallet. REQUIRED for RFQ-settled tokens (Ondo tokenized stocks fail
   * with "userWalletAddress is required for RFQ (Ondo) quote" without it).
   */
  userWalletAddress?: string;
}

/** One token leg inside a quote route. */
export interface QuoteToken {
  tokenContractAddress: string;
  tokenSymbol: string;
  /** USD price per whole token (human units, not smallest units). */
  tokenUnitPrice: string;
  /** Token decimals as a string, e.g. "18". */
  decimal: string;
  isHoneyPot: boolean;
  taxRate?: string;
  [k: string]: unknown;
}

/**
 * One aggregator route. `/dex/aggregator/quote` returns an ARRAY of these
 * (confirmed live 2026-09-28); `isBest` marks the recommended one.
 */
export interface QuoteRoute {
  quoteId: string;
  vendorName?: string;
  /** "SWAP" for AMM routes; Ondo legs are RFQ-sourced (see dexRouterList). */
  executionMode?: string;
  binanceChainId: string;
  /** From-token amount in smallest units (echoes the request amount). */
  fromTokenAmount: string;
  /** Expected to-token amount in smallest units. */
  toTokenAmount: string;
  tradeFee?: string;
  estimateGasFee?: string;
  priceImpactPercent?: string;
  router?: string;
  /** ERC-20 spender the from-token must be approved to before swapping. */
  approveTarget?: string;
  isBest?: boolean;
  fromToken: QuoteToken;
  toToken: QuoteToken;
  dexRouterList?: unknown[];
  [k: string]: unknown;
}

/** @deprecated use QuoteRoute; kept as an alias so older imports still compile. */
export type Quote = QuoteRoute;

/** The executable transaction returned by /dex/aggregator/swap (`data.tx`). */
export interface SwapTx {
  from?: string;
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxPriorityFeePerGas?: string;
  minReceiveAmount?: string;
  [k: string]: unknown;
}

/**
 * The /dex/aggregator/swap response payload (`data`). For Ondo tokenized stocks
 * `executionMode` is "SWAP" and `rfq` is null: a plain EVM tx we sign + broadcast.
 */
export interface SwapResult {
  executionMode?: string;
  routerResult?: Record<string, unknown>;
  tx: SwapTx;
  rfq?: unknown;
  [k: string]: unknown;
}

/** The subset of the signed API the app talks to. Implemented by live and mock. */
export interface BinanceApi {
  readonly mode: "live" | "mock";
  getSupportedChains(): Promise<SupportedChain[]>;
  getAllBalances(params: { chainId?: number; address: string }): Promise<TokenBalance[]>;
  getQuote(params: QuoteParams): Promise<QuoteRoute[]>;
}
