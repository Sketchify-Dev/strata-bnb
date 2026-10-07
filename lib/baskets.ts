/**
 * Basket definitions.
 *
 * A basket is a curated, target-weighted set of tokenized equities that maps
 * onto a market theme. These weights and holdings are the real, honest
 * structure of each product; live prices and market status come from the
 * Binance Web3 RWA data API at runtime (see lib/binance/rwa + lib/binance/pricing).
 *
 * Provider: Ondo Finance is currently the only tokenized-stock provider on
 * Binance Web3 (RWA `type = 1`). On-chain token symbols use the "on" suffix
 * (e.g. AAPL -> AAPLon). Each holding carries its real BNB Smart Chain (chainId
 * 56) contract address, confirmed live from the official token list. The shares
 * multiplier (1 token = N shares) is intentionally NOT stored here: it drifts as
 * dividends accrue, so it is read live per price query.
 */

export type Provider = "Ondo" | "xStock" | "bStock";

export type Holding = {
  /** Reference ticker, e.g. AAPL. */
  symbol: string;
  /** On-chain token symbol, e.g. AAPLon. */
  onchainSymbol: string;
  name: string;
  /** Target weight within the basket, 0..1. Weights in a basket sum to 1. */
  weight: number;
  provider: Provider;
  /** Token contract address on BNB Smart Chain (chainId 56). */
  address: string;
};

export type Basket = {
  id: string;
  /** Short code shown like an index ticker, e.g. MAG7. */
  code: string;
  name: string;
  /** One line, shown on the card. */
  tagline: string;
  /** One short paragraph, shown on the detail view. */
  thesis: string;
  /** Ties to an RWA API sector filter. */
  sector: string;
  /** Accent hex for the card. Stays within the brand's restrained palette. */
  accent: string;
  holdings: Holding[];
};

function normalize(holdings: Holding[]): Holding[] {
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total === 0) return holdings;
  return holdings.map((h) => ({ ...h, weight: h.weight / total }));
}

/** An Ondo tokenized-equity holding with its real BSC contract address. */
function ondo(
  symbol: string,
  name: string,
  weight: number,
  address: string,
): Holding {
  return {
    symbol,
    onchainSymbol: `${symbol}on`,
    name,
    weight,
    provider: "Ondo",
    address,
  };
}

export const BASKETS: Basket[] = [
  {
    id: "mag7",
    code: "MAG7",
    name: "Magnificent 7",
    tagline: "The seven companies carrying the market.",
    thesis:
      "The mega-cap engine of US equity returns in a single position. Cap-tilted across the seven names that dominate the index, tokenized and self-custodied so the theme trades whenever you do.",
    sector: "Magnificent 7",
    accent: "#f0b90b",
    holdings: normalize([
      ondo("NVDA", "NVIDIA", 0.2, "0xa9ee28c80f960b889dfbd1902055218cba016f75"),
      ondo("AAPL", "Apple", 0.18, "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4"),
      ondo("MSFT", "Microsoft", 0.18, "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3"),
      ondo("GOOGL", "Alphabet", 0.14, "0x091fc7778e6932d4009b087b191d1ee3bac5729a"),
      ondo("AMZN", "Amazon", 0.14, "0x4553cfe1c09f37f38b12dc509f676964e392f8fc"),
      ondo("META", "Meta Platforms", 0.1, "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6"),
      ondo("TSLA", "Tesla", 0.06, "0x2494b603319d4d9f9715c9f4496d9e0364b59d93"),
    ]),
  },
  {
    id: "chips",
    code: "CHIPS",
    name: "AI Chips",
    tagline: "The silicon the whole boom runs on.",
    thesis:
      "Concentrated exposure to the designers and foundries behind every AI workload. From accelerators to the fabs that print them, one tap owns the supply chain instead of a single bet.",
    sector: "AI Chips",
    accent: "#4c8dff",
    holdings: normalize([
      ondo("NVDA", "NVIDIA", 0.28, "0xa9ee28c80f960b889dfbd1902055218cba016f75"),
      ondo("AVGO", "Broadcom", 0.18, "0x0ed2e3180edf393e6bf8db124bd15ddd54de150a"),
      ondo("AMD", "Advanced Micro Devices", 0.16, "0x9f16e46c73b43bdb70861247d537bee4ea18f639"),
      ondo("TSM", "Taiwan Semiconductor", 0.16, "0xc37042a7a4fa510d8884a433762ab87257b91965"),
      ondo("ASML", "ASML Holding", 0.12, "0xb034f6cb52b7f2fd5a7eeeffca6b9adcd6b9a6f6"),
      ondo("MU", "Micron Technology", 0.1, "0x8b6acf6041a81567f012ff6a4c6d96d5818d74bf"),
    ]),
  },
  {
    id: "omaha",
    code: "OMAHA",
    name: "Buffett Portfolio",
    tagline: "Own what Omaha owns.",
    thesis:
      "A tokenized read on Berkshire's largest public positions: durable franchises, pricing power, and cash generation. The patient, quality end of the market, balanced automatically.",
    sector: "Buffett Portfolio",
    accent: "#16c784",
    holdings: normalize([
      ondo("AAPL", "Apple", 0.3, "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4"),
      ondo("AXP", "American Express", 0.16, "0xd803f8777187d6dee1ea57854aeb957043fb1675"),
      ondo("BAC", "Bank of America", 0.14, "0xd615468088b19fb9d4f03cb3ce9e33876ff3db99"),
      ondo("KO", "Coca-Cola", 0.14, "0x405f38b90bebf1259062cf29da299f3398662bcb"),
      ondo("CVX", "Chevron", 0.13, "0xd3113a0ad20a46f6a662c63fe8e637f7713e59c7"),
      ondo("OXY", "Occidental Petroleum", 0.13, "0x01b5a4ac600be98448dbefbb78bcdf38262552cc"),
    ]),
  },
  {
    id: "cloud",
    code: "CLOUD",
    name: "Cloud & Software",
    tagline: "The recurring-revenue layer of the economy.",
    thesis:
      "The platforms that meter the internet by the seat and the API call. High-margin, compounding software names bundled into one balanced, tokenized position.",
    sector: "Software",
    accent: "#9b7bff",
    holdings: normalize([
      ondo("MSFT", "Microsoft", 0.22, "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3"),
      ondo("ORCL", "Oracle", 0.16, "0x03e4bd1ea53f1da84513da0319d1f03dd1bbcf93"),
      ondo("CRM", "Salesforce", 0.16, "0xd04a2bb053277721a8321d7441eed5b42fdf7250"),
      ondo("NOW", "ServiceNow", 0.16, "0xeb19c13c54b1cd48afc62f6503375e92d5f1e856"),
      ondo("ADBE", "Adobe", 0.15, "0xcb22db0ecb6fe58b7b47db443dcfdfdfbf729cef"),
      ondo("SNOW", "Snowflake", 0.15, "0x138ed6833ff4e8811e1fea0d005e13726c8886f9"),
    ]),
  },
];

export function getBasket(id: string): Basket | undefined {
  return BASKETS.find((b) => b.id === id);
}

/** Distinct provider labels used across a basket. */
export function basketProviders(basket: Basket): Provider[] {
  return Array.from(new Set(basket.holdings.map((h) => h.provider)));
}
