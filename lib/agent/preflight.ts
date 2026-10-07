// Agent funding preflight. Answers two questions honestly, on-chain:
//   1. getAgentStatus() - is a wallet configured, and what does it hold? (UI)
//   2. checkFunding()   - can it afford a specific rebalance right now? (executor)
//
// Server-only (reads the chain via the agent client). Everything degrades
// gracefully: no key -> "not configured"; RPC hiccup -> nulls plus a note,
// never a thrown error that blanks the page.

import { formatUnits, type Address } from "viem";
import { USDT } from "@/lib/binance/tokens";
import { getExecutionConfig, type ExecutionMode } from "./exec-config";
import { getAgentAddress } from "@/lib/chain/client";
import { getAllowance, getErc20Balance, getNativeBalance } from "@/lib/chain/erc20";

export interface AgentStatus {
  /** True when a valid burner key is configured. */
  configured: boolean;
  mode: ExecutionMode;
  /** Agent wallet address, or null when unconfigured. */
  address: string | null;
  /** USDT balance in whole tokens, or null. */
  usdt: number | null;
  /** BNB (gas) balance in whole tokens, or null. */
  bnb: number | null;
  notes: string[];
}

/** Wallet + balances for the agent, for display. Cheap when unconfigured. */
export async function getAgentStatus(): Promise<AgentStatus> {
  const cfg = getExecutionConfig();
  const address = getAgentAddress();
  if (!address) {
    return {
      configured: false,
      mode: cfg.mode,
      address: null,
      usdt: null,
      bnb: null,
      notes: cfg.notes,
    };
  }

  const notes = [...cfg.notes];
  let usdt: number | null = null;
  let bnb: number | null = null;
  try {
    const [u, b] = await Promise.all([
      getErc20Balance(USDT.address as Address, address),
      getNativeBalance(address),
    ]);
    usdt = Number(formatUnits(u, USDT.decimals));
    bnb = Number(formatUnits(b, 18));
  } catch {
    notes.push("Could not read on-chain balances right now (RPC unavailable).");
  }

  return { configured: true, mode: cfg.mode, address, usdt, bnb, notes };
}

export interface FundingCheck {
  /** Enough USDT to cover the order. */
  enoughUsdt: boolean;
  /** Enough BNB to pay for gas. */
  enoughGas: boolean;
  /** USDT already approved to the spender covers the order. */
  allowanceOk: boolean;
  usdtBase: bigint;
  allowance: bigint;
  bnbWei: bigint;
}

// A swap on BSC costs a fraction of a cent; this is a comfortable gas floor.
const MIN_GAS_WEI = BigInt("2000000000000000"); // 0.002 BNB

/**
 * Can the agent execute an order of `requiredUsdtBase` (USDT base units) that
 * spends via `spender` (the quote's approveTarget)? Reads balances + allowance.
 */
export async function checkFunding(
  requiredUsdtBase: bigint,
  spender: Address,
): Promise<FundingCheck> {
  const address = getAgentAddress();
  if (!address) {
    return {
      enoughUsdt: false,
      enoughGas: false,
      allowanceOk: false,
      usdtBase: BigInt(0),
      allowance: BigInt(0),
      bnbWei: BigInt(0),
    };
  }

  const [usdtBase, allowance, bnbWei] = await Promise.all([
    getErc20Balance(USDT.address as Address, address),
    getAllowance(USDT.address as Address, address, spender),
    getNativeBalance(address),
  ]);

  return {
    enoughUsdt: usdtBase >= requiredUsdtBase,
    enoughGas: bnbWei >= MIN_GAS_WEI,
    allowanceOk: allowance >= requiredUsdtBase,
    usdtBase,
    allowance,
    bnbWei,
  };
}
