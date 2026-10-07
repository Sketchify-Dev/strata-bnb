// Deterministic mock adapter for the SIGNED aggregator/wallet API, so quote and
// balance flows work before credentials or a funded wallet exist. Same interface
// as the live client; clearly labelled as mock. (Live RWA market prices come
// from the public API in ./rwa and need no mock.)

import type {
  BinanceApi,
  QuoteParams,
  QuoteRoute,
  QuoteToken,
  SupportedChain,
  TokenBalance,
} from "./types";

export const mockApi: BinanceApi = {
  mode: "mock",

  async getSupportedChains(): Promise<SupportedChain[]> {
    return [{ binanceChainId: "56", name: "BNB Smart Chain", shortName: "BSC" }];
  },

  async getAllBalances(): Promise<TokenBalance[]> {
    // No connected wallet in mock mode.
    return [];
  },

  async getQuote(params: QuoteParams): Promise<QuoteRoute[]> {
    // Illustrative 1:1 echo; real routes come from the aggregator.
    const token = (address: string, symbol: string): QuoteToken => ({
      tokenContractAddress: address,
      tokenSymbol: symbol,
      tokenUnitPrice: "1",
      decimal: "18",
      isHoneyPot: false,
      taxRate: "0",
    });
    return [
      {
        quoteId: "mock",
        vendorName: "mock",
        executionMode: "SWAP",
        binanceChainId: String(params.chainId ?? 56),
        fromTokenAmount: params.amount,
        toTokenAmount: params.amount,
        approveTarget: "0x0000000000000000000000000000000000000000",
        isBest: true,
        fromToken: token(params.fromTokenAddress, "FROM"),
        toToken: token(params.toTokenAddress, "TO"),
        mock: true,
      },
    ];
  },
};
