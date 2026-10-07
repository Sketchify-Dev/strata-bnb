import { createHmac } from "node:crypto";

/** ISO 8601 with milliseconds, e.g. "2026-09-27T10:08:57.715Z". */
export function isoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * The exact string that gets signed.
 *
 *   preHash = timestamp + METHOD + requestPath + body
 *
 * - `method` is upper-cased.
 * - `requestPath` MUST include the `/build` prefix and, for GETs, the full
 *   query string exactly as it is sent on the wire.
 * - `body` is the raw JSON string for POSTs, empty string for GETs.
 */
export function buildPreHash(params: {
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
}): string {
  const { timestamp, method, requestPath, body = "" } = params;
  return `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
}

/** Base64( HMAC-SHA256(preHash, secretKey) ). */
export function signHmac(preHash: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(preHash).digest("base64");
}
