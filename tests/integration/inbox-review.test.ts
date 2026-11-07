import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { addDaysStr, localDateOf, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { assignments, financialAccounts, inboxItems, notificationLog, recurringItems, tasks, transactions, users, type InboxFiled } from "@/server/db/schema";
import { mergeCanvasDuplicates } from "@/server/integrations/canvas";
import { createManualAccount } from "@/server/services/finance/accounts";
import { upcomingBills } from "@/server/services/finance/forecast";
import { bankSeries, createRecurring } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { answerQuestion, fileSuggestion, processDocument, processForwardedEmail, undoInboxItem } from "@/server/services/inbox";
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
    expect(j.entries.find((e) => e.tag === "0046_inbox_dedupe")!.when).toBe(1794800000000);
  });

  it("2: three Verizon lines stay separate; a near amount on the same day is asked about, not merged", async () => {
    const { run, file } = await setup();
    const a = await file(billEx("Verizon", 45, "2026-11-12"), { messageId: "a@vz.com" });
    const b = await file(billEx("Verizon", 45, "2026-11-22"), { messageId: "b@vz.com" });
    const c = await file(billEx("Verizon", 55, "2026-11-25"), { messageId: "c@vz.com" });
    expect(a.filed[0].kind).toBe("recurring");
    expect(b.filed[0].kind).toBe("recurring");
    expect(c.filed).toEqual([]);
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
    expect(noOld.reason).toBe("Did Exam move to Tue, Nov 17?"); // one item is called "Exam": asked, nothing changed
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
    expect(wrong.reason).toBe("Did Exam 1 move to Thu, Nov 19?");
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
    // Canvas changed the date after the email did, so Undo leaves it (it would throw Canvas's date away) and the key stays.
    expect(await run((s) => undoInboxItem(s, r.id))).toBe(0);
    [row] = await rows();
    expect([row.dedupeKey, dayOf(row.dueAt)]).toEqual(["canvas:555", "2026-11-19"]);
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

  it("8: forwarded mail only suggests; the person's tap on the suggestion applies the update", async () => {
    const { run } = await setup();
    await run((s) => createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: "2026-11-15", kind: "subscription" }));
    const sug = await run((s) =>
      processForwardedEmail(
        s,
        TZ,
        today,
        { channel: "email", subject: "price", text: "x", files: [], messageId: "f1@x.com" },
        fixed(billEx("Spotify", 12.49, "2026-12-15")),
      ),
    );
    expect(sug.status).toBe("suggested");
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-1199);
    const done = await run((s) => fileSuggestion(s, TZ, today, sug.id));
    expect(done.filed.map((f) => f.kind)).toEqual(["recurring_update", "task"]);
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-1249);
    await run((s) => undoInboxItem(s, done.id));
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-1199);
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

describe("questions the person answers (Same bill? / Did it move?)", () => {
  const asked = (item: { extracted: unknown }) => (item.extracted as { ask?: { sameAs?: string; twin?: string; answered?: string; text: string } }).ask!;

  it("a possible duplicate bill is counted once while it waits; yes updates, no adds, and Undo asks again", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const bar = async () => {
      const list = await run((s) => upcomingBills(s, "2026-11-01", "2026-11-01", "2026-11-30"));
      return list.reduce((sum, b) => sum + Math.abs(b.amountCents), 0);
    };
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "ask1@vz.com" });
    expect(q.status).toBe("needs_review");
    expect(asked(q).text).toBe("Same bill? Verizon $50.00 on Thu, Nov 12 from your email, and Verizon $45.00 on Thu, Nov 12 in your bills.");
    expect(asked(q).sameAs).toBeTruthy();
    // Waiting: nothing added, no reminder, the 30-day bar counts the bill once.
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(1);
    expect(await run((s) => s.tx.select().from(tasks))).toHaveLength(0);
    expect(await bar()).toBe(4500);

    const yes = await run((s) => answerQuestion(s, TZ, today, q.id, true));
    expect(yes.filed.map((f) => f.kind)).toEqual(["recurring_update", "task"]);
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-5000);
    await run((s) => undoInboxItem(s, q.id));
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-4500);
    const again = (await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, q.id))))[0];
    expect([again.status, asked(again).answered]).toEqual(["needs_review", undefined]);

    const no = await run((s) => answerQuestion(s, TZ, today, q.id, false));
    expect(no.filed.map((f) => f.kind)).toEqual(["recurring", "task"]);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
    await run((s) => undoInboxItem(s, q.id));
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(1);
    expect(await bar()).toBe(4500);
    // Answering twice is refused.
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    await expect(run((s) => answerQuestion(s, TZ, today, q.id, false))).rejects.toThrow();
  });

  it("two emails for one bill with no account number: yes marks the second a copy, Undo asks again", async () => {
    const { run, file } = await setup();
    const first = await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "t1@x.com", subject: "Your Xfinity bill" });
    const second = await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "t2@gmail.com", subject: "Fwd: bill" });
    expect(asked(second).twin).toBe(first.id);
    const done = await run((s) => answerQuestion(s, TZ, today, second.id, true));
    expect([done.status, done.duplicateOf]).toEqual(["duplicate", first.id]);
    await run((s) => undoInboxItem(s, second.id));
    expect((await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, second.id))))[0].status).toBe("needs_review");
    const no = await run((s) => answerQuestion(s, TZ, today, second.id, false));
    expect(no.status).toBe("filed");
  });

  it("'Did Exam 1 move to Nov 19?': yes moves it, no adds it, Undo asks again", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      return c;
    });
    const days = async () =>
      (await run((s) => s.tx.select().from(assignments)))
        .filter((a) => a.courseId === c.id)
        .map((a) => dayOf(a.dueAt))
        .sort();
    const q = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "x1@s.edu" });
    expect(asked(q).text).toBe("Did Exam 1 move to Thu, Nov 19?");
    expect(await days()).toEqual(["2026-11-03"]);
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    expect(await days()).toEqual(["2026-11-19"]);
    await run((s) => undoInboxItem(s, q.id));
    expect(await days()).toEqual(["2026-11-03"]);
    // No keeps the old date and adds nothing.
    const no = await run((s) => answerQuestion(s, TZ, today, q.id, false));
    expect(no.filed).toEqual([]);
    expect(await days()).toEqual(["2026-11-03"]);
    // Another copy of the same news is not asked about again.
    const again = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "x2@s.edu" });
    expect(again.reason).toContain("kept Exam 1 on its old date");
    expect((again.extracted as { ask?: unknown }).ask).toBeUndefined();
    expect(await days()).toEqual(["2026-11-03"]);
    // Undo of the "no" asks again.
    await run((s) => undoInboxItem(s, q.id));
    expect((await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, q.id))))[0].status).toBe("needs_review");
  });

  it("an exam already on the new day gets no card", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-19" });
    });
    const r = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "same-day@s.edu" });
    expect((r.extracted as { ask?: unknown }).ask).toBeUndefined();
  });

  it("spoof: an unchecked sender gets no card and changes nothing; a forged card can't be answered", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" });
      return c;
    });
    const exam = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "sp1@evil.com", authenticated: false });
    expect((exam.extracted as { ask?: unknown }).ask).toBeUndefined();
    expect(exam.reason).toContain("sender check");
    const bill = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "sp2@evil.com", authenticated: false });
    expect((bill.extracted as { ask?: unknown }).ask).toBeUndefined();
    expect(bill.reason).toContain("sender check");
    const rows = await run((s) => s.tx.select().from(assignments));
    expect(rows.filter((a) => a.courseId === c.id).map((a) => dayOf(a.dueAt))).toEqual(["2026-11-03"]);
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-4500);
    // Answering them (or a hand-made card without the verified mark) is refused.
    await expect(run((s) => answerQuestion(s, TZ, today, exam.id, true))).rejects.toThrow();
    await run((s) =>
      s.tx
        .update(inboxItems)
        .set({ extracted: { ...(bill.extracted as object), ask: { kind: "bill", text: "x", sameAs: "00000000-0000-0000-0000-000000000000" } } })
        .where(eq(inboxItems.id, bill.id)),
    );
    await expect(run((s) => answerQuestion(s, TZ, today, bill.id, true))).rejects.toThrow();
    // A look-alike copy from an unchecked sender is held without a card, nothing added.
    const first = await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "t1@x.com" });
    const fake = await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "t2@evil.com", authenticated: false });
    expect(first.status).toBe("filed");
    expect(fake.status).toBe("needs_review");
    expect((fake.extracted as { ask?: unknown }).ask).toBeUndefined();
    await expect(run((s) => answerQuestion(s, TZ, today, fake.id, false))).rejects.toThrow();
  });

  it("another person's card can't be answered", async () => {
    const A = await setup();
    const B = await setup();
    await A.run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const q = await A.file(billEx("Verizon", 50, "2026-11-12"), { messageId: "own@vz.com" });
    await expect(B.run((s) => answerQuestion(s, TZ, today, q.id, true))).rejects.toThrow();
    expect((await A.run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-4500);
  });

  it("'No, keep both' on a bill is remembered: the next statement is not asked about again", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "pair1@vz.com" });
    await run((s) => answerQuestion(s, TZ, today, q.id, false));
    const next = await file(billEx("Verizon", 50, "2026-12-12"), { messageId: "pair2@vz.com" });
    expect((next.extracted as { ask?: unknown }).ask).toBeUndefined();
    expect(next.filed.map((f) => f.kind)).toContain("recurring_update");
    const bills = (await run((s) => s.tx.select().from(recurringItems))).map((r) => [r.amountCents, r.nextDueDate]).sort();
    expect(bills).toEqual(
      [
        [-5000, "2026-12-12"],
        [-4500, "2026-11-12"],
      ].sort(),
    );
  });
});

describe("round 2: accounts, unrelated names, several candidates, Undo after a later change", () => {
  const asked = (item: { extracted: unknown }) =>
    (item.extracted as { ask?: { sameAs?: string; candidates?: string[]; seriesKey?: string; options?: { id: string; label: string }[]; text: string } }).ask;
  const dayN = (n: number, back: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, n)).toISOString().slice(0, 10);
  };
  const bills = async (run: Awaited<ReturnType<typeof setup>>["run"]) =>
    (await run((s) => s.tx.select().from(recurringItems))).map((b) => [b.name, b.amountCents, b.nextDueDate]).sort();
  const verizonBank = (run: Awaited<ReturnType<typeof setup>>["run"]) =>
    run(async (s) => {
      const a = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 500_000 });
      for (const back of [1, 2, 3, 4, 5])
        await createTransaction(s, {
          accountId: a.id,
          date: dayN(15, back),
          description: "VERIZON WIRELESS",
          merchantName: "VERIZON WIRELESS",
          amountCents: -4500,
        });
    });

  it("H1a: another line (account 2222) is never swallowed by a bill through its bank series, and 3333 never overwrites line 1111", async () => {
    const { run, file } = await setup();
    await verizonBank(run);
    const due = dayN(15, -1);
    const a = await file(billEx("Verizon", 45, due, "acct 1111"), { messageId: "a@vz" });
    expect(a.filed[0].kind).toBe("recurring");
    const b = await file(billEx("Verizon", 45, due, "acct 2222"), { messageId: "b@vz" });
    expect(b.filed.map((f) => f.kind)).not.toContain("recurring_update");
    const c = await file(billEx("Verizon", 45, dayN(15, -2), "acct 3333"), { messageId: "c@vz" });
    expect(c.filed.map((f) => f.kind)).not.toContain("recurring_update");
    const rows = await run((s) => s.tx.select().from(recurringItems));
    expect(rows.find((r) => r.id === a.filed[0].id)!.nextDueDate).toBe(due);
  });

  it("H1b: a bill with no number on record is asked about, not overwritten by a line with a number; a yes records it, so it is asked once", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Austin Energy", amountCents: -8200, frequency: "monthly", nextDueDate: "2026-11-05", kind: "bill" }));
    const q = await file(billEx("Austin Energy", 79, "2026-11-05", "acct 7788"), { messageId: "w1@ae" });
    expect(q.status).toBe("needs_review");
    expect(asked(q)!.text).toContain("Same bill?");
    expect(await bills(run)).toEqual([["Austin Energy", -8200, "2026-11-05"]]);
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    const next = await file(billEx("Austin Energy", 79, "2026-12-05", "acct 7788"), { messageId: "w2@ae" });
    expect(asked(next)).toBeUndefined();
    expect(next.filed.map((f) => f.kind)).toContain("recurring_update");
    // A different number is another bill, with no card.
    const other = await file(billEx("Austin Energy", 79, "2026-12-05", "acct 9900"), { messageId: "w3@ae" });
    expect(other.filed.map((f) => f.kind)).toContain("recurring");
  });

  it("H2: rent paid by Zelle is not overwritten by a loan email of a similar size; it is a card", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      const a = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 900_000 });
      for (const back of [1, 2, 3, 4, 5])
        await createTransaction(s, {
          accountId: a.id,
          date: dayN(1, back),
          description: "ZELLE TO JOHN SMITH",
          merchantName: "ZELLE TO JOHN SMITH",
          amountCents: -120000,
        });
      await createRecurring(s, { name: "Rent", amountCents: -120000, frequency: "monthly", nextDueDate: dayN(1, -1), kind: "bill" });
    });
    const loan = await file(billEx("Nelnet", 1180, dayN(3, -1)), { messageId: "loan@nelnet" });
    expect(loan.status).toBe("needs_review");
    expect(asked(loan)).toBeDefined();
    expect(loan.filed).toEqual([]);
    expect(await bills(run)).toEqual([["Rent", -120000, dayN(1, -1)]]);
    // No keeps both: the loan becomes its own bill and Rent stays at $1,200.
    await run((s) => answerQuestion(s, TZ, today, loan.id, false));
    expect(await bills(run)).toEqual([
      ["Nelnet", -118000, dayN(3, -1)],
      ["Rent", -120000, dayN(1, -1)],
    ]);
  });

  it("M1: with several candidates the person taps the one it is (only an offered one), or says it is a new bill", async () => {
    const { run, file } = await setup();
    const ids = await run(async (s) => {
      const a = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" });
      const b = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-14", kind: "bill" });
      return [a.id, b.id];
    });
    const q = await file(billEx("Verizon", 45, "2026-12-12"), { messageId: "m1@vz" });
    const ask = asked(q)!;
    expect(ask.options!.map((o) => o.id).sort()).toEqual([...ids].sort());
    expect(new Set(ask.options!.map((o) => o.label)).size).toBe(2); // told apart by their next due date
    await expect(run((s) => answerQuestion(s, TZ, today, q.id, true))).rejects.toThrow();
    await expect(run((s) => answerQuestion(s, TZ, today, q.id, true, "00000000-0000-0000-0000-000000000000"))).rejects.toThrow();
    await run((s) => answerQuestion(s, TZ, today, q.id, true, ids[0]));
    const rows = await run((s) => s.tx.select().from(recurringItems));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === ids[0])!.nextDueDate).toBe("2026-12-12");
    expect(rows.find((r) => r.id === ids[1])!.nextDueDate).toBe("2026-11-14");
    // "A new bill" adds one instead.
    const q2 = await file(billEx("Verizon", 45, "2026-12-14"), { messageId: "m2@vz" });
    await run((s) => answerQuestion(s, TZ, today, q2.id, false));
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(3);
  });

  it("M2: Undo of an earlier update refuses once a newer one changed the bill, and the question stays answered", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "q@vz" });
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    const dec = await file(billEx("Verizon", 50, "2026-12-12"), { messageId: "dec@vz" });
    expect(dec.filed.map((f) => f.kind)).toContain("recurring_update");
    await expect(run((s) => undoInboxItem(s, q.id))).rejects.toThrow(/Undo the newer one first/);
    const [bill] = await run((s) => s.tx.select().from(recurringItems));
    expect([bill.amountCents, bill.nextDueDate]).toEqual([-5000, "2026-12-12"]);
    const [item] = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, q.id)));
    expect([item.status, asked(item)!.sameAs !== undefined, (item.extracted as { ask: { answered?: string } }).ask.answered]).toEqual(["filed", true, "same"]);
    // Newest first works: both go back.
    await run((s) => undoInboxItem(s, dec.id));
    await run((s) => undoInboxItem(s, q.id));
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].amountCents).toBe(-4500);
  });

  it("M2: the same for an exam moved twice", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      return c;
    });
    const days = async () => (await run((s) => s.tx.select().from(assignments))).filter((a) => a.courseId === c.id).map((a) => dayOf(a.dueAt));
    const q = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "x1@s.edu" });
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    const later = await file(examEx("MATH 152", "Exam 1", "2026-11-24", { moved: true, old: "2026-11-19" }), { messageId: "x2@s.edu" });
    expect(later.filed.map((f) => f.kind)).toEqual(["assignment_update"]);
    await expect(run((s) => undoInboxItem(s, q.id))).rejects.toThrow(/Undo the newer one first/);
    expect(await days()).toEqual(["2026-11-24"]);
  });

  it("M3: Yes on a same-cycle correction updates the one reminder instead of adding a second; Undo puts its title back", async () => {
    const { run, file } = await setup();
    await file(billEx("Verizon", 45, "2026-11-12"), { messageId: "1@vz" });
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "2@vz" });
    expect(asked(q)).toBeDefined();
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    let t = await run((s) => s.tx.select().from(tasks));
    expect(t.map((x) => x.title)).toEqual(["Pay Verizon ($50.00)"]);
    await run((s) => undoInboxItem(s, q.id));
    t = await run((s) => s.tx.select().from(tasks));
    expect(t.map((x) => x.title)).toEqual(["Pay Verizon ($45.00)"]);
  });

  it("L1: a Yes on a stale card files nothing", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "q@vz" });
    await file(billEx("Verizon", 45, "2026-12-12"), { messageId: "dec@vz" });
    const r = await run((s) => answerQuestion(s, TZ, today, q.id, true));
    expect(r.filed).toEqual([]);
    expect((await run((s) => s.tx.select().from(recurringItems)))[0].nextDueDate).toBe("2026-12-12");
  });

  it("L2: a Yes is refused when the exam was renamed or moved since it was asked", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      return c;
    });
    const q = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "x1@s.edu" });
    await run((s) => s.tx.update(assignments).set({ title: "Midterm" }).where(eq(assignments.courseId, c.id)));
    const r = await run((s) => answerQuestion(s, TZ, today, q.id, true));
    expect(r.filed).toEqual([]);
    const [row] = await run((s) => s.tx.select().from(assignments).where(eq(assignments.courseId, c.id)));
    expect(dayOf(row.dueAt)).toBe("2026-11-03");
  });

  it("L3: a forwarded look-alike gets the one-tap 'File this?' and the true reason, not 'unchecked address'", async () => {
    const { run, file } = await setup();
    await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "t1@x.com" });
    const fwd = await run((s) =>
      processForwardedEmail(
        s,
        TZ,
        today,
        { channel: "email", subject: "Fwd", text: "x", files: [], messageId: "t2@gmail.com" },
        fixed(billEx("Xfinity", 64.99, "2026-11-20")),
      ),
    );
    expect(fwd.status).toBe("suggested");
    expect(fwd.reason).toContain("already have");
    expect(fwd.reason).not.toContain("check");
  });

  it("L6: two taps on File this? file it once", async () => {
    const { run } = await setup();
    const fwd = await run((s) =>
      processForwardedEmail(
        s,
        TZ,
        today,
        { channel: "email", subject: "Fwd", text: "x", files: [], messageId: "f1@gmail.com" },
        fixed(billEx("Hulu", 12, "2026-11-20")),
      ),
    );
    await run((s) => fileSuggestion(s, TZ, today, fwd.id));
    await expect(run((s) => fileSuggestion(s, TZ, today, fwd.id))).rejects.toThrow();
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(1);
  });

  it("L5: the cleanup never re-merges bills the person answered 'No, keep both' about", async () => {
    const { run, user } = await setup();
    const ids = await run(async (s) => {
      const a = await createRecurring(s, { name: "Xfinity", amountCents: -6499, frequency: "monthly", nextDueDate: "2026-11-20", kind: "bill" }, "detected");
      const b = await createRecurring(s, { name: "Xfinity", amountCents: -6999, frequency: "monthly", nextDueDate: "2026-12-20", kind: "bill" }, "detected");
      await s.tx
        .update(recurringItems)
        .set({ createdAt: new Date("2026-11-01T00:00:00Z") })
        .where(eq(recurringItems.id, a.id));
      await s.tx.insert(inboxItems).values({
        userId: s.userId,
        channel: "email",
        status: "filed",
        type: "bill",
        extracted: {
          ...base,
          summary: "s",
          ...billEx("Xfinity", 69.99, "2026-12-20"),
          ask: { kind: "bill", text: "x", verified: true, candidates: [a.id], answered: "different" },
        },
        filed: [{ kind: "recurring", id: b.id, label: "b" }],
        receivedAt: new Date(Date.UTC(2026, 9, 2)),
        messageId: "dec@x",
      });
      return [a.id, b.id];
    });
    void user;
    expect((await run((s) => collapseInboxDuplicates(s))).bills).toBe(0);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
    void ids;
  });

  it("R3: a Yes on a series card the person has since started tracking never adds a second bill", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 500_000 });
      for (const back of [1, 2, 3, 4, 5])
        await createTransaction(s, {
          accountId: acct.id,
          date: dayN(15, back),
          description: "MOHELA STUDENT LN",
          merchantName: "MOHELA STUDENT LN",
          amountCents: -21_437,
        });
    });
    const due = dayN(15, -1);
    const q = await file(billEx("Federal Student Aid", 214.37, due), { messageId: "fsa@ed.gov" });
    const key = asked(q)!.seriesKey!;
    const cand = (await run((s) => bankSeries(s, today))).untracked.find((c) => c.merchantKey === key)!;
    await run((s) =>
      s.tx.insert(recurringItems).values({
        userId: s.userId,
        name: cand.name,
        merchantKey: cand.merchantKey,
        amountCents: -21_437,
        frequency: "monthly",
        nextDueDate: due,
        kind: "bill",
        source: "detected",
      }),
    );
    const yes = await run((s) => answerQuestion(s, TZ, today, q.id, true));
    expect(yes.filed.filter((f) => f.kind === "recurring")).toEqual([]);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(1);
    expect(yes.reason).toContain("changed since I asked");
  });

  it("R5: the cleanup never merges two lines whose emails print different account numbers", async () => {
    const { run, file } = await setup();
    await file(billEx("Verizon", 45, "2026-11-12", "acct 1111"), { messageId: "c1@vz" });
    await file(billEx("Verizon", 45, "2026-12-12", "acct 2222"), { messageId: "c2@vz" });
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
    expect((await run((s) => collapseInboxDuplicates(s))).bills).toBe(0);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
  });

  it("R6: two copies of one receipt attach once; Undo removes only its own line", async () => {
    const { run, file } = await setup();
    await run(async (s) => {
      const [a] = await s.tx
        .insert(financialAccounts)
        .values({ userId: s.userId, name: "Visa", type: "credit", source: "plaid", currentBalanceCents: 0 })
        .returning();
      await createTransaction(s, { accountId: a.id, date: addDaysStr(today, -2), description: "TARGET 00012345", amountCents: -2345 }, "plaid", "p-1");
    });
    const rc = { type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: addDaysStr(today, -3) } } as const;
    const one = await file(rc, { messageId: "r1@target.com" });
    const two = await file(rc, { messageId: "r2@gmail.com" });
    expect(one.filed.map((f) => f.kind)).toEqual(["transaction_note"]);
    expect(two.filed).toEqual([]);
    const notes = async () => (await run((s) => s.tx.select().from(transactions)))[0].notes;
    expect((await notes())!.split("\n")).toHaveLength(1);
    // A note the person adds by hand survives Undo.
    const notesNow = await notes();
    await run((s) =>
      s.tx
        .update(transactions)
        .set({ notes: `Mine\n${notesNow}` })
        .where(eq(transactions.description, "TARGET 00012345")),
    );
    await run((s) => undoInboxItem(s, one.id));
    expect(await notes()).toBe("Mine");
  });

  it("L2: an exam changed by hand or Canvas after the email: Undo leaves it, says so, and stops being offered", async () => {
    const { run, file } = await setup();
    const c = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-11-03" });
      return c;
    });
    const q = await file(examEx("MATH 152", "Exam 1", "2026-11-19", { moved: true }), { messageId: "x1@s.edu" });
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    await run((s) =>
      s.tx
        .update(assignments)
        .set({ dueAt: new Date("2026-11-26T18:00:00Z") })
        .where(eq(assignments.courseId, c.id)),
    );
    expect(await run((s) => undoInboxItem(s, q.id))).toBe(0);
    const [item] = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, q.id)));
    expect(item.status).toBe("filed");
    expect(item.filed.every((f) => f.stale)).toBe(true);
    const [row] = await run((s) => s.tx.select().from(assignments).where(eq(assignments.courseId, c.id)));
    expect(dayOf(row.dueAt)).toBe("2026-11-26");
  });

  it("R7: after a merge the kept bill stands for both lines, so a third line can't merge through a bill with no number", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-10-12", kind: "bill" }, "detected"));
    await run((s) => s.tx.update(recurringItems).set({ createdAt: new Date("2026-10-01T00:00:00Z") }));
    const mk = (n: number, due: string, ref: string) =>
      run((s) =>
        s.tx
          .insert(inboxItems)
          .values({
            userId: s.userId,
            channel: "email",
            status: "filed",
            type: "bill",
            extracted: { ...base, summary: "s", ...billEx("Verizon", 45, due, ref) },
            filed: [],
            receivedAt: new Date(Date.UTC(2026, 9, n)),
            messageId: `r7-${n}@vz`,
          })
          .returning(),
      );
    void file;
    const ids = await run(async (s) => {
      const x = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }, "detected");
      const y = await createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-12-12", kind: "bill" }, "detected");
      return [x.id, y.id];
    });
    const [i1] = await mk(2, "2026-11-12", "acct 2222");
    const [i2] = await mk(3, "2026-12-12", "acct 3333");
    await run(async (s) => {
      await s.tx
        .update(inboxItems)
        .set({ filed: [{ kind: "recurring", id: ids[0], label: "x" }] })
        .where(eq(inboxItems.id, i1.id));
      await s.tx
        .update(inboxItems)
        .set({ filed: [{ kind: "recurring", id: ids[1], label: "y" }] })
        .where(eq(inboxItems.id, i2.id));
    });
    // 2222 may fold into the hand-added bill (it has no number), but 3333 must not follow it there.
    const n = await run((s) => collapseInboxDuplicates(s));
    expect(n.bills).toBe(1);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
  });

  it("R8: Undo finds the newer change by state: a stuck chain ends when the newer entry itself is stale", async () => {
    const { run, file } = await setup();
    await run((s) => createRecurring(s, { name: "Verizon", amountCents: -4500, frequency: "monthly", nextDueDate: "2026-11-12", kind: "bill" }));
    const q = await file(billEx("Verizon", 50, "2026-11-12"), { messageId: "q8@vz" });
    await run((s) => answerQuestion(s, TZ, today, q.id, true));
    const dec = await file(billEx("Verizon", 50, "2026-12-12"), { messageId: "d8@vz" });
    await run((s) => s.tx.update(recurringItems).set({ amountCents: -5500 }));
    // The card's Undo waits for the email's.
    await expect(run((s) => undoInboxItem(s, q.id))).rejects.toThrow(/Undo the newer one first/);
    // The email's Undo finds a hand edit: it is left and stops being offered.
    expect(await run((s) => undoInboxItem(s, dec.id))).toBe(0);
    // Now nothing newer is left for the card either.
    expect(await run((s) => undoInboxItem(s, q.id))).toBe(0);
    const [bill] = await run((s) => s.tx.select().from(recurringItems));
    expect(bill.amountCents).toBe(-5500);
  });
});
