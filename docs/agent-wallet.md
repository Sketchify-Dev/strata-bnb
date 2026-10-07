# The agent wallet (burner) and how to fund it

Strata's rebalancing agent signs its own transactions, so it needs its own key.
This is deliberate: an autonomous agent that rebalances 24/7 cannot ask a human
to click-sign at 3am, and "an agent with its own wallet and identity" is exactly
what the BNB Agent Studio track rewards.

This wallet is a **burner**. It exists only to hold a tiny demo float and execute
rebalances. Treat it as disposable.

## Non-negotiable safety rules

- **Burner only.** Generate a brand-new wallet. Never use your main wallet, and
  never put a key here that controls anything beyond the demo float.
- **Tiny float.** A BSC swap costs a few cents of gas, so the practical minimum
  is small: roughly $3 to $5 of USDT plus about $0.50 of BNB for gas is enough
  for a live rebalance. There is no need for $20+.
- **Key lives only in `.env.local`.** That file is gitignored. Never commit it,
  never add a `NEXT_PUBLIC_` prefix, never paste the key into a chat or a client
  component. The server reads `AGENT_WALLET_PRIVATE_KEY` and nothing logs it.
- **Drain and discard** the wallet after the hackathon.

## Simulate-only until funded

You do not need funds to build or demo most of the flow. With no key set, or with
`AGENT_EXECUTION_MODE=simulate` (the default), the app quotes, applies the
liquidity guardrail, and **simulates** every transaction, but never broadcasts.
Only when you set a real burner key AND `AGENT_EXECUTION_MODE=live` does broadcast
become possible, and even then each broadcast still needs an explicit go-ahead.

So the order is: build and prove the loop on `simulate` now (no money), then flip
to `live` and fund the burner when you are ready for a real on-chain rebalance.

## 1. Generate the burner

Pick either option.

**Option A: from a wallet app (works right now, no tooling).**
1. In MetaMask or Binance Web3 Wallet, create a NEW account (do not reuse one).
2. Make sure it is on BNB Smart Chain (chain id 56).
3. Copy its address (for funding later).
4. Export its private key and paste it into `.env.local` as
   `AGENT_WALLET_PRIVATE_KEY=0x...`.

**Option B: from the CLI (after `npm i viem`).**
```bash
node -e "const {generatePrivateKey, privateKeyToAccount} = require('viem/accounts'); const pk = generatePrivateKey(); console.log('ADDRESS   :', privateKeyToAccount(pk).address); console.log('PRIVATE KEY:', pk);"
```
Copy the address for funding, and put the private key in `.env.local`. Do not
paste the key anywhere else.

## 2. Put it in `.env.local`

```
AGENT_WALLET_PRIVATE_KEY=0xyour_burner_key_here
BSC_RPC_URL=https://bsc-dataseed.binance.org
AGENT_EXECUTION_MODE=simulate
```

## 3. Fund it (only when ready to go live)

The agent settles in USDT and pays gas in BNB, both on BNB Smart Chain (BEP-20).

1. Send a small amount of **USDT (BEP-20, on BSC)** to the burner address, e.g.
   $3 to $5.
2. Send a small amount of **BNB** for gas, about $0.50 is plenty for several
   swaps.
3. Double-check the network is BNB Smart Chain before sending. USDT sent on a
   different chain will not arrive.

Then set `AGENT_EXECUTION_MODE=live` and restart the dev server. The agent can
now broadcast, still only after you approve each action.

## What the app does with this

- Reads `AGENT_WALLET_PRIVATE_KEY` server-side to build and sign transactions.
- Approves USDT to the aggregator's spender only when the current allowance is
  short.
- Simulates every swap before broadcasting.
- Broadcasts only in `live` mode and only with an explicit per-action go-ahead,
  then surfaces the BSC transaction hash.

USDT on BSC is `0x55d398326f99059fF775485246999027B3197955` (18 decimals).
