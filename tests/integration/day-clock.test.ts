import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createEvent } from "@/server/services/calendar";
import { dayClockData } from "@/server/services/day-clock";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createGoal, createRecurring } from "@/server/services/finance/planning";
import { updateSubscription } from "@/server/services/finance/subscriptions";
import { createTransaction } from "@/server/services/finance/transactions";
import { logHealth } from "@/server/services/health";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
import { createTask } from "@/server/services/tasks";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";
import { eq } from "drizzle-orm";
import { promises, tasks } from "@/server/db/schema";
import { checkHabit, createHabit } from "@/server/services/habits";
import { createPromise } from "@/server/services/promises";

afterAll(closeDb);

// Saturday, Nov 7 2026, 1:40 PM in New York.
const NOW = new Date("2026-11-07T18:40:00Z");
// when the earlier promises were made
const EARLIER = new Date("2026-11-04T12:00:00Z");

describe("day clock data", () => {
  it("reads the week around today from the person's own calendar, shifts, classes and health", async () => {
    const { run } = await makeUser("Clock Owner");
    const data = await run(async (s) => {
      const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-07", startTime: "09:00", endTime: "16:30" });
      await createEvent(s, TZ, { title: "Class", date: "2026-11-07", startTime: "18:00", endTime: "20:00", kind: "class" }, "google");
      await createEvent(s, TZ, { title: "Run with Sam", date: "2026-11-08", startTime: "08:00", endTime: "08:45", kind: "personal" });
      await createEvent(s, TZ, { title: "Too far out", date: "2026-11-20", startTime: "08:00", endTime: "09:00", kind: "personal" });
      const bio = await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-09", dueTime: "10:00" });
      await logHealth(s, TZ, { metric: "steps", value: 5060, date: "2026-11-07" }, NOW);
      return dayClockData(s, TZ, NOW);
    });

    expect(data.today).toBe("2026-11-07");
    expect(data.days.map((d) => d.short)).toEqual(["Wed", "Thu", "Fri", "Today", "Sun", "Mon", "Tue"]);
    expect(data.steps).toBe(5060);
    expect(data.empty).toBe(false);
    expect(data.base).toBe(new Date("2026-11-07T05:00:00Z").getTime());

    const byTitle = Object.fromEntries(data.items.map((i) => [i.title, i]));
    // The week in full, and plans further out too (the line keeps going): "Too far out" is 13 days ahead.
    expect(Object.keys(byTitle).sort()).toEqual(["Class", "Exam 2", "Run with Sam", "Too far out", "Work"]);
    expect(byTitle["Too far out"]).toMatchObject({ start: 13 * 1440 + 480 });
    expect(byTitle.Work).toMatchObject({
      kind: "block",
      cat: "work",
      icon: "💼",
      start: 540,
      end: 990,
      subtitle: "Campus Coffee",
      source: "From your work schedule",
    });
    expect(byTitle.Class).toMatchObject({ cat: "class", icon: "🎓", start: 1080, end: 1200, source: "From Google Calendar" });
    expect(byTitle["Run with Sam"]).toMatchObject({ start: 1440 + 480, icon: "🏃", cat: "other" });
    expect(byTitle["Exam 2"]).toMatchObject({ kind: "due", cat: "due", start: 2880 + 600, source: "From your classes" });
  });

  it("adds last night's sleep, and today's spending only while money is shown", async () => {
    const { run } = await makeUser("Money Owner");
    const [shown, hidden] = await run(async (s) => {
      await logHealth(s, TZ, { metric: "sleep_hours", value: 7.3, date: "2026-11-07" }, NOW);
      const bank = await createManualAccount(s, {
        name: "Checking",
        type: "depository",
        subtype: "checking",
        institutionName: "Chase",
        currentBalanceCents: 50000,
      });
      for (const [description, amountCents, date] of [
        ["Lunch at work", -1420, "2026-11-07"],
        ["Shell gas", -5500, "2026-11-07"],
        ["Yesterday's coffee", -540, "2026-11-06"],
      ] as const)
        await createTransaction(s, {
          accountId: bank.id,
          date,
          description,
          merchantName: description,
          amountCents,
          kind: "expense",
          categoryId: null,
          pending: false,
        });
      return [await dayClockData(s, TZ, NOW, { money: true }), await dayClockData(s, TZ, NOW)];
    });
    expect(shown.sleepHours).toBeCloseTo(7.3);
    expect(shown.spentTodayCents).toBe(6920);
    // The Money lock is on (or money isn't asked for): nothing about money, not even a zero.
    expect(hidden.spentTodayCents).toBeNull();
    expect(hidden.items.some((i) => i.amountCents != null)).toBe(false);
  });

  it("shows your life: done things where they were done, promises (never a broken one), and a short recap of each past day", async () => {
    const { run } = await makeUser("Life Owner");
    const [data, locked] = await run(async (s) => {
      const t = await createTask(s, TZ, { title: "Return library books" });
      await s.tx
        .update(tasks)
        .set({ status: "done", completedAt: new Date("2026-11-06T15:00:00Z") })
        .where(eq(tasks.id, t.id));
      await createPromise(s, TZ, { text: "study for the bio quiz", dueDate: "2026-11-07", dueTime: "20:00" }, NOW);
      const kept = await createPromise(s, TZ, { text: "not eat out", dueDate: "2026-11-06", dueTime: "21:00" }, EARLIER);
      await s.tx
        .update(promises)
        .set({ status: "kept", resolvedAt: new Date("2026-11-07T02:30:00Z") })
        .where(eq(promises.id, kept.promise.id));
      const broken = await createPromise(s, TZ, { text: "go to the gym", dueDate: "2026-11-05", dueTime: "18:00" }, EARLIER);
      await s.tx
        .update(promises)
        .set({ status: "broken", resolvedAt: new Date("2026-11-06T01:00:00Z") })
        .where(eq(promises.id, broken.promise.id));
      await logHealth(s, TZ, { metric: "sleep_hours", value: 7.5, date: "2026-11-06" }, NOW);
      await logHealth(s, TZ, { metric: "steps", value: 8214, date: "2026-11-06" }, NOW);
      const run = await createHabit(s, { title: "Morning run" });
      await checkHabit(s, run.id, "2026-11-06");
      const bank = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 50000 });
      await createTransaction(s, {
        accountId: bank.id,
        date: "2026-11-06",
        description: "Groceries",
        merchantName: "Groceries",
        amountCents: -4200,
        kind: "expense",
        categoryId: null,
        pending: false,
      });
      return [await dayClockData(s, TZ, NOW, { money: true }), await dayClockData(s, TZ, NOW)];
    });
    const by = Object.fromEntries(data.items.map((i) => [i.title, i]));
    // done where it was done (Friday 10 AM), never late
    expect(by["Return library books"]).toMatchObject({ done: true, start: -1440 + 600, origin: "task", subtitle: "Done" });
    // a promise at its time, a kept one where it was kept; the broken one never shows
    expect(by["Study for the bio quiz"]).toMatchObject({ origin: "promise", icon: "🤞", start: 1200 });
    expect(by["Not eat out"]).toMatchObject({ origin: "promise", done: true, subtitle: "Kept", start: -1440 + 21 * 60 + 30 });
    expect(data.items.some((i) => /gym/i.test(i.title))).toBe(false);
    // Friday's recap, at the end of Friday, from real records only
    const friday = data.items.find((i) => i.id === "day:2026-11-06");
    expect(friday).toMatchObject({ origin: "day", when: "Friday", icon: "😴", title: "Slept 7h 30m · 8,214 steps", start: -1440 + 1438 });
    expect(friday?.subtitle).toBe("Slept 7h 30m · 8,214 steps · Morning run · Spent $42");
    // no recap for a day with nothing in it, and none for today (it isn't over)
    expect(data.items.some((i) => i.id === "day:2026-11-05" || i.id === "day:2026-11-07")).toBe(false);
    // with the Money lock on, the recap says nothing about money
    expect(locked.items.find((i) => i.id === "day:2026-11-06")?.subtitle).toBe("Slept 7h 30m · 8,214 steps · Morning run");
  });

  it("puts pinned goals and milestones on the line by their day, with the emoji they were pinned with", async () => {
    const { run } = await makeUser("Pin Owner");
    const data = await run(async (s) => {
      await createPersonalGoal(s, { title: "🎯 Run a 10k", targetDate: "2026-11-09" });
      await createPersonalGoal(s, { title: "Far-off goal", targetDate: "2027-06-01" });
      await createMilestone(s, { title: "🎂 Turned 20", when: "2026-11-05" });
      return dayClockData(s, TZ, NOW);
    });
    const goal = data.items.find((i) => i.title === "Run a 10k");
    expect(goal).toMatchObject({ icon: "🎯", allDay: true, kind: "due", start: 2 * 1440, href: "/goals" });
    const story = data.items.find((i) => i.title === "Turned 20");
    expect(story).toMatchObject({ icon: "🎂", allDay: true, start: -2 * 1440, href: "/milestones", source: "From your milestones" });
    // The line is the whole timeline: a goal months away is on it, at its day.
    expect(data.items.find((i) => i.title === "Far-off goal")).toMatchObject({ start: 206 * 1440, origin: "goal" });
  });

  it("keeps undated to-dos and goals under Someday, and older milestones at their day", async () => {
    const { run } = await makeUser("Someday Owner");
    const data = await run(async (s) => {
      await createTask(s, TZ, { title: "📞 Call the bank", priority: "medium" });
      await createPersonalGoal(s, { title: "Learn to swim" });
      await createMilestone(s, { title: "🎓 Started college", when: "2024-08-26" });
      return dayClockData(s, TZ, NOW);
    });
    expect(data.items.find((i) => i.title === "Call the bank")).toMatchObject({ someday: true, icon: "📞", origin: "task" });
    expect(data.items.find((i) => i.title === "Learn to swim")).toMatchObject({ someday: true, origin: "goal" });
    expect(data.items.find((i) => i.title === "Started college")).toMatchObject({ icon: "🎓", start: -803 * 1440 });
  });

  it("brings in every to-do at its due time, and a reminder that rings well before as its own moment", async () => {
    const { run } = await makeUser("Todo Owner");
    const data = await run(async (s) => {
      await createTask(s, TZ, { title: "Renew passport", dueDate: "2026-12-20", priority: "medium" });
      await createTask(s, TZ, { title: "Return library books", dueDate: "2026-10-30", priority: "high" });
      await createTask(s, TZ, { title: "Lab write-up", dueDate: "2026-11-10", dueTime: "17:00", reminder: "1d", priority: "medium" });
      await createTask(s, TZ, { title: "Quick call", dueDate: "2026-11-08", dueTime: "10:00", reminder: "15m", priority: "medium" });
      return dayClockData(s, TZ, NOW);
    });
    const find = (id: string) => data.items.filter((i) => i.id.startsWith(id));
    // Weeks out and long overdue: still on the line, where they're due.
    expect(data.items.find((i) => i.title === "Renew passport")).toMatchObject({ start: 43 * 1440, allDay: true, origin: "task" });
    expect(data.items.find((i) => i.title === "Return library books")).toMatchObject({ start: -8 * 1440, origin: "task" });
    // A day-before reminder is a moment of its own (Done works on it); a 15-minute one is just the to-do.
    const reminders = find("remind:");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ title: "Lab write-up", icon: "🔔", origin: "reminder", start: 2 * 1440 + 1020, allDay: false });
    expect(reminders[0].subtitle).toBe("Due Tue, Nov 10 at 5:00 PM");
    expect(reminders[0].ref).toBe(data.items.find((i) => i.id.startsWith("task:") && i.title === "Lab write-up")?.ref);
  });

  it("keeps routine off the far line: a weekly class shows in the week, a one-off trip months out still shows", async () => {
    const { run } = await makeUser("Routine Owner");
    const data = await run(async (s) => {
      await createEvent(s, TZ, {
        title: "Chem lecture",
        date: "2026-11-02",
        startTime: "10:00",
        endTime: "11:00",
        kind: "class",
        recurrence: { freq: "weekly", byDay: [1, 3] },
      });
      await createEvent(s, TZ, { title: "Flight home", date: "2026-12-19", startTime: "07:00", endTime: "10:00", kind: "personal" });
      return dayClockData(s, TZ, NOW);
    });
    const lectures = data.items.filter((i) => i.title === "Chem lecture").map((i) => Math.floor(i.start / 1440));
    // Wed Nov 4 and Mon Nov 9 are in the week; the 16 more in the next two months are routine, so they stay off.
    expect(lectures).toEqual([-3, 2]);
    expect(data.items.find((i) => i.title === "Flight home")).toMatchObject({ icon: "✈️", start: 42 * 1440 + 420 });
  });

  it("with money shown: trial ends and money goals by their day, a month-only milestone said as its month", async () => {
    const { run } = await makeUser("Plans Owner");
    const [shown, hidden] = await run(async (s) => {
      const sub = await createRecurring(s, { name: "Streamly", amountCents: -1599, frequency: "monthly", nextDueDate: "2026-11-21", kind: "subscription" });
      await updateSubscription(s, sub.id, { trialEndsOn: "2026-11-20" });
      await createGoal(s, { name: "Spring break trip", targetCents: 80000, savedCents: 20000, targetDate: "2027-03-01" });
      await createMilestone(s, { title: "Moved to Boston", when: "2019-09" });
      return [await dayClockData(s, TZ, NOW, { money: true }), await dayClockData(s, TZ, NOW)];
    });
    expect(shown.items.find((i) => i.origin === "trial")).toMatchObject({ title: "Streamly trial ends", start: 13 * 1440, amountCents: 1599, cat: "other" });
    expect(shown.items.find((i) => i.origin === "money_goal")).toMatchObject({
      title: "Spring break trip",
      start: 114 * 1440,
      amountCents: 80000,
      subtitle: "$200 saved so far",
    });
    expect(shown.items.find((i) => i.title === "Moved to Boston")).toMatchObject({ when: "Sep 2019", origin: "milestone" });
    // Behind the Money lock: none of it.
    expect(hidden.items.some((i) => i.origin === "trial" || i.origin === "money_goal" || i.origin === "bill" || i.origin === "pay")).toBe(false);
  });

  it("is empty for someone with nothing connected or added, and never makes up steps", async () => {
    const { run } = await makeUser("New Person");
    const data = await run((s) => dayClockData(s, TZ, NOW));
    expect(data.items).toEqual([]);
    expect(data.steps).toBeNull();
    expect(data.sleepHours).toBeNull();
    expect(data.spentTodayCents).toBeNull();
    expect(data.empty).toBe(true);
  });
});
