/** Tiny formatting helpers. Pure functions, no dependencies. */

/** Format a fraction as a percent string, e.g. 0.1234 -> "12.34%". */
export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Format a USD value compactly, e.g. 1234567 -> "$1.23M". */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/** Shorten a base58 address for display. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
