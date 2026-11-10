import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, dayOfWeek, localDateOf, localTimeOf } from "@/lib/dates";
import { calendarEvents, workShifts } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { createEvent, findConflicts, getAgenda } from "./calendar";
import { ASSIGNMENT_KINDS, createCourse, importAssignments, resolveCourse } from "./school";
import { createEmployer, createShift, listEmployers, shiftInstants } from "./work";

/**
 * A whole schedule told at once ("BIO 110 Mon Wed Fri 10 to 10:50, I work at Campus Coffee Mondays 4 to 9, my exam is
 * Thursday"), saved in one go from the same services the single-item paths use. Classes and jobs that already exist
 * are found by name, and nothing is added twice, so telling it again is safe. It never guesses: a class name that
 * could be two courses comes back in `unclear`, a due date without a known course in `needsCourse`.
 */

const DAYS = z.array(z.number().int().min(0).max(6)).min(1).max(7);
const TIME = z.string().regex(TIME_RE);
const DATE = z.string().regex(DATE_RE);

/** Weekly shifts are filled this many weeks ahead, like a job's regular hours (work.ts). */
const WEEKS_AHEAD = 3;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const scheduleSetupSchema = z.object({
  classes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        days: DAYS,
        startTime: TIME,
        endTime: TIME,
        location: z.string().trim().max(200).nullish(),
        until: DATE.nullish(),
      }),
    )
    .max(12)
    .default([]),
  jobs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        hourlyRateCents: z.number().int().min(0).max(1_000_000).nullish(),
        weekly: z
          .array(z.object({ days: DAYS, startTime: TIME, endTime: TIME }))
          .max(7)
          .default([]),
        shifts: z
          .array(z.object({ date: DATE, startTime: TIME, endTime: TIME }))
          .max(40)
          .default([]),
      }),
    )
    .max(4)
    .default([]),
  deadlines: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        courseName: z.string().trim().max(200).nullish(),
        kind: z.enum(ASSIGNMENT_KINDS).default("assignment"),
        dueDate: DATE,
        dueTime: TIME.nullish(),
      }),
    )
    .max(60)
    .default([]),
});
export type ScheduleSetupInput = z.input<typeof scheduleSetupSchema>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const dayList = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);
const meets = (c: { days: number[]; startTime: string; endTime: string }) =>
  `${dayList(c.days)
    .map((d) => DAY_NAMES[d])
    .join("/")} ${c.startTime} to ${c.endTime}`;

/** The first day from `today` on that falls on one of `days`. */
function firstOn(today: string, days: number[]) {
  for (let i = 0; i < 7; i++) if (days.includes(dayOfWeek(addDaysStr(today, i)))) return addDaysStr(today, i);
  return today;
}

export async function setUpSchedule(scope: UserScope, tz: string, input: ScheduleSetupInput, opts: { now?: Date } = {}) {
  const d = scheduleSetupSchema.parse(input);
  const now = opts.now ?? new Date();
  const today = localDateOf(now, tz);

  // ---- classes: the course (found by name, or new) and its weekly meeting on the calendar
  const classes: { course: string; courseId: string; meets: string; newCourse: boolean; alreadyOnCalendar: boolean; daysAdded: number[] }[] = [];
  const unclear: { name: string; couldBe: string[] }[] = [];
  for (const c of d.classes) {
    const found = await resolveCourse(scope, { courseName: c.name });
    if (!found.course && found.candidates.length) {
      unclear.push({ name: c.name, couldBe: found.candidates.map((x) => x.name) });
      continue;
    }
    const course = found.course ?? (await createCourse(scope, { name: c.name, meetingInfo: meets(c), location: c.location ?? undefined }, "jarvis"));
    const days = dayList(c.days);
    const weekly = await scope.tx
      .select({ startsAt: calendarEvents.startsAt, recurrence: calendarEvents.recurrence })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, scope.userId),
          eq(calendarEvents.courseId, course.id),
          eq(calendarEvents.kind, "class"),
          isNotNull(calendarEvents.recurrence),
        ),
      );
    // the days this class already meets at this hour; only the missing ones are added (MW there + "MWF" adds Friday)
    const covered = new Set(weekly.filter((e) => localTimeOf(e.startsAt, tz) === c.startTime).flatMap((e) => e.recurrence?.byDay ?? []));
    const missing = days.filter((x) => !covered.has(x));
    const alreadyOnCalendar = missing.length === 0;
    if (!alreadyOnCalendar) {
      await createEvent(
        scope,
        tz,
        {
          title: course.name,
          date: firstOn(today, missing),
          startTime: c.startTime,
          endTime: c.endTime,
          kind: "class",
          location: c.location ?? undefined,
          courseId: course.id,
          recurrence: { freq: "weekly", byDay: missing, ...(c.until && { until: c.until }) },
        },
        "jarvis",
      );
    }
    classes.push({ course: course.name, courseId: course.id, meets: meets(c), newCourse: !found.course, alreadyOnCalendar, daysAdded: missing });
  }

  // ---- jobs: the job (found by name, or new), the shifts given, and each weekly pattern for the next three weeks
  const jobs: {
    job: string;
    jobId: string;
    newJob: boolean;
    shiftsAdded: number;
    shiftsAlreadyThere: number;
    through: string | null;
    /** A rate was given for a job that already has a different one: pay settings are never changed from here, so ask. */
    rateNotChanged?: { given: number; saved: number | null };
  }[] = [];
  const unclearJobs: { name: string; couldBe: string[] }[] = [];
  const known = await listEmployers(scope);
  const until = addDaysStr(today, WEEKS_AHEAD * 7 - 1);
  for (const j of d.jobs) {
    const key = norm(j.name);
    // the same job by its exact name; a name that is only close to one ("Target" and "Target Optical") or says
    // nothing is asked about, never guessed, so no shift lands at the wrong job
    let job = key ? known.find((e) => norm(e.name) === key) : undefined;
    const near = key ? known.filter((e) => norm(e.name) !== key && (norm(e.name).includes(key) || key.includes(norm(e.name)))) : [];
    if (!key || (!job && near.length)) {
      unclearJobs.push({ name: j.name, couldBe: near.map((e) => e.name) });
      continue;
    }
    const newJob = !job;
    if (!job) {
      job = await createEmployer(scope, { name: j.name, payType: "hourly", hourlyRateCents: j.hourlyRateCents ?? null }, "jarvis");
      known.push(job);
    }
    const wanted = [...j.shifts];
    for (const w of j.weekly)
      for (let day = today; day <= until; day = addDaysStr(day, 1))
        if (w.days.includes(dayOfWeek(day))) wanted.push({ date: day, startTime: w.startTime, endTime: w.endTime });
    let shiftsAdded = 0;
    let shiftsAlreadyThere = 0;
    if (wanted.length) {
      const spans = wanted.map((w) => ({ ...w, ...shiftInstants(w.date, w.startTime, w.endTime, tz) }));
      const first = new Date(Math.min(...spans.map((s) => s.startsAt.getTime())));
      const last = new Date(Math.max(...spans.map((s) => s.startsAt.getTime())));
      const have = await scope.tx
        .select({ startsAt: workShifts.startsAt, status: workShifts.status })
        .from(workShifts)
        .where(and(eq(workShifts.userId, scope.userId), eq(workShifts.employerId, job.id), gte(workShifts.startsAt, first), lte(workShifts.startsAt, last)));
      const taken = new Set(have.filter((h) => h.status !== "cancelled").map((h) => h.startsAt.getTime()));
      // a shift the person cancelled stays cancelled: a weekly pattern sent again doesn't bring it back
      const cancelled = new Set(have.filter((h) => h.status === "cancelled").map((h) => h.startsAt.getTime()));
      for (const s of spans) {
        // a weekly shift that already started today isn't added; a dated one the person gave always is
        const fromWeekly = !j.shifts.some((x) => x.date === s.date && x.startTime === s.startTime);
        if (fromWeekly && (s.startsAt.getTime() <= now.getTime() || cancelled.has(s.startsAt.getTime()))) continue;
        if (taken.has(s.startsAt.getTime())) {
          shiftsAlreadyThere++;
          continue;
        }
        await createShift(scope, tz, { employerId: job.id, date: s.date, startTime: s.startTime, endTime: s.endTime }, "jarvis");
        taken.add(s.startsAt.getTime());
        shiftsAdded++;
      }
    }
    const rateNotChanged =
      !newJob && j.hourlyRateCents != null && j.hourlyRateCents !== job.hourlyRateCents
        ? { given: j.hourlyRateCents, saved: job.hourlyRateCents ?? null }
        : undefined;
    jobs.push({
      job: job.name,
      jobId: job.id,
      newJob,
      shiftsAdded,
      shiftsAlreadyThere,
      through: j.weekly.length ? until : null,
      ...(rateNotChanged && { rateNotChanged }),
    });
  }

  // ---- exams and due dates, through the same import the syllabus reader uses (never guesses a course)
  const deadlines = d.deadlines.length
    ? await importAssignments(
        scope,
        tz,
        d.deadlines.map((x) => ({ title: x.title, courseName: x.courseName ?? undefined, kind: x.kind, dueDate: x.dueDate, dueTime: x.dueTime ?? undefined })),
        { source: "jarvis", now },
      )
    : { created: [], duplicates: [], needsCourse: [], errors: [], warnings: [] };

  // ---- what now overlaps in the next 7 days, from the saved records
  const agenda = await getAgenda(scope, tz, today, addDaysStr(today, 6), { include: ["event", "shift"], now });
  const seen = new Set<string>();
  const conflicts: { a: string; b: string; date: string; at: string }[] = [];
  for (const c of findConflicts(agenda)) {
    const later = c.a.startsAt > c.b.startsAt ? c.a : c.b;
    const date = localDateOf(later.startsAt, tz);
    const k = `${c.a.title}|${c.b.title}|${date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    conflicts.push({ a: c.a.title, b: c.b.title, date, at: localTimeOf(later.startsAt, tz) });
  }

  return { classes, unclear, unclearJobs, jobs, deadlines, conflicts };
}
