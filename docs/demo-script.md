# Strata demo video, recording guide

This is a shot list for the demo video (<= 4 min). It is a recording guide, NOT
the Developer Experience report. Per the hackathon rules the DevEx report must be
written by you; an AI-written report is grounds for rejection. Keep this guide for
yourself and record from it.

## The 10-second opener (say first, over the landing hero)

"Buy a whole theme of tokenized stocks in one tap. Then an agent with its own
wallet keeps it balanced 24/7 through your Binance Web3 Wallet, and it refuses to
trade when the liquidity is a trap. You keep custody; it does the babysitting."

## Honesty rules (say what is real on camera)

- REAL, live on BSC mainnet (all verifiable on BscScan):
  - The signed quotes, the RWA on-chain reference prices, and the liquidity
    guardrail catching an off-market route (MSFTon).
  - The agent's wallet signing AND BROADCASTING transactions autonomously, from
    its own key. We did this three times: two USDT approves and one actual
    NVDAon purchase. Show the hashes (below).
- SIMULATED, and say so: the multi-leg rebalance decision (quote, guardrail,
  preflight, then it stops before signing). Call it "simulate mode, no broadcast."
- Do NOT claim an autonomous multi-asset rebalance if you only show the single
  real buy. The accurate line: "the agent autonomously bought a tokenized stock
  on-chain; the full multi-leg rebalance runs in simulate here."

## Real mainnet hashes to show on BscScan

- Agent buys NVDAon (the money-shot): `0x9eb3e95b72c781e536810167105c03167c32af40c63820cc272cabb29d9fb477`
- Agent approves USDT (6): `0xfc15671bb95900c81800c3b87fd45c1457cb1dbdd3eb34c8b01ac0de8635ee6a`
- Agent approves USDT (5): `0x3be3e991f17b8b301619812990ddf5299aef7dae1f9277605e014ec2ec8ee32e`
- Agent wallet: `0xD7F2ad868ae53de84F3666661Ce96592C6948C6B` (its own key, its own gas)

## Shot list (~3.5 min of content)

1. 0:00-0:12  Landing hero. Read the opener. (story)
2. 0:12-0:45  "THE EDGE" section. Point at the real MSFTon capture: a router
   would fill at $1,030,453,124 per token vs the $511.52 live mark, 201,448,575%
   off, verdict HELD. Line: "This is our edge. It knows when not to trade."
3. 0:45-1:25  Open the app, pick a basket, use the buy panel. Enter an amount and
   a wallet, "Get live quote." Show the per-leg verdicts: most Ready, one Held.
   Line: "Six legs execute, the trap leg is held, not force-filled. Live on
   mainnet right now."
4. 1:25-2:10  Go to the Agent page. Show live drift computed from real 24h moves.
   Change the drift threshold; the plan updates live. Line: "Set one rule."
5. 2:10-3:05  Click "Dry run: buy X". Walk the steps on screen: fresh quote,
   guardrail verdict, preflight against the agent's OWN wallet, planned approve,
   would-sign, pending submit. Line: "The agent has its own wallet, funds its own
   gas through x402, and can never custody yours."
   Note: if the burner is funded and the RFQ submit path is wired before you
   record, end this shot on a real BSC transaction hash. That is the strongest
   possible ending.
6. 3:05-3:30  Return to the pitch. "Built on Binance Web3 Wallet and BNB Agent
   Studio." Close.

## Say each sponsor-capability at least once

- BNB Agent Studio: agent identity and its own wallet, autonomous runtime,
  self-funding via x402.
- Binance Web3 Wallet: agentic execution without custody.
- Our own edge: the liquidity guardrail. Real domain insight, not generic AI.

## Logistics

- Keep it under 4 minutes. Screen-record at 1440p or higher. Default dark theme.
- Before recording, set a burner key in `.env.local` (no funds needed, see
  `docs/agent-wallet.md`) so the Dry run shows the full pipeline instead of
  "wallet not set."
- Have the market session in mind: the guardrail and quotes read best during US
  market hours or premarket, when makers are active.
