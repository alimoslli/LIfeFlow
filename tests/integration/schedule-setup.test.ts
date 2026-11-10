import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { getAgenda } from "@/server/services/calendar";
import { setUpSchedule } from "@/server/services/schedule-setup";
import { createCourse, listAssignments, listCourses } from "@/server/services/school";
import { createEmployer, listEmployers, listShifts, setShiftStatus } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Monday 8 AM in New York.
const NOW = new Date("2026-11-09T13:00:00Z");
const WEEK = {
  classes: [
    { name: "BIO 110", days: [1, 3, 5], startTime: "10:00", endTime: "10:50" },
    { name: "ENG 102", days: [2, 4], startTime: "13:00", endTime: "14:15" },
  ],
  jobs: [
    {
      name: "Campus Coffee",
      weekly: [
        { days: [1], startTime: "16:00", endTime: "21:00" },
        { days: [6], startTime: "09:00", endTime: "15:00" },
      ],
    },
  ],
  deadlines: [
    { title: "BIO exam", courseName: "BIO 110", kind: "exam" as const, dueDate: "2026-11-12", dueTime: "10:00" },
    { title: "Essay draft", courseName: "ENG 102", dueDate: "2026-11-11", dueTime: "23:59" },
  ],
};

describe("a whole schedule told at once is saved in one go", () => {
  it("creates the classes with their weekly meetings, the job with three weeks of shifts, and the due dates", async () => {
    const { run } = await makeUser();
    const r = await run((s) => setUpSchedule(s, TZ, WEEK, { now: NOW }));

    expect(r.classes).toMatchObject([
      { course: "BIO 110", meets: "Mon/Wed/Fri 10:00 to 10:50", newCourse: true, alreadyOnCalendar: false },
      { course: "ENG 102", meets: "Tue/Thu 13:00 to 14:15", newCourse: true, alreadyOnCalendar: false },
    ]);
    // Mondays 16:00 (today's hasn't started) and Saturdays, three weeks ahead: 3 + 3
    expect(r.jobs).toMatchObject([{ job: "Campus Coffee", newJob: true, shiftsAdded: 6, shiftsAlreadyThere: 0, through: "2026-11-29" }]);
    expect(r.deadlines.created.map((c) => c.title).sort()).toEqual(["BIO exam", "Essay draft"]);
    expect(r.deadlines.needsCourse).toEqual([]);
    expect(r.unclear).toEqual([]);
    expect(r.conflicts).toEqual([]);

    const week = await run((s) => getAgenda(s, TZ, "2026-11-09", "2026-11-15", { include: ["event", "shift"], now: NOW }));
    expect(week.filter((i) => i.title === "BIO 110")).toHaveLength(3);
    expect(week.filter((i) => i.title === "ENG 102")).toHaveLength(2);
    expect(week.filter((i) => i.origin === "shift")).toHaveLength(2);
    expect((await run((s) => listAssignments(s, TZ, { view: "all", now: NOW }))).length).toBe(2);
  });

  it("telling it again adds nothing twice", async () => {
    const { run } = await makeUser();
    await run((s) => setUpSchedule(s, TZ, WEEK, { now: NOW }));
    const again = await run((s) => setUpSchedule(s, TZ, WEEK, { now: NOW }));

    expect(again.classes).toMatchObject([
      { course: "BIO 110", newCourse: false, alreadyOnCalendar: true },
      { course: "ENG 102", newCourse: false, alreadyOnCalendar: true },
    ]);
    expect(again.jobs).toMatchObject([{ newJob: false, shiftsAdded: 0, shiftsAlreadyThere: 6 }]);
    expect(again.deadlines.created).toEqual([]);
    expect(again.deadlines.duplicates).toHaveLength(2);

    expect(await run((s) => listCourses(s))).toHaveLength(2);
    expect(await run((s) => listEmployers(s))).toHaveLength(1);
    expect(await run((s) => listShifts(s, TZ, "2026-11-09", "2026-11-30"))).toHaveLength(6);
    const week = await run((s) => getAgenda(s, TZ, "2026-11-09", "2026-11-15", { include: ["event"], now: NOW }));
    expect(week).toHaveLength(5);
  });

  it("uses the class and the job that are already there, and reports what clashes this week", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
      await createEmployer(s, { name: "Campus Coffee", payType: "hourly", hourlyRateCents: 1600 });
    });
    const r = await run((s) =>
      setUpSchedule(
        s,
        TZ,
        {
          classes: [{ name: "BIO 110", days: [4], startTime: "13:00", endTime: "14:15" }],
          jobs: [{ name: "campus coffee", shifts: [{ date: "2026-11-12", startTime: "12:00", endTime: "17:00" }] }],
        },
        { now: NOW },
      ),
    );
    expect(r.classes).toMatchObject([{ course: "Intro to Biology", newCourse: false }]);
    expect(r.jobs).toMatchObject([{ job: "Campus Coffee", newJob: false, shiftsAdded: 1, through: null }]);
    expect(await run((s) => listCourses(s))).toHaveLength(1);
    expect(await run((s) => listEmployers(s))).toHaveLength(1);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ date: "2026-11-12", at: "13:00" });
    expect([r.conflicts[0].a, r.conflicts[0].b].sort()).toEqual(["Intro to Biology", "Work · Campus Coffee"].sort());
  });

  it("never guesses: an unclear class and a due date with no known class come back to ask about", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      await createCourse(s, { name: "Biology I", code: "BIO 110" });
      await createCourse(s, { name: "Biology II", code: "BIO 111" });
    });
    const r = await run((s) =>
      setUpSchedule(
        s,
        TZ,
        {
          classes: [{ name: "Biology", days: [1], startTime: "09:00", endTime: "09:50" }],
          deadlines: [{ title: "Lab report", courseName: "Chemistry", dueDate: "2026-11-13" }],
        },
        { now: NOW },
      ),
    );
    expect(r.classes).toEqual([]);
    expect(r.unclear).toHaveLength(1);
    expect(r.unclear[0].couldBe.sort()).toEqual(["Biology I", "Biology II"]);
    expect(r.deadlines.created).toEqual([]);
    expect(r.deadlines.needsCourse).toMatchObject([{ title: "Lab report", courseName: "Chemistry" }]);
    expect(await run((s) => listCourses(s))).toHaveLength(2);
  });

  // independent review, 2026-11-10
  it("adds only the class days that are missing: MW already there and MWF told adds Friday", async () => {
    const { run } = await makeUser();
    await run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1, 3], startTime: "10:00", endTime: "10:50" }] }, { now: NOW }));
    const r = await run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1, 3, 5], startTime: "10:00", endTime: "10:50" }] }, { now: NOW }));
    expect(r.classes).toMatchObject([{ course: "BIO 110", alreadyOnCalendar: false, daysAdded: [5] }]);
    const week = await run((s) => getAgenda(s, TZ, "2026-11-09", "2026-11-15", { include: ["event"], now: NOW }));
    expect(week.filter((i) => i.title === "BIO 110")).toHaveLength(3);
  });

  it("never puts shifts at a job with a look-alike name, or at any job for a name that says nothing", async () => {
    const { run } = await makeUser();
    await run((s) => createEmployer(s, { name: "Target Optical", payType: "hourly", hourlyRateCents: 1500 }));
    const shift = { date: "2026-11-12", startTime: "12:00", endTime: "17:00" };
    const r = await run((s) =>
      setUpSchedule(
        s,
        TZ,
        {
          jobs: [
            { name: "Target", shifts: [shift] },
            { name: "!!!", shifts: [shift] },
          ],
        },
        { now: NOW },
      ),
    );
    expect(r.jobs).toEqual([]);
    expect(r.unclearJobs).toEqual([
      { name: "Target", couldBe: ["Target Optical"] },
      { name: "!!!", couldBe: [] },
    ]);
    expect(await run((s) => listEmployers(s))).toHaveLength(1);
    expect(await run((s) => listShifts(s, TZ, "2026-11-09", "2026-11-30"))).toHaveLength(0);
  });

  it("keeps a cancelled shift cancelled when the weekly pattern is sent again, and never changes a saved pay rate", async () => {
    const { run } = await makeUser();
    const job = { name: "Campus Coffee", hourlyRateCents: 1600, weekly: [{ days: [6], startTime: "09:00", endTime: "15:00" }] };
    await run((s) => setUpSchedule(s, TZ, { jobs: [job] }, { now: NOW }));
    const [first] = await run((s) => listShifts(s, TZ, "2026-11-09", "2026-11-15"));
    await run((s) => setShiftStatus(s, first.id, "cancelled"));
    const r = await run((s) => setUpSchedule(s, TZ, { jobs: [{ ...job, hourlyRateCents: 1800 }] }, { now: NOW }));
    expect(r.jobs).toMatchObject([{ shiftsAdded: 0, rateNotChanged: { given: 1800, saved: 1600 } }]);
    const shifts = await run((s) => listShifts(s, TZ, "2026-11-09", "2026-11-30", { includeCancelled: true }));
    expect(shifts).toHaveLength(3);
    expect(shifts.filter((x) => x.status === "cancelled")).toHaveLength(1);
    expect((await run((s) => listEmployers(s)))[0].hourlyRateCents).toBe(1600);
  });
});
