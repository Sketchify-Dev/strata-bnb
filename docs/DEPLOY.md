# Deploying Strata (GitHub + Vercel)

Two deploy realities to respect, both verified concerns, not guesses:

1. **This is a modified Next.js 16.3.6.** A production `next build` MUST pass
   locally before trusting Vercel, and Vercel must resolve the same `next`
   version. If `npm install` on Vercel can't get `next@16.3.6`, the build fails.
2. **Binance geoblocks US IPs; Vercel defaults to US.** From a US serverless
   region the signed quote/guardrail calls and the public RWA price feed will
   fail the same way they failed on your network. Fix: run the Vercel project's
   functions in a **non-US region** (Frankfurt `fra1` or Singapore `sin1`).

## The split: what runs where

- **Hosted (Vercel):** the UI, baskets, live quotes + guardrail, and the agent
  **dry-run** (simulate). NO private key on the host, so it can never broadcast.
- **Local (your machine, WARP on, funded burner):** the real on-chain execution.
  The three real tx hashes are already captured; the video is recorded locally.

Do NOT put the funded burner key in Vercel. Hosted stays simulate-only.

## Step 1 - confirm the production build (critical, do first)

```
cd /home/sketchify/bnb-hackathon
cat .npmrc 2>/dev/null || echo "(no .npmrc - uses public npm registry)"
ls -la package-lock.json 2>/dev/null || echo "(no lockfile yet)"
npm run build && echo BUILD_OK
```
- `BUILD_OK` → safe to deploy.
- If `.npmrc` points at a private/custom registry, Vercel won't reach it; tell me
  and we handle it (vendor the dep or switch registry).
- Commit the lockfile so Vercel installs the exact same tree.

## Step 2 - push to GitHub

Confirm no secrets are tracked (`.env.local` must NOT appear):
```
git status --short
git ls-files | grep -E '\.env' || echo "(no env files tracked - good)"
```
Then (if not already a remote):
```
gh repo create strata-bnb --private --source=. --remote=origin --push
```
or, with an existing empty GitHub repo:
```
git remote add origin <your repo url>
git add -A && git commit -m "Strata: tokenized-stock baskets + rebalancing agent"
git push -u origin main
```

## Step 3 - deploy on Vercel

1. Import the GitHub repo at vercel.com/new.
2. **Project Settings -> Functions -> Region: Frankfurt (fra1)** (or Singapore).
   This is what dodges the Binance US geoblock. Do this before the first build.
3. **Environment Variables** (Production):
   - `BINANCE_WEB3_API_KEY` = (your key)
   - `BINANCE_WEB3_SECRET_KEY` = (your secret)
   - `AGENT_EXECUTION_MODE` = `simulate`
   - Do NOT set `AGENT_WALLET_PRIVATE_KEY`. (Hosted agent page shows "wallet not
     configured", which is correct and safe. Optional: a FRESH zero-funded burner
     key gives a richer hosted dry-run, still simulate-only; never the funded one.)
   - `BSC_RPC_URL` optional (the app has a public-RPC fallback list).
4. Deploy.

## Step 4 - verify the hosted site

- Landing + baskets render.
- A basket's "Get live quote" returns per-leg verdicts (confirms the region fix
  reached Binance). If quotes error, the region is still US, recheck Step 3.2.
- Agent page loads; the dry-run reflects the no-key / simulate posture.

## Reminder

The demo video is recorded LOCALLY (WARP on, funded burner, live execution), not
from the hosted site. The hosted URL is the clickable product for judges; the
video is where the real signed transactions happen.
