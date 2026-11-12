import { and, between, eq, ne } from "drizzle-orm";
import { addDaysStr, daysBetween } from "@/lib/dates";
import { recurringItems } from "../../db/schema";
import { series } from "../../db/series";
import type { UserScope } from "../../db/with-user";
import { searchWeb } from "../../integrations/web-search";
import { ServiceError } from "../errors";
import { createTask } from "../tasks";
import { amountsClose } from "./bill-match";
import { bankSeries, createRecurring, listRecurring, seriesForItem, suggestRecurring } from "./planning";
import { merchantKey, merchantKeys, storedKeyForms, type RecurringCandidate } from "./recurring-detect";
import { queryAllTransactions } from "./transactions";

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

/**
 * A price increase as people see it (positive cents), dated on the first charge at the new price. `key`
 * names the change itself (merchant, new price, day it started), the same whether the subscription is
 * tracked yet or only found in the bank.
 */
type PriceUp = { fromCents: number; toCents: number; date: string; key: string };
const priceUpOf = (c: RecurringCandidate): PriceUp | null => {
  const p = c.priceChange;
  // More than 50 cents more: rounding and tax changes aren't news.
  return p && -p.toCents > -p.fromCents + 50
    ? { fromCents: -p.fromCents, toCents: -p.toCents, date: p.date, key: `${c.merchantKey}:${-p.toCents}:${p.date}` }
    : null;
};

export async function subscriptionsOverview(scope: UserScope, today: string) {
  const [items, txns, bank] = await series(
    () => listRecurring(scope, { includeInactive: true }),
    () => queryAllTransactions(scope, { from: addDaysStr(today, -400), to: today, kinds: ["expense"] }),
    () => bankSeries(scope, today),
  );
  const allSeries = [...bank.tracked, ...bank.untracked];
  const at = (x: { date: string; amountCents: number }) => `${x.date}|${x.amountCents}`;
  const subs = items
    .filter((i) => i.kind === "subscription" && i.status !== "cancelled")
    .map((s) => {
      const key = merchantKey({ merchantName: s.name, description: s.name });
      const found = seriesForItem(s, bank.tracked)[0];
      // Its own charges: the matched series', or the merchant's minus those of its other services (Apple bills several).
      const mine = found && new Set(found.charges.map(at));
      const others = new Set(allSeries.filter((c) => c !== found).flatMap((c) => c.charges.map(at)));
      const charges = txns
        .filter((t) => !t.pending && merchantKeys(t).some((k) => k === key || storedKeyForms(s.merchantKey).includes(k)))
        .filter((t) => (mine ? mine.has(at(t)) : !others.has(at(t))))
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = charges[0] ? -charges[0].amountCents : null;
      const previous = charges.findIndex((c, i) => i > 0 && -c.amountCents !== latest);
      const priceUp: PriceUp | null = found
        ? priceUpOf(found)
        : latest !== null && previous > 0 && latest > -charges[previous].amountCents + 50
          ? {
              fromCents: -charges[previous].amountCents,
              toCents: latest,
              date: charges[previous - 1].date,
              key: `${merchantKey(charges[0])}:${latest}:${charges[previous - 1].date}`,
            }
          : null;
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

  // Subscriptions found in transactions that aren't tracked yet.
  const found = bank.untracked.filter((c) => c.kind === "subscription" && c.latestAmountCents < 0);
  const active = subs.filter((s) => s.status === "active");
  const families = FAMILIES.map(([family, re]) => ({ family, names: active.filter((s) => re.test(s.name)) })).filter((f) => f.names.length >= 2);
  // The same service tracked twice costs about the same each time; one biller's different services don't (iCloud and Apple Music).
  const sameService = Object.values(Object.groupBy(active, (s) => s.merchantKey ?? s.name))
    .map((g = []) => g.filter((s) => g.some((o) => o !== s && amountsClose(o.amountCents, s.amountCents, false))))
    .filter((g) => g.length >= 2);
  const yearlyExtra = (p: PriceUp, freq: keyof typeof PER_YEAR) => (p.toCents - p.fromCents) * PER_YEAR[freq];
  const flags = [
    ...active
      .filter((s) => s.priceUp)
      .map((s) => ({
        kind: "price_up" as const,
        id: s.id as string | null,
        name: s.name,
        ...s.priceUp!,
        yearlyExtraCents: yearlyExtra(s.priceUp!, s.frequency),
        // The alert's name: a tracked subscription's as it has always been (its id and new price), so alerts already
        // sent stay sent. `sentAs` is the same change announced while it was only found in the bank.
        alertKey: `${s.id}:${s.priceUp!.toCents}`,
        sentAs: [`found:${s.priceUp!.key}`],
      })),
    // Price increases on subscriptions found in the bank but not tracked yet count the same.
    ...found.flatMap((c) => {
      const p = priceUpOf(c);
      return p
        ? [
            {
              kind: "price_up" as const,
              id: null,
              name: c.name,
              ...p,
              yearlyExtraCents: yearlyExtra(p, c.frequency),
              alertKey: `found:${p.key}`,
              sentAs: [] as string[],
            },
          ]
        : [];
    }),
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
      names: g.map((s) => s.name),
      yearlyCents: g.reduce((n, s) => n + s.yearlyCents, 0),
    })),
    ...active.filter((s) => s.usage === "not_using").map((s) => ({ kind: "unused" as const, id: s.id, name: s.name, yearlyCents: s.yearlyCents })),
  ];
  // Totals count what was found in the bank too (it's real money going out), not only what's tracked.
  const foundYearly = found.reduce((n, c) => n + -c.latestAmountCents * PER_YEAR[c.frequency], 0);
  // How much bank history there is to look at: a subscription shows up after 2 to 3 charges.
  const oldest = txns.reduce<string | null>((o, t) => (!t.pending && (!o || t.date < o) ? t.date : o), null);
  return {
    subscriptions: subs,
    monthlyCents: active.reduce((n, s) => n + s.monthlyCents, 0) + Math.round(foundYearly / 12),
    yearlyCents: active.reduce((n, s) => n + s.yearlyCents, 0) + foundYearly,
    flags,
    found,
    historyDays: oldest ? daysBetween(oldest, today) : 0,
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

/** Free trials that end between two dates (the first charge comes after), for the timeline. */
export async function upcomingTrials(scope: UserScope, from: string, to: string) {
  return scope.tx
    .select({ id: recurringItems.id, name: recurringItems.name, amountCents: recurringItems.amountCents, trialEndsOn: recurringItems.trialEndsOn })
    .from(recurringItems)
    .where(and(eq(recurringItems.userId, scope.userId), ne(recurringItems.status, "cancelled"), between(recurringItems.trialEndsOn, from, to)));
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

/** Starts tracking a recurring charge found in transactions. `key` is its `seriesKey` (one merchant can bill several). */
export async function trackFound(scope: UserScope, today: string, key: string) {
  const c = (await suggestRecurring(scope, today)).find((x) => x.seriesKey === key);
  if (!c) throw new ServiceError("That charge is already tracked or no longer looks recurring.");
  return createRecurring(
    scope,
    { name: c.name, amountCents: c.latestAmountCents, frequency: c.frequency, nextDueDate: c.nextExpectedDate, kind: c.kind },
    "detected",
  );
}

/** Live search for the official way to cancel; keeps the answer and the sources it cited. */
export async function findCancelHelp(scope: UserScope, id: string) {
  const s = await owned(scope, id);
  const r = await searchWeb(
    `How do I cancel my ${s.name} subscription? Official steps and the direct cancellation page.`,
    { userId: scope.userId, door: "cancel_help" },
    {
      instructions: "Use the company's own help pages when you can. Give short numbered steps and the direct link to the page where you cancel.",
    },
  );
  const help = { answer: r.answer.slice(0, 3000), sources: r.sources, at: r.searchedAt };
  await scope.tx.update(recurringItems).set({ cancelHelp: help }).where(eq(recurringItems.id, id));
  return help;
}
