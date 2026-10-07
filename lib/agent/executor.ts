// Rebalancing agent executor. Server-only. Turns ONE basket leg into an
// executable swap, gated by the SAME liquidity guardrail as the buy flow.
//
// Ondo tokenized stocks route as a normal EVM swap (executionMode "SWAP",
// rfq: null): /dex/aggregator/swap returns an unsigned transaction we sign and
// broadcast. There is no EIP-712 order submit.
//
// Safety model:
//   - simulate mode (default): ZERO authorizations. Fetches a fresh quote, runs
//     the guardrail, reads balances, and builds the approve calldata for display,
//     but never signs, approves, or broadcasts.
//   - live mode: requires AGENT_EXECUTION_MODE=live (a valid burner key) AND an
//     explicit per-call goAhead. Even then it re-quotes, re-checks the guardrail,
//     and simulates the swap (eth_call) BEFORE broadcasting. Never silent.
//
// Buy side (USDT -> token). The sell side is symmetric and reuses the evaluator.

import type { Basket, Holding } from "@/lib/baskets";
import { getBinanceApi } from "@/lib/binance";
import { binanceGet } from "@/lib/binance/client";
import { getRwaDynamic } from "@/lib/binance/rwa";
import type { QuoteRoute, SwapResult } from "@/lib/binance/types";
import { USDT, BSC_CHAIN_ID } from "@/lib/binance/tokens";
import {
  bestRoute,
  evaluateRoute,
  toBaseUnits,
  toNum,
  type LegStatus,
} from "@/lib/binance/quote-basket";
import { encodeApprove } from "@/lib/chain/erc20";
import {
  getAgentAccount,
  getAgentAddress,
  getPublicClient,
  getWalletClient,
} from "@/lib/chain/client";
import { getExecutionConfig, type ExecutionMode } from "./exec-config";
import { checkFunding } from "./preflight";
import { bsc } from "viem/chains";
import type { Address, Hex } from "viem";

export type StepStatus = "done" | "planned" | "skipped" | "blocked" | "pending";

export interface ExecStep {
  key: "quote" | "guardrail" | "preflight" | "approve" | "swap";
  label: string;
  status: StepStatus;
  detail: string;
}

export type ExecOutcome =
  | "not_configured"
  | "blocked"
  | "dry_run_complete"
  | "submitted";

export interface ExecutionResult {
  mode: ExecutionMode;
  wallet: string | null;
  symbol: string;
  onchainSymbol: string;
  orderUsdt: number;
  guardrail: LegStatus | null;
  tokensOut: number | null;
  executablePrice: number | null;
  referencePrice: number | null;
  deviationPct: number | null;
  approveTarget: string | null;
  /** On-chain swap tx hash once broadcast, else null. */
  txHash: string | null;
  steps: ExecStep[];
  outcome: ExecOutcome;
  reasons: string[];
  createdAt: string;
}

const SLIPPAGE = "0.5";

export interface ExecuteLegParams {
  basket: Basket;
  holding: Holding;
  /** USDT to spend on this leg (the buy side). */
  orderUsdt: number;
  /** Explicit per-action approval, required before anything live happens. */
  goAhead?: boolean;
}

export async function executeLeg(
  params: ExecuteLegParams,
): Promise<ExecutionResult> {
  const { holding, orderUsdt } = params;
  const cfg = getExecutionConfig();
  const wallet = getAgentAddress();

  const base = {
    mode: cfg.mode,
    wallet,
    symbol: holding.symbol,
    onchainSymbol: holding.onchainSymbol,
    orderUsdt,
    guardrail: null as LegStatus | null,
    tokensOut: null as number | null,
    executablePrice: null as number | null,
    referencePrice: null as number | null,
    deviationPct: null as number | null,
    approveTarget: null as string | null,
    txHash: null as string | null,
    createdAt: new Date().toISOString(),
  };
  const steps: ExecStep[] = [];

  // The agent acts on its OWN wallet, so it needs one configured to do anything.
  if (!wallet) {
    return {
      ...base,
      steps: [
        {
          key: "preflight",
          label: "Agent wallet",
          status: "blocked",
          detail:
            "No agent wallet configured. Set AGENT_WALLET_PRIVATE_KEY (a burner) to run a dry-run; no funds are needed for simulate.",
        },
      ],
      outcome: "not_configured",
      reasons: cfg.notes,
    };
  }

  // 1. Fresh single-leg quote.
  const amount = toBaseUnits(orderUsdt, USDT.decimals);
  let route: QuoteRoute | undefined;
  try {
    const routes = await getBinanceApi().getQuote({
      chainId: BSC_CHAIN_ID,
      fromTokenAddress: USDT.address,
      toTokenAddress: holding.address,
      amount,
      slippage: SLIPPAGE,
      userWalletAddress: wallet,
    });
    route = Array.isArray(routes) ? bestRoute(routes) : undefined;
  } catch (err) {
    const detail = describeError(err);
    steps.push({ key: "quote", label: "Quote", status: "blocked", detail });
    return { ...base, steps, outcome: "blocked", reasons: [detail] };
  }
  if (!route) {
    steps.push({
      key: "quote",
      label: "Quote",
      status: "blocked",
      detail: "No route returned by the aggregator for this leg.",
    });
    return { ...base, steps, outcome: "blocked", reasons: ["No route."] };
  }
  steps.push({
    key: "quote",
    label: "Quote",
    status: "done",
    detail: `Fresh route from ${route.vendorName ?? "aggregator"} (quote ${
      route.quoteId ?? "n/a"
    }).`,
  });

  // 2. Guardrail on the fresh route, via the shared evaluator.
  const ref = await getRwaDynamic(holding.address).catch(() => null);
  const referencePrice = toNum(ref?.tokenInfo?.price);
  const evaluation = evaluateRoute(route, referencePrice, orderUsdt);
  const approveTarget = route.approveTarget ?? null;

  const filled = {
    ...base,
    guardrail: evaluation.status,
    tokensOut: evaluation.tokensOut,
    executablePrice: evaluation.executablePrice,
    referencePrice: evaluation.referenceUsed,
    deviationPct: evaluation.deviationPct,
    approveTarget,
  };

  if (evaluation.status === "rejected") {
    steps.push({
      key: "guardrail",
      label: "Guardrail",
      status: "blocked",
      detail: evaluation.reasons.join(" "),
    });
    return { ...filled, steps, outcome: "blocked", reasons: evaluation.reasons };
  }
  steps.push({
    key: "guardrail",
    label: "Guardrail",
    status: "done",
    detail:
      evaluation.reasons.length > 0
        ? evaluation.reasons.join(" ")
        : "Executable price sits at the on-chain mark.",
  });

  if (!approveTarget) {
    steps.push({
      key: "preflight",
      label: "Preflight",
      status: "blocked",
      detail: "Quote returned no approve target; cannot size the approval.",
    });
    return {
      ...filled,
      steps,
      outcome: "blocked",
      reasons: ["No approve target on the quote."],
    };
  }

  // 3. Funding preflight (balances + allowance), best-effort.
  const requiredBase = BigInt(amount);
  const funding = await checkFunding(
    requiredBase,
    approveTarget as Address,
  ).catch(() => null);

  const funded = !!funding && funding.enoughUsdt && funding.enoughGas;
  const needsApprove = !funding?.allowanceOk;
  const fundDetail = funding
    ? [
        funding.enoughUsdt ? "USDT ok" : "USDT short",
        funding.enoughGas ? "gas ok" : "gas short",
        funding.allowanceOk ? "allowance ok" : "approval needed",
      ].join(" · ")
    : "balances unavailable (RPC)";

  steps.push({
    key: "preflight",
    label: "Preflight",
    status: cfg.mode === "simulate" ? "done" : funded ? "done" : "blocked",
    detail: fundDetail,
  });

  // --- Simulate mode: build the approve calldata for display, then STOP. -------
  if (cfg.mode === "simulate") {
    if (needsApprove) {
      const calldata = encodeApprove(approveTarget as Address, requiredBase);
      steps.push({
        key: "approve",
        label: "Approve USDT",
        status: "planned",
        detail: `Approve ${orderUsdt} USDT to ${short(approveTarget)} (calldata ${short(
          calldata,
        )}) — not sent in simulate.`,
      });
    } else {
      steps.push({
        key: "approve",
        label: "Approve USDT",
        status: "skipped",
        detail: "Allowance already covers this order.",
      });
    }
    steps.push({
      key: "swap",
      label: "Swap",
      status: "pending",
      detail:
        "Simulate-only: the swap is checked but not signed or broadcast. Enable live mode and fund the wallet to execute.",
    });
    return { ...filled, steps, outcome: "dry_run_complete", reasons: [] };
  }

  // --- Live mode: real approve + swap, each behind the go-ahead gate. ----------
  if (!funded) {
    const reason = funding
      ? "Insufficient USDT and/or BNB gas to execute."
      : "Could not read on-chain balances.";
    steps.push({ key: "swap", label: "Swap", status: "blocked", detail: reason });
    return { ...filled, steps, outcome: "blocked", reasons: [reason] };
  }
  if (!params.goAhead) {
    steps.push({
      key: "swap",
      label: "Swap",
      status: "pending",
      detail: "Live mode: awaiting explicit go-ahead before any broadcast.",
    });
    return {
      ...filled,
      steps,
      outcome: "blocked",
      reasons: ["Awaiting explicit go-ahead."],
    };
  }

  const account = getAgentAccount();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  if (!account || !walletClient) {
    steps.push({
      key: "swap",
      label: "Swap",
      status: "blocked",
      detail: "Agent wallet client unavailable.",
    });
    return { ...filled, steps, outcome: "blocked", reasons: ["No wallet client."] };
  }

  // a. Approve USDT to the router if the allowance is short.
  if (needsApprove) {
    try {
      const approveData = encodeApprove(approveTarget as Address, requiredBase);
      const approveHash = await walletClient.sendTransaction({
        account,
        chain: bsc,
        to: USDT.address as Address,
        data: approveData,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      steps.push({
        key: "approve",
        label: "Approve USDT",
        status: "done",
        detail: `Approved ${orderUsdt} USDT. tx ${approveHash}`,
      });
    } catch (err) {
      const d = describeError(err);
      steps.push({ key: "approve", label: "Approve USDT", status: "blocked", detail: d });
      return { ...filled, steps, outcome: "blocked", reasons: [`Approve failed: ${d}`] };
    }
  } else {
    steps.push({
      key: "approve",
      label: "Approve USDT",
      status: "skipped",
      detail: "Allowance already covers this order.",
    });
  }

  // b. Re-quote for a fresh quoteId (the approve wait can age the first one) and
  //    re-run the guardrail: never execute a route that just went off-market.
  let liveRoute = route;
  try {
    const freshRoutes = await getBinanceApi().getQuote({
      chainId: BSC_CHAIN_ID,
      fromTokenAddress: USDT.address,
      toTokenAddress: holding.address,
      amount,
      slippage: SLIPPAGE,
      userWalletAddress: wallet,
    });
    const fresh = Array.isArray(freshRoutes) ? bestRoute(freshRoutes) : undefined;
    if (fresh) {
      const freshEval = evaluateRoute(fresh, referencePrice, orderUsdt);
      if (freshEval.status === "rejected") {
        steps.push({
          key: "swap",
          label: "Swap",
          status: "blocked",
          detail: `Re-quote failed the guardrail: ${freshEval.reasons.join(" ")}`,
        });
        return { ...filled, steps, outcome: "blocked", reasons: freshEval.reasons };
      }
      liveRoute = fresh;
    }
  } catch {
    /* keep the original route/quoteId if the re-quote hiccups */
  }

  // c. Fetch the executable swap transaction.
  let swap: SwapResult;
  try {
    swap = await binanceGet<SwapResult>("/dex/aggregator/swap", {
      binanceChainId: BSC_CHAIN_ID,
      fromTokenAddress: USDT.address,
      toTokenAddress: holding.address,
      amount,
      slippagePercent: SLIPPAGE,
      userWalletAddress: wallet,
      quoteId: liveRoute.quoteId,
    });
  } catch (err) {
    const d = describeError(err);
    steps.push({ key: "swap", label: "Swap", status: "blocked", detail: d });
    return { ...filled, steps, outcome: "blocked", reasons: [`Swap build failed: ${d}`] };
  }
  const tx = swap?.tx;
  if (!tx?.to || !tx?.data) {
    steps.push({
      key: "swap",
      label: "Swap",
      status: "blocked",
      detail: "Swap endpoint returned no transaction.",
    });
    return { ...filled, steps, outcome: "blocked", reasons: ["No swap tx."] };
  }

  // d. Simulate (eth_call) before broadcasting, per the never-silent rule.
  try {
    await publicClient.call({
      account,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: BigInt(tx.value ?? "0"),
    });
  } catch (err) {
    const d = describeError(err);
    steps.push({
      key: "swap",
      label: "Swap",
      status: "blocked",
      detail: `Simulation reverted, not broadcasting: ${d}`,
    });
    return { ...filled, steps, outcome: "blocked", reasons: [`Simulation reverted: ${d}`] };
  }

  // e. Broadcast and wait for the receipt.
  try {
    const hash = await walletClient.sendTransaction({
      account,
      chain: bsc,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: BigInt(tx.value ?? "0"),
      gas: tx.gas ? BigInt(tx.gas) : undefined,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const ok = receipt.status === "success";
    steps.push({
      key: "swap",
      label: "Swap",
      status: ok ? "done" : "blocked",
      detail: `${ok ? "Confirmed" : "Reverted"} on BSC. tx ${hash}`,
    });
    return {
      ...filled,
      txHash: hash,
      steps,
      outcome: ok ? "submitted" : "blocked",
      reasons: ok ? [] : ["Swap transaction reverted on-chain."],
    };
  } catch (err) {
    const d = describeError(err);
    steps.push({ key: "swap", label: "Swap", status: "blocked", detail: d });
    return { ...filled, steps, outcome: "blocked", reasons: [`Broadcast failed: ${d}`] };
  }
}

function short(s: string | null): string {
  if (!s) return "-";
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** Unwrap a fetch/chain error to its underlying cause (ENOTFOUND, revert, etc.). */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "Request failed.";
  const cause = (err as { cause?: unknown }).cause;
  let extra = "";
  if (cause instanceof Error) extra = cause.message;
  else if (cause && typeof cause === "object" && "code" in cause) {
    extra = String((cause as { code: unknown }).code);
  } else if (cause) {
    extra = String(cause);
  }
  return extra ? `${err.message}: ${extra}` : err.message;
}
