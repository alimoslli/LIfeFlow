export const GENERAL_INFO = "General information, not personalized investment advice. For big decisions, talk with a licensed financial professional.";

/**
 * Compound growth with monthly contributions. Rates are assumptions, shown as
 * a range, never a promise. Pure.
 */
export function projectInvesting(i: { startCents: number; monthlyCents: number; years: number; ratesPercent?: number[] }) {
  const rates = i.ratesPercent ?? [4, 6, 8];
  return {
    contributedCents: i.startCents + i.monthlyCents * 12 * i.years,
    scenarios: rates.map((r) => {
      const m = r / 100 / 12;
      let v = i.startCents;
      for (let k = 0; k < i.years * 12; k++) v = v * (1 + m) + i.monthlyCents;
      return { ratePercent: r, valueCents: Math.round(v) };
    }),
    assumptions: `Yearly returns of ${rates.join("%, ")}% are illustrations. Real returns vary year to year and can be negative. Inflation and taxes are not included.`,
    disclaimer: GENERAL_INFO,
  };
}
