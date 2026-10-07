// Probes the PUBLIC Binance Web3 RWA (Ondo tokenized stocks) data API.
// No auth: these are public `bapi` endpoints, a DIFFERENT service from the
// signed aggregator at web3.binance.com/build. Source of truth: the official
// binance-tokenized-securities-info skill.
//   API 3  market status  /.../rwa/market/status/ai
//   API 1  token list     /.../rwa/stock/detail/list/ai?type=1
//   API 5  dynamic data    /.../rwa/dynamic/ai?chainId&contractAddress
// Run: node scripts/rwa-probe.mjs

const BASE = "https://www.binance.com/bapi/defi";
const HEADERS = {
  "Accept-Encoding": "identity",
  "User-Agent": "binance-web3/1.1 (Skill)",
};

async function get(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
    return { http: res.status, ...json };
  } catch (e) {
    return { http: 0, error: String(e) };
  }
}

const LIST_URL = `${BASE}/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=1`;
const STATUS_URL = `${BASE}/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`;
const dynamicUrl = (chainId, addr) =>
  `${BASE}/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=${chainId}&contractAddress=${addr}`;

const run = async () => {
  console.log("=== API 3: Ondo market status ===");
  const st = await get(STATUS_URL);
  console.log(
    `http=${st.http} code=${st.code} openState=${st.data?.openState} reason=${st.data?.reasonCode} nextOpen=${st.data?.nextOpen} nextClose=${st.data?.nextClose}`,
  );

  console.log("\n=== API 1: token symbol list (type=1, Ondo) ===");
  const list = await get(LIST_URL);
  const data = Array.isArray(list.data) ? list.data : [];
  console.log(`http=${list.http} code=${list.code} success=${list.success} total=${data.length}`);
  if (!data.length) {
    console.log("no data; raw:", JSON.stringify(list).slice(0, 400));
    return;
  }

  const bsc = data.filter((t) => String(t.chainId) === "56");
  const eth = data.filter((t) => String(t.chainId) === "1");
  const bscTickers = new Set(bsc.map((t) => t.ticker));
  const ethOnly = eth.filter((t) => !bscTickers.has(t.ticker));

  console.log(`\n-- BSC (chainId 56): ${bsc.length} tokens --`);
  console.log("TICKER   SYMBOL     CONTRACT                                     MULT");
  for (const t of bsc.sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)))) {
    const mult = Number(t.multiplier);
    console.log(
      `${String(t.ticker).padEnd(8)} ${String(t.symbol).padEnd(10)} ${t.contractAddress}  ${Number.isFinite(mult) ? mult.toFixed(4) : t.multiplier}`,
    );
  }
  console.log(`\n-- Ethereum-only (not also on BSC): ${ethOnly.length} tickers --`);
  console.log(ethOnly.map((t) => t.ticker).join(", ") || "(none)");

  console.log("\n=== API 5: live dynamic data for first 3 BSC tokens ===");
  for (const t of bsc.slice(0, 3)) {
    const d = await get(dynamicUrl("56", t.contractAddress));
    const ti = d.data?.tokenInfo ?? {};
    const si = d.data?.stockInfo ?? {};
    const stt = d.data?.statusInfo ?? {};
    const mult = Number(ti.sharesMultiplier || t.multiplier || 1);
    const tokenPrice = Number(ti.price);
    const ref = mult ? tokenPrice / mult : tokenPrice;
    console.log(`\n${t.ticker} (${t.symbol})  http=${d.http} code=${d.code}`);
    console.log(`  tokenPrice=$${ti.price}  multiplier=${ti.sharesMultiplier}  refPrice/share=$${Number.isFinite(ref) ? ref.toFixed(2) : "?"}`);
    console.log(`  holders=${ti.totalHolders}  onchainMcap=$${ti.marketCap}  circSupply=${ti.circulatingSupply}`);
    console.log(`  stock: P/E=${si.priceToEarnings} divYld=${si.dividendYield}% 52w=[${si.priceLow52w}, ${si.priceHigh52w}] stockPrice=$${si.price}`);
    console.log(`  status: open=${stt.openState} marketStatus=${stt.marketStatus} reason=${stt.reasonCode}`);
  }
};

run().catch((e) => console.error("FATAL", e));
