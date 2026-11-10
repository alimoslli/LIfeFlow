import { z } from "zod";
import { ASSIGNMENT_KINDS } from "../../services/school";
import { setUpSchedule } from "../../services/schedule-setup";
import { dateArg, defineTool, moneyArg, timeArg } from "../tool";

const days = z.array(z.number().int().min(0).max(6)).min(1).max(7).describe("Weekdays, 0=Sunday … 6=Saturday");

export const setupTools = [
  defineTool({
    name: "set_up_schedule",
    description:
      "Save a schedule the user tells you in one go, in ONE call: weekly classes, a job with its usual weekly shifts or dated shifts, and exams or due dates. " +
      "Classes and jobs that already exist are found by name and nothing is added twice, so do not look anything up or create courses or jobs first. " +
      "Use it whenever a message holds two or more of these; for a single item use that item's own tool. " +
      "Returns what was saved (saved: how many things), anything it could not place (unclear, unclearJobs, needsCourse: ask which one), a pay rate it did not change (rateNotChanged: ask), and the clashes in the next 7 days: always mention the clashes. " +
      'Only include times and dates the user gave; turn words like "Friday" into the date from today\'s date, and ask when a date is unclear.',
    schema: z.object({
      classes: z
        .array(
          z.object({
            name: z.string().min(1).max(200).describe('The class as the user calls it, e.g. "BIO 110"'),
            days,
            startTime: timeArg(),
            endTime: timeArg(),
            location: z.string().max(200).optional(),
            until: dateArg("Last day of class, only if stated").optional(),
          }),
        )
        .max(12)
        .optional(),
      jobs: z
        .array(
          z.object({
            name: z.string().min(1).max(200).describe('The employer, e.g. "Campus Coffee"'),
            hourlyRate: moneyArg("Hourly pay, only if stated").optional(),
            weekly: z
              .array(z.object({ days, startTime: timeArg(), endTime: timeArg() }))
              .max(7)
              .optional()
              .describe("Shifts that repeat every week (saved for the next 3 weeks)"),
            shifts: z
              .array(z.object({ date: dateArg(), startTime: timeArg(), endTime: timeArg() }))
              .max(40)
              .optional()
              .describe("Shifts on specific dates"),
          }),
        )
        .max(4)
        .optional(),
      deadlines: z
        .array(
          z.object({
            title: z.string().min(1).max(300),
            courseName: z.string().max(200).optional().describe("The class it belongs to, as the user calls it"),
            kind: z.enum(ASSIGNMENT_KINDS).optional(),
            dueDate: dateArg("Due date or exam date"),
            dueTime: timeArg("Local time HH:mm, only if stated").optional(),
          }),
        )
        .max(60)
        .optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run((s) =>
        setUpSchedule(
          s,
          ctx.tz,
          {
            classes: a.classes,
            jobs: a.jobs?.map(({ hourlyRate, ...j }) => ({ ...j, hourlyRateCents: hourlyRate != null ? Math.round(hourlyRate * 100) : undefined })),
            deadlines: a.deadlines,
          },
          { now: ctx.now },
        ),
      );
      // a link only when something was really saved; otherwise the counts say nothing was
      const saved =
        r.classes.filter((c) => !c.alreadyOnCalendar).length + r.jobs.reduce((n, j) => n + j.shiftsAdded + (j.newJob ? 1 : 0), 0) + r.deadlines.created.length;
      return { ...r, saved, ...(saved > 0 && { viewAt: "/calendar" }) };
    },
  }),
];
