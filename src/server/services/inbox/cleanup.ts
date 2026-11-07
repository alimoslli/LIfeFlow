import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { assignments, inboxItems, recurringItems, savingsOpportunities, tasks, users, type InboxFiled } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { addDaysStr, daysBetween } from "@/lib/dates";
import { amountsClose, nameRelation, SLACK_DAYS, scheduleGap, trackedKeys } from "../finance/bill-match";
import { createTransaction } from "../finance/transactions";
import {
  attachReceipt,
  contentSigFor,
  differentPairs,
  normalizeAccountRef,
  pairKey,
  findPurchaseTwin,
  handAccount,
  isStrongSig,
  RECEIPT_WAIT_DAYS,
  WAITING_FOR_BANK,
} from "./dedupe";
import type { Extraction } from "./extract";

/**
 * One-off cleanup (and safe to repeat): collapses what the inbox already filed twice, for one user. Bills, to-dos and
 * exams that came from the same email (Message-ID, or a content signature that names the account or line), and
 * repeated monthly statements of one bill (same brand, due day and amount). The original stays; anything pointing at
 * a removed row (savings finds, sub-tasks, other inbox items) is moved to it. Only rows the inbox made are ever removed,
 * and when in doubt nothing is: names alone never merge (three Verizon lines, a weekly "Quiz"). Every merge keeps a
 * copy of what it removed, and Undo on the inbox item brings it back.
 */
export type CollapseCounts = { inboxItems: number; bills: number; tasks: number; exams: number };

type Item = typeof inboxItems.$inferSelect;
const isSame = (kind: InboxFiled["kind"]) => kind === "recurring" || kind === "recurring_update";

/** A removed row, kept on the inbox item that filed it so Undo can bring it back. */
type Snap = {
  table: "recurring" | "task" | "assignment";
  row: Record<string, unknown>;
  entry: InboxFiled;
  /** The surviving bill before it took the later date and amount. */
  keeper?: { id: string; amountCents: number; nextDueDate: string | null; priceHistory: { amountCents: number; until: string }[] };
  /** Rows that were pointed at the survivor (savings finds, sub-tasks) and go back. */
  moved?: string[];
};
const PERIOD_DAYS = { weekly: 7, biweekly: 14, monthly: 28, quarterly: 84, yearly: 350 } as const;
const TABLES = { recurring: recurringItems, task: tasks, assignment: assignments } as const;

export async function collapseInboxDuplicates(scope: UserScope, opts: { limit?: number } = {}): Promise<CollapseCounts> {
  const counts: CollapseCounts = { inboxItems: 0, bills: 0, tasks: 0, exams: 0 };
  // Bounded: the newest `limit` filed items (oldest first within them), so a big account can't slow a sync.
  const newest = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, scope.userId), eq(inboxItems.status, "filed")))
    .orderBy(desc(inboxItems.receivedAt), desc(inboxItems.createdAt), desc(inboxItems.id))
    .limit(opts.limit ?? 5000);
  const items = newest.reverse();
  const dirty = new Set<string>();
  const touch = (i: Item) => dirty.add(i.id);

  // Points every inbox entry for a removed row at the one that stays. `as` lets a statement that only updated a bill say so.
  const repoint = (from: string, to: string, as?: InboxFiled["kind"]) => {
    for (const i of items)
      for (const f of i.filed)
        if (f.id === from) {
          f.id = to;
          if (as) f.kind = as;
          delete f.prev;
          f.merged = true;
          touch(i);
        }
  };
  // Keeps a copy of a row about to be removed on the inbox item that filed it (Undo on that item restores it).
  const stash = (table: Snap["table"], row: { id: string }, extra: Partial<Snap> = {}) => {
    const owner = items.find((i) => i.filed.some((f) => f.id === row.id));
    const entry = owner?.filed.find((f) => f.id === row.id);
    if (!owner || !entry) return;
    const ex = (owner.extracted ?? {}) as Record<string, unknown>;
    owner.extracted = { ...ex, merged: [...((ex.merged as Snap[] | undefined) ?? []), { table, row, entry: { ...entry }, ...extra } satisfies Snap] };
    touch(owner);
  };

  const removeRecurring = async (keepId: string, dropId: string) => {
    const [keep] = await scope.tx.select().from(recurringItems).where(eq(recurringItems.id, keepId));
    const [drop] = await scope.tx.select().from(recurringItems).where(eq(recurringItems.id, dropId));
    if (!keep || !drop) return false;
    // The later due date and its amount win; an amount that changed is a price change, kept in the history.
    const later = (drop.nextDueDate ?? "") > (keep.nextDueDate ?? "");
    const nextDueDate = later ? drop.nextDueDate : keep.nextDueDate;
    const amountCents = later ? drop.amountCents : keep.amountCents;
    const history = [...keep.priceHistory, ...drop.priceHistory];
    if (later && drop.amountCents !== keep.amountCents && nextDueDate) history.push({ amountCents: keep.amountCents, until: nextDueDate });
    await scope.tx.update(recurringItems).set({ nextDueDate, amountCents, priceHistory: history }).where(eq(recurringItems.id, keep.id));
    const savings = await scope.tx
      .update(savingsOpportunities)
      .set({ recurringId: keep.id })
      .where(eq(savingsOpportunities.recurringId, drop.id))
      .returning({ id: savingsOpportunities.id });
    stash("recurring", drop, {
      keeper: { id: keep.id, amountCents: keep.amountCents, nextDueDate: keep.nextDueDate, priceHistory: keep.priceHistory },
      moved: savings.map((x) => x.id),
    });
    await scope.tx.delete(recurringItems).where(and(eq(recurringItems.id, drop.id), eq(recurringItems.userId, scope.userId)));
    counts.bills++;
    return true;
  };

  const removeTask = async (keepId: string, dropId: string) => {
    const [drop] = await scope.tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, dropId), eq(tasks.userId, scope.userId)));
    // An open reminder only: one the user finished or started on stays.
    if (!drop || drop.status !== "todo") return false;
    const kids = await scope.tx
      .update(tasks)
      .set({ parentId: keepId })
      .where(and(eq(tasks.parentId, dropId), eq(tasks.userId, scope.userId)))
      .returning({ id: tasks.id });
    stash("task", drop, { moved: kids.map((k) => k.id) });
    await scope.tx.delete(tasks).where(eq(tasks.id, dropId));
    counts.tasks++;
    return true;
  };

  const removeAssignment = async (dropId: string) => {
    const [drop] = await scope.tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, dropId), eq(assignments.userId, scope.userId)));
    if (!drop || drop.status !== "todo" || drop.grade) return false;
    stash("assignment", drop);
    await scope.tx.delete(assignments).where(eq(assignments.id, dropId));
    counts.exams++;
    return true;
  };

  // 1. The same email (Message-ID, or a bill's content key) filed more than once.
  const byMessage = new Map<string, Item>();
  const byContent = new Map<string, Item>();
  for (const i of items) {
    const ex = i.extracted as Extraction | null;
    const contentSig = i.contentSig ?? (ex ? contentSigFor(ex) : null);
    if (contentSig !== i.contentSig) {
      i.contentSig = contentSig;
      touch(i);
    }
    // Only a signature that names the account or line is the same bill; one without could be two lines of a plan.
    const sig = isStrongSig(contentSig) ? contentSig : null;
    const orig = (i.messageId && byMessage.get(i.messageId)) || (sig && byContent.get(sig)) || null;
    if (!orig) {
      if (i.messageId) byMessage.set(i.messageId, i);
      if (sig) byContent.set(sig, i);
      continue;
    }
    for (const f of [...i.filed]) {
      const original = (match: (kind: InboxFiled["kind"]) => boolean) => orig.filed.find((o) => match(o.kind));
      let removed = false;
      if (f.kind === "recurring") {
        const k = original(isSame);
        if (k && k.id !== f.id && (await removeRecurring(k.id, f.id))) {
          repoint(f.id, k.id, "recurring_update");
          removed = true;
        }
      } else if (f.kind === "task") {
        const k = original((x) => x === "task");
        if (k && k.id !== f.id && (await removeTask(k.id, f.id))) {
          repoint(f.id, k.id);
          removed = true;
        }
      } else if (f.kind === "assignment") {
        const k = original((x) => x === "assignment" || x === "assignment_update");
        if (k && k.id !== f.id && (await removeAssignment(f.id))) {
          repoint(f.id, k.id, "assignment_update");
          removed = true;
        }
      }
      if (removed) i.filed = i.filed.filter((x) => x !== f);
    }
    i.duplicateOf = orig.id;
    if (!i.filed.length) {
      i.status = "duplicate";
      i.reason = "Already filed from another copy of this email, so I didn't add it again.";
      counts.inboxItems++;
    }
    touch(i);
  }

  // 2. Monthly statements: one bill per brand, due day and amount (within 10%). The inbox-made one gives way to the oldest.
  // A bill that fits more than one other, or a different day of the month (another line), is left alone.
  const madeByInbox = new Set(items.flatMap((i) => i.filed.filter((f) => isSame(f.kind)).map((f) => f.id)));
  const bills = [...(await scope.tx.select().from(recurringItems).where(eq(recurringItems.userId, scope.userId)))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const cur = new Map(bills.map((b) => [b.id, b]));
  // Bills the person answered "No, keep both" about are never merged again.
  const apart = await differentPairs(scope);
  // The account or line numbers the filing emails printed, per bill: two bills with different numbers are two lines, never one.
  const refsByBill = new Map<string, Set<string>>();
  for (const i of items)
    for (const f of i.filed) {
      const ref = normalizeAccountRef((i.extracted as Partial<Extraction> | null)?.bill?.account_ref);
      if (ref && isSame(f.kind)) refsByBill.set(f.id, (refsByBill.get(f.id) ?? new Set()).add(ref));
    }
  const differentLines = (x: string, y: string) => {
    const [a, b] = [refsByBill.get(x), refsByBill.get(y)];
    return !!a && !!b && ![...a].some((r) => b.has(r));
  };
  for (const b of bills) {
    if (!madeByInbox.has(b.id) || !cur.has(b.id) || !b.nextDueDate) continue;
    const fits = [...cur.values()].filter(
      (o) =>
        o.id !== b.id &&
        !apart.has(pairKey(o.id, b.id)) &&
        !differentLines(o.id, b.id) &&
        !!o.nextDueDate &&
        o.status === b.status &&
        o.kind !== "income" &&
        o.frequency === b.frequency &&
        nameRelation(trackedKeys(o), trackedKeys(b)) === "same" &&
        amountsClose(o.amountCents, b.amountCents, false) &&
        scheduleGap(o.nextDueDate!, b.nextDueDate!, b.frequency) <= SLACK_DAYS[b.frequency] &&
        // A statement for another period. Two with the same date could be two lines of a plan, so they are left (see step 1).
        Math.abs(daysBetween(o.nextDueDate!, b.nextDueDate!)) >= PERIOD_DAYS[b.frequency] - SLACK_DAYS[b.frequency],
    );
    const older = fits.filter((o) => o.createdAt < b.createdAt || (o.createdAt.getTime() === b.createdAt.getTime() && o.id < b.id));
    // Exactly one other bill fits, and it is the older one.
    if (fits.length !== 1 || older.length !== 1) continue;
    const keeper = older[0];
    if (!(await removeRecurring(keeper.id, b.id))) continue;
    cur.delete(b.id);
    const [fresh] = await scope.tx.select().from(recurringItems).where(eq(recurringItems.id, keeper.id));
    cur.set(keeper.id, fresh);
    repoint(b.id, keeper.id, "recurring_update");
  }

  for (const i of items)
    if (dirty.has(i.id))
      await scope.tx
        .update(inboxItems)
        .set({ filed: i.filed, status: i.status, reason: i.reason, duplicateOf: i.duplicateOf, contentSig: i.contentSig, extracted: i.extracted })
        .where(eq(inboxItems.id, i.id));
  return counts;
}

/**
 * Receipts kept while their bank charge hadn't posted: attaches each to its charge once it has (a note on the bank's
 * transaction; the amount is never touched). One whose charge never came within RECEIPT_WAIT_DAYS was paid some other
 * way (cash, a card that isn't linked), so it is added as spending with a note saying so (Undo removes it). Safe to repeat.
 */
export async function attachWaitingReceipts(scope: UserScope, today: string): Promise<number> {
  const waiting = await scope.tx
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.userId, scope.userId),
        eq(inboxItems.status, "needs_review"),
        eq(inboxItems.type, "receipt"),
        like(inboxItems.reason, `${WAITING_FOR_BANK}%`),
      ),
    );
  let n = 0;
  for (const w of waiting) {
    const r = (w.extracted as Partial<Extraction> | null)?.receipt;
    const amountCents = r ? Math.round(Math.abs(r.total_usd) * 100) : 0;
    if (!r || !amountCents) continue;
    const day = r.date ?? w.receivedAt.toISOString().slice(0, 10);
    const receipt = { merchant: r.merchant, amountCents, day };
    const twin = await findPurchaseTwin(scope, receipt);
    if (twin?.source === "plaid") {
      const filed = await attachReceipt(scope, twin, receipt);
      await scope.tx
        .update(inboxItems)
        .set(
          filed
            ? { status: "filed", filed: [filed], reason: null }
            : { status: "duplicate", filed: [], reason: "This receipt was already attached to the bank's charge, so I didn't add it again." },
        )
        .where(eq(inboxItems.id, w.id));
      n++;
      continue;
    }
    // Still waiting, unless the card printed on it is a linked one (the bank will bring it).
    const last4 = (r.payment_last4 ?? "").replace(/\D/g, "");
    if (last4 || daysBetween(day, today) <= RECEIPT_WAIT_DAYS) continue;
    const account = await handAccount(scope);
    if (!account) continue;
    const t = await createTransaction(
      scope,
      { accountId: account.id, date: day, description: r.merchant.slice(0, 200), merchantName: r.merchant.slice(0, 120), amountCents: -amountCents },
      "manual",
    );
    await scope.tx
      .update(inboxItems)
      .set({
        status: "filed",
        reason: "No matching charge from a linked bank came, so I counted this as spending (cash or a card that isn't linked). Undo it if the bank has it.",
        filed: [
          {
            kind: "transaction",
            id: t.id,
            label: `Spending: ${r.merchant} $${(amountCents / 100).toFixed(2)} on ${day} (${account.name})`,
            href: "/finances/transactions",
          },
        ],
      })
      .where(eq(inboxItems.id, w.id));
    n++;
  }
  return n;
}

/** Does this inbox item carry copies of rows a cleanup merge removed? */
export const hasMerged = (item: { extracted: Record<string, unknown> | null }) =>
  Array.isArray(item.extracted?.merged) && (item.extracted!.merged as unknown[]).length > 0;

/**
 * Undoes a cleanup merge for an inbox item, whatever its status: the removed rows come back (same ids), the survivor gets
 * its earlier date and amount, what was pointed at the survivor is pointed back, and the item is filed as it was.
 * Null when there is nothing to restore.
 */
export async function restoreMerged(scope: UserScope, id: string): Promise<number | null> {
  const [item] = await scope.tx
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, scope.userId)));
  const { merged, ...rest } = (item?.extracted ?? {}) as Record<string, unknown> & { merged?: Snap[] };
  if (!item || !merged?.length) return null;
  const revive = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && /At$/.test(k) ? new Date(v) : v]));
  for (const m of merged) {
    await scope.tx
      .insert(TABLES[m.table])
      .values({ ...revive(m.row), userId: scope.userId } as never)
      .onConflictDoNothing();
    const rowId = m.row.id as string;
    if (m.table === "recurring") {
      if (m.keeper)
        await scope.tx
          .update(recurringItems)
          .set({ amountCents: m.keeper.amountCents, nextDueDate: m.keeper.nextDueDate, priceHistory: m.keeper.priceHistory })
          .where(and(eq(recurringItems.id, m.keeper.id), eq(recurringItems.userId, scope.userId)));
      if (m.moved?.length)
        await scope.tx
          .update(savingsOpportunities)
          .set({ recurringId: rowId })
          .where(and(eq(savingsOpportunities.userId, scope.userId), inArray(savingsOpportunities.id, m.moved)));
    }
    if (m.table === "task" && m.moved?.length)
      await scope.tx
        .update(tasks)
        .set({ parentId: rowId })
        .where(and(eq(tasks.userId, scope.userId), inArray(tasks.id, m.moved)));
  }
  await scope.tx
    .update(inboxItems)
    .set({
      status: "filed",
      duplicateOf: null,
      reason: null,
      // Entries the merge pointed at the survivor give way to the originals.
      filed: [...item.filed.filter((f) => !f.merged), ...merged.map((m) => m.entry)],
      extracted: rest,
    })
    .where(eq(inboxItems.id, id));
  return merged.length;
}

export const INBOX_DEDUPE_VERSION = 1;
/** Newest filed inbox items one run looks at. */
const CLEANUP_BATCH = 1000;

/**
 * Cleans an account's duplicate inbox filings once per INBOX_DEDUPE_VERSION (marker in the user's preferences), inside the
 * caller's scope. Returns the counts, or null when this account already had it (or is waiting out a failed attempt).
 */
export async function runInboxCleanupOnce(scope: UserScope, today = new Date().toISOString().slice(0, 10)): Promise<CollapseCounts | null> {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  const prefs = u?.preferences ?? {};
  if ((prefs.inboxDedupeVersion ?? 0) >= INBOX_DEDUPE_VERSION) return null;
  if (prefs.inboxDedupeRetryAfter && prefs.inboxDedupeRetryAfter > today) return null;
  // In its own savepoint: a failure inside rolls back only the cleanup, never the rest of the caller's transaction.
  let counts: CollapseCounts;
  try {
    counts = await scope.tx.transaction((tx) => collapseInboxDuplicates({ ...scope, tx }, { limit: CLEANUP_BATCH }));
  } catch (e) {
    console.error("[inbox cleanup]", e instanceof Error ? e.name : e);
    await setPref(scope, "inboxDedupeRetryAfter", JSON.stringify(addDaysStr(today, 3)));
    return null;
  }
  await setPref(scope, "inboxDedupeVersion", String(INBOX_DEDUPE_VERSION));
  return counts;
}

const setPref = (scope: UserScope, key: string, json: string) =>
  scope.tx.execute(
    sql`update users set preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(${key}::text, ${json}::jsonb) where id = ${scope.userId}`,
  );

/** attachWaitingReceipts in its own savepoint, for the morning run: a failure is logged and the run goes on. */
export async function attachWaitingReceiptsSafely(scope: UserScope, today: string) {
  try {
    return await scope.tx.transaction((tx) => attachWaitingReceipts({ ...scope, tx }, today));
  } catch (e) {
    console.error("[waiting receipts]", e instanceof Error ? e.name : e);
    return 0;
  }
}
