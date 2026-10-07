/**
 * Display formatters. Every figure in a finance UI should line up, so pair
 * these with the `.tnum` class (tabular numerals) at the render site.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function usd(value: number, whole = false): string {
  return (whole ? USD_WHOLE : USD).format(value);
}

export function compactUsd(value: number): string {
  return "$" + COMPACT.format(value);
}

/** Signed percent, e.g. +2.41% / -0.88%. Input is already in percent units. */
export function pct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** 0.42 -> "42%" for basket weights. */
export function weightPct(weight: number, digits = 0): string {
  return `${(weight * 100).toFixed(digits)}%`;
}

export function price(value: number): string {
  return USD.format(value);
}

export type Direction = "up" | "down" | "flat";

export function direction(value: number): Direction {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}
