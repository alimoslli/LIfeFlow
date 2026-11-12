import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { pickClouds } from "@/lib/idea-clouds";
import { pickInsights } from "@/lib/insight-clouds";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createEvent } from "@/server/services/calendar";
import { createRecurring } from "@/server/services/finance/planning";
import { logHealth } from "@/server/services/health";
import { createHabit } from "@/server/services/habits";
import { cloudFacts, doCloud, ideaClouds, recordCloudTap } from "@/server/services/idea-clouds";
import { insightFacts } from "@/server/services/insight-facts";
import { PRODUCERS } from "@/server/services/insights";
import { saveMessage } from "@/server/services/proactive/engine";
import { respondToMessage } from "@/server/services/proactive/respond";
import { createTask, listTasks } from "@/server/services/tasks";
import { createEmployer, createShift } from "@/server/services/work";
import { createPromise } from "@/server/services/promises";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);

const TZ = "America/Chicago";
const prefsOf = async (id: string) => (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p;

describe("idea cloud facts come from the person's own records only", () => {
  it("a new account: nothing assumed, so only the clouds that fit anyone", async () => {
    const { user, run } = await makeUser("Fresh Start");
    const prefs = await prefsOf(user.id);
    const f = await run((s) => cloudFacts(s, TZ, prefs));
    expect(f).toMatchObject({ student: false, worker: false, dueSoon: false, bank: false, shifts: false, health: false, moneyLocked: false });
    expect(f.ageDays).toBe(0);
    expect(
      pickClouds(f, "Ray", 1, 14)
        .map((c) => c.key)
        .sort(),
    ).toEqual(["first_today", "free_time", "goal"]);
  });

  it("classes, a due date, a bank and the Money lock: study clouds yes, money clouds no", async () => {
    const { user, run } = await makeUser("Kai Busy");
    await run(async (s) => {
      const c = await createCourse(s, { name: "Biology" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab 4", dueDate: addDaysStr(todayIn(TZ), 2), dueTime: "23:59" });
      await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 10_000 });
    });
    await getDb()
      .update(users)
      .set({ preferences: { ...(await prefsOf(user.id)), moneyLock: { enabled: true, idleMinutes: 5 } } })
      .where(eq(users.id, user.id));
    const locked = await prefsOf(user.id);
    const f = await run((s) => cloudFacts(s, TZ, locked));
    expect(f).toMatchObject({ student: true, dueSoon: true, bank: true, moneyLocked: true, nextAssignment: "Lab 4" });
    const keys = pickClouds(f, "Ray", 1, 14).map((c) => c.key);
    expect(keys).toContain("plan_week");
    expect(keys).toContain("finished");
    expect(keys).not.toContain("afford");
    expect(keys).not.toContain("subscriptions");
  });

  it("a tap counts (never the text); a promise or goal already made counts as used", async () => {
    const { user, run } = await makeUser("Tap Tap");
    await run((s) => recordCloudTap(s, "free_time"));
    await run((s) => recordCloudTap(s, "free_time"));
    await run((s) => recordCloudTap(s, "not_a_cloud"));
    const p = await prefsOf(user.id);
    expect(p.ideaTaps).toEqual({ free_time: 2 });
    await run((s) => createPromise(s, TZ, { text: "study tonight" }));
    const f = await run((s) => cloudFacts(s, TZ, p));
    expect(f.used).toMatchObject({ free_time: true, promise: true, goal: false });
  });
});

describe("insight clouds come from the person's own rows (owner, 2026-11-12)", () => {
  // Wednesday 9 AM in Chicago
  const NOW = new Date("2026-11-11T15:00:00Z");
  const TODAY = "2026-11-11";

  async function busyStudent() {
    const made = await makeUser("Busy Student");
    await made.run(async (s) => {
      const bio = await createCourse(s, { name: "Biology" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Lab 4", dueDate: "2026-11-13", dueTime: "23:59" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Quiz 2", dueDate: "2026-11-12", dueTime: "09:00" });
      await createEvent(s, TZ, { title: "Biology", date: TODAY, startTime: "14:00", endTime: "15:00", kind: "class" });
      const job = await createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-12", startTime: "17:00", endTime: "22:00" });
      await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 62_000 });
      await createRecurring(s, { name: "Rent", amountCents: -85_000, frequency: "monthly", nextDueDate: "2026-11-13", kind: "bill" });
      await createTask(s, TZ, { title: "Call the bank", dueDate: "2026-11-10" });
      await createHabit(s, { title: "Stretch", cadence: "daily" });
      await logHealth(s, TZ, { metric: "sleep_hours", value: 5.2, date: TODAY }, NOW);
    });
    return made;
  }

  it("a busy student: a shortfall, a clash and the rest, each from a real row", async () => {
    const { user, run } = await busyStudent();
    const prefs = await prefsOf(user.id);
    const have = await run((s) => cloudFacts(s, TZ, prefs, NOW));
    const facts = await run((s) => insightFacts(s, TZ, have, NOW));
    const kinds = facts.map((f) => f.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["bill_short", "conflict", "due_soon", "free_before_class", "busy_day", "overdue_todos", "habits_left", "sleep"]),
    );
    expect(facts.find((f) => f.kind === "bill_short")).toMatchObject({ bill: "Rent", billCents: 85_000, cashCents: 62_000, dueDate: "2026-11-13" });
    expect(facts.find((f) => f.kind === "conflict")).toMatchObject({ assignment: "Lab 4", dueDay: "Friday" });
    expect(facts.find((f) => f.kind === "free_before_class")).toMatchObject({ hours: 5, classTime: "2 PM" });
    expect(facts.find((f) => f.kind === "overdue_todos")).toMatchObject({ total: 1, firstTitle: "Call the bank" });
    expect(facts.find((f) => f.kind === "sleep")).toMatchObject({ minutes: 312 });
    // the page's three: the shortfall first, then the clash, never two about the same thing
    const top = await run((s) => ideaClouds(s, TZ, prefs, "Ray", NOW));
    expect(top.map((c) => c.key)).toEqual(["insight:bill_short", "insight:conflict", "insight:due_soon"]);
    expect(top[0]).toMatchObject({ say: "Rent $850 Fri, you have $620", weather: "storm", cta: "Remind me to cover it", act: { type: "do" } });
    expect(top[1]).toMatchObject({ weather: "storm", cta: "Block Wed 9 AM" });
    // reading for Today records nothing: no message rows, so a push later still goes out
    expect(pickInsights(facts, { noteId: "overdraft" }).map((c) => c.key)).not.toContain("insight:bill_short");
  });

  it("the same person with the Money lock on: no money insight at all", async () => {
    const { user, run } = await busyStudent();
    await getDb()
      .update(users)
      .set({ preferences: { ...(await prefsOf(user.id)), moneyLock: { enabled: true, idleMinutes: 5 } } })
      .where(eq(users.id, user.id));
    const prefs = await prefsOf(user.id);
    const have = await run((s) => cloudFacts(s, TZ, prefs, NOW));
    const facts = await run((s) => insightFacts(s, TZ, have, NOW));
    const kinds = facts.map((f) => f.kind);
    for (const money of ["bill_short", "bill_due", "available", "spending_pace", "sub_overlap", "trial_ending", "sub_price_up"])
      expect(kinds).not.toContain(money);
    expect(kinds).toContain("conflict");
    const shown = (await run((s) => ideaClouds(s, TZ, prefs, "Ray", NOW))).map((c) => c.say).join(" | ");
    expect(shown).not.toMatch(/\$|Rent/);
  });

  it("a tap does the one fix through the same Do it path, with Undo; nothing sent can pick what runs", async () => {
    const { user, run } = await busyStudent();
    const prefs = await prefsOf(user.id);
    const clouds = await run((s) => ideaClouds(s, TZ, prefs, "Ray", NOW));
    const block = clouds.find((c) => c.cta === "Block Wed 9 AM")!;
    expect(block.act?.type).toBe("do");
    const u = { id: user.id, timezone: TZ, preferences: prefs };
    const r = await run((s) => doCloud(s, u, (block.act as { ref: string }).ref, NOW));
    expect(r.text).toMatch(/Blocked .* for "Work on Lab 4"/);
    const events = await run((s) =>
      import("@/server/services/calendar").then((m) => m.getAgenda(s, TZ, "2026-11-11", "2026-11-11", { include: ["event"], now: NOW })),
    );
    expect(events.map((e) => e.title)).toContain("Work on Lab 4");
    // tapping again does not add a second one
    expect((await run((s) => doCloud(s, u, (block.act as { ref: string }).ref, NOW))).id).toBe(r.id);
    expect(
      (
        await run((s) => import("@/server/services/calendar").then((m) => m.getAgenda(s, TZ, "2026-11-11", "2026-11-11", { include: ["event"], now: NOW })))
      ).filter((e) => e.title === "Work on Lab 4"),
    ).toHaveLength(1);
    // Undo is the usual one
    await run((s) => respondToMessage(s, u, r.id, "undo", "2026-11-11"));
    expect(
      (
        await run((s) => import("@/server/services/calendar").then((m) => m.getAgenda(s, TZ, "2026-11-11", "2026-11-11", { include: ["event"], now: NOW })))
      ).map((e) => e.title),
    ).not.toContain("Work on Lab 4");
    // a made-up key, or a fix the records don't show, does nothing
    await expect(run((s) => doCloud(s, u, "move_tasks:everything", NOW))).rejects.toThrow(/changed/);
    expect(await run((s) => listTasks(s, { status: "open" }))).toHaveLength(1);
  });

  it("producers added later work through the same tap: a 'block' and a filed 'message', each with Undo", async () => {
    const { user, run } = await makeUser("Late Producer");
    const u = { id: user.id, timezone: TZ, preferences: await prefsOf(user.id) };
    const filed = await run((s) =>
      saveMessage(
        s,
        {
          kind: "task_streak",
          topic: "habits",
          dedupeKey: "t:1",
          facts: { headline: "x", text: "y" },
          action: { type: "create_task", label: "Add", title: "Stretch" },
          priority: 50,
        },
        "friend",
        false,
        "t",
      ),
    );
    const producer = async () => [
      {
        key: "p:block",
        kind: "study_block",
        tone: "heads_up" as const,
        headline: "Study block",
        why: "Free 7 to 9",
        source: "test",
        rank: 50,
        action: { label: "Block 7", doIt: { kind: "block", payload: { block: { date: "2026-11-11", start: "19:00", end: "21:00", title: "Study" } } } },
      },
      {
        key: "p:msg",
        kind: "task_streak",
        tone: "tip" as const,
        headline: "Msg",
        why: "w",
        source: "test",
        rank: 40,
        action: { label: "Do it", doIt: { kind: "message", payload: { messageId: filed!.id } } },
      },
    ];
    PRODUCERS.push(producer);
    try {
      const b = await run((s) => doCloud(s, u, "p:block", NOW));
      expect(b.text).toMatch(/Blocked .* for "Study"/);
      await run((s) => respondToMessage(s, u, b.id, "undo", "2026-11-11"));
      const m = await run((s) => doCloud(s, u, "p:msg", NOW));
      expect(m.id).toBe(filed!.id);
      expect(m.text).toMatch(/Added the to-do "Stretch"/);
      await expect(run((s) => doCloud(s, u, "p:nope", NOW))).rejects.toThrow(/changed/);
    } finally {
      PRODUCERS.pop();
    }
  });

  it("an account with nothing: a couple of calm tips, so the sky is never empty", async () => {
    const { user, run } = await makeUser("Nothing Yet");
    const prefs = await prefsOf(user.id);
    const have = await run((s) => cloudFacts(s, TZ, prefs, NOW));
    expect(await run((s) => insightFacts(s, TZ, have, NOW))).toEqual([]);
    const shown = await run((s) => ideaClouds(s, TZ, prefs, "Ray", NOW));
    expect(shown).toHaveLength(2);
    for (const c of shown) expect(c).toMatchObject({ weather: "tip", cta: "Try it" });
    expect(shown.some((c) => c.key.startsWith("insight:"))).toBe(false);
  });
});
