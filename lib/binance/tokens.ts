// Well-known BNB Smart Chain (chainId 56) token constants.
//
// USDT is the unit of account for every basket order: the buy flow and the
// rebalancing agent quote and settle token legs against USDT. On BSC, USDT and
// WBNB are both 18-decimal (unlike Ethereum/Tron USDT, which is 6) - confirmed
// against live quote payloads.

export const BSC_CHAIN_ID = 56;

export interface KnownToken {
  address: string;
  symbol: string;
  decimals: number;
}

/** Binance-Peg USD (BSC USDT). 18 decimals on BSC. Basket settlement currency. */
export const USDT: KnownToken = {
  address: "0x55d398326f99059fF775485246999027B3197955",
  symbol: "USDT",
  decimals: 18,
};

/** Wrapped BNB. Used as an AMM control and for gas-token math. */
export const WBNB: KnownToken = {
  address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  symbol: "WBNB",
  decimals: 18,
};
