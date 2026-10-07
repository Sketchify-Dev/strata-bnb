// Agent execution config. Server-only, and deliberately free of any chain
// library so it stays importable everywhere and encodes ONE thing: the safety
// default. Execution is "simulate" unless the operator has BOTH set
// AGENT_EXECUTION_MODE=live AND provided a valid burner key. Anything missing or
// malformed falls back to simulate, with a human-readable note explaining why.
//
// This module never exposes the private key. It only reports whether one is
// present and well-formed; the chain client (added once viem is installed) is
// the only place the key is read to build a signer.

export type ExecutionMode = "simulate" | "live";

export interface ExecutionConfig {
  /** Effective mode after applying the safety fallback. */
  mode: ExecutionMode;
  /** The mode the environment asked for, before any fallback. */
  requestedMode: ExecutionMode;
  /** BSC JSON-RPC endpoint used to simulate/broadcast. */
  rpcUrl: string;
  /** True when a syntactically valid burner key is present. */
  hasWalletKey: boolean;
  /** Why the effective mode differs from requested, or other honest caveats. */
  notes: string[];
}

const DEFAULT_RPC = "https://bsc-dataseed.binance.org";

/** A 32-byte hex private key, 0x-prefixed. We validate shape only, never log it. */
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

function readMode(raw: string | undefined): ExecutionMode {
  return raw?.trim().toLowerCase() === "live" ? "live" : "simulate";
}

/**
 * Resolve the agent's execution configuration from the environment. Pure and
 * side-effect free, so the UI and the (future) executor read the same truth.
 */
export function getExecutionConfig(): ExecutionConfig {
  const rawKey = process.env.AGENT_WALLET_PRIVATE_KEY?.trim() ?? "";
  const keyPresent = rawKey.length > 0;
  const keyValid = PRIVATE_KEY_RE.test(rawKey);
  const hasWalletKey = keyPresent && keyValid;

  const rpcUrl = process.env.BSC_RPC_URL?.trim() || DEFAULT_RPC;
  const requestedMode = readMode(process.env.AGENT_EXECUTION_MODE);

  const notes: string[] = [];
  if (keyPresent && !keyValid) {
    notes.push(
      "AGENT_WALLET_PRIVATE_KEY is set but is not a 0x-prefixed 32-byte hex key; ignoring it.",
    );
  }
  if (requestedMode === "live" && !hasWalletKey) {
    notes.push(
      "AGENT_EXECUTION_MODE=live but no valid agent wallet key is set, so execution is held at simulate.",
    );
  }

  const mode: ExecutionMode =
    requestedMode === "live" && hasWalletKey ? "live" : "simulate";

  if (mode === "simulate" && requestedMode === "simulate") {
    notes.push("Simulate-only: transactions are built and simulated, never broadcast.");
  }

  return { mode, requestedMode, rpcUrl, hasWalletKey, notes };
}

/** Convenience: can the agent actually broadcast right now? */
export function canBroadcast(config: ExecutionConfig = getExecutionConfig()): boolean {
  return config.mode === "live" && config.hasWalletKey;
}
