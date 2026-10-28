"use server";
import { formCents, formNum, formObject, mutate, type ActionState } from "@/server/actions";
import { addPaycheck, createEmployer, createShift, deleteShift, recordShiftHours, setShiftStatus } from "@/server/services/work";

export async function createEmployerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("employer.create", async (s) => {
    await createEmployer(s, {
      name: f.name ?? "",
      position: f.position,
      payType: (f.payType as "hourly") ?? "hourly",
      hourlyRateCents: formCents(f.hourlyRate) ?? null,
      overtimeThresholdHours: formNum(f.overtimeThreshold) ?? 40,
    });
  });
}

export async function createShiftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("shift.create", async (s, u) => {
    await createShift(s, u.timezone, {
      employerId: f.employerId ?? "",
      date: f.date ?? "",
      startTime: f.startTime ?? "",
      endTime: f.endTime ?? "",
      breakMinutes: formNum(f.breakMinutes) ?? 0,
      notes: f.notes,
    });
  });
}

export async function recordHoursAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("shift.record", async (s, u) => {
    await recordShiftHours(s, u.timezone, id, { recordedStartTime: f.clockIn ?? "", recordedEndTime: f.clockOut ?? "" });
  });
}

export async function cancelShiftAction(id: string): Promise<ActionState> {
  return mutate("shift.cancel", async (s) => {
    await setShiftStatus(s, id, "cancelled");
  });
}

export async function deleteShiftAction(id: string): Promise<ActionState> {
  return mutate("shift.delete", async (s) => {
    await deleteShift(s, id);
  });
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
