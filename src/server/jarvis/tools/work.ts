import { z } from "zod";
import { formatIn } from "@/lib/dates";
import { and, eq } from "drizzle-orm";
import { workShifts } from "../../db/schema";
import { moveToTrash } from "../../services/trash";
import {
  addPaycheck,
  createEmployer,
  createShift,
  fillRegularShifts,
  listEmployers,
  listShifts,
  recordShiftHours,
  setShiftStatus,
  updateEmployer,
  updateShift,
  workSummary,
  workScheduleSchema,
} from "../../services/work";
import { scheduleLabel } from "@/lib/work-schedule";
import { centsToDollarsDeep } from "./finance";
import { dateArg, defineTool, idArg, moneyArg, timeArg, toCents } from "../tool";

const REGULAR_HOURS = workScheduleSchema.describe("Days 0=Sunday..6=Saturday, start and end as HH:MM (24h), optional unpaid breakMinutes");

export const workTools = [
  defineTool({
    name: "list_jobs",
    description: "The user's employers/jobs with pay rates.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listEmployers(s));
      return centsToDollarsDeep({
        jobs: rows.map((e) => ({
          id: e.id,
          name: e.name,
          position: e.position,
          payType: e.payType,
          hourlyRateCents: e.hourlyRateCents,
          overtimeAfterHours: Number(e.overtimeThresholdHours),
          regularHours: e.schedule ? scheduleLabel(e.schedule) : null,
        })),
      });
    },
  }),
  defineTool({
    name: "add_job",
    description: "Add an employer/job. For a fixed schedule (e.g. full-time Mon-Fri 8 to 5) pass regularHours; shifts then fill in 3 weeks ahead.",
    schema: z.object({
      name: z.string().min(1).max(200),
      position: z.string().max(120).optional(),
      hourlyRate: moneyArg("Hourly rate").optional(),
      regularHours: REGULAR_HOURS.optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run(async (s) => {
        const e = await createEmployer(
          s,
          {
            name: a.name,
            position: a.position,
            payType: "hourly",
            hourlyRateCents: a.hourlyRate != null ? toCents(a.hourlyRate) : null,
            schedule: a.regularHours ?? null,
          },
          "jarvis",
        );
        return { e, shiftsAdded: await fillRegularShifts(s, ctx.tz, ctx.today) };
      });
      return {
        created: { id: r.e.id, name: r.e.name, regularHours: r.e.schedule ? scheduleLabel(r.e.schedule) : null },
        shiftsAdded: r.shiftsAdded,
        viewAt: "/work",
      };
    },
  }),
  defineTool({
    name: "add_paycheck",
    description: "Record a paycheck the user received (actual pay deposited). Net pay is required; gross, hours and pay period are optional.",
    schema: z.object({
      jobId: idArg("Job id from list_jobs"),
      payDate: dateArg(),
      net: moneyArg("Net pay (take-home)"),
      gross: moneyArg("Gross pay").optional(),
      hours: z.number().min(0).max(1000).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      const p = await ctx.run((s) =>
        addPaycheck(
          s,
          { employerId: a.jobId, payDate: a.payDate, netCents: toCents(a.net), grossCents: a.gross != null ? toCents(a.gross) : null, hours: a.hours ?? null },
          "jarvis",
        ),
      );
      return centsToDollarsDeep({ saved: { id: p.id, payDate: p.payDate, netCents: p.netCents }, viewAt: "/work" });
    },
  }),
  defineTool({
    name: "set_regular_hours",
    description:
      "Set or clear a job's regular hours (same days and times every week). Replaces the upcoming days filled from the old hours; worked or hand-added shifts stay. Pass null to switch back to shifts that change week to week.",
    schema: z.object({ jobId: idArg("Job id from list_jobs"), regularHours: REGULAR_HOURS.nullable() }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run(async (s) => {
        const e = await updateEmployer(s, a.jobId, { schedule: a.regularHours });
        return { e, shiftsAdded: await fillRegularShifts(s, ctx.tz, ctx.today) };
      });
      return { job: r.e.name, regularHours: r.e.schedule ? scheduleLabel(r.e.schedule) : null, shiftsAdded: r.shiftsAdded, viewAt: "/work" };
    },
  }),
  defineTool({
    name: "list_shifts",
    description: "Scheduled and worked shifts in a date range (scheduled times and recorded punches are separate).",
    schema: z.object({ from: dateArg(), to: dateArg() }),
    mutates: false,
    async execute(a, ctx) {
      const rows = await ctx.run((s) => listShifts(s, ctx.tz, a.from, a.to));
      const f = (d: Date | null) => (d ? formatIn(d, ctx.tz, "yyyy-MM-dd HH:mm") : null);
      return {
        shifts: rows.map((r) => ({
          id: r.id,
          job: r.employer.name,
          scheduledStart: f(r.startsAt),
          scheduledEnd: f(r.endsAt),
          breakMinutes: r.breakMinutes,
          recordedStart: f(r.recordedStart),
          recordedEnd: f(r.recordedEnd),
          status: r.status,
        })),
      };
    },
  }),
  defineTool({
    name: "add_shifts",
    description: "Add scheduled work shifts. End time before start time means the shift ends the next day.",
    schema: z.object({
      shifts: z
        .array(
          z.object({
            jobId: idArg("Job"),
            date: dateArg(),
            startTime: timeArg(),
            endTime: timeArg(),
            breakMinutes: z.number().int().min(0).max(240).optional(),
            notes: z.string().max(500).optional(),
          }),
        )
        .min(1)
        .max(60),
    }),
    mutates: true,
    async execute({ shifts }, ctx) {
      const created = await ctx.run(async (s) => {
        const out = [];
        for (const sh of shifts) {
          const r = await createShift(
            s,
            ctx.tz,
            { employerId: sh.jobId, date: sh.date, startTime: sh.startTime, endTime: sh.endTime, breakMinutes: sh.breakMinutes ?? 0, notes: sh.notes },
            "jarvis",
          );
          out.push({ id: r.id, start: formatIn(r.startsAt, ctx.tz, "yyyy-MM-dd HH:mm"), end: formatIn(r.endsAt, ctx.tz, "yyyy-MM-dd HH:mm") });
        }
        return out;
      });
      return { created, viewAt: "/work" };
    },
  }),
  defineTool({
    name: "record_shift_hours",
    description: "Record actual clock-in/out times for a shift (marks it worked).",
    schema: z.object({ shiftId: idArg("Shift"), clockIn: timeArg(), clockOut: timeArg() }),
    mutates: true,
    async execute(a, ctx) {
      const r = await ctx.run((s) => recordShiftHours(s, ctx.tz, a.shiftId, { recordedStartTime: a.clockIn, recordedEndTime: a.clockOut }));
      return { updated: { id: r.id, status: r.status } };
    },
  }),
  defineTool({
    name: "update_shift",
    description: "Change a shift's date, start or end time, job, break or notes ('move my Friday shift to 2pm'). Reports any overlaps with other shifts.",
    schema: z.object({
      shiftId: idArg("Shift"),
      date: dateArg().optional(),
      startTime: timeArg().optional(),
      endTime: timeArg().optional(),
      employerId: idArg("Job").optional(),
      breakMinutes: z.number().int().min(0).max(600).optional(),
      notes: z.string().max(2000).nullable().optional(),
      status: z.enum(["scheduled", "worked", "cancelled"]).optional(),
    }),
    mutates: true,
    async execute(a, ctx) {
      return ctx.run(async (s) => {
        const { shiftId, status, ...patch } = a;
        const r = Object.keys(patch).length ? await updateShift(s, ctx.tz, shiftId, patch) : null;
        const row = status ? await setShiftStatus(s, shiftId, status) : r!.shift;
        return {
          updated: { id: row.id, starts: formatIn(row.startsAt, ctx.tz, "EEE MMM d h:mm a"), ends: formatIn(row.endsAt, ctx.tz, "h:mm a"), status: row.status },
          overlapsWithOtherShifts: r?.overlaps ?? 0,
          viewAt: "/work",
        };
      });
    },
  }),
  defineTool({
    name: "delete_shift",
    description: "Delete a shift (it goes to the trash and can be restored for 30 days). Requires the user's confirmation.",
    schema: z.object({ shiftId: idArg("Shift") }),
    mutates: true,
    async confirm({ shiftId }, ctx) {
      const [sh] = await ctx.run((s) =>
        s.tx
          .select()
          .from(workShifts)
          .where(and(eq(workShifts.id, shiftId), eq(workShifts.userId, s.userId))),
      );
      if (!sh) throw new Error("Shift not found.");
      return `Delete the shift on ${formatIn(sh.startsAt, ctx.tz, "EEE, MMM d, h:mm a")}?`;
    },
    async execute({ shiftId }, ctx) {
      const t = await ctx.run((s) => moveToTrash(s, "shift", shiftId));
      return { deleted: t.label, restorableFromTrash: true, viewAt: "/work" };
    },
  }),
  defineTool({
    name: "work_earnings",
    description:
      "Hours and ESTIMATED gross earnings per job for a range (uses recorded punches when available, else schedule). Not actual pay — actual pay comes from paychecks/deposits.",
    schema: z.object({ from: dateArg(), to: dateArg() }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep({ range: a, jobs: await ctx.run((s) => workSummary(s, ctx.tz, a.from, a.to)) });
    },
  }),
];
