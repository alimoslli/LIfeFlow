import type { UserScope } from "@/server/db/with-user";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { assignments, financialAccounts, inboxItems, recurringItems, tasks, transactions, users, type InboxFiled } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { bankSeries, createRecurring } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { answerQuestion, fileSuggestion, processDocument, processForwardedEmail, undoInboxItem } from "@/server/services/inbox";
import { attachWaitingReceipts, collapseInboxDuplicates, runInboxCleanupOnce } from "@/server/services/inbox/cleanup";
import { contentSigFor, normalizeMessageId } from "@/server/services/inbox/dedupe";
import type { Extraction } from "@/server/services/inbox/extract";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const today = todayIn(TZ);
const base: Omit<Extraction, "type" | "summary"> = { bill: null, receipt: null, school: null, travel: null, pay: null };
const doc = { channel: "email" as const, subject: "Fwd", text: "…", files: [] };
const fixed = (ex: Partial<Extraction> & Pick<Extraction, "type">) => async () => ({ ...base, summary: "s", ...ex }) as Extraction;
const billEx = (payee: string, usd: number, due: string, repeats: "monthly" | "none" = "monthly", account_ref: string | null = null) =>
  ({ type: "bill", bill: { payee, amount_usd: usd, due_date: due, repeats, account_ref } }) as const;

/** The 15th of the month `back` months ago (UTC, so the test never depends on the clock's day). */
const fifteenth = (back: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 15)).toISOString().slice(0, 10);
};

const setup = async () => {
  const { user, run } = await makeUser();
  const file = (ex: Partial<Extraction> & Pick<Extraction, "type">, extra: Partial<Parameters<typeof processDocument>[3]> = {}) =>
    run((s) => processDocument(s, TZ, today, { ...doc, authenticated: true, ...extra }, fixed(ex)));
  const rows = <T>(f: (s: Parameters<Parameters<typeof run>[0]>[0]) => Promise<T>) => run(f);
  return { user, run, file, rows };
};

describe("Gmail items show up once", () => {
  it("normalizes Message-IDs", () => {
    expect(normalizeMessageId(" <ABC123@mail.example.com> ")).toBe("abc123@mail.example.com");
    expect(normalizeMessageId("")).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
    expect(contentSigFor({ type: "bill", bill: { payee: "Comcast", amount_usd: 64.99, due_date: null, repeats: "monthly" } })).toBeNull();
  });

  it("D6: a bill in Gmail and forwarded is filed once (same Message-ID, or the same content when the forward lost it)", async () => {
    const { run, file, rows } = await setup();
    const due = addDaysStr(today, 10);
    const first = await file(billEx("Xfinity", 64.99, due), { externalId: "gmail:abc", messageId: "<M1@xfinity.com>", from: "billing@xfinity.com" });
    expect(first.filed.map((f) => f.kind)).toEqual(["recurring", "task"]);
    // The auto-forward keeps the Message-ID: caught before it is even read.
    const forwarded = await file(billEx("Xfinity", 64.99, due), { messageId: "m1@xfinity.com", from: "me@gmail.com" });
    expect(forwarded.status).toBe("duplicate");
    expect(forwarded.duplicateOf).toBe(first.id);
    // A hand forward has a new Message-ID, a different sender and no account number: it looks the same, but two lines of
    // a plan would too, so nothing is filed and the user is asked ("Same bill?").
    const hand = await file(billEx("XFINITY", 64.99, due), { messageId: "other@gmail.com", from: "me@gmail.com" });
    expect(hand.status).toBe("needs_review");
    expect(hand.duplicateOf).toBe(first.id);
    expect(hand.reason).toContain("Same bill?");
    // With the account number on both, the same signature is the same bill.
    const withAcct = await file(billEx("Xfinity", 90, due, "monthly", "acct 5521"), { messageId: "a1@x.com" });
    const sameAcct = await file(billEx("Xfinity", 90, due, "monthly", "5521"), { messageId: "a2@gmail.com" });
    expect(withAcct.status).toBe("filed");
    expect(sameAcct.status).toBe("duplicate");
    expect(sameAcct.duplicateOf).toBe(withAcct.id);
    // Answering "yes, same bill" closes the suggestion; "no" files it as its own bill.
    expect((await run((s) => answerQuestion(s, TZ, today, hand.id, true))).status).toBe("duplicate");
    const n = await rows(async (s) => ({ bills: (await s.tx.select().from(recurringItems)).length, tasks: (await s.tx.select().from(tasks)).length }));
    expect(n).toEqual({ bills: 2, tasks: 2 }); // Xfinity, plus the $90 account 5521 bill
  });

  it("D7 and D11: a new statement updates the tracked bill; a price change keeps the old price; Undo puts both back", async () => {
    const { run, file, rows } = await setup();
    const nov = await file(billEx("Xfinity", 64.99, "2026-11-20"), { messageId: "nov@x.com" });
    const dec = await file(billEx("Xfinity", 64.99, "2026-12-20"), { messageId: "dec@x.com" });
    expect(dec.filed.map((f) => f.kind)).toEqual(["recurring_update", "task"]);
    let bills = await rows((s) => s.tx.select().from(recurringItems));
    expect(bills).toHaveLength(1);
    expect(bills[0].nextDueDate).toBe("2026-12-20");
    expect(bills[0].amountCents).toBe(-6499);
    expect(bills[0].priceHistory).toEqual([]);

    // Spotify tracked at $11.99; "your price is changing to $12.99 from Dec 1".
    await run((s) => createRecurring(s, { name: "Spotify", amountCents: -1199, frequency: "monthly", nextDueDate: "2026-11-15", kind: "subscription" }));
    const price = await file(billEx("Spotify Premium", 12.99, "2026-12-15"), { messageId: "sp@spotify.com" });
    expect(price.filed[0].kind).toBe("recurring_update");
    const spotify = async () => (await rows((s) => s.tx.select().from(recurringItems))).filter((b) => b.name.startsWith("Spotify"));
    expect(await spotify()).toHaveLength(1);
    expect((await spotify())[0]).toMatchObject({ amountCents: -1299, nextDueDate: "2026-12-15", priceHistory: [{ amountCents: -1199, until: "2026-12-15" }] });
    await run((s) => undoInboxItem(s, price.id));
    expect((await spotify())[0]).toMatchObject({ amountCents: -1199, nextDueDate: "2026-11-15", priceHistory: [] });

    await run((s) => undoInboxItem(s, dec.id));
    bills = (await rows((s) => s.tx.select().from(recurringItems))).filter((b) => b.name === "Xfinity");
    expect(bills).toHaveLength(1);
    expect(bills[0].nextDueDate).toBe("2026-11-20");
    expect(nov.status).toBe("filed");
  });

  it("D7: a very different charge from one merchant (rent and parking) is its own bill", async () => {
    const { file, rows } = await setup();
    await file(billEx("Parkview Apartments", 1200, "2026-12-01"), { messageId: "r@p.com" });
    await file(billEx("Parkview Apartments", 85, "2026-12-05"), { messageId: "p@p.com" });
    expect(await rows((s) => s.tx.select().from(recurringItems))).toHaveLength(2);
  });

  it("D8: the email's bill and the bank's series with another name are one bill ($214.37 once)", async () => {
    const { run, file, rows } = await setup();
    await run(async (s) => {
      const a = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 500_000 });
      for (const back of [1, 2, 3, 4, 5])
        await createTransaction(s, {
          accountId: a.id,
          date: fifteenth(back),
          description: "MOHELA STUDENT LN",
          merchantName: "MOHELA STUDENT LN",
          amountCents: -21_437,
        });
    });
    const due = fifteenth(-1) > today ? fifteenth(-1) : fifteenth(-2);
    // The names differ, so it is a card (same amount and day is not proof): nothing is added until the person says yes.
    const asked = await file(billEx("Federal Student Aid", 214.37, due), { messageId: "fsa1@ed.gov" });
    expect(asked.status).toBe("needs_review");
    expect(asked.reason).toContain("Same bill?");
    expect(await rows((s) => s.tx.select().from(recurringItems))).toHaveLength(0);
    const first = await run((s) => answerQuestion(s, TZ, today, asked.id, true));
    expect(first.filed[0].kind).toBe("recurring");
    expect(first.filed[0].label).toContain("same as your bank's");
    // The second email is the same bill again.
    const second = await file(billEx("Federal Student Aid", 214.37, due), { messageId: "fsa2@ed.gov" });
    expect(second.status).toBe("needs_review");
    expect(second.reason).toContain("Same bill?");
    const bills = await rows((s) => s.tx.select().from(recurringItems));
    expect(bills).toHaveLength(1);
    expect(bills[0].amountCents).toBe(-21_437);
    // The bank's series is now the tracked bill, not a second one to suggest.
    const bank = await run((s) => bankSeries(s, today));
    expect(bank.untracked.filter((c) => c.name.toLowerCase().includes("mohela"))).toHaveLength(0);
    expect(bank.tracked.length).toBeGreaterThan(0);
  });

  it("D9: a receipt rides on the bank's charge; unmatched ones wait and never count; Undo removes the note", async () => {
    const { run, file, rows } = await setup();
    const card = await run(async (s) => {
      const [a] = await s.tx
        .insert(financialAccounts)
        .values({ userId: s.userId, name: "Visa", type: "credit", source: "plaid", currentBalanceCents: 0 })
        .returning();
      await createTransaction(s, { accountId: a.id, date: addDaysStr(today, -2), description: "TARGET 00012345", amountCents: -2345 }, "plaid", "p-1");
      return a;
    });
    const txnCount = async () => (await rows((s) => s.tx.select().from(transactions))).length;
    const attached = await file({ type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: addDaysStr(today, -5) } });
    expect(attached.status).toBe("filed");
    expect(attached.filed.map((f) => f.kind)).toEqual(["transaction_note"]);
    expect(await txnCount()).toBe(1);
    const [t] = await rows((s) => s.tx.select().from(transactions));
    expect(t.amountCents).toBe(-2345);
    expect(t.notes).toContain("Receipt by email: Target $23.45");
    await run((s) => undoInboxItem(s, attached.id));
    expect((await rows((s) => s.tx.select().from(transactions)))[0].notes).toBeNull();

    // Not posted yet: kept, not counted.
    const waiting = await file({ type: "receipt", receipt: { merchant: "Trader Joe's", total_usd: 41.1, date: today } }, { messageId: "tj@x.com" });
    expect(waiting.status).toBe("needs_review");
    expect(waiting.reason).toContain("Waiting for your bank");
    expect(await txnCount()).toBe(1);
    expect(await run((s) => attachWaitingReceipts(s, today))).toBe(0);
    // The charge posts; the waiting receipt attaches to it.
    await run((s) => createTransaction(s, { accountId: card.id, date: today, description: "TRADER JOES #123", amountCents: -4110 }, "plaid", "p-2"));
    expect(await run((s) => attachWaitingReceipts(s, today))).toBe(1);
    expect(await txnCount()).toBe(2);
    const [done] = await rows((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.id, waiting.id)));
    expect(done.status).toBe("filed");
    expect(done.filed[0].kind).toBe("transaction_note");
  });

  it("D10: an exam that moved is updated, never added; Undo moves it back", async () => {
    const { run, file, rows } = await setup();
    const course = await run(async (s) => {
      const c = await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-12", dueTime: "13:00" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Exam 3", kind: "exam", dueDate: "2026-12-03" });
      return c;
    });
    const moved = await file(
      { type: "exam", school: { course: "MATH 152", title: "Exam 2", due_date: "2026-11-17", due_time: null, old_due_date: "2026-11-12", moved: true } },
      { from: "prof@school.edu", messageId: "mv1@school.edu" },
    );
    expect(moved.status).toBe("filed");
    expect(moved.filed[0].kind).toBe("assignment_update");
    const exams = async () =>
      (await rows((s) => s.tx.select().from(assignments))).filter((a) => a.courseId === course.id).sort((a, b) => a.title.localeCompare(b.title));
    let list = await exams();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("Exam 2");
    expect(list[0].dueAt?.toISOString().slice(0, 10)).toBe("2026-11-17");
    expect(list[0].sourceRef).toContain("Moved by an email from prof@school.edu");
    // Same exam under another name, found by the old date.
    const again = await file(
      {
        type: "exam",
        school: { course: "MATH 152", title: "Second midterm", due_date: "2026-11-19", due_time: "10:00", old_due_date: "2026-11-17", moved: true },
      },
      { messageId: "mv2@school.edu" },
    );
    expect(again.filed[0].kind).toBe("assignment_update");
    expect(await exams()).toHaveLength(2);
    await run((s) => undoInboxItem(s, again.id));
    await run((s) => undoInboxItem(s, moved.id));
    list = await exams();
    expect(list).toHaveLength(2);
    expect(list[0].dueAt?.toISOString()).toBe(new Date("2026-11-12T18:00:00Z").toISOString());
    expect(list[0].sourceRef).toBeNull();
    // A different exam is added as before.
    const other = await file({ type: "exam", school: { course: "MATH 152", title: "Final", due_date: "2026-12-15", due_time: null } });
    expect(other.filed[0].kind).toBe("assignment");
    expect(await exams()).toHaveLength(3);
  });
});

describe("collapse what was already filed twice", () => {
  const legacy = async (collapse: (s: UserScope) => Promise<unknown>) => {
    const { run, user } = await setup();
    const counts = await run(async (s) => {
      const bill = (due: string, usd = 64.99): Extraction => ({
        ...base,
        type: "bill",
        summary: "s",
        bill: { payee: "Xfinity", amount_usd: usd, due_date: due, repeats: "monthly", account_ref: "1234" },
      });
      const mk = async (i: number, ex: Extraction, filed: InboxFiled[], extra: Partial<typeof inboxItems.$inferInsert> = {}) => {
        const [r] = await s.tx
          .insert(inboxItems)
          .values({
            userId: s.userId,
            channel: "email",
            status: "filed",
            type: ex.type,
            extracted: ex as unknown as Record<string, unknown>,
            filed,
            receivedAt: new Date(Date.UTC(2026, 10, i)),
            ...extra,
          })
          .returning();
        return r;
      };
      const rec = async (due: string, createdAt: Date, usd = 6499) => {
        const [r] = await s.tx
          .insert(recurringItems)
          .values({
            userId: s.userId,
            name: "Xfinity",
            merchantKey: "xfinity",
            amountCents: -usd,
            frequency: "monthly",
            nextDueDate: due,
            kind: "bill",
            source: "detected",
            createdAt,
          })
          .returning();
        return r;
      };
      const task = async (due: string) => {
        const [t] = await s.tx
          .insert(tasks)
          .values({ userId: s.userId, title: "Pay Xfinity ($64.99)", dueAt: new Date(`${due}T14:00:00Z`), source: "manual" })
          .returning();
        return t;
      };
      const entry = (kind: InboxFiled["kind"], id: string): InboxFiled => ({ kind, id, label: kind });
      // The same November statement filed three times (Gmail, forward, forward), then December's.
      const [r1, r2, r3, r4] = [
        await rec("2026-11-20", new Date("2026-11-01")),
        await rec("2026-11-20", new Date("2026-11-02")),
        await rec("2026-11-20", new Date("2026-11-03")),
        await rec("2026-12-20", new Date("2026-12-01"), 6999),
      ];
      const [t1, t2, t3, t4] = [await task("2026-11-20"), await task("2026-11-20"), await task("2026-11-20"), await task("2026-12-20")];
      await mk(1, bill("2026-11-20"), [entry("recurring", r1.id), entry("task", t1.id)], { externalId: "gmail:1", messageId: "same@x.com" });
      await mk(2, bill("2026-11-20"), [entry("recurring", r2.id), entry("task", t2.id)], { messageId: "same@x.com" });
      await mk(3, bill("2026-11-20"), [entry("recurring", r3.id), entry("task", t3.id)]);
      await mk(4, bill("2026-12-20", 69.99), [entry("recurring", r4.id), entry("task", t4.id)]);
      // Exam 2 on Nov 12 (Canvas) and Nov 17 (email), plus one the email added alone.
      const c = await createCourse(s, { name: "Chem", code: "CHEM 101" });
      const canvas = await createAssignment(s, TZ, { courseId: c.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-12" }, "canvas");
      const viaEmail = await createAssignment(s, TZ, { courseId: c.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-17" }, "manual");
      const solo = await createAssignment(s, TZ, { courseId: c.id, title: "Exam 1", kind: "exam", dueDate: "2026-10-12" }, "manual");
      const exam = (title: string, d: string): Extraction => ({
        ...base,
        type: "exam",
        summary: "s",
        school: { course: "CHEM 101", title, due_date: d, due_time: null },
      });
      await mk(5, exam("Exam 2", "2026-11-17"), [entry("assignment", viaEmail.assignment.id)]);
      await mk(6, exam("Exam 1", "2026-10-12"), [entry("assignment", solo.assignment.id)]);
      expect(canvas.status).toBe("created");

      const first = await collapse(s);
      // Safe to repeat.
      expect(await collapseInboxDuplicates(s)).toEqual({ inboxItems: 0, bills: 0, tasks: 0, exams: 0 });
      const left = {
        bills: await s.tx.select().from(recurringItems),
        tasks: await s.tx.select().from(tasks),
        exams: await s.tx.select().from(assignments),
        items: await s.tx.select().from(inboxItems),
      };
      // One Xfinity bill (the oldest), moved to December's date and amount; the November reminder once, December's once.
      expect(left.bills).toHaveLength(1);
      expect(left.bills[0].id).toBe(r1.id);
      expect(left.bills[0]).toMatchObject({ nextDueDate: "2026-12-20", amountCents: -6999 });
      expect(left.bills[0].priceHistory).toEqual([{ amountCents: -6499, until: "2026-12-20" }]);
      expect(left.tasks.map((t) => t.id).sort()).toEqual([t1.id, t4.id].sort());
      expect(left.exams.map((a) => `${a.title}:${a.source}`).sort()).toEqual(["Exam 1:manual", "Exam 2:canvas", "Exam 2:manual"]);
      const byDay = new Map(left.items.map((i) => [i.receivedAt.getUTCDate(), i]));
      expect(byDay.get(2)!.status).toBe("duplicate");
      expect(byDay.get(2)!.duplicateOf).toBe(byDay.get(1)!.id);
      expect(byDay.get(3)!.status).toBe("duplicate");
      expect(byDay.get(1)!.filed.map((f) => f.id)).toEqual([r1.id, t1.id]);
      // The December statement and the moved exam now point at the survivors.
      expect(byDay.get(4)!.filed.map((f) => [f.kind, f.id])).toEqual([
        ["recurring_update", r1.id],
        ["task", t4.id],
      ]);
      // Same title is never a reason to merge: the Canvas row and the email's row both stay.
      expect(byDay.get(5)!.filed[0]).toMatchObject({ kind: "assignment", id: viaEmail.assignment.id });
      return first;
    });
    expect(user.id).toBeTruthy();
    return { counts, run, user };
  };
  const EXPECTED = { inboxItems: 2, bills: 3, tasks: 2, exams: 0 };

  it("keeps the original and moves references", async () => {
    const { counts } = await legacy((s) => collapseInboxDuplicates(s));
    expect(counts).toEqual(EXPECTED);
  });

  it("runs by itself once per account (next morning run), and Undo on a merged copy brings its rows back", async () => {
    const { counts, run, user } = await legacy((s) => runInboxCleanupOnce(s));
    expect(counts).toEqual(EXPECTED);
    // The marker is set: the next run does nothing.
    expect(await run((s) => runInboxCleanupOnce(s))).toBeNull();
    const [u] = await run((s) => s.tx.select({ p: users.preferences }).from(users).where(eq(users.id, user.id)));
    expect(u.p.inboxDedupeVersion).toBe(1);
    // Undo on the merged-away copy (the 2nd email) restores the bill and reminder it had filed.
    const dup = (await run((s) => s.tx.select().from(inboxItems))).find((i) => i.status === "duplicate" && i.receivedAt.getUTCDate() === 2)!;
    expect(await run((s) => undoInboxItem(s, dup.id))).toBe(2);
    expect((await run((s) => s.tx.select().from(recurringItems))).length).toBe(2);
    expect((await run((s) => s.tx.select().from(inboxItems))).find((i) => i.id === dup.id)!.status).toBe("filed");
  });
});

describe("two deliveries of the same mail at once", () => {
  it("makes one card and files once (Message-ID), and a Postmark retry is a no-op", async () => {
    const { run } = await setup();
    const due = addDaysStr(today, 10);
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 300)); // the read takes a while, as the AI does
      return (await fixed(billEx("Spectrum", 80, due))()) as Extraction;
    };
    const send = (externalId: string | null) =>
      run((s) =>
        processDocument(s, TZ, today, { ...doc, authenticated: true, messageId: "<Same@spectrum.com>", externalId, from: "billing@spectrum.com" }, slow),
      );
    const [a, b] = await Promise.all([send(null), send(null)]);
    expect([a.status, b.status].sort()).toEqual(["duplicate", "filed"]);
    const items = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.messageId, "same@spectrum.com")));
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.status === "filed")).toHaveLength(1);
    const bills = await run((s) => s.tx.select().from(recurringItems));
    expect(bills.filter((r) => r.name.includes("Spectrum"))).toHaveLength(1);

    // A retry with the same provider id makes no second row at all.
    const [c, d] = await Promise.all([send("postmark:abc"), send("postmark:abc")]);
    expect(c.id).toBe(d.id);
    const pm = await run((s) => s.tx.select().from(inboxItems).where(eq(inboxItems.externalId, "postmark:abc")));
    expect(pm).toHaveLength(1);
  });

  it("refuses to file a suggestion whose email is already filed", async () => {
    const { run } = await setup();
    const due = addDaysStr(today, 10);
    const ex = fixed(billEx("Water Co", 40, due));
    const sug = await run((s) => processForwardedEmail(s, TZ, today, { ...doc, messageId: "w1@water.com" }, ex));
    expect(sug.status).toBe("suggested");
    // The same email arrived by another route and was filed meanwhile.
    const other = await run((s) =>
      s.tx.insert(inboxItems).values({ userId: s.userId, channel: "email", messageId: "w1@water.com", status: "filed" }).returning(),
    );
    const r = await run((s) => fileSuggestion(s, TZ, today, sug.id));
    expect(r.status).toBe("duplicate");
    expect(r.duplicateOf).toBe(other[0].id);
    expect(await run((s) => s.tx.select().from(recurringItems))).toHaveLength(0);
  });
});
