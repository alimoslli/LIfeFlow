import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr, monthStart, todayIn, weekStart } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents, jarvisMessages, memories, tasks, type UserPreferences } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { createGoal, createRecurring, setBudget, budgetStatus } from "@/server/services/finance/planning";
import { contributeToGoal } from "@/server/services/finance/goals";
import { createTransaction } from "@/server/services/finance/transactions";
import { createCourse, createAssignment } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { createEmployer, createShift } from "@/server/services/work";
import { inQuietHours, learnedStats, pushImportant, runProactive } from "@/server/services/proactive/engine";
import { respondToMessage } from "@/server/services/proactive/respond";
import { openQuestions } from "@/server/services/proactive/questions";
import { createMemory, listActiveMemories as listActive } from "@/server/services/memory";
import { composeMessage } from "@/lib/jarvis-voice";
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
      await s.tx.insert(jarvisMessages).values({ userId: u.id, kind: "log_reminder", topic: "money", dedupeKey: "x1", title: "t", body: "b" });
    });
    const [x1] = (await msgs(run)).filter((m) => m.dedupeKey === "x1");
    await run((s) => respondToMessage(s, me, x1.id, "mute", today));
    expect(me.preferences.jarvis?.mutedKinds).toEqual(["log_reminder"]);

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

    // A Sunday evening: the weekly review.
    const daysToSunday = (7 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7;
    const sunday = new Date(`${addDaysStr(today, daysToSunday)}T23:30:00Z`);
    const week = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: sunday }));
    const review = week.find((m) => m.kind === "weekly_review")!;
    expect(review.body).toMatch(/to-do.* done, \d+ slipped, \$\d+ spent/);
    expect((review.facts.sections as { heading: string }[]).map((x) => x.heading)).toEqual(expect.arrayContaining(["Wins", "What slipped", "Spending"]));
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
