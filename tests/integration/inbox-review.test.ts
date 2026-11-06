import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { addDaysStr, localDateOf, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { assignments, financialAccounts, inboxItems, notificationLog, recurringItems, tasks, transactions, users, type InboxFiled } from "@/server/db/schema";
import { mergeCanvasDuplicates } from "@/server/integrations/canvas";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createRecurring } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { processDocument, undoInboxItem } from "@/server/services/inbox";
import { attachWaitingReceipts, collapseInboxDuplicates } from "@/server/services/inbox/cleanup";
import { runDueSlot } from "@/server/services/proactive/engine";
import type { Extraction } from "@/server/services/inbox/extract";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const today = todayIn(TZ);
const base: Omit<Extraction, "type" | "summary"> = { bill: null, receipt: null, school: null, travel: null, pay: null };
const fixed = (ex: Partial<Extraction> & Pick<Extraction, "type">) => async () => ({ ...base, summary: "s", ...ex }) as Extraction;
const billEx = (payee: string, usd: number, due: string, account_ref: string | null = null) =>
  ({ type: "bill", bill: { payee, amount_usd: usd, due_date: due, repeats: "monthly", account_ref } }) as const;
const examEx = (course: string, title: string, due: string, o: { old?: string | null; moved?: boolean; type?: "exam" | "assignment" } = {}) =>
  ({ type: o.type ?? "exam", school: { course, title, due_date: due, due_time: null, old_due_date: o.old ?? null, moved: o.moved ?? false } }) as const;

const setup = async () => {
  const { user, run } = await makeUser();
  const file = (ex: Partial<Extraction> & Pick<Extraction, "type">, extra: Record<string, unknown> = {}) =>
    run((s) => processDocument(s, TZ, today, { channel: "email", subject: "x", text: "x", files: [], authenticated: true, ...extra }, fixed(ex)));
  return { user, run, file };
};
const dayOf = (d: Date | null) => (d ? localDateOf(d, TZ) : undefined);

describe("review fixes: nothing is merged on a guess", () => {
  it("1: every migration has its own, rising `when` (drizzle skips one that is not above the latest)", () => {
    const j = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    const whens = j.entries.map((e) => e.when);
    expect(new Set(whens).size).toBe(whens.length);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(j.entries.find((e) => e.tag === "0040_inbox_dedupe")!.when).toBe(1794200000000);
  });

  it("2: three Verizon lines stay separate; a near amount on the same day is asked about, not merged", async () => {
    const { run, file } = await setup();
    const a = await file(billEx("Verizon", 45, "2026-11-12"), { messageId: "a@vz.com" });
    const b = await file(billEx("Verizon", 45, "2026-11-22"), { messageId: "b@vz.com" });
    const c = await file(billEx("Verizon", 55, "2026-11-25"), { messageId: "c@vz.com" });
    expect(a.filed[0].kind).toBe("recurring");
    expect(b.filed[0].kind).toBe("recurring");
    expect(c.filed.map((f) => f.kind)).toEqual(["task"]);
    expect(c.reason).toContain("Same bill?");
    const bills = await run((s) => s.tx.select().from(recurringItems));
    expect(bills.map((r) => [r.amountCents, r.nextDueDate]).sort()).toEqual([
      [-4500, "2026-11-12"],
      [-4500, "2026-11-22"],
    ]);
    // Next month's statement for line A still finds line A (same day of the month, same amount).
    const aDec = await file(billEx("Verizon", 45, "2026-12-12"), { messageId: "a2@vz.com" });
    expect(aDec.filed[0].kind).toBe("recurring_update");
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
  });

  it("3: two lines with the same amount and date are told apart by their account, else asked about", async () => {
    const { run, file } = await setup();
    await file(billEx("Verizon", 45, "2026-11-20", "line 0001"), { messageId: "l1@vz.com" });
    const second = await file(billEx("Verizon", 45, "2026-11-20", "line 0002"), { messageId: "l2@vz.com" });
    expect(second.status).toBe("filed");
    const noRef = await file(billEx("Verizon", 45, "2026-11-20"), { messageId: "l3@vz.com" });
    expect(noRef.status).toBe("needs_review");
    expect(noRef.reason).toContain("Same bill?");
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
    // The very same email (same Message-ID) is still dropped without being read.
    expect((await file(billEx("Verizon", 45, "2026-11-20", "line 0001"), { messageId: "<L1@vz.com>" })).status).toBe("duplicate");
  });

  it("11: an older statement never moves the due date back", async () => {
    const { run, file } = await setup();
    await file(billEx("Oak Street Apartments", 1500, "2026-12-01"), { messageId: "dec@oak.com" });
    const nov = await file(billEx("Oak Street Apartments", 1500, "2026-11-01"), { messageId: "nov@oak.com" });
    expect(nov.filed).toEqual([]);
    expect(nov.reason).toContain("older statement");
    const bills = await run((s) => s.tx.select().from(recurringItems));
    expect(bills.map((r) => r.nextDueDate)).toEqual(["2026-12-01"]);
    expect(await run((s) => s.tx.select().from(tasks))).toHaveLength(1);
  });

  it("6: only a 'moved' email with the old date and exactly one match moves an exam", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-12" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Essay 1 Draft", kind: "assignment", dueDate: "2026-11-10" });
      return c;
    });
    const list = async () =>
      (await run((s) => s.tx.select().from(assignments)))
        .filter((a) => a.courseId === c.id)
        .map((a) => `${a.title}:${dayOf(a.dueAt)}`)
        .sort();
    // A new "Exam" is added, not mistaken for Exam 1.
    await file(examEx("MATH 152", "Exam", "2026-11-30"), { messageId: "n1@s.edu" });
    expect(await list()).toEqual(["Essay 1 Draft:2026-11-10", "Exam 1:2026-11-03", "Exam 2:2026-11-12", "Exam:2026-11-30"]);
    // A new "Essay 1" is added next to "Essay 1 Draft".
    const essay = await file(examEx("MATH 152", "Essay 1", "2026-11-24", { type: "assignment" }), { messageId: "n2@s.edu" });
    expect(essay.filed[0].kind).toBe("assignment");
    expect(await list()).toContain("Essay 1 Draft:2026-11-10");
    // Moved but no old date: asked, nothing changes.
    const noOld = await file(examEx("MATH 152", "Exam", "2026-11-17", { moved: true }), { messageId: "m1@s.edu" });
    expect(noOld.reason).toContain("Same exam?");
    expect(await list()).toContain("Exam 2:2026-11-12");
    // Moved, vague title, the old date points at Exam 2 only.
    const moved = await file(examEx("MATH 152", "Exam", "2026-11-17", { moved: true, old: "2026-11-12" }), { messageId: "m2@s.edu", from: "prof@s.edu" });
    expect(moved.filed[0].kind).toBe("assignment_update");
    const after = await list();
    expect(after).toContain("Exam 2:2026-11-17");
    expect(after).toContain("Exam 1:2026-11-03");
    // Moved with an old date nothing is due on: asked.
    const none = await file(examEx("MATH 152", "Exam 9", "2026-11-18", { moved: true, old: "2026-09-09" }), { messageId: "m3@s.edu" });
    expect(none.reason).toContain("Same exam?");
    // A title naming another number never matches by date alone.
    const wrong = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true, old: "2026-11-17" }), { messageId: "m4@s.edu" });
    expect(wrong.reason).toContain("Same exam?");
    expect(await list()).toContain("Exam 2:2026-11-17");
  });

  it("6: two items due on the old date are asked about, not guessed", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Bio", code: "BIO 110" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Quiz A", kind: "exam", dueDate: "2026-11-12" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Quiz B", kind: "exam", dueDate: "2026-11-12" });
    });
    const r = await file(examEx("BIO 110", "Quiz", "2026-11-19", { moved: true, old: "2026-11-12" }), { messageId: "q@s.edu" });
    expect(r.reason).toContain("Same exam?");
    expect((await run((s) => s.tx.select().from(assignments))).map((a) => dayOf(a.dueAt))).toEqual(["2026-11-12", "2026-11-12"]);
  });

  it("7: moving a Canvas row leaves Canvas's key alone, so Canvas's own date applies at its next sync", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Chem", code: "CHEM 101" });
      await s.tx.insert(assignments).values({
        userId: s.userId,
        courseId: c.id,
        title: "Exam 2",
        kind: "exam",
        dueAt: new Date("2026-11-12T18:00:00Z"),
        dueAllDay: false,
        source: "canvas",
        sourceRef: "https://canvas.example/courses/1/assignments/555",
        providerAssignmentId: "555",
        dedupeKey: "canvas:555",
      });
      return c;
    });
    const r = await file(examEx("CHEM 101", "Exam 2", "2026-11-17", { moved: true, old: "2026-11-12" }), { messageId: "mv@s.edu", from: "x@s.edu" });
    expect(r.filed[0].kind).toBe("assignment_update");
    const rows = () => run((s) => s.tx.select().from(assignments)).then((l) => l.filter((a) => a.courseId === c.id));
    let [row] = await rows();
    expect([row.dedupeKey, dayOf(row.dueAt), row.sourceRef]).toEqual(["canvas:555", "2026-11-17", "https://canvas.example/courses/1/assignments/555"]);
    // Canvas syncs its real date (the same upsert syncApi runs, then the merge).
    await run(async (s) => {
      const fields = { title: "Exam 2", kind: "exam" as const, dueAt: new Date("2026-11-19T18:00:00Z"), dueAllDay: false, pointsPossible: null, url: null };
      await s.tx
        .insert(assignments)
        .values({ userId: s.userId, courseId: c.id, ...fields, source: "canvas", providerAssignmentId: "555", dedupeKey: "canvas:555" })
        .onConflictDoUpdate({ target: [assignments.userId, assignments.dedupeKey], set: fields });
      await mergeCanvasDuplicates(s);
    });
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(dayOf(after[0].dueAt)).toBe("2026-11-19");
    // Undo puts the email's change back without touching the key either.
    await run((s) => undoInboxItem(s, r.id));
    [row] = await rows();
    expect(row.dedupeKey).toBe("canvas:555");
  });

  it("8: without the sender check, no email changes a bill, an exam or a bank charge", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      await createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: "2026-11-15", kind: "subscription" });
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-12" });
      const [card] = await s.tx
        .insert(financialAccounts)
        .values({ userId: s.userId, name: "Visa", type: "credit", source: "plaid", currentBalanceCents: 0 })
        .returning();
      await createTransaction(s, { accountId: card.id, date: addDaysStr(today, -1), description: "TARGET 0001", amountCents: -2345 }, "plaid", "p-1");
    });
    const spoof = { authenticated: false, from: "evil@example.com" };
    const price = await file(billEx("Spotify", 12.49, "2026-12-15"), { ...spoof, messageId: "p1@x.com" });
    expect(price.filed.map((f) => f.kind)).toEqual(["task"]);
    expect(price.reason).toContain("sender check");
    const moved = await file(examEx("MATH 152", "Exam 2", "2026-11-30", { moved: true, old: "2026-11-12" }), { ...spoof, messageId: "p2@x.com" });
    expect(moved.filed).toEqual([]);
    const receipt = await file(
      { type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: addDaysStr(today, -2) } },
      { ...spoof, messageId: "p3@x.com" },
    );
    expect(receipt.filed).toEqual([]);
    const spotify = (await run((s) => s.tx.select().from(recurringItems)))[0];
    expect([spotify.amountCents, spotify.nextDueDate]).toEqual([-1199, "2026-11-15"]);
    expect(dayOf((await run((s) => s.tx.select().from(assignments)))[0].dueAt)).toBe("2026-11-12");
    expect((await run((s) => s.tx.select().from(transactions)))[0].notes).toBeNull();
    // The same three emails with the sender check change them.
    expect((await file(billEx("Spotify", 12.49, "2026-12-16"), { messageId: "q1@x.com" })).filed[0].kind).toBe("recurring_update");
    expect((await file(examEx("MATH 152", "Exam 2", "2026-11-30", { moved: true, old: "2026-11-12" }), { messageId: "q2@x.com" })).filed[0].kind).toBe(
      "assignment_update",
    );
    expect(
      (await file({ type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: addDaysStr(today, -2) } }, { messageId: "q3@x.com" })).filed[0]
        .kind,
    ).toBe("transaction_note");
  });

  it("12: a receipt for cash or an unlinked card is spending; one for a linked card waits for its charge", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      await s.tx.insert(financialAccounts).values({ userId: s.userId, name: "Visa", type: "credit", source: "plaid", mask: "1111", currentBalanceCents: 0 });
      await createManualAccount(s, { name: "Cash", type: "depository", currentBalanceCents: 0 });
    });
    const count = async () => (await run((s) => s.tx.select().from(transactions))).length;
    const unlinked = await file(
      { type: "receipt", receipt: { merchant: "Corner Deli", total_usd: 9.5, date: today, payment_last4: "9999" } },
      { messageId: "r1@x.com" },
    );
    expect(unlinked.filed[0].kind).toBe("transaction");
    expect(unlinked.reason).toContain("counted this as spending");
    expect(await count()).toBe(1);
    const linked = await file(
      { type: "receipt", receipt: { merchant: "Cafe", total_usd: 4.5, date: today, payment_last4: "1111" } },
      { messageId: "r2@x.com" },
    );
    expect(linked.status).toBe("needs_review");
    expect(await count()).toBe(1);
    const unknown = await file({ type: "receipt", receipt: { merchant: "Hardware Store", total_usd: 30, date: today } }, { messageId: "r3@x.com" });
    expect(unknown.status).toBe("needs_review");
    expect(await count()).toBe(1);
    // Six days on, no charge came for the one with no card printed: it was paid another way, so it counts.
    expect(await run((s) => attachWaitingReceipts(s, addDaysStr(today, 6)))).toBe(1);
    const txns = await run((s) => s.tx.select().from(transactions));
    expect(txns.map((t) => t.description).sort()).toEqual(["Corner Deli", "Hardware Store"]);
    const [item] = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, unknown.id)));
    expect(item.status).toBe("filed");
    await run((s) => undoInboxItem(s, unknown.id));
    expect(await count()).toBe(1);
    // The one for the linked card keeps waiting.
    expect((await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, linked.id))))[0].status).toBe("needs_review");
  });
});

describe("review fixes: the cleanup", () => {
  const legacy = async () => {
    const { run, user } = await setup();
    const mk = (s: Parameters<Parameters<typeof run>[0]>[0], day: number, ex: Extraction, filed: InboxFiled[], messageId: string) =>
      s.tx
        .insert(inboxItems)
        .values({
          userId: s.userId,
          channel: "email",
          status: "filed",
          type: ex.type,
          extracted: ex as unknown as Record<string, unknown>,
          filed,
          receivedAt: new Date(Date.UTC(2026, 9, day)),
          messageId,
        })
        .returning();
    return { run, user, mk };
  };
  const bill = (payee: string, usd: number, due: string): Extraction => ({ ...base, summary: "s", ...billEx(payee, usd, due) }) as Extraction;

  it("4: two Verizon lines filed by two emails are not merged", async () => {
    const { run, mk } = await legacy();
    await run(async (s) => {
      const a = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }, "detected");
      const b = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-22", kind: "bill" }, "detected");
      await mk(s, 1, bill("Verizon", 45, "2026-11-12"), [{ kind: "recurring", id: a.id, label: "a" }], "a@vz");
      await mk(s, 2, bill("Verizon", 45, "2026-11-22"), [{ kind: "recurring", id: b.id, label: "b" }], "b@vz");
    });
    expect(await run((s) => collapseInboxDuplicates(s))).toEqual({ inboxItems: 0, bills: 0, tasks: 0, exams: 0 });
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
  });

  it("5: a weekly 'Quiz' filed by three emails is never grouped by its title", async () => {
    const { run, mk } = await legacy();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Bio", code: "BIO 110" });
      let d = 1;
      for (const due of ["2026-11-03", "2026-11-10", "2026-11-17"]) {
        const q = await createAssignment(s, TZ, { courseId: c.id, title: "Quiz", kind: "exam", dueDate: due });
        const ex = { ...base, type: "exam", summary: "s", school: { course: "BIO 110", title: "Quiz", due_date: due, due_time: null } } as Extraction;
        await mk(s, d++, ex, [{ kind: "assignment", id: q.assignment.id, label: "q" }], `q${due}@bio`);
      }
    });
    expect(await run((s) => collapseInboxDuplicates(s))).toEqual({ inboxItems: 0, bills: 0, tasks: 0, exams: 0 });
    expect(await run((s) => s.tx.select().from(assignments))).toHaveLength(3);
  });

  it("10: Undo restores a statement merge too (the removed bill returns and the kept bill goes back)", async () => {
    const { run, mk } = await legacy();
    const ids = await run(async (s) => {
      const a = await createRecurring(s, { name: "Xfinity", amountCents: -6499, frequency: "monthly", nextDueDate: "2026-11-20", kind: "bill" }, "detected");
      const b = await createRecurring(s, { name: "Xfinity", amountCents: -6999, frequency: "monthly", nextDueDate: "2026-12-20", kind: "bill" }, "detected");
      await s.tx
        .update(recurringItems)
        .set({ createdAt: new Date("2026-11-01T00:00:00Z") })
        .where(eq(recurringItems.id, a.id));
      await mk(s, 1, bill("Xfinity", 64.99, "2026-11-20"), [{ kind: "recurring", id: a.id, label: "a" }], "nov@x");
      const [ib] = await mk(s, 2, bill("Xfinity", 69.99, "2026-12-20"), [{ kind: "recurring", id: b.id, label: "b" }], "dec@x");
      return { a: a.id, b: b.id, ib: ib.id };
    });
    expect((await run((s) => collapseInboxDuplicates(s))).bills).toBe(1);
    const mid = await run((s) => s.tx.select().from(recurringItems));
    expect(mid.map((r) => [r.id === ids.a, r.amountCents, r.nextDueDate])).toEqual([[true, -6999, "2026-12-20"]]);
    expect(await run((s) => undoInboxItem(s, ids.ib))).toBe(1);
    const after = (await run((s) => s.tx.select().from(recurringItems))).sort((x, y) => (x.nextDueDate ?? "").localeCompare(y.nextDueDate ?? ""));
    expect(after.map((r) => [r.id === ids.a ? "A" : "B", r.amountCents, r.nextDueDate, r.priceHistory])).toEqual([
      ["A", -6499, "2026-11-20", []],
      ["B", -6999, "2026-12-20", []],
    ]);
    const [item] = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, ids.ib)));
    expect(item.status).toBe("filed");
    expect(item.filed.map((f) => [f.kind, f.id])).toEqual([["recurring", ids.b]]);
  });

  it("9: a database error inside the cleanup is logged and backed off; the rest of the morning run goes on", async () => {
    const { run, mk, user } = await legacy();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Bio", code: "BIO 110" });
      for (const due of ["2026-11-03", "2026-11-10"]) {
        const q = await createAssignment(s, TZ, { courseId: c.id, title: `Quiz ${due}`, kind: "exam", dueDate: due });
        const ex = { ...base, type: "exam", summary: "s", school: { course: "BIO 110", title: "Quiz", due_date: due, due_time: null } } as Extraction;
        await mk(s, 1, ex, [{ kind: "assignment", id: q.assignment.id, label: "q" }], "same-email@bio"); // one email, filed twice
      }
    });
    await getDb().execute(sql`create or replace function zz_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
    await getDb().execute(sql`create trigger zz_boom before delete on assignments for each row execute function zz_boom()`);
    const err = console.error;
    console.error = () => undefined;
    try {
      const now = new Date("2026-11-06T13:00:00Z"); // 8am in New York: the morning slot
      await withUser(user.id, (s) => runDueSlot(s, TZ, user.preferences, now));
    } finally {
      console.error = err;
      await getDb().execute(sql`drop trigger zz_boom on assignments`);
      await getDb().execute(sql`drop function zz_boom()`);
    }
    expect(await run((s) => s.tx.select().from(notificationLog).where(eq(notificationLog.userId, user.id)))).not.toHaveLength(0);
    const [u] = await run((s) => s.tx.select({ p: users.preferences }).from(users).where(eq(users.id, user.id)));
    expect(u.p.inboxDedupeVersion).toBeUndefined();
    expect(u.p.inboxDedupeRetryAfter).toBe("2026-11-09");
    expect(await run((s) => s.tx.select().from(assignments))).toHaveLength(2);
  });

  it("10: the cleanup in one user's scope never touches another's rows", async () => {
    const A = await legacy();
    await A.run(async (s) => {
      const c = await createCourse(s, { name: "Bio", code: "BIO 110" });
      for (const due of ["2026-11-03", "2026-11-10"]) {
        const q = await createAssignment(s, TZ, { courseId: c.id, title: `Quiz ${due}`, kind: "exam", dueDate: due });
        const ex = { ...base, type: "exam", summary: "s", school: { course: "BIO 110", title: "Quiz", due_date: due, due_time: null } } as Extraction;
        await A.mk(s, 1, ex, [{ kind: "assignment", id: q.assignment.id, label: "q" }], "same@bio");
      }
    });
    const B = await makeUser();
    expect(await B.run((s) => collapseInboxDuplicates(s))).toEqual({ inboxItems: 0, bills: 0, tasks: 0, exams: 0 });
    expect(await A.run((s) => s.tx.select().from(assignments))).toHaveLength(2);
  });
});
