import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { assignments, calendarEvents, jarvisMessages, notificationLog, users } from "@/server/db/schema";
import type { UserScope } from "@/server/db/with-user";
import { createEvent } from "@/server/services/calendar";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction } from "@/server/services/finance/transactions";
import { createAssignment, createCourse } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { runDueSlot, runProactive } from "@/server/services/proactive/engine";
import { respondToMessage } from "@/server/services/proactive/respond";
import { collectSnapshot } from "@/server/briefing/collect";
import { skyInsights } from "@/server/services/sky-insights";
import { listInsights } from "@/server/services/insights";
import { makeUser, TZ } from "../helpers";

// Owner, 2026-11-12 (docs/backlog/2026-11-12-useful-sky.md): study blocks before exams, a head start for people who usually
// finish late (never naming it), the Sunday look at 6 PM skipped when empty, and the one ranked list Today reads.

afterAll(closeDb);

/** Tuesday Nov 17, 2026, 2 PM in New York. */
const NOW = localToInstant("2026-11-17", "14:00", TZ);
const at = (date: string, time: string) => localToInstant(date, time, TZ);
const sunday = (time: string) => at("2026-11-15", time);

/** Messages are saved with the database's clock; these tests run at fixed moments, so stamp them with that moment. */
const stamp = (run: Awaited<ReturnType<typeof makeUser>>["run"], when: Date) =>
  run((s) => s.tx.update(jarvisMessages).set({ createdAt: when }).where(eq(jarvisMessages.userId, s.userId)));

async function bio(s: UserScope) {
  return createCourse(s, { name: "Biology", code: "BIO 101" });
}

describe("study blocks before an exam", () => {
  it("offers the latest free time before it, once, and books it with Undo", async () => {
    const { user, run } = await makeUser("Exam Study");
    await run(async (s) => {
      const c = await bio(s);
      await createAssignment(s, TZ, { courseId: c.id, title: "Midterm", kind: "exam", dueDate: "2026-11-20", dueTime: "10:00" });
      // a full Thursday until 5 PM: the block goes after it, never during it
      await createEvent(s, TZ, { title: "Lab day", date: "2026-11-19", startTime: "09:00", endTime: "17:00", kind: "class" });
      // a quiz tomorrow is too close for a fresh offer
      await createAssignment(s, TZ, { courseId: c.id, title: "Quiz 3", kind: "quiz", dueDate: "2026-11-18", dueTime: "09:00" });
    });
    const out = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (m) => m.kind === "exam_study",
    );
    expect(out).toHaveLength(1);
    const [m] = out;
    expect(m.action).toEqual({ type: "block_time", label: "Block it", date: "2026-11-19", start: "17:00", end: "18:30", title: "Study for BIO 101 exam" });
    expect(m.title).toBe("BIO 101 exam Friday");
    expect(m.body).toContain("Thursday at 5 PM is free. Want me to block 90 minutes?");
    expect(m.priority).toBeGreaterThanOrEqual(75); // it matters: it's pushed

    // offered once, even if not answered
    const again = await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "evening", now: new Date(NOW.getTime() + 3600_000) }));
    expect(again.filter((x) => x.kind === "exam_study")).toEqual([]);

    // Block it, then Undo
    await run((s) => respondToMessage(s, user, m.id, "do", "2026-11-17"));
    const booked = await run((s) =>
      s.tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, user.id), eq(calendarEvents.kind, "study"))),
    );
    expect(booked.map((e) => e.title)).toEqual(["Study for BIO 101 exam"]);
    await run((s) => respondToMessage(s, user, m.id, "undo", "2026-11-17"));
    expect(await run((s) => s.tx.select().from(calendarEvents).where(eq(calendarEvents.kind, "study")))).toEqual([]);
  });

  it("keeps to their study hours, and skips an exam they already booked study time for", async () => {
    const { user, run } = await makeUser("Evening Study");
    await run(async (s) => {
      await s.tx
        .update(users)
        .set({ preferences: { studyTime: "evening" } })
        .where(eq(users.id, s.userId));
      const c = await bio(s);
      await createAssignment(s, TZ, { courseId: c.id, title: "Final", kind: "exam", dueDate: "2026-11-21", dueTime: "09:00" });
      const chem = await createCourse(s, { name: "Chemistry", code: "CHEM 110" });
      await createAssignment(s, TZ, { courseId: chem.id, title: "Unit test", kind: "exam", dueDate: "2026-11-21", dueTime: "13:00" });
      await createEvent(s, TZ, { title: "Study CHEM 110", date: "2026-11-19", startTime: "18:00", endTime: "19:00", kind: "study" });
    });
    const out = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (m) => m.kind === "exam_study",
    );
    expect(out).toHaveLength(1);
    expect(out[0].action).toMatchObject({ date: "2026-11-20", start: "17:00", end: "18:30", title: "Study for BIO 101 exam" });
  });

  it("says so as a storm when the days before it are full", async () => {
    const { user, run } = await makeUser("Full Week");
    await run(async (s) => {
      const c = await bio(s);
      await createAssignment(s, TZ, { courseId: c.id, title: "Midterm", kind: "exam", dueDate: "2026-11-19", dueTime: "10:00" });
      for (const d of ["2026-11-17", "2026-11-18"]) await createEvent(s, TZ, { title: "Shift", date: d, startTime: "08:00", endTime: "22:00", kind: "work" });
    });
    const [m] = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (x) => x.kind === "exam_study",
    );
    expect(m.facts).toMatchObject({ noFreeBlock: true });
    expect(m.action).toMatchObject({ type: "open", href: "/plan" });
    await stamp(run, NOW);
    const sky = await run(async (s) => skyInsights(s, await collectSnapshot(s, user, NOW), { moneyLocked: false }));
    expect(sky[0]).toMatchObject({ kind: "exam_study", weather: "storm" });
    // the general "exam coming" line steps aside for its own offer
    expect(sky.some((i) => i.id.startsWith("exam-"))).toBe(false);
  });
});

describe("a head start, only when it helps", () => {
  async function lateFinisher(s: UserScope, courseId: string) {
    for (const [i, d] of ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"].entries()) {
      const { assignment } = await createAssignment(s, TZ, { courseId, title: `Worksheet ${i + 1}`, kind: "assignment", dueDate: d, dueTime: "23:59" });
      // finished a couple of hours before it was due
      await s.tx
        .update(assignments)
        .set({ status: "done", completedAt: at(d, "21:30") })
        .where(eq(assignments.id, assignment.id));
    }
  }

  it("offers an earlier start for a big paper, without naming the habit", async () => {
    const { user, run } = await makeUser("Head Start");
    await run(async (s) => {
      const c = await bio(s);
      await lateFinisher(s, c.id);
      await createAssignment(s, TZ, { courseId: c.id, title: "Research paper", kind: "assignment", dueDate: "2026-11-23", dueTime: "23:59" });
    });
    const [m] = (await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }))).filter(
      (x) => x.kind === "start_earlier",
    );
    expect(m.action).toMatchObject({ type: "block_time", date: "2026-11-21", start: "09:00", end: "10:30", title: "Start Research paper" });
    expect(m.body).toContain("Research paper is due Monday. Starting Saturday at 9 AM leaves you 2 days of room. Want me to block 90 minutes then?");
    expect(`${m.title} ${m.body}`).not.toMatch(/usually|last minute|late|final 24|always|habit/i);
    expect(m.priority).toBeLessThan(75); // never pushed
  });

  it("stays quiet for someone who finishes early", async () => {
    const { user, run } = await makeUser("Early Bird");
    await run(async (s) => {
      const c = await bio(s);
      await createAssignment(s, TZ, { courseId: c.id, title: "Research paper", kind: "assignment", dueDate: "2026-11-23", dueTime: "23:59" });
    });
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "morning", now: NOW }));
    expect(out.filter((x) => x.kind === "start_earlier")).toEqual([]);
  });
});

describe("the Sunday look", () => {
  /** Sunday Nov 15, 2026 in New York. */
  const logged = (run: Awaited<ReturnType<typeof makeUser>>["run"]) =>
    run(async (s) => (await s.tx.select({ key: notificationLog.key }).from(notificationLog)).map((r) => r.key).filter((k) => k.endsWith(":sunday")));

  it("runs once from 6 PM, with a look ahead at next week", async () => {
    const { user, run } = await makeUser("Sunday Look");
    await run(async (s) => {
      const c = await bio(s);
      await createAssignment(s, TZ, { courseId: c.id, title: "Quiz 4", kind: "quiz", dueDate: "2026-11-18", dueTime: "09:00" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab report", kind: "lab", dueDate: "2026-11-19", dueTime: "23:59" });
      await createTask(s, TZ, { title: "Laundry", dueDate: "2026-11-14" });
    });
    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("17:30")));
    expect(await logged(run)).toEqual([]);
    expect(await run((s) => s.tx.select().from(jarvisMessages).where(eq(jarvisMessages.kind, "weekly_review")))).toEqual([]);

    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("18:05")));
    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("19:00")));
    expect(await logged(run)).toEqual(["slot:2026-11-15:sunday"]);
    const [review] = await run((s) => s.tx.select().from(jarvisMessages).where(eq(jarvisMessages.kind, "weekly_review")));
    const sections = review.facts.sections as { heading: string; lines: string[] }[];
    expect(sections.find((x) => x.heading === "Next week")?.lines).toEqual(["BIO 101 quiz Wednesday", "1 assignment due"]);
    // no bank connected: no "$0 spent" guess
    expect(sections.some((x) => x.heading === "Spending")).toBe(false);
    expect(review.body).not.toMatch(/\$/);
  });

  it("is skipped when there's nothing to say", async () => {
    const { user, run } = await makeUser("Quiet Week");
    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("18:30")));
    expect(await logged(run)).toEqual(["slot:2026-11-15:sunday"]);
    expect(await run((s) => s.tx.select().from(jarvisMessages).where(eq(jarvisMessages.kind, "weekly_review")))).toEqual([]);
  });

  it("is Today's note from Sunday evening through Monday, with its breakdown, and gone by Tuesday", async () => {
    const { user, run } = await makeUser("Sunday Card");
    await run((s) => createTask(s, TZ, { title: "Laundry", dueDate: "2026-11-14" }));
    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("18:10")));
    await stamp(run, sunday("18:10"));
    const top = (now: Date) =>
      run(async (s) => (await skyInsights(s, await collectSnapshot(s, user, now), { moneyLocked: false })).find((i) => i.kind === "weekly_review"));
    expect((await top(sunday("18:20")))?.sections?.map((x) => x.heading)).toEqual(expect.arrayContaining(["Wins", "Still open"]));
    expect(await top(at("2026-11-16", "21:00"))).toBeDefined();
    expect(await top(at("2026-11-17", "08:00"))).toBeUndefined();
  });
});

describe("the one list", () => {
  it("leaves money out while the Money lock is on, in stored messages and in Tonight's line", async () => {
    const { user, run } = await makeUser("Locked Sky");
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 50_000 });
      // the same charge twice: a storm while Money is open
      for (const d of ["2026-11-16", "2026-11-17"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "Target", merchantName: "Target", amountCents: -4218 });
    });
    const evening = localToInstant("2026-11-17", "17:00", TZ);
    await run((s) => runProactive({ scope: s, tz: TZ, prefs: user.preferences, trigger: "midday", now: evening }));
    await stamp(run, evening);
    const list = (locked: boolean) => run(async (s) => skyInsights(s, await collectSnapshot(s, user, evening), { moneyLocked: locked }));
    const open = await list(false);
    expect(open[0]).toMatchObject({ kind: "double_charge", weather: "storm", money: true });
    expect(open.find((i) => i.kind === "tonight")?.why).toMatch(/left after this week's bills/);
    const locked = await list(true);
    expect(locked.some((i) => i.money)).toBe(false);
    expect(locked.find((i) => i.kind === "tonight")?.why).not.toMatch(/\$/);
  });

  // COO review, 2026-11-12: the weekly review is "general" but says what was spent, the weekend pattern and a cap
  it("keeps the Sunday review's spending behind the Money lock, in the sky's list and in the clouds", async () => {
    const { user, run } = await makeUser("Locked Review");
    await run(async (s) => {
      const acct = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 90_000 });
      for (const d of ["2026-11-14", "2026-11-15", "2026-11-12"])
        await createTransaction(s, { accountId: acct.id, date: d, description: "Chipotle", merchantName: "Chipotle", amountCents: -2650 });
      await createTask(s, TZ, { title: "Laundry", dueDate: "2026-11-14" });
    });
    await run((s) => runDueSlot(s, TZ, user.preferences, sunday("18:10")));
    await stamp(run, sunday("18:10"));
    const [stored] = await run((s) => s.tx.select().from(jarvisMessages).where(eq(jarvisMessages.kind, "weekly_review")));
    // the review really says money, under a topic that isn't
    expect(stored.topic).toBe("general");
    expect(JSON.stringify([stored.body, stored.facts.sections])).toMatch(/\$\d/);

    const when = sunday("18:20");
    const sky = (locked: boolean) => run(async (s) => skyInsights(s, await collectSnapshot(s, user, when), { moneyLocked: locked }));
    const open = (await sky(false)).find((i) => i.kind === "weekly_review")!;
    expect(open.money).toBe(true);
    const locked = await sky(true);
    const review = locked.find((i) => i.kind === "weekly_review")!;
    // still there, with what isn't money
    expect(review.sections?.map((x) => x.heading)).toEqual(expect.arrayContaining(["Wins", "Still open"]));
    expect(review.money).toBe(false);
    expect(JSON.stringify(locked)).not.toMatch(/\$\s?\d|Spending/);

    const lockedPrefs = { ...user.preferences, moneyLock: { enabled: true } } as never;
    const clouds = await run((s) => listInsights(s, TZ, lockedPrefs, when));
    expect(clouds.some((i) => i.kind === "weekly_review")).toBe(true);
    expect(JSON.stringify(clouds)).not.toMatch(/\$\s?\d/);
  });
});
