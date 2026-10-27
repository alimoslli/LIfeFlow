import { z } from "zod";
import { formatIn } from "@/lib/dates";
import { createEmployer, createShift, listEmployers, listShifts, recordShiftHours, workSummary } from "../../services/work";
import { centsToDollarsDeep } from "./finance";
import { dateArg, defineTool, idArg, moneyArg, timeArg, toCents } from "../tool";

export const workTools = [
  defineTool({
    name: "list_jobs",
    description: "The user's employers/jobs with pay rates.",
    schema: z.object({}),
    mutates: false,
    async execute(_a, ctx) {
      const rows = await ctx.run((s) => listEmployers(s));
      return centsToDollarsDeep({ jobs: rows.map((e) => ({ id: e.id, name: e.name, position: e.position, payType: e.payType, hourlyRateCents: e.hourlyRateCents, overtimeAfterHours: Number(e.overtimeThresholdHours) })) });
    },
  }),
  defineTool({
    name: "add_job",
    description: "Add an employer/job.",
    schema: z.object({ name: z.string().min(1).max(200), position: z.string().max(120).optional(), hourlyRate: moneyArg("Hourly rate").optional() }),
    mutates: true,
    async execute(a, ctx) {
      const e = await ctx.run((s) => createEmployer(s, { name: a.name, position: a.position, payType: "hourly", hourlyRateCents: a.hourlyRate != null ? toCents(a.hourlyRate) : null }, "jarvis"));
      return { created: { id: e.id, name: e.name }, viewAt: "/work" };
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
      return { shifts: rows.map((r) => ({ id: r.id, job: r.employer.name, scheduledStart: f(r.startsAt), scheduledEnd: f(r.endsAt), breakMinutes: r.breakMinutes, recordedStart: f(r.recordedStart), recordedEnd: f(r.recordedEnd), status: r.status })) };
    },
  }),
  defineTool({
    name: "add_shifts",
    description: "Add scheduled work shifts. End time before start time means the shift ends the next day.",
    schema: z.object({
      shifts: z
        .array(z.object({ jobId: idArg("Job"), date: dateArg(), startTime: timeArg(), endTime: timeArg(), breakMinutes: z.number().int().min(0).max(240).optional(), notes: z.string().max(500).optional() }))
        .min(1)
        .max(60),
    }),
    mutates: true,
    async execute({ shifts }, ctx) {
      const created = await ctx.run(async (s) => {
        const out = [];
        for (const sh of shifts) {
          const r = await createShift(s, ctx.tz, { employerId: sh.jobId, date: sh.date, startTime: sh.startTime, endTime: sh.endTime, breakMinutes: sh.breakMinutes ?? 0, notes: sh.notes }, "jarvis");
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
    name: "work_earnings",
    description: "Hours and ESTIMATED gross earnings per job for a range (uses recorded punches when available, else schedule). Not actual pay — actual pay comes from paychecks/deposits.",
    schema: z.object({ from: dateArg(), to: dateArg() }),
    mutates: false,
    async execute(a, ctx) {
      return centsToDollarsDeep({ range: a, jobs: await ctx.run((s) => workSummary(s, ctx.tz, a.from, a.to)) });
    },
  }),
];
