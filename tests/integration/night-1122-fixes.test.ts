import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { notificationLog } from "@/server/db/schema";
import { collectSnapshot } from "@/server/briefing/collect";
import { allInsights } from "@/server/briefing/rules";
import { createEvent, findConflicts, getAgenda } from "@/server/services/calendar";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { DETECTORS } from "@/server/services/proactive/detectors";
import { openSlotTomorrow } from "@/server/services/proactive/reviews";
import { runDueSlot } from "@/server/services/proactive/engine";
import { makeUser, TZ } from "../helpers";

const mocks = vi.hoisted(() => ({ filed: vi.fn(async () => ({ filed: 0 })) }));
vi.mock("@/server/services/inbox/gmail", async (orig) => ({
  ...(await orig<typeof import("@/server/services/inbox/gmail")>()),
  fileFromGmail: mocks.filed,
}));

afterAll(closeDb);

/** Night audit 2026-11-22: a timed exam is busy time everywhere free time or a clash is worked out. */
describe("exams count as busy for every free-time and clash caller", () => {
  const NOW = localToInstant("2026-11-22", "09:00", TZ);

  it("findConflicts sees an event booked on a timed exam, and not one on a quiz, a deadline or an all-day exam", async () => {
    const { run } = await makeUser("Clash");
    await run(async (s) => {
      const course = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: "2026-11-24", dueTime: "10:00" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Quiz", kind: "quiz", dueDate: "2026-11-25", dueTime: "10:00" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Final", kind: "exam", dueDate: "2026-11-26" });
      for (const date of ["2026-11-24", "2026-11-25", "2026-11-26"])
        await createEvent(s, TZ, { title: `Study ${date}`, kind: "study", date, startTime: "10:30", endTime: "11:30" }, "manual");
    });
    const agenda = await run((s) => getAgenda(s, TZ, "2026-11-24", "2026-11-26", { now: NOW }));
    expect(findConflicts(agenda).map((c) => [c.a.title, c.b.title])).toEqual([["Midterm", "Study 2026-11-24"]]);
  });

  it("the briefing's rules and free minutes count the exam", async () => {
    const { run } = await makeUser("Briefing");
    await run(async (s) => {
      const course = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: "2026-11-23", dueTime: "10:00" });
      await createEvent(s, TZ, { title: "Study", kind: "study", date: "2026-11-23", startTime: "10:30", endTime: "11:30" }, "manual");
    });
    const snap = await run((s) => collectSnapshot(s, { name: "Briefing Person", timezone: TZ, preferences: {} }, NOW));
    const day = snap.freeMinutesByDay.find((d) => d.date === "2026-11-23")!;
    // 8 AM to 10 PM is 840 minutes; the exam (10 to noon) is busy and the study block sits inside it
    expect(day.minutes).toBe(840 - 120);
    expect(allInsights(snap).some((i) => i.id.startsWith("conflict-"))).toBe(true);
  });

  it("the study-block detector never puts its block on the exam", async () => {
    const { run } = await makeUser("Block");
    await run(async (s) => {
      const course = await createCourse(s, { name: "English", code: "ENG 101" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Essay", dueDate: "2026-11-04", dueTime: "23:59" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: "2026-11-02", dueTime: "09:00" });
      const job = await createEmployer(s, { name: "Cafe", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-03", startTime: "17:00", endTime: "22:00" });
    });
    const now = localToInstant("2026-11-02", "09:00", TZ);
    const out = await run((s) => DETECTORS.deadlineConflicts({ scope: s, tz: TZ, today: "2026-11-02", now }));
    const block = out.find((c) => c.kind === "deadline_conflict")?.action as { start: string };
    // 9 to 11 is the exam
    expect(block.start).toBe("11:00");
  });

  it("the habit slot for tomorrow skips the exam", async () => {
    const { run } = await makeUser("Habit slot");
    await run(async (s) => {
      const course = await createCourse(s, { name: "Biology", code: "BIO 101", meetingInfo: "Mon 3:00–4:00 PM" });
      await createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: "2026-11-23", dueTime: "09:00" });
    });
    const slot = await run((s) => openSlotTomorrow({ scope: s, tz: TZ, today: "2026-11-22", now: NOW }, 60, "09:00"));
    expect(slot).toEqual({ date: "2026-11-23", time: "11:00" });
  });
});

describe("a morning slot spent while idle does not use up the Gmail filing", () => {
  it("opening the app later that morning files on the next run, and only once", async () => {
    mocks.filed.mockClear();
    const prefs = { gmailFiling: true, aiConsentAt: "2026-01-01T00:00:00.000Z" } as Parameters<typeof runDueSlot>[2];
    const { run, user } = await makeUser("Idle then open");
    await run((s) => runDueSlot(s, TZ, prefs, new Date("2026-11-10T14:00:00Z"), { scheduled: true, idle: true }));
    expect(mocks.filed).not.toHaveBeenCalled();
    await run((s) => runDueSlot(s, TZ, prefs, new Date("2026-11-10T15:00:00Z"), { scheduled: true, idle: false }));
    expect(mocks.filed).toHaveBeenCalledTimes(1);
    await run((s) => runDueSlot(s, TZ, prefs, new Date("2026-11-10T16:00:00Z"), { scheduled: true, idle: false }));
    expect(mocks.filed).toHaveBeenCalledTimes(1);
    const rows = await run((s) => s.tx.select().from(notificationLog).where(eq(notificationLog.userId, user.id)));
    expect(rows.filter((r) => r.key === "slot:2026-11-10:morning")).toHaveLength(1);
  });
});
