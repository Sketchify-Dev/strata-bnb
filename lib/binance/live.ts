// Live Binance Web3 (Build) API methods. Server-only (imports the signed client).

import { binanceGet } from "./client";
import type {
  BinanceApi,
  QuoteParams,
  QuoteRoute,
  SupportedChain,
  TokenBalance,
} from "./types";

const BSC_CHAIN_ID = 56;

export const liveApi: BinanceApi = {
  mode: "live",

  getSupportedChains() {
    return binanceGet<SupportedChain[]>("/dex/aggregator/supported/chain");
  },

  getAllBalances({ chainId = BSC_CHAIN_ID, address }) {
    return binanceGet<TokenBalance[]>(
      "/dex/balance/all-token-balances-by-address",
      { chainId, address },
    );
  },

  getQuote(params: QuoteParams) {
    const { chainId = BSC_CHAIN_ID, userWalletAddress, slippage, ...rest } =
      params;
    // The aggregator names the chain param `binanceChainId` (not `chainId`),
    // and RFQ-settled tokens (Ondo) require userWalletAddress.
    return binanceGet<QuoteRoute[]>("/dex/aggregator/quote", {
      binanceChainId: chainId,
      userWalletAddress,
      slippage,
      ...rest,
    });
  },
};
