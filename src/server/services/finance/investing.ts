import { and, asc, eq, gte } from "drizzle-orm";
import { addDaysStr } from "@/lib/dates";
import { netWorthSnapshots } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { listAccounts } from "./accounts";
import { balancesOf } from "./overview";
import { allocation, listHoldings, portfolioReturn } from "./wealth";

/**
 * Investments, explained. LifeFlow shows what the user holds and teaches the
 * basics; it never recommends buying or selling a specific investment.
 */

export const GENERAL_INFO = "General information, not personalized investment advice. For big decisions, talk with a licensed financial professional.";

export async function investmentReport(scope: UserScope) {
  const [accounts, holdings] = [await listAccounts(scope), await listHoldings(scope)];
  const b = balancesOf(accounts);
  const total = holdings.reduce((s, h) => s + h.valueCents, 0);
  const top = [...holdings].sort((a, c) => c.valueCents - a.valueCents)[0];
  const topShare = total && top ? Math.round((top.valueCents / total) * 100) : null;
  const fundsLike = holdings.filter((h) => h.securityType === "etf" || h.securityType === "mutual_fund");
  const withFee = holdings.filter((h) => h.expenseRatioBps != null);
  const yearlyFees = withFee.reduce((s, h) => s + Math.round((h.valueCents * h.expenseRatioBps!) / 10_000), 0);
  const weightedFee = withFee.length
    ? Math.round(
        (withFee.reduce((s, h) => s + h.valueCents * h.expenseRatioBps!, 0) /
          Math.max(
            1,
            withFee.reduce((s, h) => s + h.valueCents, 0),
          )) *
          100,
      ) / 100
    : null;
  const notes: string[] = [];
  if (topShare != null && topShare >= 40 && top.securityType !== "etf" && top.securityType !== "mutual_fund")
    notes.push(`${top.symbol ?? top.name} is ${topShare}% of your holdings. A single company or coin that large means your portfolio rides on it.`);
  if (holdings.length && !fundsLike.length)
    notes.push("You hold no index funds or ETFs. Broad funds spread money across hundreds of companies in one purchase.");
  if (weightedFee != null && weightedFee > 50)
    notes.push(`Your average fund fee is ${(weightedFee / 100).toFixed(2)}% a year. Broad index funds often charge under 0.10%.`);
  if (holdings.length && withFee.length < fundsLike.length) notes.push("Add expense ratios to your funds to see what fees cost you each year.");
  return {
    accountsValueCents: b.investmentsCents,
    holdingsValueCents: total,
    accounts: b.investmentAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      subtype: a.subtype,
      valueCents: a.currentBalanceCents,
      asOf: a.balanceUpdatedAt,
      source: a.source,
    })),
    holdings: holdings.map((h) => ({
      id: h.id,
      name: h.name,
      symbol: h.symbol,
      type: h.securityType,
      valueCents: h.valueCents,
      gainCents: h.costBasisCents != null ? h.valueCents - h.costBasisCents : null,
      sharePercent: total ? Math.round((h.valueCents / total) * 1000) / 10 : 0,
      expenseRatioPercent: h.expenseRatioBps != null ? h.expenseRatioBps / 100 : null,
    })),
    allocation: allocation(holdings),
    returnPercent: portfolioReturn(holdings),
    topHoldingSharePercent: topShare,
    yearlyFeesCents: withFee.length ? yearlyFees : null,
    averageFeePercent: weightedFee != null ? weightedFee / 100 : null,
    notes,
    disclaimer: GENERAL_INFO,
  };
}

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

/** Records today's balances once per day, so the net worth trend builds up over time. */
export async function recordNetWorth(scope: UserScope, today: string) {
  const accounts = await listAccounts(scope);
  if (!accounts.length) return null;
  const b = balancesOf(accounts);
  const row = {
    userId: scope.userId,
    day: today,
    netWorthCents: b.netWorthCents,
    cashCents: b.cashCents,
    savingsCents: b.savingsCents,
    investmentsCents: b.investmentsCents,
    debtCents: b.creditOwedCents + b.loansOwedCents,
  };
  await scope.tx
    .insert(netWorthSnapshots)
    .values(row)
    .onConflictDoUpdate({ target: [netWorthSnapshots.userId, netWorthSnapshots.day], set: row });
  return row;
}

export async function netWorthTrend(scope: UserScope, today: string, days = 365) {
  return scope.tx
    .select()
    .from(netWorthSnapshots)
    .where(and(eq(netWorthSnapshots.userId, scope.userId), gte(netWorthSnapshots.day, addDaysStr(today, -days))))
    .orderBy(asc(netWorthSnapshots.day));
}

/** Short lessons, each tied to something in the user's own data when possible. */
export const LESSONS = [
  {
    id: "compounding",
    title: "Compounding",
    level: "new",
    body: "Growth earns growth. $100 a month for 40 years is $48,000 put in; at a 6% yearly return it could grow to around $199,000, because returns keep building on earlier returns. Starting early matters more than starting big.",
  },
  {
    id: "index_funds",
    title: "Index funds",
    level: "new",
    body: "An index fund buys every company in a market index (like the S&P 500) in one purchase. Low fees and broad spread make them a common core for long-term investing.",
  },
  {
    id: "risk",
    title: "Risk and time",
    level: "new",
    body: "Stocks can drop 30% or more in a bad year. Money you need within about 3 to 5 years usually belongs in savings, not stocks. Long horizons give time to recover.",
  },
  {
    id: "roth_ira",
    title: "Roth IRA",
    level: "some",
    body: "A Roth IRA is a retirement account you fund with money you've already paid tax on. Growth and qualified withdrawals in retirement are tax-free. You need earned income to contribute, and there are yearly limits; check the current limit on irs.gov.",
  },
  {
    id: "fees",
    title: "Fees add up",
    level: "some",
    body: "A 1% yearly fee on $10,000 is $100 every year, and it compounds against you. Compare a fund's expense ratio before you buy.",
  },
  {
    id: "emergency_first",
    title: "Emergency fund first",
    level: "new",
    body: "Before investing, most people keep 3 to 6 months of essential costs in savings so a surprise bill doesn't force selling investments at a bad time.",
  },
  {
    id: "credit_utilization",
    title: "Credit utilization",
    level: "new",
    body: "Utilization is how much of your card limits you're using. Under 30% is good and under 10% is excellent. Paying before the statement date lowers the number reported.",
  },
  {
    id: "50_30_20",
    title: "The 50/30/20 rule",
    level: "new",
    body: "A simple split of take-home pay: 50% needs, 30% wants, 20% savings and debt payoff. It's a starting point, not a law; adjust it to your life.",
  },
] as const;
