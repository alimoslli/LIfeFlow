/** Money is handled as integer cents everywhere. */

export function formatCents(cents: number, opts: { currency?: string; signed?: boolean; compact?: boolean } = {}): string {
  const { currency = "USD", signed = false, compact = false } = opts;
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  return fmt.format(cents / 100);
}

/** Parses "12.34", "$1,200", "-5" into cents. Returns null when not a number. */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const dollarsToCents = (d: number) => Math.round(d * 100);
export const centsToDollars = (c: number) => Math.round(c) / 100;
