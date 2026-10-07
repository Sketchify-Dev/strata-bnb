// Minimal ERC-20 reads + approve encoding for the settlement token (USDT on BSC).
// Server-only (uses the shared public client). viem ships a canonical erc20Abi,
// so we lean on that rather than hand-rolling fragments.

import { erc20Abi, encodeFunctionData, type Address, type Hex } from "viem";
import { getPublicClient } from "./client";

/** Unlimited allowance sentinel (2^256 - 1). */
export const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

/** Current allowance the owner has granted the spender for `token`, in base units. */
export function getAllowance(
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return getPublicClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

/** ERC-20 balance of `owner` for `token`, in base units. */
export function getErc20Balance(token: Address, owner: Address): Promise<bigint> {
  return getPublicClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

/** Native BNB balance of `owner`, in wei. */
export function getNativeBalance(owner: Address): Promise<bigint> {
  return getPublicClient().getBalance({ address: owner });
}

/** Calldata for `approve(spender, amount)`, ready to sign and send. */
export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}
