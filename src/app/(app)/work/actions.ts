"use server";
import { trashAction } from "../trash-actions";
import { formCents, formNum, formObject, mutate, type ActionState } from "@/server/actions";
import {
  addPaycheck,
  createEmployer,
  createShift,
  fillRegularShifts,
  recordShiftHours,
  setShiftStatus,
  shiftOverlaps,
  updateEmployer,
  updateShift,
  workScheduleSchema,
} from "@/server/services/work";
import { todayIn } from "@/lib/dates";
import { ServiceError } from "@/server/services/errors";

export async function createEmployerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("employer.create", async (s, u) => {
    await createEmployer(s, {
      name: f.name ?? "",
      position: f.position,
      payType: (f.payType as "hourly") ?? "hourly",
      hourlyRateCents: formCents(f.hourlyRate) ?? null,
      overtimeThresholdHours: formNum(f.overtimeThreshold) ?? 40,
      schedule: parseSchedule(f.schedule),
    });
    await fillRegularShifts(s, u.timezone, todayIn(u.timezone));
  });
}

const parseSchedule = (v: string | undefined) => (v ? workScheduleSchema.parse(JSON.parse(v)) : null);

export async function setJobHoursAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("employer.hours", async (s, u) => {
    await updateEmployer(s, f.employerId ?? "", { schedule: parseSchedule(f.schedule) });
    await fillRegularShifts(s, u.timezone, todayIn(u.timezone));
    return "Saved";
  });
}

export async function createShiftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("shift.create", async (s, u) => {
    if (!f.date || !f.startTime || !f.endTime) throw new ServiceError("Pick a date, a start time and an end time.");
    const shift = await createShift(s, u.timezone, {
      employerId: f.employerId ?? "",
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      breakMinutes: formNum(f.breakMinutes) ?? 0,
      notes: f.notes,
    });
    const n = await shiftOverlaps(s, shift);
    return n ? `Shift added. Heads up: it overlaps ${n} other shift${n === 1 ? "" : "s"}.` : "Shift added.";
  });
}

export async function updateShiftAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("shift.update", async (s, u) => {
    if (!f.date || !f.startTime || !f.endTime) throw new ServiceError("Pick a date, a start time and an end time.");
    const r = await updateShift(s, u.timezone, id, {
      employerId: f.employerId,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      breakMinutes: formNum(f.breakMinutes) ?? 0,
      notes: f.notes ?? null,
    });
    return r.overlaps ? `Shift saved. It overlaps ${r.overlaps} other shift${r.overlaps === 1 ? "" : "s"}.` : "Shift saved.";
  });
}

export async function markWorkedAction(id: string): Promise<ActionState> {
  return mutate("shift.worked", async (s) => {
    await setShiftStatus(s, id, "worked");
    return "Marked as worked as scheduled.";
  });
}

export async function recordHoursAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("shift.record", async (s, u) => {
    await recordShiftHours(s, u.timezone, id, { recordedStartTime: f.clockIn ?? "", recordedEndTime: f.clockOut ?? "" });
    return "Hours recorded.";
  });
}

export async function cancelShiftAction(id: string): Promise<ActionState> {
  return mutate("shift.cancel", async (s) => {
    await setShiftStatus(s, id, "cancelled");
    return "Shift marked cancelled.";
  });
}

export async function deleteShiftAction(id: string): Promise<ActionState> {
  return trashAction("shift", id);
}

export async function addPaycheckAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("paycheck.create", async (s) => {
    await addPaycheck(s, {
      employerId: f.employerId ?? "",
      payDate: f.payDate ?? "",
      netCents: formCents(f.net) ?? -1,
      grossCents: formCents(f.gross) ?? null,
      hours: formNum(f.hours) ?? null,
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
    });
  });
}
