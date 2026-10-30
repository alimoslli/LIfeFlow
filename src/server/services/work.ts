import { series } from "@/server/db/series";
import { and, asc, desc, eq, gt, gte, isNull, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { DATE_RE, TIME_RE, addDaysStr, dayOfWeek, localDateOf, localTimeOf, localToInstant, startOfLocalDay, weekStart } from "@/lib/dates";
import { employers, paychecks, workShifts, type DataSource, type WorkSchedule } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { assertOwned, notFound, ServiceError } from "./errors";

// ---------------------------------------------------------------- pure calculations

export type ShiftLike = {
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  breakPaid: boolean;
  recordedStart: Date | null;
  recordedEnd: Date | null;
  status: "scheduled" | "worked" | "cancelled";
};

const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000);

/** Paid minutes for one shift. Uses recorded punches when both exist, else the schedule. */
export function shiftPaidMinutes(s: ShiftLike): { minutes: number; basis: "recorded" | "scheduled" } {
  const recorded = !!(s.recordedStart && s.recordedEnd);
  const start = recorded ? s.recordedStart! : s.startsAt;
  const end = recorded ? s.recordedEnd! : s.endsAt;
  const gross = minutesBetween(start, end);
  const minutes = Math.max(0, gross - (s.breakPaid ? 0 : s.breakMinutes));
  return { minutes, basis: recorded ? "recorded" : "scheduled" };
}

export type EmployerRates = {
  payType: "hourly" | "salary";
  hourlyRateCents: number | null;
  overtimeThresholdHours: number;
  overtimeMultiplier: number;
};

export type EarningsEstimate = {
  shiftCount: number;
  scheduledHours: number;
  recordedHours: number;
  paidHours: number;
  regularHours: number;
  overtimeHours: number;
  estimatedGrossCents: number | null;
  basis: "recorded" | "scheduled" | "mixed" | "none";
  assumptions: string[];
};

/**
 * Estimates gross wages for hourly work. Overtime is computed per local
 * week (Mon–Sun) above the employer's threshold. This is an estimate before
 * taxes/deductions — it is never presented as actual pay.
 */
export function estimateEarnings(shifts: ShiftLike[], rates: EmployerRates, tz: string): EarningsEstimate {
  const active = shifts.filter((s) => s.status !== "cancelled");
  const byWeek = new Map<string, number>();
  let scheduled = 0;
  let recorded = 0;
  const bases = new Set<string>();
  for (const s of active) {
    const sched = Math.max(0, minutesBetween(s.startsAt, s.endsAt) - (s.breakPaid ? 0 : s.breakMinutes));
    scheduled += sched;
    const paid = shiftPaidMinutes(s);
    if (paid.basis === "recorded") recorded += paid.minutes;
    bases.add(paid.basis);
    const wk = weekStart(localDateOf(s.startsAt, tz));
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + paid.minutes);
  }
  let regular = 0;
  let overtime = 0;
  const threshold = rates.overtimeThresholdHours * 60;
  for (const mins of byWeek.values()) {
    regular += Math.min(mins, threshold);
    overtime += Math.max(0, mins - threshold);
  }
  const assumptions = ["Gross pay before taxes and deductions.", `Overtime above ${rates.overtimeThresholdHours}h/week at ${rates.overtimeMultiplier}x.`];
  let gross: number | null = null;
  if (rates.payType === "hourly" && rates.hourlyRateCents != null) {
    gross = Math.round((regular / 60) * rates.hourlyRateCents + (overtime / 60) * rates.hourlyRateCents * rates.overtimeMultiplier);
  } else {
    assumptions.push(rates.payType === "salary" ? "Salaried: hours do not change pay." : "No hourly rate set.");
  }
  const basis = bases.size === 0 ? "none" : bases.size === 2 ? "mixed" : ([...bases][0] as "recorded" | "scheduled");
  if (basis !== "recorded" && basis !== "none") assumptions.push("Some hours come from the schedule, not recorded punches.");
  const h = (m: number) => Math.round((m / 60) * 100) / 100;
  return {
    shiftCount: active.length,
    scheduledHours: h(scheduled),
    recordedHours: h(recorded),
    paidHours: h(regular + overtime),
    regularHours: h(regular),
    overtimeHours: h(overtime),
    estimatedGrossCents: gross,
    basis,
    assumptions,
  };
}

// ---------------------------------------------------------------- employers

export const workScheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: z.string().regex(TIME_RE),
  end: z.string().regex(TIME_RE),
  breakMinutes: z.number().int().min(0).max(240).optional(),
});

export const employerInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  position: z.string().trim().max(120).nullish(),
  payType: z.enum(["hourly", "salary"]).default("hourly"),
  hourlyRateCents: z.number().int().min(0).max(1_000_000).nullish(),
  annualSalaryCents: z.number().int().min(0).nullish(),
  overtimeThresholdHours: z.number().min(0).max(168).default(40),
  overtimeMultiplier: z.number().min(1).max(5).default(1.5),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullish(),
  /** Regular hours (full-time or a fixed part-time schedule). Null = shifts change week to week. */
  schedule: workScheduleSchema.nullish(),
});

export async function createEmployer(scope: UserScope, input: z.input<typeof employerInputSchema>, source: DataSource = "manual") {
  const d = employerInputSchema.parse(input);
  const [row] = await scope.tx
    .insert(employers)
    .values({
      ...d,
      userId: scope.userId,
      source,
      overtimeThresholdHours: String(d.overtimeThresholdHours),
      overtimeMultiplier: String(d.overtimeMultiplier),
      color: d.color ?? "#0f766e",
    })
    .returning();
  return row;
}

export async function updateEmployer(scope: UserScope, id: string, patch: Partial<z.input<typeof employerInputSchema>>) {
  const d = employerInputSchema.partial().parse(patch);
  const { overtimeThresholdHours, overtimeMultiplier, ...rest } = d;
  if (d.schedule !== undefined) {
    // New hours replace the future days filled from the old ones; worked, edited or added shifts stay.
    await scope.tx
      .delete(workShifts)
      .where(
        and(
          eq(workShifts.userId, scope.userId),
          eq(workShifts.employerId, id),
          eq(workShifts.source, "schedule"),
          eq(workShifts.status, "scheduled"),
          gt(workShifts.startsAt, new Date()),
        ),
      );
  }
  const [row] = await scope.tx
    .update(employers)
    .set({
      ...rest,
      ...(d.schedule !== undefined && { scheduleFilledThrough: null }),
      ...(overtimeThresholdHours !== undefined && { overtimeThresholdHours: String(overtimeThresholdHours) }),
      ...(overtimeMultiplier !== undefined && { overtimeMultiplier: String(overtimeMultiplier) }),
    })
    .where(and(eq(employers.id, id), eq(employers.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Employer");
  return row;
}

/** Jobs are archived, not deleted, so past shifts and pay keep their employer. */
export async function archiveEmployer(scope: UserScope, id: string, archived = true) {
  const [row] = await scope.tx
    .update(employers)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(employers.id, id), eq(employers.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Employer");
  return row;
}

export async function listEmployers(scope: UserScope) {
  return scope.tx
    .select()
    .from(employers)
    .where(and(eq(employers.userId, scope.userId), isNull(employers.archivedAt)))
    .orderBy(asc(employers.name));
}

export function ratesOf(e: typeof employers.$inferSelect): EmployerRates {
  return {
    payType: e.payType,
    hourlyRateCents: e.hourlyRateCents,
    overtimeThresholdHours: Number(e.overtimeThresholdHours),
    overtimeMultiplier: Number(e.overtimeMultiplier),
  };
}

// ---------------------------------------------------------------- shifts

export const shiftInputSchema = z.object({
  employerId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  breakMinutes: z.number().int().min(0).max(600).default(0),
  breakPaid: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
});

/** End times earlier than start times roll over to the next day (overnight shifts). */
export function shiftInstants(date: string, startTime: string, endTime: string, tz: string) {
  const startsAt = localToInstant(date, startTime, tz);
  const endDate = endTime <= startTime ? addDaysStr(date, 1) : date;
  return { startsAt, endsAt: localToInstant(endDate, endTime, tz) };
}

export async function createShift(
  scope: UserScope,
  tz: string,
  input: z.input<typeof shiftInputSchema>,
  source: DataSource = "manual",
  opts: { id?: string } = {},
) {
  const d = shiftInputSchema.parse(input);
  await assertOwned(scope, employers, d.employerId, "Employer");
  const { startsAt, endsAt } = shiftInstants(d.date, d.startTime, d.endTime, tz);
  if (endsAt.getTime() - startsAt.getTime() > 24 * 3600_000) throw new ServiceError("Shifts cannot exceed 24 hours.");
  const [row] = await scope.tx
    .insert(workShifts)
    .values({
      ...(opts.id && { id: opts.id }),
      userId: scope.userId,
      employerId: d.employerId,
      startsAt,
      endsAt,
      breakMinutes: d.breakMinutes,
      breakPaid: d.breakPaid,
      notes: d.notes ?? null,
      source,
    })
    .returning();
  return row;
}

/** Shifts that overlap [startsAt, endsAt), not counting `exceptId` or cancelled ones. */
async function overlapping(scope: UserScope, startsAt: Date, endsAt: Date, exceptId?: string) {
  const rows = await scope.tx
    .select({ id: workShifts.id, startsAt: workShifts.startsAt, endsAt: workShifts.endsAt, status: workShifts.status })
    .from(workShifts)
    .where(and(eq(workShifts.userId, scope.userId), lt(workShifts.startsAt, endsAt), gt(workShifts.endsAt, startsAt)));
  return rows.filter((r) => r.id !== exceptId && r.status !== "cancelled");
}

export const shiftPatchSchema = shiftInputSchema.partial().extend({ breakMinutes: z.number().int().min(0).max(600).optional() });

/** Edits a shift's job, date, times, break or notes. Returns any shifts it now overlaps. */
export async function updateShift(scope: UserScope, tz: string, id: string, input: z.input<typeof shiftPatchSchema>) {
  const d = shiftPatchSchema.parse(input);
  const [shift] = await scope.tx
    .select()
    .from(workShifts)
    .where(and(eq(workShifts.id, id), eq(workShifts.userId, scope.userId)));
  if (!shift) throw notFound("Shift");
  if (d.employerId) await assertOwned(scope, employers, d.employerId, "Employer");
  const date = d.date ?? localDateOf(shift.startsAt, tz);
  const start = d.startTime ?? localTimeOf(shift.startsAt, tz);
  const end = d.endTime ?? localTimeOf(shift.endsAt, tz);
  const { startsAt, endsAt } = shiftInstants(date, start, end, tz);
  if (endsAt.getTime() - startsAt.getTime() > 24 * 3600_000) throw new ServiceError("Shifts cannot exceed 24 hours.");
  const [row] = await scope.tx
    .update(workShifts)
    .set({
      startsAt,
      endsAt,
      ...(d.employerId && { employerId: d.employerId }),
      ...(d.breakMinutes != null && { breakMinutes: d.breakMinutes }),
      ...(d.notes !== undefined && { notes: d.notes ?? null }),
    })
    .where(eq(workShifts.id, id))
    .returning();
  return { shift: row, overlaps: (await overlapping(scope, startsAt, endsAt, id)).length };
}

/** How many other shifts a new one overlaps (shown as a warning, never blocked). */
export async function shiftOverlaps(scope: UserScope, shift: { id: string; startsAt: Date; endsAt: Date }) {
  return (await overlapping(scope, shift.startsAt, shift.endsAt, shift.id)).length;
}

export const punchSchema = z.object({
  recordedStartTime: z.string().regex(TIME_RE),
  recordedEndTime: z.string().regex(TIME_RE),
});

/** Records actual punches for a shift (kept separate from the scheduled times). */
export async function recordShiftHours(scope: UserScope, tz: string, id: string, input: z.input<typeof punchSchema>) {
  const d = punchSchema.parse(input);
  const [shift] = await scope.tx
    .select()
    .from(workShifts)
    .where(and(eq(workShifts.id, id), eq(workShifts.userId, scope.userId)));
  if (!shift) throw notFound("Shift");
  const date = localDateOf(shift.startsAt, tz);
  const { startsAt, endsAt } = shiftInstants(date, d.recordedStartTime, d.recordedEndTime, tz);
  const [row] = await scope.tx
    .update(workShifts)
    .set({ recordedStart: startsAt, recordedEnd: endsAt, status: "worked" })
    .where(eq(workShifts.id, id))
    .returning();
  return row;
}

export async function setShiftStatus(scope: UserScope, id: string, status: "scheduled" | "worked" | "cancelled") {
  const [row] = await scope.tx
    .update(workShifts)
    .set({ status })
    .where(and(eq(workShifts.id, id), eq(workShifts.userId, scope.userId)))
    .returning();
  if (!row) throw notFound("Shift");
  return row;
}

export async function deleteShift(scope: UserScope, id: string) {
  const [row] = await scope.tx
    .delete(workShifts)
    .where(and(eq(workShifts.id, id), eq(workShifts.userId, scope.userId)))
    .returning({ id: workShifts.id });
  if (!row) throw notFound("Shift");
  return row;
}

export async function listShifts(scope: UserScope, tz: string, from: string, to: string, opts: { includeCancelled?: boolean } = {}) {
  const conds = [
    eq(workShifts.userId, scope.userId),
    gte(workShifts.startsAt, startOfLocalDay(from, tz)),
    lt(workShifts.startsAt, startOfLocalDay(addDaysStr(to, 1), tz)),
  ];
  if (!opts.includeCancelled) conds.push(ne(workShifts.status, "cancelled"));
  const rows = await scope.tx
    .select({ shift: workShifts, employer: { id: employers.id, name: employers.name, color: employers.color } })
    .from(workShifts)
    .innerJoin(employers, eq(employers.id, workShifts.employerId))
    .where(and(...conds))
    .orderBy(asc(workShifts.startsAt));
  return rows.map((r) => ({ ...r.shift, employer: r.employer }));
}

/** Per-employer estimate for a date range. */
export async function workSummary(scope: UserScope, tz: string, from: string, to: string) {
  const [emps, shifts] = await series(
    () => listEmployers(scope),
    () => listShifts(scope, tz, from, to),
  );
  return emps.map((e) => ({
    employer: { id: e.id, name: e.name, payType: e.payType, hourlyRateCents: e.hourlyRateCents },
    estimate: estimateEarnings(
      shifts.filter((s) => s.employerId === e.id),
      ratesOf(e),
      tz,
    ),
  }));
}

// ---------------------------------------------------------------- paychecks

export const paycheckInputSchema = z.object({
  employerId: z.string().uuid(),
  payDate: z.string().regex(DATE_RE),
  periodStart: z.string().regex(DATE_RE).nullish(),
  periodEnd: z.string().regex(DATE_RE).nullish(),
  grossCents: z.number().int().min(0).nullish(),
  netCents: z.number().int().min(0),
  hours: z.number().min(0).max(1000).nullish(),
});

export async function addPaycheck(scope: UserScope, input: z.input<typeof paycheckInputSchema>, source: DataSource = "manual") {
  const d = paycheckInputSchema.parse(input);
  await assertOwned(scope, employers, d.employerId, "Employer");
  const [row] = await scope.tx
    .insert(paychecks)
    .values({ ...d, userId: scope.userId, hours: d.hours != null ? String(d.hours) : null, source })
    .returning();
  return row;
}

export async function deletePaycheck(scope: UserScope, id: string) {
  await scope.tx.delete(paychecks).where(and(eq(paychecks.id, id), eq(paychecks.userId, scope.userId)));
}

export async function listPaychecks(scope: UserScope, limit = 20) {
  return scope.tx.select().from(paychecks).where(eq(paychecks.userId, scope.userId)).orderBy(desc(paychecks.payDate)).limit(limit);
}

// ---------------------------------------------------------------- regular hours

const SCHEDULE_WEEKS_AHEAD = 3;

/**
 * Fills in shifts from each job's regular hours, a few weeks ahead. Each day is
 * filled once (`scheduleFilledThrough`), so a day the user deletes or cancels
 * (a holiday, a day off) isn't put back. Returns how many shifts were added.
 */
export async function fillRegularShifts(scope: UserScope, tz: string, today: string) {
  const jobs = (await listEmployers(scope)).filter((e) => e.schedule && !e.archivedAt);
  const until = addDaysStr(today, SCHEDULE_WEEKS_AHEAD * 7 - 1);
  let added = 0;
  for (const job of jobs) {
    const sched = job.schedule as WorkSchedule;
    const from = job.scheduleFilledThrough && job.scheduleFilledThrough >= today ? addDaysStr(job.scheduleFilledThrough, 1) : today;
    if (from > until) continue;
    for (let d = from; d <= until; d = addDaysStr(d, 1)) {
      if (!sched.days.includes(dayOfWeek(d))) continue;
      const { startsAt } = shiftInstants(d, sched.start, sched.end, tz);
      if (startsAt.getTime() <= Date.now()) continue;
      await createShift(
        scope,
        tz,
        { employerId: job.id, date: d, startTime: sched.start, endTime: sched.end, breakMinutes: sched.breakMinutes ?? 0 },
        "schedule",
      );
      added++;
    }
    await scope.tx.update(employers).set({ scheduleFilledThrough: until }).where(eq(employers.id, job.id));
  }
  return added;
}
