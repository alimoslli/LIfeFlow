import { afterAll, describe, expect, it } from "vitest";
import { addDaysStr, todayIn } from "@/lib/dates";
import { closeDb, getDb } from "@/server/db/client";
import { assignments, calendarEvents, paychecks, recurringItems, tasks, transactions } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createCourse } from "@/server/services/school";
import { createEmployer } from "@/server/services/work";
import { inboxAddress, isVerifiedSender, processDocument, undoInboxItem, userForAddress } from "@/server/services/inbox";
import { senderAuthenticated } from "@/server/services/inbox/email-auth";
import type { Extraction } from "@/server/services/inbox/extract";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const today = todayIn(TZ);
const base: Omit<Extraction, "type" | "summary"> = { bill: null, receipt: null, school: null, travel: null, pay: null };
const doc = { channel: "email" as const, subject: "Fwd", text: "…", files: [] };
const fixed = (ex: Partial<Extraction> & Pick<Extraction, "type">) => async () => ({ ...base, summary: "s", ...ex }) as Extraction;

describe("smart inbox", () => {
  it("files bills, receipts, assignments, bookings and pay stubs where they belong, and Undo removes them", async () => {
    const { user, run } = await makeUser();
    await run(async (s) => {
      await createManualAccount(s, { name: "Visa", type: "credit", currentBalanceCents: 0 });
      await createCourse(s, { name: "Calculus II", code: "MATH 152" });
      await createEmployer(s, { name: "Campus Library", hourlyRateCents: 1500 });
    });
    const file = (ex: Partial<Extraction> & Pick<Extraction, "type">) => run((s) => processDocument(s, TZ, today, doc, fixed(ex)));

    const bill = await file({ type: "bill", bill: { payee: "Comcast", amount_usd: 64.99, due_date: addDaysStr(today, 10), repeats: "monthly" } });
    expect(bill.status).toBe("filed");
    expect(bill.filed.map((f) => f.kind)).toEqual(["recurring", "task"]);

    const receipt = await file({ type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: today } });
    expect(receipt.filed[0].label).toContain("Spending: Target $23.45");
    // The same receipt again (e.g. the bank already imported it): not added twice.
    const again = await file({ type: "receipt", receipt: { merchant: "Target", total_usd: 23.45, date: today } });
    expect(again.status).toBe("needs_review");

    const exam = await file({ type: "exam", school: { course: "MATH 152", title: "Midterm 2", due_date: addDaysStr(today, 14), due_time: "13:00" } });
    expect(exam.filed[0].label).toContain("Exam: Midterm 2 in Calculus II");

    const flight = await file({
      type: "flight",
      travel: {
        destination: "Paris",
        items: [
          {
            kind: "flight",
            title: "AF 23 BOS to CDG",
            start: `${addDaysStr(today, 30)}T18:30`,
            end: null,
            location: "Boston Logan",
            confirmation: "X7Q2LM",
            cost_usd: 612,
          },
          {
            kind: "hotel",
            title: "Hotel du Marais",
            start: addDaysStr(today, 31),
            end: addDaysStr(today, 35),
            location: "Paris",
            confirmation: "H-8821",
            cost_usd: 540,
          },
        ],
      },
    });
    expect(flight.filed.map((f) => f.kind)).toEqual(["event", "event"]);

    const pay = await file({ type: "pay_stub", pay: { employer: "Campus Library", pay_date: today, net_usd: 412.5, gross_usd: 480, hours: 32 } });
    expect(pay.filed[0].label).toContain("Paycheck from Campus Library: $412.50");

    const counts = async () =>
      run(async (s) => ({
        recurring: (await s.tx.select().from(recurringItems)).length,
        tasks: (await s.tx.select().from(tasks)).length,
        txns: (await s.tx.select().from(transactions)).length,
        assignments: (await s.tx.select().from(assignments)).length,
        events: (await s.tx.select().from(calendarEvents)).length,
        paychecks: (await s.tx.select().from(paychecks)).length,
      }));
    expect(await counts()).toEqual({ recurring: 1, tasks: 1, txns: 1, assignments: 1, events: 2, paychecks: 1 });
    for (const item of [bill, receipt, exam, flight, pay]) await run((s) => undoInboxItem(s, item.id));
    expect(await counts()).toEqual({ recurring: 0, tasks: 0, txns: 0, assignments: 0, events: 0, paychecks: 0 });

    // A class it can't find is left for the user, not guessed.
    const unknown = await file({ type: "assignment", school: { course: "BIO 999", title: "Lab", due_date: today, due_time: null } });
    expect(unknown.status).toBe("needs_review");
    expect(unknown.reason).toContain("couldn't find the class");
    expect(user.id).toBeTruthy();
  });

  it("gives each user a private address and only trusts verified, authenticated senders", async () => {
    process.env.INBOX_DOMAIN = "in.example.test";
    const { user, run } = await makeUser();
    const addr = (await inboxAddress(getDb(), user.id))!;
    expect(addr).toMatch(/^u-[a-z0-9]+@in\.example\.test$/);
    expect((await userForAddress(getDb(), addr.toUpperCase()))?.id).toBe(user.id);
    expect(await userForAddress(getDb(), "u-nope1234@in.example.test")).toBeNull();
    expect(await run((s) => isVerifiedSender(s, user.email))).toBe(false);

    const from = "me@school.edu";
    expect(
      senderAuthenticated(
        [
          {
            Name: "Received-SPF",
            Value: "Pass (sender SPF authorized) identity=mailfrom; client-ip=1.2.3.4; envelope-from=me@school.edu; domain of me@school.edu",
          },
        ],
        from,
      ),
    ).toBe(true);
    expect(senderAuthenticated([{ Name: "Authentication-Results", Value: "mx.example; dkim=pass header.d=school.edu; spf=fail" }], from)).toBe(true);
    expect(senderAuthenticated([{ Name: "Authentication-Results", Value: "mx.example; dkim=pass header.d=evil.com" }], from)).toBe(false);
    expect(senderAuthenticated([], from)).toBe(false);
    delete process.env.INBOX_DOMAIN;
  });
});
