import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { addDaysStr, daysBetween, formatDateStr, localDateOf, localTimeOf, localToInstant } from "@/lib/dates";
import { brandName } from "@/lib/vendor";
import { normalizeText } from "@/lib/utils";
import { assignments, inboxItems, recurringItems, tasks, transactions, type Frequency, type InboxFiled } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { amountsClose, nameRelation, SLACK_DAYS, scheduleGap, trackedKeys, tracksSeries } from "../finance/bill-match";
import { merchantKey, merchantKeys, type RecurringCandidate } from "../finance/recurring-detect";
import { bankSeries, listRecurring, seriesForItem } from "../finance/planning";
import { listAccounts } from "../finance/accounts";
import { queryTransactions } from "../finance/transactions";
import { assignmentDedupeKey } from "../school";
import type { Extraction } from "./extract";

/**
 * Things from Google (and forwarded copies of them) must show up once. This file holds the rules that decide
 * "is it the one we already have?": the same email (Message-ID, content key), the same bill (a tracked one, or the
 * bank's series), the same purchase (the bank's copy) and the same exam (moved, not added). Email content is
 * untrusted: it only ever picks among rows the user already has, through the services, and every change keeps
 * what it replaced (`prev`) so Undo can put it back.
 */

const usd = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;
const fmtDay = (d: string) => formatDateStr(d, "EEE, MMM d");

// ------------------------------------------------------------------ the same email

/** A Message-ID header without its angle brackets, lower case. Null when there isn't a usable one. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  const id = (raw ?? "")
    .trim()
    .replace(/^<+|>+$/g, "")
    .trim()
    .toLowerCase();
  return id.length >= 3 ? id.slice(0, 300) : null;
}

/**
 * What a bill says, independent of the door it came through. The sender's domain is no use here: a forwarded copy
 * comes from the user's own address, so the key uses who is owed (the brand), the amount and the due date. A bill
 * without a due date has no key (two monthly statements for the same amount would look alike).
 */
export function contentSigFor(ex: Pick<Extraction, "type" | "bill">): string | null {
  const b = ex.bill;
  if (ex.type !== "bill" || !b || !b.due_date || !Number.isFinite(b.amount_usd)) return null;
  const amount = Math.round(Math.abs(b.amount_usd) * 100);
  const who = merchantKey({ merchantName: b.payee, description: b.payee });
  return who && amount ? `bill|${who}|${amount}|${b.due_date}` : null;
}

/** The first inbox item (oldest) that already filed this email, if any. Failed and ignored items never filed anything. */
export async function findFiledTwin(scope: UserScope, by: { messageId?: string | null; contentSig?: string | null }, exceptId: string) {
  const key = by.messageId ? { col: inboxItems.messageId, v: by.messageId } : by.contentSig ? { col: inboxItems.contentSig, v: by.contentSig } : null;
  if (!key) return null;
  const rows = await scope.tx
    .select({ id: inboxItems.id, status: inboxItems.status })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        eq(key.col, key.v),
        ne(inboxItems.id, exceptId),
        // An undone item counts: the user took it back, so another copy must not file it again.
        inArray(inboxItems.status, ["filed", "needs_review", "undone"]),
      ),
    )
    .orderBy(asc(inboxItems.receivedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ bills (D6, D7, D8, D11)

export type BillFacts = { payee: string; amountCents: number; frequency: Frequency; due: string };
type Virtual = { name: string; merchantKey: string | null; amountCents: number; frequency: Frequency; nextDueDate: string };

export type BillMatch = { kind: "item"; item: typeof recurringItems.$inferSelect } | { kind: "series"; series: RecurringCandidate } | null;

/**
 * An email's bill against a bank series when the names don't relate ("Federal Student Aid" and "MOHELA STUDENT LN",
 * both $214.37 on the 15th): the same direction, schedule, amount within 5% and day within 3. Two well-known brands
 * that differ (Netflix, Hulu) never match. `tracksSeries` (names that relate) is tried first by the caller.
 */
function looseSeriesMatch(v: Virtual, c: RecurringCandidate): boolean {
  if (tracksSeries(v, c)) return true;
  if (c.frequency !== v.frequency || Math.sign(c.latestAmountCents) !== Math.sign(v.amountCents)) return false;
  const [a, b] = [brandName(v.name), brandName(c.name)];
  if (a && b && a !== b) return false;
  const near = Math.abs(c.latestAmountCents - v.amountCents) <= Math.max(Math.abs(v.amountCents) * 0.05, 50);
  return near && scheduleGap(v.nextDueDate, c.nextExpectedDate, v.frequency) <= 3;
}

/**
 * The bill already tracked that this email is about, if any:
 * 1. a tracked bill whose name relates (the same brand, "Comcast" and "Xfinity" included) on the same schedule;
 * 2. a tracked bill standing for a bank series that matches (names differ, amount and day agree);
 * 3. a bank series the user doesn't track yet: the new bill is saved as that series, so it counts once.
 */
export async function findTrackedBill(scope: UserScope, bill: BillFacts, today: string): Promise<BillMatch> {
  const v: Virtual = { name: bill.payee, merchantKey: null, amountCents: -bill.amountCents, frequency: bill.frequency, nextDueDate: bill.due };
  const items = (await listRecurring(scope)).filter((i) => i.amountCents < 0 && i.kind !== "income" && i.frequency === bill.frequency);
  const mine = trackedKeys(v);

  const related = items.flatMap((item) => {
    const rel = nameRelation(trackedKeys(item), mine);
    return rel ? [{ item, rel }] : [];
  });
  const fits = related.filter(({ item, rel }) =>
    rel === "same"
      ? // A price change is welcome (Spotify 11.99 to 12.99); a different charge from one merchant (rent and parking) is not.
        amountsClose(item.amountCents, v.amountCents, true)
      : amountsClose(item.amountCents, v.amountCents, false) &&
        (!item.nextDueDate || scheduleGap(item.nextDueDate, bill.due, bill.frequency) <= SLACK_DAYS[bill.frequency]),
  );
  const closest = (list: typeof fits) =>
    list.reduce((best, x) => (Math.abs(x.item.amountCents - v.amountCents) < Math.abs(best.item.amountCents - v.amountCents) ? x : best));
  if (fits.length) return { kind: "item", item: closest(fits).item };

  const bank = await bankSeries(scope, today);
  const viaSeries = items.filter((item) => seriesForItem(item, bank.trackedActive).some((c) => looseSeriesMatch(v, c)));
  if (viaSeries.length === 1) return { kind: "item", item: viaSeries[0] };
  if (viaSeries.length > 1) return null; // ambiguous: never guess between two bills
  const open = bank.untracked.filter((c) => looseSeriesMatch(v, c));
  return open.length === 1 ? { kind: "series", series: open[0] } : null;
}

/** Same title (a "Pay X ($Y)" to-do) already open for that payee and date? Then the second email reuses it. */
export async function findOpenPayTask(scope: UserScope, tz: string, payee: string, due: string) {
  const rows = await scope.tx
    .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt })
    .from(tasks)
    .where(and(eq(tasks.userId, scope.userId), ne(tasks.status, "done")));
  const want = normalizeText(`Pay ${payee}`);
  return rows.find((t) => t.dueAt && localDateOf(t.dueAt, tz) === due && normalizeText(t.title).startsWith(want)) ?? null;
}

/**
 * A new statement for a bill already tracked: its next due date moves (never backwards past a different cycle) and its
 * amount follows. A different amount is a price change; the old price is kept in `priceHistory`.
 */
export async function updateTrackedBill(scope: UserScope, item: typeof recurringItems.$inferSelect, bill: BillFacts): Promise<InboxFiled> {
  const newAmount = -bill.amountCents;
  const moves = !item.nextDueDate || bill.due > item.nextDueDate || scheduleGap(item.nextDueDate, bill.due, item.frequency) <= SLACK_DAYS[item.frequency];
  const nextDueDate = moves ? bill.due : item.nextDueDate;
  const priceChanged = newAmount !== item.amountCents;
  const priceHistory = priceChanged ? [...item.priceHistory, { amountCents: item.amountCents, until: bill.due }] : item.priceHistory;
  await scope.tx
    .update(recurringItems)
    .set({ amountCents: newAmount, nextDueDate, priceHistory })
    .where(and(eq(recurringItems.id, item.id), eq(recurringItems.userId, scope.userId)));
  const what = priceChanged
    ? `price ${usd(item.amountCents)} to ${usd(newAmount)} from ${fmtDay(bill.due)}`
    : `${usd(newAmount)}, next ${fmtDay(nextDueDate ?? bill.due)}`;
  return {
    kind: "recurring_update",
    id: item.id,
    label: `Bill updated: ${item.name} ${what}`,
    href: "/finances/bills",
    prev: { amountCents: item.amountCents, nextDueDate: item.nextDueDate, priceHistory: item.priceHistory },
  };
}

/** A bill the email found in the bank under another name: save it as that series, so the bank's charges pay it. */
export async function saveBillAsSeries(scope: UserScope, series: RecurringCandidate, bill: BillFacts): Promise<InboxFiled> {
  const [row] = await scope.tx
    .insert(recurringItems)
    .values({
      userId: scope.userId,
      name: series.name.slice(0, 120),
      merchantKey: series.merchantKey,
      amountCents: -bill.amountCents,
      frequency: bill.frequency,
      nextDueDate: bill.due,
      kind: "bill",
      source: "detected",
    })
    .returning();
  return {
    kind: "recurring",
    id: row.id,
    label: `Bill: ${row.name} ${usd(bill.amountCents)} ${bill.frequency}, next ${fmtDay(bill.due)} (same as your bank's ${series.name})`,
    href: "/finances/bills",
  };
}

// ------------------------------------------------------------------ receipts (D9)

export const WAITING_FOR_BANK = "Waiting for your bank";

/** Does a bank feed (Plaid) cover the accounts a receipt could belong to? Then the bank brings the spending; the receipt never adds to it. */
export async function bankFeedCovers(scope: UserScope) {
  const accounts = await listAccounts(scope);
  return accounts.some((a) => a.source === "plaid" && !a.excludedAt && (a.type === "credit" || a.type === "depository"));
}

type Receipt = { merchant: string; amountCents: number; day: string };

/** The bank's (or any) copy of a purchase: same amount, within a few days, and a merchant of the same brand. */
export async function findPurchaseTwin(scope: UserScope, r: Receipt) {
  const rows = await queryTransactions(scope, {
    from: addDaysStr(r.day, -3),
    to: addDaysStr(r.day, 5),
    minAmountCents: r.amountCents,
    maxAmountCents: r.amountCents,
    limit: 25,
  });
  const mine = merchantKeys({ merchantName: r.merchant, description: r.merchant });
  return rows
    .filter((t) => t.amountCents < 0 && t.kind !== "transfer" && nameRelation(mine, merchantKeys(t)))
    .sort(
      (a, b) => Number(b.source === "plaid") - Number(a.source === "plaid") || Math.abs(daysBetween(r.day, a.date)) - Math.abs(daysBetween(r.day, b.date)),
    )[0];
}

/** Writes the receipt onto the bank's transaction as a note (Undo puts the old note back). Never touches the amount. */
export async function attachReceipt(
  scope: UserScope,
  txn: { id: string; notes: string | null; description: string; date: string },
  r: Receipt,
): Promise<InboxFiled> {
  const line = `Receipt by email: ${r.merchant.slice(0, 80)} ${usd(r.amountCents)} on ${r.day}`;
  const notes = [txn.notes, line].filter(Boolean).join("\n").slice(0, 2000);
  await scope.tx
    .update(transactions)
    .set({ notes })
    .where(and(eq(transactions.id, txn.id), eq(transactions.userId, scope.userId)));
  return {
    kind: "transaction_note",
    id: txn.id,
    label: `Receipt attached to ${txn.description} ${usd(r.amountCents)} on ${fmtDay(txn.date)} (not counted twice)`,
    href: "/finances/transactions",
    prev: { notes: txn.notes },
  };
}

// ------------------------------------------------------------------ exams moved (D10)

const EXAM_WORDS = new Set(["exam", "test", "midterm", "final", "quiz"]);
const numbersIn = (t: string) => normalizeText(t).match(/\d+/g) ?? [];

/**
 * The course's open exam (or assignment) an email is about: the same name, one name inside the other, the old date
 * the email names, or the same exam number ("Midterm 2" and "Exam 2" for an exam). Never a finished one.
 */
export async function findExistingSchoolItem(
  scope: UserScope,
  tz: string,
  q: { courseId: string; kind: "exam" | "assignment"; title: string; oldDate: string | null },
) {
  const rows = await scope.tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.courseId, q.courseId), eq(assignments.kind, q.kind), ne(assignments.status, "done")))
    .orderBy(asc(assignments.createdAt));
  const title = normalizeText(q.title);
  const words = new Set(title.split(" ").filter(Boolean));
  const hit = (a: (typeof rows)[number]) => {
    const other = normalizeText(a.title);
    if (other === title) return 4;
    const ow = new Set(other.split(" ").filter(Boolean));
    if (title && other && ([...words].every((w) => ow.has(w)) || [...ow].every((w) => words.has(w)))) return 3;
    if (q.oldDate && a.dueAt && localDateOf(a.dueAt, tz) === q.oldDate) return 2;
    const [n1, n2] = [numbersIn(q.title), numbersIn(a.title)];
    if (q.kind === "exam" && n1.length && n1.join() === n2.join() && [...words].some((w) => EXAM_WORDS.has(w)) && [...ow].some((w) => EXAM_WORDS.has(w)))
      return 1;
    return 0;
  };
  const best = rows.map((a) => ({ a, s: hit(a) })).filter((x) => x.s > 0);
  best.sort((x, y) => y.s - x.s);
  return best[0]?.a ?? null;
}

/** Moves an existing exam to the date the email gives. Null when nothing would change or the new date is already taken by a copy. */
export async function moveSchoolItem(
  scope: UserScope,
  tz: string,
  row: typeof assignments.$inferSelect,
  to: { date: string; time: string | null },
  from: string | null,
  label: string,
): Promise<{ filed: InboxFiled } | { same: true } | { taken: true }> {
  const prevDate = row.dueAt ? localDateOf(row.dueAt, tz) : null;
  const prevTime = row.dueAt && !row.dueAllDay ? localTimeOf(row.dueAt, tz) : null;
  // An email that gives only a new day keeps the exam's time.
  const time = to.time ?? prevTime;
  if (prevDate === to.date && prevTime === time) return { same: true };
  const key = assignmentDedupeKey(row.courseId, row.title, to.date);
  const [clash] = await scope.tx
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.dedupeKey, key), ne(assignments.id, row.id)));
  if (clash) return { taken: true };
  const note = `Moved by an email${from ? ` from ${from.replace(/[\r\n]+/g, " ").slice(0, 120)}` : ""}${prevDate ? `; it was ${prevDate}` : ""}`.slice(0, 300);
  await scope.tx
    .update(assignments)
    .set({ dueAt: localToInstant(to.date, time, tz), dueAllDay: !time, dedupeKey: key, sourceRef: note })
    .where(and(eq(assignments.id, row.id), eq(assignments.userId, scope.userId)));
  return {
    filed: {
      kind: "assignment_update",
      id: row.id,
      label: `${label} moved to ${fmtDay(to.date)}${prevDate ? ` (was ${fmtDay(prevDate)})` : ""}`,
      href: `/school/courses/${row.courseId}`,
      prev: { dueAt: row.dueAt?.toISOString() ?? null, dueAllDay: row.dueAllDay, dedupeKey: row.dedupeKey, sourceRef: row.sourceRef },
    },
  };
}

// ------------------------------------------------------------------ Undo of updates

/** Puts back what an update changed. Quiet when the row is gone. */
export async function undoUpdate(scope: UserScope, f: InboxFiled) {
  const prev = f.prev ?? {};
  if (f.kind === "recurring_update" && "amountCents" in prev)
    await scope.tx
      .update(recurringItems)
      .set({
        amountCents: prev.amountCents as number,
        nextDueDate: (prev.nextDueDate as string | null) ?? null,
        priceHistory: (prev.priceHistory as { amountCents: number; until: string }[]) ?? [],
      })
      .where(and(eq(recurringItems.id, f.id), eq(recurringItems.userId, scope.userId)));
  if (f.kind === "assignment_update" && "dedupeKey" in prev) {
    const key = prev.dedupeKey as string;
    const [clash] = await scope.tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.userId, scope.userId), eq(assignments.dedupeKey, key), ne(assignments.id, f.id)));
    if (clash) return;
    await scope.tx
      .update(assignments)
      .set({
        dueAt: prev.dueAt ? new Date(prev.dueAt as string) : null,
        dueAllDay: prev.dueAllDay === true,
        dedupeKey: key,
        sourceRef: (prev.sourceRef as string | null) ?? null,
      })
      .where(and(eq(assignments.id, f.id), eq(assignments.userId, scope.userId)));
  }
  if (f.kind === "transaction_note" && "notes" in prev)
    await scope.tx
      .update(transactions)
      .set({ notes: (prev.notes as string | null) ?? null })
      .where(and(eq(transactions.id, f.id), eq(transactions.userId, scope.userId)));
}
