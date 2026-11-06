import { and, asc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { addDaysStr, daysBetween, formatDateStr, localDateOf, localTimeOf, localToInstant } from "@/lib/dates";
import { brandName } from "@/lib/vendor";
import { normalizeText } from "@/lib/utils";
import { assignments, inboxItems, recurringItems, transactions, type Frequency, type InboxFiled } from "../../db/schema";
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

/** "Account 5521", "xxxx-5521" and "5521" are one account: the last 4 digits when there are any. */
export function normalizeAccountRef(ref: string | null | undefined): string {
  const digits = (ref ?? "").replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-4) : normalizeText(ref ?? "").replace(/ /g, "");
}

/**
 * What a bill says, independent of the door it came through: who is owed (the brand), the amount, the due date and
 * the account or line printed on it. The sender's domain is no use (a forwarded copy comes from the user's own address).
 * Without an account or line, two lines of one plan (same amount, same date) look alike, so such a signature is only
 * ever a suggestion ("Same bill?"), never a reason to drop the email (see `isStrongSig`). A bill without a due date has none.
 */
export function contentSigFor(ex: Pick<Extraction, "type" | "bill">): string | null {
  const b = ex.bill;
  if (ex.type !== "bill" || !b || !b.due_date || !Number.isFinite(b.amount_usd)) return null;
  const amount = Math.round(Math.abs(b.amount_usd) * 100);
  const who = merchantKey({ merchantName: b.payee, description: b.payee });
  const acct = normalizeAccountRef(b.account_ref);
  return who && amount ? `bill|${who}|${amount}|${b.due_date}|${acct}` : null;
}

/** A signature that names an account or line: two emails with the same one are the same bill. */
export const isStrongSig = (sig: string | null | undefined): sig is string => !!sig && !sig.endsWith("|");
/** The part of a signature without the account: what a "Same bill?" suggestion compares. */
export const weakSigPrefix = (sig: string) => sig.slice(0, sig.lastIndexOf("|") + 1);

/** The first inbox item (oldest) that already filed this email, if any. Failed and ignored items never filed anything. */
export async function findFiledTwin(
  scope: UserScope,
  by: { messageId?: string | null; contentSig?: string | null; similarTo?: string | null },
  exceptId: string,
) {
  const key = by.messageId
    ? eq(inboxItems.messageId, by.messageId)
    : by.contentSig
      ? eq(inboxItems.contentSig, by.contentSig)
      : by.similarTo
        ? like(inboxItems.contentSig, `${by.similarTo.replace(/[\\%_]/g, "")}%`)
        : null;
  if (!key) return null;
  const rows = await scope.tx
    .select({ id: inboxItems.id, status: inboxItems.status, subject: inboxItems.subject })
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        key,
        ne(inboxItems.id, exceptId),
        // An undone item counts: the user took it back, so another copy must not file it again.
        inArray(inboxItems.status, ["suggested", "filed", "needs_review", "undone"]),
      ),
    )
    .orderBy(asc(inboxItems.receivedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ bills (D6, D7, D8, D11)

/** "Verizon $45.00 on Nov 12", for a question to the person. */
const billLabel = (i: { name: string; amountCents: number; nextDueDate: string | null }) =>
  `${i.name} ${usd(i.amountCents)}${i.nextDueDate ? ` on ${fmtDay(i.nextDueDate)}` : ""}`;

export type BillFacts = { payee: string; amountCents: number; frequency: Frequency; due: string; accountRef?: string | null };
type Virtual = { name: string; merchantKey: string | null; amountCents: number; frequency: Frequency; nextDueDate: string };

export type BillMatch =
  | { kind: "item"; item: typeof recurringItems.$inferSelect }
  | { kind: "series"; series: RecurringCandidate }
  /** Could be a bill we track but not sure enough to change anything: the user is asked ("Same bill?"). */
  | { kind: "ask"; names: string[]; ids: string[] }
  | null;

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
 * The bill already tracked that this email is about, if any. When in doubt nothing is merged:
 * 1. a tracked bill whose name relates (the same brand, "Comcast" and "Xfinity" included), on the same schedule (due
 *    day within the usual slack) and within the usual amount tolerance is the bill; exactly one, else we ask.
 *    A name that relates on the same schedule but at a very different amount is asked about too (a price change?).
 *    The same name on another day of the month is another line (three Verizon lines), so it is a new bill;
 * 2. a tracked bill standing for a bank series that matches (names differ, amount and day agree);
 * 3. a bank series the user doesn't track yet: the new bill is saved as that series, so it counts once.
 */
export async function findTrackedBill(scope: UserScope, bill: BillFacts, today: string): Promise<BillMatch> {
  const v: Virtual = { name: bill.payee, merchantKey: null, amountCents: -bill.amountCents, frequency: bill.frequency, nextDueDate: bill.due };
  const items = (await listRecurring(scope)).filter((i) => i.amountCents < 0 && i.kind !== "income" && i.frequency === bill.frequency);
  const mine = trackedKeys(v);

  // Two lines of one plan: a tracked bill that came from an email naming another account or line is another bill.
  const mineRef = normalizeAccountRef(bill.accountRef);
  const sameAccount = async (itemId: string) => {
    if (!mineRef) return true;
    const filedBy = await scope.tx
      .select({ extracted: inboxItems.extracted })
      .from(inboxItems)
      .where(and(eq(inboxItems.userId, scope.userId), sql`${inboxItems.filed} @> ${JSON.stringify([{ id: itemId }])}::jsonb`));
    const refs = filedBy.map((r) => normalizeAccountRef((r.extracted as Partial<Extraction> | null)?.bill?.account_ref)).filter(Boolean);
    return !refs.length || refs.includes(mineRef);
  };
  const related: { item: (typeof items)[number]; rel: "same" | "contained" }[] = [];
  for (const item of items) {
    const rel = nameRelation(trackedKeys(item), mine);
    if (rel && (await sameAccount(item.id))) related.push({ item, rel });
  }
  if (related.length) {
    // No stored date: the schedule can't be checked, so it can't be told from another line.
    const onSchedule = related.filter(({ item }) => !item.nextDueDate || scheduleGap(item.nextDueDate, bill.due, bill.frequency) <= SLACK_DAYS[bill.frequency]);
    // A very different amount (rent and parking at one landlord) is another bill; a plausible one is a price change or a mistake.
    const plausible = onSchedule.filter(({ item }) => amountsClose(item.amountCents, v.amountCents, true));
    const sure = plausible.filter(({ item }) => item.nextDueDate && amountsClose(item.amountCents, v.amountCents, false));
    if (sure.length === 1 && plausible.length === 1) return { kind: "item", item: sure[0].item };
    if (plausible.length) return { kind: "ask", names: plausible.map(({ item }) => billLabel(item)), ids: plausible.map(({ item }) => item.id) };
    return null; // related names, but another day or a very different amount: another line or bill
  }

  const bank = await bankSeries(scope, today);
  const viaSeries = items.filter((item) => seriesForItem(item, bank.trackedActive).some((c) => looseSeriesMatch(v, c)));
  if (viaSeries.length === 1) return { kind: "item", item: viaSeries[0] };
  if (viaSeries.length > 1) return { kind: "ask", names: viaSeries.map(billLabel), ids: viaSeries.map((i) => i.id) };
  const open = bank.untracked.filter((c) => looseSeriesMatch(v, c));
  return open.length === 1 ? { kind: "series", series: open[0] } : null;
}

/**
 * A new statement for a bill already tracked: its next due date moves (never backwards past a different cycle) and its
 * amount follows. A different amount is a price change; the old price is kept in `priceHistory`.
 */
export async function updateTrackedBill(
  scope: UserScope,
  item: typeof recurringItems.$inferSelect,
  bill: BillFacts,
  opts: { sameCycleOk?: boolean } = {},
): Promise<InboxFiled | null> {
  // Only a statement for a newer period changes the bill; an older (or the same) one is already behind us.
  // (When the person said "same bill", a corrected statement for the same cycle counts too.)
  if (item.nextDueDate && (opts.sameCycleOk ? bill.due < item.nextDueDate : bill.due <= item.nextDueDate)) return null;
  const newAmount = -bill.amountCents;
  const priceChanged = newAmount !== item.amountCents;
  const priceHistory = priceChanged ? [...item.priceHistory, { amountCents: item.amountCents, until: bill.due }] : item.priceHistory;
  await scope.tx
    .update(recurringItems)
    .set({ amountCents: newAmount, nextDueDate: bill.due, priceHistory })
    .where(and(eq(recurringItems.id, item.id), eq(recurringItems.userId, scope.userId)));
  const what = priceChanged ? `price ${usd(item.amountCents)} to ${usd(newAmount)} from ${fmtDay(bill.due)}` : `${usd(newAmount)}, next ${fmtDay(bill.due)}`;
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

/** How many days a receipt waits for its bank charge before it counts as spending paid some other way (cash, a card that isn't linked). */
export const RECEIPT_WAIT_DAYS = 5;

/**
 * Does the bank bring this purchase? "hold": a linked account is the one it was paid with (the card's last 4 digits match),
 * or no payment method is printed and the charge may still post (within RECEIPT_WAIT_DAYS): the receipt waits and is not
 * counted. "spend": no bank feed, a card that isn't linked, or no charge showed up in time: it is spending.
 */
export async function receiptPolicy(scope: UserScope, r: { day: string; last4?: string | null }, today: string): Promise<"hold" | "spend" | "spend_unmatched"> {
  const linked = (await listAccounts(scope)).filter((a) => a.source === "plaid" && !a.excludedAt && (a.type === "credit" || a.type === "depository"));
  if (!linked.length) return "spend";
  const last4 = (r.last4 ?? "").replace(/\D/g, "").slice(-4);
  if (last4.length === 4) return linked.some((a) => a.mask === last4) ? "hold" : "spend_unmatched";
  return daysBetween(r.day, today) <= RECEIPT_WAIT_DAYS ? "hold" : "spend_unmatched";
}

/** Where spending the bank doesn't bring goes: a card or account the user keeps by hand. */
export async function handAccount(scope: UserScope) {
  const hand = (await listAccounts(scope)).filter((a) => a.source !== "plaid");
  return hand.find((a) => a.type === "credit") ?? hand.find((a) => a.type === "depository") ?? null;
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

const numbersIn = (t: string) => normalizeText(t).match(/\d+/g) ?? [];

/**
 * The exam (or assignment) a "moved" email is about. Only a moved email gets here, and it must give the date the item had:
 * the match is the course's one open item of that kind that is due on that date now. Zero or several matches, or a
 * title that names another number ("Exam 1" for "Exam 2"), is not a match: the caller asks the user instead. A new
 * item whose name merely resembles an existing one ("Essay 1" and "Essay 1 Draft") never gets here.
 */
export async function findMovedSchoolItem(
  scope: UserScope,
  tz: string,
  q: { courseId: string; kind: "exam" | "assignment"; title: string; oldDate: string | null },
): Promise<{ match: typeof assignments.$inferSelect } | { match: null; why: "no_date" | "none" | "many" }> {
  if (!q.oldDate) return { match: null, why: "no_date" };
  const rows = await scope.tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.courseId, q.courseId), eq(assignments.kind, q.kind), ne(assignments.status, "done")))
    .orderBy(asc(assignments.createdAt));
  const mine = numbersIn(q.title);
  const hits = rows.filter(
    (a) => a.dueAt && localDateOf(a.dueAt, tz) === q.oldDate && (!mine.length || !numbersIn(a.title).length || mine.join() === numbersIn(a.title).join()),
  );
  if (hits.length === 1) return { match: hits[0] };
  return { match: null, why: hits.length ? "many" : "none" };
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
  // Canvas owns its rows' key (`canvas:<id>`): changing it would stop Canvas's own date from ever applying again.
  const canvasOwned = row.source === "canvas" || row.dedupeKey.startsWith("canvas:");
  const key = canvasOwned ? row.dedupeKey : assignmentDedupeKey(row.courseId, row.title, to.date);
  const [clash] = await scope.tx
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.dedupeKey, key), ne(assignments.id, row.id)));
  if (clash) return { taken: true };
  const note = `Moved by an email${from ? ` from ${from.replace(/[\r\n]+/g, " ").slice(0, 120)}` : ""}${prevDate ? `; it was ${prevDate}` : ""}`.slice(0, 300);
  await scope.tx
    .update(assignments)
    // A Canvas row keeps its source reference; the change lives in this inbox item (and Canvas's date wins at its next sync).
    .set({ dueAt: localToInstant(to.date, time, tz), dueAllDay: !time, dedupeKey: key, ...(canvasOwned ? {} : { sourceRef: note }) })
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

/** The course's open items with this exact name (normalized), for "Did Exam 1 move?" when the old date can't pin it down. */
export async function findOpenByTitle(scope: UserScope, q: { courseId: string; kind: "exam" | "assignment"; title: string }) {
  const rows = await scope.tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, scope.userId), eq(assignments.courseId, q.courseId), eq(assignments.kind, q.kind), ne(assignments.status, "done")));
  return rows.filter((a) => normalizeText(a.title) === normalizeText(q.title));
}
