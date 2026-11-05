import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr, monthStart, todayIn, weekStart } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents, habits, jarvisMessages, memories, tasks, type UserPreferences } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { createGoal, createRecurring, setBudget, budgetStatus } from "@/server/services/finance/planning";
import { contributeToGoal } from "@/server/services/finance/goals";
import { createTransaction } from "@/server/services/finance/transactions";
import { createCourse, createAssignment } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { createEvent } from "@/server/services/calendar";
import { checkHabit, createHabit } from "@/server/services/habits";
import { createEmployer, createShift } from "@/server/services/work";
import { inQuietHours, learnedStats, listMessages, pushImportant, runProactive, topMessage, unreadCount } from "@/server/services/proactive/engine";
import { respondToMessage } from "@/server/services/proactive/respond";
import { openQuestions } from "@/server/services/proactive/questions";
import { createMemory, listActiveMemories as listActive } from "@/server/services/memory";
import { composeMessage, KIND_LABELS } from "@/lib/jarvis-voice";
import { DETECTORS, RUNS } from "@/server/services/proactive/detectors";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const today = todayIn(TZ);
const user = (id: string, preferences: UserPreferences = {}) => ({ id, timezone: TZ, preferences });
const msgs = (run: <T>(fn: (s: UserScope) => Promise<T>) => Promise<T>) => run((s) => s.tx.select().from(jarvisMessages));

async function checking(s: UserScope, cents = 50_000) {
  return createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: cents });
}

describe("proactive Jarvis", () => {
  it("notices food running high this week and moves budget room on 'Do it', with Undo", async () => {
    const { user: u, run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s);
      const food = (await getCategoryByName(s, "Groceries"))!;
      const fun = (await getCategoryByName(s, "Entertainment"))!;
      // Usual: $40 a week on groceries for 8 weeks. This week: $95.
      for (let w = 1; w <= 8; w++)
        await createTransaction(s, {
          accountId: acct.id,
          date: addDaysStr(weekStart(today), -7 * w),
          description: "Kroger",
          merchantName: "Kroger",
          amountCents: -4000,
          categoryId: food.id,
        });
      await createTransaction(s, {
        accountId: acct.id,
        date: weekStart(today),
        description: "Kroger",
        merchantName: "Kroger",
        amountCents: -9500,
        categoryId: food.id,
      });
      await setBudget(s, { month: today, categoryId: food.id, limitCents: 30_000 });
      await setBudget(s, { month: today, categoryId: fun.id, limitCents: 20_000 });
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "transaction" }));
    const m = out.find((x) => x.kind === "spending_pace")!;
    expect(m.body).toContain("$95 on groceries this week, $55 more than usual");
    expect(m.action).toMatchObject({ type: "shift_budget", cents: 5500 });

    const r = await run((s) => respondToMessage(s, user(u.id), m.id, "do", today));
    expect(r.text).toMatch(/Moved \$55 from Entertainment .* to Groceries/);
    const after = await run((s) => budgetStatus(s, today));
    expect(after.find((b) => b.categoryName === "Groceries")!.limitCents).toBe(35_500);
    await run((s) => respondToMessage(s, user(u.id), m.id, "undo", today));
    expect((await run((s) => budgetStatus(s, today))).find((b) => b.categoryName === "Groceries")!.limitCents).toBe(30_000);

    // Same situation again: never said twice.
    expect((await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "transaction" }))).filter((x) => x.kind === "spending_pace")).toHaveLength(0);
  });

  it("warns when a bill isn't covered, celebrates goal milestones, and blocks study time before a shift", async () => {
    const { user: u, run } = await makeUser();
    await run(async (s) => {
      await checking(s, 50_000);
      await createRecurring(s, { name: "Rent", amountCents: -62_000, frequency: "monthly", nextDueDate: addDaysStr(today, 3), kind: "bill" });
      const g = await createGoal(s, { name: "Paris", targetCents: 200_000 });
      await contributeToGoal(s, { goalId: g.id, amountCents: 100_000, date: today });
      const course = await createCourse(s, { name: "English 101", code: "ENG 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Essay draft", dueDate: addDaysStr(today, 3), dueTime: "23:59" });
      const job = await createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: addDaysStr(today, 2), startTime: "18:00", endTime: "23:00" });
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "morning" }));
    const kinds = out.map((m) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(["bill_short", "goal_milestone", "deadline_conflict"]));
    const bill = out.find((m) => m.kind === "bill_short")!;
    expect(bill.body).toContain("Rent ($620) is due in 3 days and your checking is $120 short");
    expect(bill.urgent).toBe(true);
    expect(out.find((m) => m.kind === "goal_milestone")!.body).toContain("50% of the way to Paris");

    const block = out.find((m) => m.kind === "deadline_conflict")!;
    expect(block.body).toMatch(/Essay draft is due .* and you work .* night/);
    await run((s) => respondToMessage(s, user(u.id), block.id, "do", today));
    const events = await run((s) => s.tx.select().from(calendarEvents));
    expect(events.map((e) => e.title)).toContain("Work on Essay draft");
  });

  it("offers to move overdue to-dos, respects muted topics and kinds, and stops what keeps getting ignored", async () => {
    const { user: u, run } = await makeUser();
    await run((s) => createTask(s, TZ, { title: "Return library books", dueDate: addDaysStr(today, -2) }));
    const first = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "midday" }));
    const overdue = first.find((m) => m.kind === "overdue_tasks")!;
    expect(overdue.body).toContain('"Return library books" is past due');
    await run((s) => respondToMessage(s, user(u.id), overdue.id, "do", today));
    const [t] = await run((s) => s.tx.select().from(tasks));
    expect(t.dueAt!.getTime()).toBeGreaterThan(Date.now());

    // "Don't suggest this again" is remembered in settings.
    const prefs: UserPreferences = {};
    const me = user(u.id, prefs);
    await run(async (s) => {
      await s.tx.insert(jarvisMessages).values({ userId: u.id, kind: "bank_fees", topic: "money", dedupeKey: "x1", title: "t", body: "b" });
    });
    const [x1] = (await msgs(run)).filter((m) => m.dedupeKey === "x1");
    await run((s) => respondToMessage(s, me, x1.id, "mute", today));
    expect(me.preferences.jarvis?.mutedKinds).toEqual(["bank_fees"]);

    // Three ignored in a row (with learning on): suppressed.
    const old = new Date(Date.now() - 3 * 86_400_000);
    await run(async (s) => {
      for (let i = 0; i < 3; i++)
        await s.tx
          .insert(jarvisMessages)
          .values({ userId: u.id, kind: "unusual_spend", topic: "money", dedupeKey: `ign${i}`, title: "t", body: "b", createdAt: old });
    });
    const stats = await run((s) => learnedStats(s));
    expect(stats.kinds.find((k) => k.kind === "unusual_spend")!.suppressed).toBe(true);
  });

  it("caps how often he speaks, keeps quiet hours, never pushes the same thing twice, and changes tone", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await checking(s, 1_000);
      for (let i = 1; i <= 3; i++)
        await createRecurring(s, { name: `Bill ${i}`, amountCents: -50_000, frequency: "monthly", nextDueDate: addDaysStr(today, 1), kind: "bill" });
      for (let i = 0; i < 6; i++) await createTask(s, TZ, { title: `Late ${i}`, dueDate: addDaysStr(today, -1 - i) });
    });
    await run((s) => runProactive({ scope: s, tz: TZ, prefs: { jarvis: { frequency: "low" } }, trigger: "morning" }));
    const pushed: string[] = [];
    const push = async (key: string) => {
      pushed.push(key);
      return true;
    };
    // 3 urgent bills plus the morning brief; a limit of 2 a day sends the 2 most urgent.
    expect(await run((s) => pushImportant(s, TZ, { jarvis: { pushLimit: 2, quietStart: "00:00", quietEnd: "00:00" } }, push))).toBe(2);
    expect(pushed.every((k) => k.startsWith("jarvis:bill_short"))).toBe(true);
    expect(await run((s) => pushImportant(s, TZ, { jarvis: { pushLimit: 5, quietStart: "00:00", quietEnd: "00:00" } }, push))).toBe(2);
    expect(new Set(pushed).size).toBe(4);
    expect(inQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("12:00", "22:00", "07:00")).toBe(false);

    const facts = { category: "Food", spentCents: 8600, overCents: 3000, fromCategory: "Fun", moveCents: 3000 };
    expect(composeMessage("spending_pace", facts, "direct").body).toBe(
      "You spent $86 on food this week, $30 more than usual. Want me to move $30 from Fun to Food?",
    );
    expect(composeMessage("spending_pace", facts, "friend", { seed: 0 }).body.startsWith("Heads up:")).toBe(true);
    expect(composeMessage("spending_pace", facts, "coach", { seed: 0, brief: true }).body.startsWith("You spent")).toBe(true);
  });

  it("every push says what was noticed in one line, not just a headline", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await checking(s, 50_000);
      await createRecurring(s, { name: "Rent", amountCents: -62_000, frequency: "monthly", nextDueDate: addDaysStr(today, 3), kind: "bill" });
      await createTask(s, TZ, { title: "Email advisor", dueDate: today, priority: "high" });
      const course = await createCourse(s, { name: "English 101", code: "ENG 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Essay draft", dueDate: addDaysStr(today, 3), dueTime: "23:59" });
      const job = await createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: addDaysStr(today, 2), startTime: "18:00", endTime: "23:00" });
    });
    await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "morning" }));
    const sent: { key: string; title: string; body: string }[] = [];
    const push = async (key: string, msg: { title: string; body: string }) => {
      sent.push({ key, ...msg });
      return true;
    };
    expect(await run((s) => pushImportant(s, TZ, { jarvis: { pushLimit: 5, quietStart: "00:00", quietEnd: "00:00" } }, push))).toBeGreaterThanOrEqual(3);
    const kinds = sent.map((p) => p.key.split(":")[1]);
    expect(kinds).toEqual(expect.arrayContaining(["bill_short", "morning_brief", "deadline_conflict"]));
    const saved = await msgs(run);
    for (const p of sent) {
      const m = saved.find((x) => `jarvis:${x.dedupeKey}` === p.key)!;
      expect(p.title).toBe(m.title);
      expect(p.body.length).toBeGreaterThan(20);
      expect(p.body).not.toBe(p.title);
      expect(p.body).not.toMatch(/\n|^(Hey!|Quick one:|Heads up:|Just so you know:)/);
      expect(m.body).toContain(p.body);
    }
    expect(sent.find((p) => p.key.includes("bill_short"))!.body).toMatch(/^Rent \(\$620\) is due in 3 days and your checking is \$120 short\./);
    expect(sent.find((p) => p.key.includes("morning_brief"))!.body).toMatch(/on today's list/);
    expect(sent.find((p) => p.key.includes("deadline_conflict"))!.body).toMatch(/^Essay draft is due .* and you work .*\. Want me to block/);
  });

  it("only learns from responses after the user agrees", async () => {
    const { user: u, run } = await makeUser();
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "morning" }));
    const consent = out.find((m) => m.kind === "consent")!;
    const me = user(u.id);
    await run((s) => respondToMessage(s, me, consent.id, "do", today));
    expect(me.preferences.jarvis?.learning).toBe(true);
    const again = await run((s) => runProactive({ scope: s, tz: TZ, prefs: me.preferences, trigger: "morning" }));
    expect(again.find((m) => m.kind === "consent")).toBeUndefined();
    expect((await run((s) => s.tx.select().from(jarvisMessages).where(eq(jarvisMessages.kind, "consent"))))[0].status).toBe("done");
    expect(monthStart(today)).toBe(`${today.slice(0, 7)}-01`);
  });

  it("asks one get-to-know question, saves the answer as a memory, and resets what it learned", async () => {
    const { user: u, run } = await makeUser();
    const me = user(u.id, { jarvis: { learning: true } });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: me.preferences, trigger: "evening" }));
    const q = out.find((m) => m.kind === "question")!;
    expect(q.title).toBe("What usually makes you put things off?");
    expect(q.action).toMatchObject({ type: "answer", choices: expect.arrayContaining(["My phone"]) });
    await expect(run((s) => respondToMessage(s, me, q.id, "answer", today, "Buy a boat"))).rejects.toThrow(/Pick one/);
    const r = await run((s) => respondToMessage(s, me, q.id, "answer", today, "My phone"));
    expect(r.text).toContain("What usually makes me put things off: my phone.");
    const mems = await run((s) => s.tx.select().from(memories));
    expect(mems).toMatchObject([{ content: "What usually makes me put things off: my phone.", category: "preference", source: "user", status: "active" }]);
    // Not asked again within 2 days; undo removes the memory.
    const later = await run((s) => runProactive({ scope: s, tz: TZ, prefs: me.preferences, trigger: "evening", now: new Date(Date.now() + 3600_000) }));
    expect(later.find((m) => m.kind === "question")).toBeUndefined();
    await run((s) => respondToMessage(s, me, q.id, "undo", today));
    expect(await run((s) => s.tx.select().from(memories))).toHaveLength(0);
    // Reset: older responses no longer count.
    await run((s) => respondToMessage(s, me, out.find((m) => m.kind !== "question")?.id ?? q.id, "down", today));
    expect((await run((s) => learnedStats(s))).kinds.length).toBeGreaterThan(0);
    expect((await run((s) => learnedStats(s, new Date(), new Date(Date.now() + 1000)))).kinds).toHaveLength(0);
  });
});

describe("spending pace uses the weeks there really is data for (audit A24)", () => {
  // Groceries each week before this one, then `now` on this week's Monday.
  async function groceries(weeks: number, usualCents: number, nowCents: number) {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s);
      const food = (await getCategoryByName(s, "Groceries"))!;
      const tx = (date: string, cents: number) =>
        createTransaction(s, { accountId: acct.id, date, description: "Kroger", merchantName: "Kroger", amountCents: -cents, categoryId: food.id });
      for (let w = 1; w <= weeks; w++) await tx(addDaysStr(weekStart(today), -7 * w), usualCents);
      await tx(weekStart(today), nowCents);
    });
    return (await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "transaction" }))).filter((m) => m.kind === "spending_pace");
  }

  it("stays quiet on an ordinary week with only 3 weeks of history", async () => {
    expect(await groceries(3, 4000, 4000)).toEqual([]);
  });

  it("stays quiet with too little history to know what's usual", async () => {
    expect(await groceries(2, 4000, 12_000)).toEqual([]);
  });

  it("still notices a real jump, against the average of the weeks there are", async () => {
    const [m] = await groceries(3, 4000, 9500);
    expect(m.facts).toMatchObject({ spentCents: 9500, usualCents: 4000, overCents: 5500 });
    expect(m.body).toContain("$95 on groceries this week, $55 more than usual");
  });
});

describe("never asks to log by hand (audit A30)", () => {
  it("stays quiet for a manual-only user who stopped entering spending", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s);
      const food = (await getCategoryByName(s, "Groceries"))!;
      await createTransaction(s, { accountId: acct.id, date: addDaysStr(today, -10), description: "Kroger", amountCents: -2500, categoryId: food.id });
    });
    const midday = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "midday" }));
    expect(midday).toEqual([]);
    const all = [
      ...midday,
      ...(await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "morning" }))),
      ...(await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening" }))),
      ...(await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "transaction" }))),
    ];
    expect(all.map((m) => m.kind)).not.toContain("log_reminder");
    expect(all.filter((m) => /\blog(ged|ging)?\b|catch up/i.test(`${m.title} ${m.body}`))).toEqual([]);
    expect(Object.keys(DETECTORS)).not.toContain("logReminder");
    expect(Object.values(RUNS).flat()).not.toContain("logReminder");
    expect(KIND_LABELS).not.toHaveProperty("log_reminder");
  });

  it("hides 'log spending' messages saved before it was removed: Today, the dot, Updates and pushes (review)", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await s.tx.insert(jarvisMessages).values([
        {
          userId: s.userId,
          kind: "log_reminder",
          topic: "money",
          dedupeKey: "log_reminder:old",
          title: "Catch up on spending",
          body: "You haven't logged",
          priority: 99,
        },
        {
          userId: s.userId,
          kind: "bank_fees",
          topic: "money",
          dedupeKey: "bank_fees:x",
          title: "$35 in bank fees this month",
          body: "Your bank charged 1 fee",
          priority: 60,
        },
      ]);
    });
    expect((await run((s) => topMessage(s)))?.kind).toBe("bank_fees");
    expect(await run((s) => unreadCount(s))).toBe(1);
    expect((await run((s) => listMessages(s))).map((m) => m.kind)).toEqual(["bank_fees"]);
    const pushed: string[] = [];
    await run((s) =>
      pushImportant(s, TZ, { jarvis: { quietStart: "00:00", quietEnd: "00:00" } }, async (key) => {
        pushed.push(key);
        return true;
      }),
    );
    expect(pushed.filter((k) => k.includes("log_reminder"))).toEqual([]);
  });
});

describe("money findings", () => {
  it("tells you about a possible double charge and this month's bank fees", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const acct = await checking(s);
      const tx = (date: string, cents: number, description: string, merchantName: string | null = null) =>
        createTransaction(s, { accountId: acct.id, date, description, merchantName, amountCents: -cents });
      await tx(addDaysStr(today, -3), 4218, "TARGET T-1294 ATLANTA GA", "Target");
      await tx(addDaysStr(today, -2), 4218, "TARGET T-1294 ATLANTA GA", "Target");
      await tx(addDaysStr(today, -1), 3500, "OVERDRAFT FEE FOR A TRANSACTION");
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "midday" }));
    const kinds = out.map((m) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(["double_charge", "bank_fees"]));
    expect(out.find((m) => m.kind === "double_charge")!.body).toMatch(/Target charged you \$42\.18 twice/);
    expect(out.find((m) => m.kind === "bank_fees")!.title).toBe("$35 in bank fees this month");
  });
});

describe("Sunday week ahead", () => {
  it("names the heaviest day, why, and a lighter day before it; quiet on light weeks and other days", async () => {
    const { run } = await makeUser();
    // A Sunday evening; the week ahead is Mon Nov 9 to Sun Nov 15.
    const sunday = new Date("2026-11-08T23:00:00Z");
    const quiet = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: sunday }));
    expect(quiet.find((m) => m.kind === "week_ahead")).toBeUndefined();

    await run(async (s) => {
      const job = await createEmployer(s, { name: "Target", hourlyRateCents: 1600 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-11", startTime: "10:00", endTime: "19:00" });
      await createTask(s, TZ, { title: "Pay phone bill", dueDate: "2026-11-11", priority: "high" });
      const course = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Quiz 4", kind: "quiz", dueDate: "2026-11-12", dueTime: "09:00" });
    });
    const mon = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: new Date("2026-11-09T23:00:00Z") }));
    expect(mon.find((m) => m.kind === "week_ahead")).toBeUndefined(); // only on Sundays

    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: new Date(sunday.getTime() + 60_000) }));
    const msg = out.find((m) => m.kind === "week_ahead")!;
    expect(msg.title).toBe("Wednesday is your big day this week");
    expect(msg.body).toContain("Wednesday has about 11 hours on it: Work at Target 10:00 AM–7:00 PM and a to-do (Pay phone bill).");
    expect(msg.body).toContain("Monday is wide open.");
    expect(msg.action).toMatchObject({ type: "ask", prompt: expect.stringContaining("Help me move what I can to Monday") });
  });
});

describe("curious Jarvis", () => {
  it("asks what fits the user's life and skips what it already knows", async () => {
    const { run } = await makeUser();
    const keys = () => run(async (s) => (await openQuestions(s, undefined, await listActive(s))).questions.map((q) => q.key));
    // No school or job on record: nothing class- or job-specific.
    expect(await keys()).not.toContain("heaviest_class");
    expect(await keys()).not.toContain("work_hours");

    await run(async (s) => {
      await createCourse(s, { name: "Intro to Psychology", code: "PSY 101" });
      await createCourse(s, { name: "Biology" });
      await createMemory(s, { content: "I focus best: evening.", category: "routine" }, "user");
    });
    const student = await run(async (s) => (await openQuestions(s, undefined, await listActive(s))).questions);
    expect(student[0].key).toBe("semester_win");
    expect(student.find((q) => q.key === "heaviest_class")?.choices.sort()).toEqual(["Biology", "PSY 101"]);
    expect(student.map((q) => q.key)).toContain("has_job");
    expect(student.map((q) => q.key)).not.toContain("focus_time"); // already saved
    expect(student.map((q) => q.key)).not.toContain("payday");

    await run((s) => createEmployer(s, { name: "Target", hourlyRateCents: 1600 }));
    const both = await run(async (s) => (await openQuestions(s, undefined, await listActive(s))).questions.map((q) => q.key));
    expect(both).toEqual(expect.arrayContaining(["work_hours", "payday"]));
    expect(both).not.toContain("has_job");
    // Money questions can be left out.
    const noMoney = await run(async (s) => (await openQuestions(s, undefined, [], { money: false })).questions);
    expect(noMoney.some((q) => q.topic === "money")).toBe(false);
  });
});

describe("reviews and coaching", () => {
  it("builds the morning brief, the evening wrap-up and the Sunday weekly review from real data", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await checking(s, 80_000);
      await createTask(s, TZ, { title: "Email advisor", dueDate: today, priority: "high" });
      const done = await createTask(s, TZ, { title: "Laundry", dueDate: today });
      await s.tx.update(tasks).set({ status: "done", completedAt: new Date() }).where(eq(tasks.id, done.id));
    });
    const morning = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "morning" }));
    const brief = morning.find((m) => m.kind === "morning_brief")!;
    expect(brief.body).toMatch(/available now/);
    expect(JSON.stringify(brief.facts.sections)).toContain("Email advisor");

    const evening = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening" }));
    const wrap = evening.find((m) => m.kind === "evening_wrap")!;
    expect(wrap.body).toContain("You finished 1 to-do today. 1 to-do didn't happen.");
    expect(wrap.action).toMatchObject({ type: "move_tasks" });

    // A Sunday evening: the weekly review. On a Sunday, use next Sunday (tonight already had its evening message).
    const daysToSunday = (7 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7 || 7;
    const sunday = new Date(`${addDaysStr(today, daysToSunday)}T23:30:00Z`);
    const week = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: sunday }));
    const review = week.find((m) => m.kind === "weekly_review")!;
    expect(review.body).toMatch(/to-do.* done, \d+ still open, \$\d+ spent/);
    expect((review.facts.sections as { heading: string }[]).map((x) => x.heading)).toEqual(expect.arrayContaining(["Wins", "Still open", "Spending"]));
  });

  it("says a habit is off track with real numbers, and offers an open slot only when the calendar shows one", async () => {
    const { run } = await makeUser();
    // A Tuesday evening in New York (Nov 10, 2026; UTC is already Wednesday).
    const now = new Date("2026-11-11T01:30:00Z");
    const day = todayIn(TZ, now);
    expect(day).toBe("2026-11-10");
    await run(async (s) => {
      const gym = await createHabit(s, { title: "Gym", kind: "custom", cadence: "daily" });
      const read = await createHabit(s, { title: "Read 20 pages", kind: "custom", cadence: "daily" });
      for (const h of [gym, read]) {
        await s.tx
          .update(habits)
          .set({ createdAt: new Date("2026-10-20T12:00:00Z") })
          .where(eq(habits.id, h.id));
        // Done 2 of the 5 days before today.
        for (const d of [-2, -5]) await checkHabit(s, h.id, addDaysStr(day, d));
      }
      // Tomorrow (Wednesday) has a class 9 to 11 AM, so the first open stretch starts at 11 AM.
      await createEvent(s, TZ, { title: "BIO 101", date: addDaysStr(day, 1), startTime: "09:00", endTime: "11:00" });
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now }));
    const off = out.filter((m) => m.kind === "habit_struggle");
    expect(off).toHaveLength(2);
    for (const m of off) {
      // Wed Nov 4 to Mon Nov 9 reaches into last week, so no "this week".
      expect(m.facts).toMatchObject({ kept: 2, of: 5, unit: "days", thisWeek: false });
      expect(`${m.title} ${m.body}`).not.toMatch(/slipp|missed|failed/i);
      expect(m.body).toContain(": 2 of the last 5 days. That's off track.");
      expect(m.action).toMatchObject({ type: "open", href: "/goals" });
      // The real day and time, so it still reads right the next morning (never "tomorrow" in saved text).
      expect(m.facts).toMatchObject({ slotDate: "2026-11-11", slotTime: "11:00" });
      expect(m.body).toContain("Wednesday 11 AM is open to get back on track.");
      expect(m.body).not.toMatch(/tomorrow/i);
    }

    // With nothing on tomorrow's calendar, no slot is claimed.
    const { run: run2 } = await makeUser();
    await run2(async (s) => {
      const h = await createHabit(s, { title: "Gym", kind: "custom", cadence: "daily" });
      await s.tx
        .update(habits)
        .set({ createdAt: new Date("2026-10-20T12:00:00Z") })
        .where(eq(habits.id, h.id));
      await checkHabit(s, h.id, addDaysStr(day, -1));
    });
    const [lone] = (await run2((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now }))).filter((m) => m.kind === "habit_struggle");
    expect(lone.facts).toMatchObject({ kept: 1, of: 5, slotDate: null, slotTime: null });
    expect(lone.body).not.toMatch(/is open/);
  });

  describe("an open slot is only offered where it fits the person's day (review)", () => {
    // Tuesday Nov 10, 8:30 PM in New York; tomorrow is Wednesday Nov 11.
    const now = new Date("2026-11-11T01:30:00Z");
    const day = "2026-11-10";
    async function habitOffTrack(habit: { title: string; kind?: "study" | "custom"; target?: number }, setup: (s: UserScope) => Promise<void>) {
      const { run } = await makeUser();
      await run(async (s) => {
        const h = await createHabit(s, { kind: "custom", cadence: "daily", ...habit });
        await s.tx
          .update(habits)
          .set({ createdAt: new Date("2026-10-20T12:00:00Z") })
          .where(eq(habits.id, h.id));
        await checkHabit(s, h.id, addDaysStr(day, -2));
        await setup(s);
      });
      const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now }));
      return out.find((m) => m.kind === "habit_struggle")!;
    }

    it("never for a habit you keep all day, like No soda (the plain way back instead)", async () => {
      const m = await habitOffTrack({ title: "No soda" }, (s) =>
        createEvent(s, TZ, { title: "BIO 101", date: "2026-11-11", startTime: "18:00", endTime: "19:00" }).then(() => {}),
      );
      expect(m.facts).toMatchObject({ slotDate: null, slotTime: null });
      expect(m.body).toMatch(/1 of the last 5 days\. That's off track\. Want to make it smaller for a while to get back on track\?$/);
      expect(m.body).not.toMatch(/is open|AM|PM/);
    });

    it("never before 9 AM, even when the morning is empty", async () => {
      const m = await habitOffTrack({ title: "Gym" }, (s) =>
        createEvent(s, TZ, { title: "BIO 101", date: "2026-11-11", startTime: "18:00", endTime: "19:00" }).then(() => {}),
      );
      expect(m.facts).toMatchObject({ slotDate: "2026-11-11", slotTime: "09:00" });
      expect(m.body).toContain("Wednesday 9 AM is open to get back on track.");
    });

    it("later for someone who goes to bed after 1 AM", async () => {
      const m = await habitOffTrack({ title: "Study", kind: "study", target: 25 }, async (s) => {
        await createMemory(s, { content: "When I usually go to bed on a weeknight: after 1 am.", category: "routine" }, "user");
        await createEvent(s, TZ, { title: "Shift", date: "2026-11-11", startTime: "13:00", endTime: "17:00" });
      });
      expect(m.facts).toMatchObject({ slotDate: "2026-11-11", slotTime: "10:00" });
      expect(m.body).toContain("Wednesday 10 AM is open to get back on track.");
    });

    it("works around class times typed on the course, and offers nothing when they can't be read", async () => {
      const m = await habitOffTrack({ title: "Gym" }, async (s) => {
        await createCourse(s, { name: "Biology", code: "BIO 101", meetingInfo: "Mon/Wed 9:00–11:30 AM" });
      });
      expect(m.facts).toMatchObject({ slotDate: "2026-11-11", slotTime: "11:30" });
      expect(m.body).toContain("Wednesday 11:30 AM is open to get back on track.");

      const unclear = await habitOffTrack({ title: "Gym" }, async (s) => {
        await createCourse(s, { name: "Biology", code: "BIO 101", meetingInfo: "Wednesday mornings, see syllabus" });
        await createEvent(s, TZ, { title: "Shift", date: "2026-11-11", startTime: "18:00", endTime: "21:00" });
      });
      expect(unclear.facts).toMatchObject({ slotDate: null, slotTime: null });
      expect(unclear.body).not.toMatch(/is open/);
    });
  });

  it("counts only periods since the habit began, and says 'this week' only when the days are this week (review)", async () => {
    const offTrack = async (title: string, cadence: "daily" | "weekly", created: string, now: Date) => {
      const { run } = await makeUser();
      await run(async (s) => {
        const h = await createHabit(s, { title, kind: "custom", cadence });
        await s.tx
          .update(habits)
          .set({ createdAt: new Date(created) })
          .where(eq(habits.id, h.id));
      });
      return (await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now }))).find((m) => m.kind === "habit_struggle");
    };
    // Weekly, 28 days old on Wed Nov 11: the weeks of Oct 19, Oct 26 and Nov 2 (not the week it began, nor before).
    const weekly = (await offTrack("Gym once a week", "weekly", "2026-10-14T16:00:00Z", new Date("2026-11-11T22:30:00Z")))!;
    expect(weekly.facts).toMatchObject({ kept: 0, of: 3, unit: "weeks", thisWeek: false });
    expect(weekly.body).toContain('"Gym once a week": 0 of the last 3 weeks. That\'s off track.');
    expect(weekly.body).not.toMatch(/of the last 5/);
    // Daily, on a Monday: the 5 days before are all last week.
    const monday = (await offTrack("Read", "daily", "2026-10-14T16:00:00Z", new Date("2026-11-09T23:30:00Z")))!;
    expect(monday.facts).toMatchObject({ kept: 0, of: 5, thisWeek: false });
    expect(monday.body).not.toMatch(/this week/);
    // Daily, on a Saturday: Monday to Friday are this week.
    const saturday = (await offTrack("Read", "daily", "2026-10-14T16:00:00Z", new Date("2026-11-14T23:30:00Z")))!;
    expect(saturday.facts).toMatchObject({ kept: 0, of: 5, thisWeek: true });
    expect(saturday.body).toContain("0 of the last 5 days. That's off track this week.");
    // Daily, 4 days old: only 4 days to count (and too new to be called off track anyway).
    expect(await offTrack("Read", "daily", "2026-11-05T16:00:00Z", new Date("2026-11-09T23:30:00Z"))).toBeUndefined();
  });

  it("counts habit streaks by day and by week", async () => {
    const { streakOf } = await import("@/server/services/habits");
    const d = (n: number) => addDaysStr(today, -n);
    expect(streakOf("daily", [d(0), d(1), d(2), d(4)], today)).toMatchObject({ current: 3, best: 3 });
    // Today not done yet doesn't break yesterday's streak.
    expect(streakOf("daily", [d(1), d(2)], today).current).toBe(2);
    expect(streakOf("weekly", [d(0), d(7), d(14)], today).current).toBe(3);
  });
});
