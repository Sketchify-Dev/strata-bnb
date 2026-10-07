# Binance Web3 Wallet API - working reference

Verified against `web3.binance.com/en/dev-docs/` (`llms-full.txt`) on 2026-09-27. This is our build reference and the raw material for the Developer Experience Report. Anything marked TODO must be confirmed against the live docs once we have a key.

## Auth and transport

- **Base URL:** `https://web3.binance.com/build`
- **Request URL:** base + `/api/v1/...`
- **Signed `requestPath`:** must include the `/build` prefix, e.g. `/build/api/v1/dex/aggregator/quote?...` (query string included).
- **Host header:** `web3.binance.com`

Required headers on every call:

| Header | Value |
| --- | --- |
| `X-OC-APIKEY` | your API key |
| `X-OC-TIMESTAMP` | ISO 8601 with ms, e.g. `2026-09-27T10:08:57.715Z` |
| `X-OC-SIGN` | Base64 signature (below) |

Optional: `X-OC-RECV-WINDOW` (default `5000`, max `60000`), `X-OC-NONCE`.

**Signature (HMAC):**

```
preHash   = timestamp + method + requestPath + body
signature = Base64( HMAC-SHA256(preHash, secretKey) )
```

- `method` is upper-case (`GET`, `POST`).
- `requestPath` includes `/build` and the full query string for GETs.
- `body` is the raw JSON string for POSTs, empty string for GETs.
- Ed25519 / asymmetric keys are also supported per the SDK docs (TODO confirm header差异 if we use them).

**Response envelope `OCResult<T>`:**

```jsonc
{ "code": 0, "msg": "", "data": { /* T */ }, "timestamp": 0, "success": true }
```

`code === 0` means success; non-zero is an error code. Wallet and Transaction endpoints always return HTTP 200, so never trust the HTTP status alone: read `code`.

**Rate limits:** 5 RPS per endpoint; 1200 / 60s per IP and per API key; 6000 / 60s per user. Over limit returns HTTP 429 with `Retry-After`.

## Chains

BSC mainnet is `chainId` / `binanceChainId` = **56** (our only target this edition). Solana is `CT_501`, Tron `CT_195`, ETH `1`.

## RWA / tokenized equities

There is no separate "RWA Data API" namespace in the docs we pulled. Tokenized equities surface **inside the Trading (aggregator) API**, tagged by provider type:

| Provider | `type` |
| --- | --- |
| Ondo | 1 |
| xStock | 2 |
| bStock | 3 |

There is also a wallet skill `binance-tokenized-securities-info` that returns tokenized-securities metadata. TODO: confirm the exact token-list endpoint + query params for filtering by `type` and by sector once we have a key (the Trading API doc section was truncated in `llms-full.txt`).

## Market API

- `GET /api/v1/dex/market/price?chainId=56&symbol=<SYMBOL>` - real-time price.
- Candlesticks / analytics: referenced, endpoints TODO.

## Trading API (DEX aggregator)

| Purpose | Method | Path |
| --- | --- | --- |
| Supported chains | GET | `/api/v1/dex/aggregator/supported/chain` |
| Get quote | GET | `/api/v1/dex/aggregator/quote` |
| Execute swap | GET | `/api/v1/dex/aggregator/swap` |
| Quote + swap | GET | `/api/v1/dex/aggregator/quote-and-swap` |
| Approve token | GET | `/api/v1/dex/aggregator/approve-transaction` |
| Tx status | GET | `/api/v1/dex/aggregator/history` |
| Submit RFQ order | POST | `/api/v1/dex/aggregator/order/submit` |
| RFQ order status | GET | `/api/v1/dex/aggregator/order/{orderId}` |

Key fields: `executionMode` (`SWAP` | `RFQ`), `quoteId` (TTL 30s), `userWalletAddress` (required for RFQ), `vendor`/`vendorName` (Flash currently only `LiquidMesh`), `rfq.typedDataToSign` (EIP-712 to sign), `requestId` (idempotency UUID), `tx` / `swapTransaction` (unsigned calldata to broadcast).

## Transaction API

| Purpose | Method | Path |
| --- | --- | --- |
| Supported chains | GET | `/api/v1/dex/pre-transaction/supported/chain` |
| Gas price | GET | `/api/v1/dex/pre-transaction/gas-price` |
| Latest block height | GET | `/api/v1/dex/pre-transaction/block-height` |
| Gas limit | POST | `/api/v1/dex/pre-transaction/gas-limit` |
| Simulate | POST | `/api/v1/dex/pre-transaction/simulate` |
| Broadcast | POST | `/api/v1/dex/pre-transaction/broadcast-transaction` |
| Broadcast orders | GET | `/api/v1/dex/post-transaction/orders` |

Key fields: `binanceChainId`, `address`, `evmTx` (with `gasLimit`, `gasPrice`), `solTx`, `limit` [1,100]. Broadcast needs one of `evmTx` / `solTx`. KYT rejection codes on broadcast: `40311`-`40314`, `40434`.

Our buy flow uses this as the "dry run then live" path: quote (Trading) -> simulate (Transaction) -> broadcast (Transaction).

## Wallet API

| Purpose | Method | Path |
| --- | --- | --- |
| Supported chains | GET | `/api/v1/dex/balance/supported/chain` |
| All token balances | GET | `/api/v1/dex/balance/all-token-balances-by-address` |
| Balances by address | POST | `/api/v1/dex/balance/token-balances-by-address` |
| Tx history | GET | `/api/v1/dex/post-transaction/transactions-by-address` |
| Tx detail | GET | `/api/v1/dex/post-transaction/transaction-detail-by-txhash` |

Key fields: `address`, `pageSize` [1,100], `tokenContractAddresses`, `binanceChainId`, `tokenContractAddress`.

## DeFi API

Referenced only ("DeFi positions, protocols, investments and tx building"); no paths in the excerpt. TODO once we have a key.

## Realtime (WebSocket)

- `wss://web3-stream.binance.com/w3w/stream?token=<token>` (token from a "Get WebSocket Auth Token" REST call, TODO path).
- Subscribe frame: `{ id, method: "SUBSCRIBE" | "UNSUBSCRIBE" | "LIST_SUBSCRIPTIONS" | ..., params }`. Data frame: `{ stream, data }`.
- Limits: <=10 subscribe msgs/sec, <=1024 streams/connection, <=24h/connection, ping every 3 min.

## Agentic layer (both special prizes)

- **SDK:** `@binance-web3/wallet` (npm, Node 22.12+), also Python `binance-web3-wallet` and Java `io.github.binance:binance-web3-wallet`.
- **Skills:** `binance/binance-skills-hub`, install `npx skills add https://github.com/binance/binance-skills-hub`. 10 read skills + 2 agentic. The read skill `binance-tokenized-securities-info` and the agentic `binance-agentic-wallet` (wallet mgmt, transfers, market swaps, limit orders, DeFi) are the ones relevant to us.
- **BNB Agent Studio:** one-prompt deploy of a persistent on-chain agent with ERC-8004 identity, ERC-8183 task interface, self-funding via x402, auto-registers an MCP server. TODO: confirm exact deploy flow (not in the excerpt we pulled).

## Error codes seen

`40001`, `40101`-`40104` (auth), `42900`, `50000`/`50001` (server), `40301`-`40303` (IP compliance), `40411` (chain), `40431` (broadcast), `40311`-`40314` + `40434` (KYT).
