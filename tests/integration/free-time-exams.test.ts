import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { getTool } from "@/server/jarvis/registry";
import { createEvent } from "@/server/services/calendar";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

/**
 * The AI Lab's find (COO, 2026-11-22): find_free_time read only events and shifts, so an exam from School left its time
 * "free" and the skyling could book a study block on top of the exam itself. A timed exam is busy for EXAM_BUSY_MINUTES;
 * a quiz, a plain deadline and an all-day exam never block time.
 */
describe("free time and clashes count exams as busy", () => {
  const DAY = "2026-11-24";
  const NOW = localToInstant("2026-11-22", "09:00", TZ);

  async function setUp() {
    const { user, run } = await makeUser("Exam Week");
    const ctx = { userId: user.id, tz: TZ, today: "2026-11-22", now: NOW, conversationId: "", userText: "", memorySuggestions: false, run };
    const call = (name: string, args: Record<string, unknown>) => getTool(name)!.execute(args as never, ctx) as Promise<Record<string, unknown>>;
    const course = await run((s) => createCourse(s, { name: "Biology", code: "BIO 101" }));
    return { run, call, course };
  }
  type Day = { date: string; free: { start: string; end: string }[] };

  it("find_free_time never offers the exam's time; a quiz, a deadline and an all-day exam leave it free", async () => {
    const { run, call, course } = await setUp();
    await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: DAY, dueTime: "10:00" }));
    await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Quiz 4", kind: "quiz", dueDate: DAY, dueTime: "14:00" }));
    await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Lab report", dueDate: DAY, dueTime: "16:00" }));
    await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Final", kind: "exam", dueDate: "2026-11-25" }));
    const out = (await call("find_free_time", { from: DAY, to: "2026-11-25", minMinutes: 45 })) as { days: Day[] };
    const [exam, allDay] = out.days;
    // 8 AM to 10 AM, then the exam (10 AM to noon) is busy, then free until 10 PM through the quiz and the deadline
    expect(exam.free).toEqual([
      { start: "08:00", end: "10:00", minutes: 120 },
      { start: "12:00", end: "22:00", minutes: 600 },
    ]);
    expect(exam.free.some((f) => f.start < "12:00" && f.end > "10:00")).toBe(false);
    // an exam with no time can't hold a time
    expect(allDay.free).toEqual([{ start: "08:00", end: "22:00", minutes: 840 }]);
  });

  it("create_events reports a study block put on top of the exam as a clash", async () => {
    const { run, call, course } = await setUp();
    await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Midterm", kind: "exam", dueDate: DAY, dueTime: "10:00" }));
    const out = (await call("create_events", {
      events: [{ title: "Study Biology", kind: "study", date: DAY, startTime: "11:00", endTime: "12:30" }],
    })) as { conflicts: { event: string; conflictsWith: string }[] };
    expect(out.conflicts).toEqual([expect.objectContaining({ event: "Study Biology", conflictsWith: "Midterm" })]);
  });

  it("a calendar exam event was already busy, and still is", async () => {
    const { run, call } = await setUp();
    await run((s) => createEvent(s, TZ, { title: "Chem exam", kind: "exam", date: DAY, startTime: "13:00", endTime: "15:00" }, "manual"));
    const out = (await call("find_free_time", { from: DAY, to: DAY, minMinutes: 45 })) as { days: Day[] };
    expect(out.days[0].free).toEqual([
      { start: "08:00", end: "13:00", minutes: 300 },
      { start: "15:00", end: "22:00", minutes: 420 },
    ]);
  });
});
