import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { assignments, inboxItems, recurringItems, savingsOpportunities, tasks, users, type InboxFiled } from "../../db/schema";
import type { UserScope } from "../../db/with-user";
import { normalizeText } from "@/lib/utils";
import { amountsClose, nameRelation, trackedKeys } from "../finance/bill-match";
import { contentSigFor, findPurchaseTwin, attachReceipt, WAITING_FOR_BANK } from "./dedupe";
import type { Extraction } from "./extract";

/**
 * One-off cleanup (and safe to repeat): collapses what the inbox already filed twice, for one user. Bills, to-dos and
 * exams that came from the same email (Message-ID or content key), repeated monthly statements for one bill, and
 * exams an "it moved" email added next to the old one. The original stays; anything pointing at a removed row
 * (savings finds, sub-tasks, other inbox items) is moved to the original. Only rows the inbox made are ever removed.
 */
export type CollapseCounts = { inboxItems: number; bills: number; tasks: number; exams: number };

type Item = typeof inboxItems.$inferSelect;
const isSame = (kind: InboxFiled["kind"]) => kind === "recurring" || kind === "recurring_update";

/** A removed row, kept on the inbox item that filed it so Undo can bring it back. */
type Snap = { table: "recurring" | "task" | "assignment"; row: Record<string, unknown>; entry: InboxFiled };
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
          touch(i);
        }
  };
  const dropEntry = (i: Item, id: string) => {
    i.filed = i.filed.filter((f) => f.id !== id);
    touch(i);
  };

  // Keeps a copy of a row about to be removed on the inbox item that filed it (Undo on that item restores it).
  const stash = (table: Snap["table"], row: { id: string }) => {
    const owner = items.find((i) => i.filed.some((f) => f.id === row.id));
    const entry = owner?.filed.find((f) => f.id === row.id);
    if (!owner || !entry) return;
    const ex = (owner.extracted ?? {}) as Record<string, unknown>;
    owner.extracted = { ...ex, merged: [...((ex.merged as Snap[] | undefined) ?? []), { table, row, entry: { ...entry } } satisfies Snap] };
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
    await scope.tx.update(savingsOpportunities).set({ recurringId: keep.id }).where(eq(savingsOpportunities.recurringId, drop.id));
    stash("recurring", drop);
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
    stash("task", drop);
    await scope.tx
      .update(tasks)
      .set({ parentId: keepId })
      .where(and(eq(tasks.parentId, dropId), eq(tasks.userId, scope.userId)));
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
    const orig = (i.messageId && byMessage.get(i.messageId)) || (contentSig && byContent.get(contentSig)) || null;
    if (!orig) {
      if (i.messageId) byMessage.set(i.messageId, i);
      if (contentSig) byContent.set(contentSig, i);
      continue;
    }
    for (const f of [...i.filed]) {
      const original = (match: (kind: InboxFiled["kind"]) => boolean) => orig.filed.find((o) => match(o.kind));
      let removed = false;
      if (f.kind === "recurring") {
        const k = original(isSame);
        if (k && k.id !== f.id && (await removeRecurring(k.id, f.id))) (repoint(f.id, k.id, "recurring_update"), (removed = true));
      } else if (f.kind === "task") {
        const k = original((x) => x === "task");
        if (k && k.id !== f.id && (await removeTask(k.id, f.id))) (repoint(f.id, k.id), (removed = true));
      } else if (f.kind === "assignment") {
        const k = original((x) => x === "assignment" || x === "assignment_update");
        if (k && k.id !== f.id && (await removeAssignment(f.id))) (repoint(f.id, k.id, "assignment_update"), (removed = true));
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

  // 2. Monthly statements: one bill per brand, schedule and amount (within 10%). The inbox-made one gives way to the oldest.
  const madeByInbox = new Set(items.flatMap((i) => i.filed.filter((f) => isSame(f.kind)).map((f) => f.id)));
  const bills = [...(await scope.tx.select().from(recurringItems).where(eq(recurringItems.userId, scope.userId)))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const cur = new Map(bills.map((b) => [b.id, b]));
  for (const b of bills) {
    if (!madeByInbox.has(b.id) || !cur.has(b.id)) continue;
    const keeper = [...cur.values()].find(
      (o) =>
        o.id !== b.id &&
        (o.createdAt < b.createdAt || (o.createdAt.getTime() === b.createdAt.getTime() && o.id < b.id)) &&
        o.status === b.status &&
        o.kind !== "income" &&
        o.frequency === b.frequency &&
        nameRelation(trackedKeys(o), trackedKeys(b)) === "same" &&
        amountsClose(o.amountCents, b.amountCents, false),
    );
    if (!keeper || !(await removeRecurring(keeper.id, b.id))) continue;
    cur.delete(b.id);
    const [fresh] = await scope.tx.select().from(recurringItems).where(eq(recurringItems.id, keeper.id));
    cur.set(keeper.id, fresh);
    repoint(b.id, keeper.id, "recurring_update");
  }

  // 3. The same open "Pay X ($Y)" reminder on the same day, filed by more than one email.
  const filedTasks = items.flatMap((i) => i.filed.filter((f) => f.kind === "task").map((f) => ({ i, f })));
  if (filedTasks.length) {
    const rows = await scope.tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, scope.userId),
          inArray(
            tasks.id,
            filedTasks.map((t) => t.f.id),
          ),
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
    const seen = new Map<string, string>();
    for (const t of rows) {
      const key = `${normalizeText(t.title)}|${t.dueAt?.toISOString() ?? ""}`;
      const keepId = seen.get(key);
      if (!keepId) {
        if (t.status === "todo") seen.set(key, t.id);
        continue;
      }
      if (await removeTask(keepId, t.id)) for (const e of filedTasks.filter((x) => x.f.id === t.id)) dropEntry(e.i, t.id);
    }
  }

  // 4. Exams (and assignments) an email added next to the one a class already had.
  const filedSchool = new Map<string, Item>();
  for (const i of items) for (const f of i.filed) if (f.kind === "assignment" || f.kind === "assignment_update") filedSchool.set(f.id, i);
  if (filedSchool.size) {
    const all = await scope.tx.select().from(assignments).where(eq(assignments.userId, scope.userId));
    const groups = Map.groupBy(all, (a) => `${a.courseId}|${a.kind}|${normalizeText(a.title)}`);
    for (const g of groups.values()) {
      if (g.length < 2 || !g.some((a) => filedSchool.has(a.id))) continue;
      // The synced (Canvas) row if there is one, else the date from the latest email.
      const byEmail = g
        .filter((a) => filedSchool.has(a.id))
        .sort((a, b) => filedSchool.get(b.id)!.receivedAt.getTime() - filedSchool.get(a.id)!.receivedAt.getTime());
      const keeper = g.find((a) => a.source === "canvas") ?? byEmail[0] ?? g[0];
      for (const a of g) if (a.id !== keeper.id && filedSchool.has(a.id) && (await removeAssignment(a.id))) repoint(a.id, keeper.id, "assignment_update");
    }
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
 * Receipts kept while their bank charge hadn't posted: attaches each to its charge once it has (a note on the
 * bank's transaction; the amount is never touched), and files the inbox item. Safe to repeat.
 */
export async function attachWaitingReceipts(scope: UserScope): Promise<number> {
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
    const receipt = { merchant: r.merchant, amountCents, day: r.date ?? w.receivedAt.toISOString().slice(0, 10) };
    const twin = await findPurchaseTwin(scope, receipt);
    if (twin?.source !== "plaid") continue;
    const filed = await attachReceipt(scope, twin, receipt);
    await scope.tx
      .update(inboxItems)
      .set({ status: "filed", filed: [filed], reason: null })
      .where(eq(inboxItems.id, w.id));
    n++;
  }
  return n;
}

/** Brings back what the cleanup removed for an inbox item (Undo on a "duplicate" item that has copies saved). Null when there is nothing to restore. */
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
    const t = TABLES[m.table];
    await scope.tx
      .insert(t)
      .values({ ...revive(m.row), userId: scope.userId } as never)
      .onConflictDoNothing();
  }
  await scope.tx
    .update(inboxItems)
    .set({ status: "filed", duplicateOf: null, reason: null, filed: [...item.filed, ...merged.map((m) => m.entry)], extracted: rest })
    .where(eq(inboxItems.id, id));
  return merged.length;
}

export const INBOX_DEDUPE_VERSION = 1;
/** Newest filed inbox items one run looks at. */
const CLEANUP_BATCH = 1000;

/**
 * Cleans an account's duplicate inbox filings once per INBOX_DEDUPE_VERSION (marker in the user's preferences), inside the
 * caller's scope. Returns the counts, or null when this account already had it.
 */
export async function runInboxCleanupOnce(scope: UserScope): Promise<CollapseCounts | null> {
  const [u] = await scope.tx.select({ preferences: users.preferences }).from(users).where(eq(users.id, scope.userId));
  if ((u?.preferences?.inboxDedupeVersion ?? 0) >= INBOX_DEDUPE_VERSION) return null;
  const counts = await collapseInboxDuplicates(scope, { limit: CLEANUP_BATCH });
  await scope.tx.execute(
    sql`update users set preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object('inboxDedupeVersion', ${INBOX_DEDUPE_VERSION}::int) where id = ${scope.userId}`,
  );
  return counts;
}
