import { and, eq } from "drizzle-orm";
import { addDaysStr, daysBetween } from "@/lib/dates";
import { recurringItems } from "../../db/schema";
import { series } from "../../db/series";
import type { UserScope } from "../../db/with-user";
import { searchWeb } from "../../integrations/web-search";
import { ServiceError } from "../errors";
import { createTask } from "../tasks";
import { createRecurring, listRecurring, suggestRecurring } from "./planning";
import { merchantKey } from "./recurring-detect";
import { queryTransactions } from "./transactions";

/**
 * Subscription finder: what you pay for, how much a month and a year, the next
 * charge, and what deserves a look (price increases, duplicate services, free
 * trials about to convert, things you said you don't use). Jarvis never
 * cancels anything; he helps you do it.
 */

const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 } as const;

/** Services that do the same job; paying for several is worth a second look. */
const FAMILIES: [string, RegExp][] = [
  ["video streaming", /netflix|hulu|disney|max\b|hbo|paramount|peacock|prime video|apple tv|crunchyroll/i],
  ["music", /spotify|apple music|youtube music|tidal|pandora|amazon music/i],
  ["cloud storage", /icloud|google one|dropbox|onedrive/i],
  ["VPN", /vpn|nordvpn|expressvpn|surfshark/i],
  ["food delivery passes", /dashpass|uber one|grubhub\+|instacart\+/i],
];

/** Who bills it, from how the charge reads on the statement. */
export function billedVia(description: string): "apple" | "google_play" | "paypal" | null {
  if (/apple\.com\/bill|itunes/i.test(description)) return "apple";
  if (/google\s*\*|google play/i.test(description)) return "google_play";
  if (/paypal/i.test(description)) return "paypal";
  return null;
}

export async function subscriptionsOverview(scope: UserScope, today: string) {
  const [items, txns, detected] = await series(
    () => listRecurring(scope, { includeInactive: true }),
    () => queryTransactions(scope, { from: addDaysStr(today, -400), to: today, kinds: ["expense"], limit: 20_000 }),
    () => suggestRecurring(scope, today),
  );
  const subs = items
    .filter((i) => i.kind === "subscription" && i.status !== "cancelled")
    .map((s) => {
      const charges = txns.filter((t) => merchantKey(t) === s.merchantKey).sort((a, b) => b.date.localeCompare(a.date));
      const latest = charges[0] ? -charges[0].amountCents : null;
      const previous = charges.find((c, i) => i > 0 && -c.amountCents !== latest);
      const priceUp = latest !== null && previous && latest > -previous.amountCents + 50 ? { fromCents: -previous.amountCents, toCents: latest } : null;
      const monthlyCents = Math.round((-s.amountCents * PER_YEAR[s.frequency]) / 12);
      return {
        ...s,
        monthlyCents,
        yearlyCents: -s.amountCents * PER_YEAR[s.frequency],
        lastChargeDate: charges[0]?.date ?? null,
        chargeCount: charges.length,
        priceUp,
        via: charges[0] ? billedVia(charges[0].description) : null,
        trialDaysLeft: s.trialEndsOn && s.trialEndsOn >= today ? daysBetween(today, s.trialEndsOn) : null,
      };
    })
    .sort((a, b) => b.yearlyCents - a.yearlyCents);

  const active = subs.filter((s) => s.status === "active");
  const families = FAMILIES.map(([family, re]) => ({ family, names: active.filter((s) => re.test(s.name)) })).filter((f) => f.names.length >= 2);
  const sameService = Object.values(Object.groupBy(active, (s) => s.merchantKey ?? s.name)).filter((g) => (g?.length ?? 0) >= 2);
  const flags = [
    ...active
      .filter((s) => s.priceUp)
      .map((s) => ({
        kind: "price_up" as const,
        id: s.id,
        name: s.name,
        ...s.priceUp!,
        yearlyExtraCents: (s.priceUp!.toCents - s.priceUp!.fromCents) * PER_YEAR[s.frequency],
      })),
    ...active
      .filter((s) => s.trialDaysLeft !== null && s.trialDaysLeft <= 7)
      .map((s) => ({ kind: "trial" as const, id: s.id, name: s.name, daysLeft: s.trialDaysLeft!, thenCents: -s.amountCents })),
    ...families.map((f) => ({
      kind: "duplicate" as const,
      family: f.family,
      names: f.names.map((s) => s.name),
      yearlyCents: f.names.reduce((n, s) => n + s.yearlyCents, 0),
    })),
    ...sameService.map((g) => ({
      kind: "duplicate" as const,
      family: "the same service",
      names: g!.map((s) => s.name),
      yearlyCents: g!.reduce((n, s) => n + s.yearlyCents, 0),
    })),
    ...active.filter((s) => s.usage === "not_using").map((s) => ({ kind: "unused" as const, id: s.id, name: s.name, yearlyCents: s.yearlyCents })),
  ];
  // Recurring charges found in transactions that aren't tracked yet (small, regular, monthly-ish: likely subscriptions).
  const found = detected.filter((c) => c.averageAmountCents < 0 && -c.averageAmountCents <= 30_000 && c.confidence >= 0.6 && c.occurrences >= 2);
  return {
    subscriptions: subs,
    monthlyCents: active.reduce((n, s) => n + s.monthlyCents, 0),
    yearlyCents: active.reduce((n, s) => n + s.yearlyCents, 0),
    flags,
    found,
  };
}
export type SubscriptionsOverview = Awaited<ReturnType<typeof subscriptionsOverview>>;

async function owned(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .select()
    .from(recurringItems)
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, scope.userId)));
  if (!row) throw new ServiceError("Subscription not found", "not_found");
  return row;
}

export async function updateSubscription(scope: UserScope, id: string, patch: { usage?: "using" | "not_using"; trialEndsOn?: string | null; kept?: boolean }) {
  await owned(scope, id);
  await scope.tx
    .update(recurringItems)
    .set({
      ...(patch.usage && { usage: patch.usage }),
      ...(patch.trialEndsOn !== undefined && { trialEndsOn: patch.trialEndsOn }),
      ...(patch.kept && { keptAt: new Date(), usage: "using" as const }),
    })
    .where(eq(recurringItems.id, id));
}

/** A to-do with a reminder a few days before the next charge. */
export async function remindBeforeRenewal(scope: UserScope, tz: string, id: string, daysBefore: number, today: string) {
  const s = await owned(scope, id);
  const charge = s.trialEndsOn && s.trialEndsOn >= today ? s.trialEndsOn : s.nextDueDate;
  if (!charge) throw new ServiceError("There's no next charge date for this one yet.");
  const day = addDaysStr(charge, -daysBefore) < today ? today : addDaysStr(charge, -daysBefore);
  const usd = `$${(-s.amountCents / 100).toFixed(2)}`;
  const t = await createTask(scope, tz, { title: `${s.name} renews ${charge} (${usd}): keep or cancel?`, dueDate: day, dueTime: "09:00", reminder: "at_time" });
  return { taskId: t.id, day };
}

/** Starts tracking a recurring charge found in transactions. */
export async function trackFound(scope: UserScope, today: string, key: string) {
  const c = (await suggestRecurring(scope, today)).find((x) => x.merchantKey === key);
  if (!c) throw new ServiceError("That charge is already tracked or no longer looks recurring.");
  return createRecurring(
    scope,
    { name: c.name, amountCents: c.averageAmountCents, frequency: c.frequency, nextDueDate: c.nextExpectedDate, kind: "subscription" },
    "detected",
  );
}

/** Live search for the official way to cancel; keeps the answer and the sources it cited. */
export async function findCancelHelp(scope: UserScope, id: string) {
  const s = await owned(scope, id);
  const r = await searchWeb(`How do I cancel my ${s.name} subscription? Official steps and the direct cancellation page.`, {
    instructions: "Use the company's own help pages when you can. Give short numbered steps and the direct link to the page where you cancel.",
  });
  const help = { answer: r.answer.slice(0, 3000), sources: r.sources, at: r.searchedAt };
  await scope.tx.update(recurringItems).set({ cancelHelp: help }).where(eq(recurringItems.id, id));
  return help;
}
