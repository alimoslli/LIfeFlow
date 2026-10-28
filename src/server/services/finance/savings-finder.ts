import { and, desc, eq } from "drizzle-orm";
import { savingsOpportunities } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { searchWeb, type SearchClient, type WebSource } from "../../integrations/web-search";
import { ServiceError } from "../errors";
import { listAccounts } from "./accounts";
import { listRecurring } from "./planning";

/**
 * Savings finder: for recurring bills (phone, internet, insurance, streaming)
 * and card/loan rates, a live web search for cheaper options. A price is shown
 * only if the page it came from is one the search actually cited. Jarvis drafts
 * a negotiation script; the user sends it. Nothing is switched automatically.
 */

export type BillCategory = (typeof savingsOpportunities.$inferSelect)["category"];
const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 } as const;

const KINDS: [BillCategory, RegExp][] = [
  ["phone", /verizon|t-?mobile|at&t|\batt\b|mint mobile|visible|cricket|metro|phone|wireless|cellular/i],
  ["internet", /comcast|xfinity|spectrum|fios|cox|optimum|frontier|internet|wifi|broadband|starlink/i],
  ["insurance", /geico|progressive|state farm|allstate|liberty mutual|lemonade|insurance|usaa/i],
  ["streaming", /netflix|hulu|disney|max\b|hbo|paramount|peacock|spotify|apple music|youtube|prime video/i],
];

export function categorize(name: string): BillCategory | null {
  return KINDS.find(([, re]) => re.test(name))?.[0] ?? null;
}

/** What can be checked for a better deal: bills by category, and cards/loans with an interest rate. */
export async function billsToReview(scope: UserScope) {
  const [items, accounts] = [await listRecurring(scope), await listAccounts(scope, { types: ["credit", "loan"] })];
  const bills = items
    .filter((r) => r.amountCents < 0)
    .map((r) => ({
      id: r.id,
      type: "bill" as const,
      name: r.name,
      category: categorize(r.name),
      monthlyCents: Math.round((-r.amountCents * PER_YEAR[r.frequency]) / 12),
    }))
    .filter((b): b is typeof b & { category: BillCategory } => !!b.category);
  const rates = accounts
    .filter((a) => a.aprBps && a.currentBalanceCents !== 0)
    .map((a) => ({
      id: a.id,
      type: "rate" as const,
      name: a.name,
      category: (a.type === "credit" ? "credit_card" : "loan") as BillCategory,
      aprPercent: (a.aprBps ?? 0) / 100,
      balanceCents: Math.abs(a.currentBalanceCents),
      monthlyCents: Math.round((Math.abs(a.currentBalanceCents) * (a.aprBps ?? 0)) / 10000 / 12),
    }));
  return { bills, rates };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["options"],
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["provider", "plan", "monthly_price_usd", "source_url", "details"],
        properties: {
          provider: { type: "string" },
          plan: { type: "string" },
          monthly_price_usd: {
            type: "number",
            description: "Monthly price (or monthly interest cost at the advertised APR) exactly as listed on the source page",
          },
          source_url: { type: "string", description: "The page where this price is listed" },
          details: { type: "string", description: "Important conditions: promo length, contract, data cap, credit needed, taxes" },
        },
      },
    },
  },
} as const;

const same = (a: string, b: string) =>
  a
    .replace(/[#?].*$/, "")
    .replace(/\/$/, "")
    .toLowerCase() ===
  b
    .replace(/[#?].*$/, "")
    .replace(/\/$/, "")
    .toLowerCase();

/** Runs the live search for one bill or rate and saves the sourced options that would save money. */
export async function findSavings(
  scope: UserScope,
  target: { recurringId?: string; accountId?: string },
  opts: { country?: string; search?: SearchClient | null } = {},
) {
  const { bills, rates } = await billsToReview(scope);
  const bill = target.recurringId ? bills.find((b) => b.id === target.recurringId) : undefined;
  const rate = target.accountId ? rates.find((r) => r.id === target.accountId) : undefined;
  if (!bill && !rate) throw new ServiceError("That bill isn't one I can compare yet.", "not_found");
  const current = (bill ?? rate)!.monthlyCents;
  const query = bill
    ? `Cheaper ${bill.category} plans than ${bill.name} at $${(current / 100).toFixed(2)} a month in ${opts.country ?? "the US"}: current advertised prices from providers.`
    : `Current credit card or personal loan offers with an APR below ${rate!.aprPercent}% for balance transfer or refinancing in ${opts.country ?? "the US"}.`;
  const r = await searchWeb(query, {
    json: { name: "savings_options", schema: SCHEMA as unknown as Record<string, unknown> },
    country: opts.country,
    search: opts.search,
    instructions:
      "Return up to 4 options that cost less than the user's current price. Use only prices you found on the cited page, as listed today, and give that page's URL. If a price is promotional, say how long it lasts in details. Do not include options you couldn't price from a source.",
  });
  let parsed: { options: { provider: string; plan: string; monthly_price_usd: number; source_url: string; details: string }[] };
  try {
    parsed = JSON.parse(r.answer);
  } catch {
    throw new ServiceError("The search didn't return usable prices. Try again later.");
  }
  // Only keep prices from pages the search really read, and only real savings.
  const sourced = parsed.options
    .map((o) => ({ ...o, source: r.sources.find((s) => same(s.url, o.source_url)) }))
    .filter((o): o is typeof o & { source: WebSource } => !!o.source && Number.isFinite(o.monthly_price_usd) && o.monthly_price_usd > 0)
    .map((o) => ({ ...o, offerCents: Math.round(o.monthly_price_usd * 100) }))
    .filter((o) => o.offerCents < current);
  const searchedAt = new Date(r.searchedAt);
  // Replace earlier unacted results for the same bill.
  await scope.tx
    .delete(savingsOpportunities)
    .where(
      and(
        eq(savingsOpportunities.userId, scope.userId),
        eq(savingsOpportunities.status, "found"),
        bill ? eq(savingsOpportunities.recurringId, bill.id) : eq(savingsOpportunities.accountId, rate!.id),
      ),
    );
  if (!sourced.length) return { saved: [], dropped: parsed.options.length };
  const saved = await scope.tx
    .insert(savingsOpportunities)
    .values(
      sourced.map((o) => ({
        userId: scope.userId,
        recurringId: bill?.id ?? null,
        accountId: rate?.id ?? null,
        billName: (bill ?? rate)!.name,
        category: (bill ?? rate)!.category,
        currentMonthlyCents: current,
        provider: o.provider.slice(0, 120),
        plan: o.plan.slice(0, 200),
        offerMonthlyCents: o.offerCents,
        yearlySavingsCents: (current - o.offerCents) * 12,
        details: o.details.slice(0, 500) || null,
        sourceUrl: o.source.url,
        sourceTitle: o.source.title,
        searchedAt,
      })),
    )
    .returning();
  return { saved, dropped: parsed.options.length - sourced.length };
}

export async function listSavings(scope: UserScope) {
  const rows = await scope.tx
    .select()
    .from(savingsOpportunities)
    .where(eq(savingsOpportunities.userId, scope.userId))
    .orderBy(desc(savingsOpportunities.yearlySavingsCents));
  const best = new Map<string, number>();
  for (const r of rows.filter((x) => x.status === "found")) best.set(r.billName, Math.max(best.get(r.billName) ?? 0, r.yearlySavingsCents));
  return {
    rows,
    // Per bill only the best option counts, so totals aren't double counted.
    foundYearlyCents: [...best.values()].reduce((a, b) => a + b, 0),
    actedYearlyCents: rows.filter((r) => r.status === "acted").reduce((a, r) => a + r.yearlySavingsCents, 0),
  };
}

export async function setSavingsStatus(scope: UserScope, id: string, status: "acted" | "dismissed" | "found") {
  const [row] = await scope.tx
    .update(savingsOpportunities)
    .set({ status, actedAt: status === "acted" ? new Date() : null })
    .where(and(eq(savingsOpportunities.id, id), eq(savingsOpportunities.userId, scope.userId)))
    .returning();
  if (!row) throw new ServiceError("Not found", "not_found");
  return row;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** A message the user can send or read to the provider. Built from their real numbers and the sourced offer. */
export function negotiationScript(
  o: Pick<typeof savingsOpportunities.$inferSelect, "billName" | "category" | "currentMonthlyCents" | "provider" | "plan" | "offerMonthlyCents" | "sourceUrl">,
) {
  if (o.category === "credit_card" || o.category === "loan")
    return [
      `Hi, I'm calling about my ${o.billName} account.`,
      `I've been paying on time, and I'm paying about ${usd(o.currentMonthlyCents)} a month in interest at my current rate.`,
      `I've seen offers like ${o.provider}'s ${o.plan} (${o.sourceUrl}) at a lower rate.`,
      "Can you lower my APR? If not, I'm going to move the balance.",
      "Thank you. Can you tell me the new rate and when it takes effect?",
    ].join("\n");
  return [
    `Hi, I'm a ${o.billName} customer and I'm paying ${usd(o.currentMonthlyCents)} a month.`,
    `${o.provider} offers ${o.plan} for ${usd(o.offerMonthlyCents)} a month (${o.sourceUrl}).`,
    "I'd like to stay with you. Can you match that price or offer something lower?",
    "If not, could you transfer me to the retention team, or I'll plan to switch.",
    "Thanks! Please confirm the new monthly price and any contract terms in writing.",
  ].join("\n");
}
