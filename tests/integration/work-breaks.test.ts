import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { getTool } from "@/server/jarvis/registry";
import { createEmployer, createShift, listShifts, updateShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const NOW = new Date("2026-11-07T15:00:00Z");
const RULE = [
  { minShiftMinutes: 360, unpaidMinutes: 30 },
  { minShiftMinutes: 540, unpaidMinutes: 60 },
];
// The owner's week: six 7.5 hour shifts (45 hours on the clock).
const DAYS = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-06"];
const sixShifts = (jobId: string) => DAYS.map((date) => ({ jobId, date, startTime: "08:00", endTime: "15:30" }));

async function setup(now = NOW) {
  const u = await makeUser();
  const ctx = { userId: u.user.id, tz: TZ, today: "2026-11-07", now, conversationId: "", userText: "", memorySuggestions: false, run: u.run };
  const call = (name: string, args: Record<string, unknown>) => getTool(name)!.execute(args as never, ctx) as Promise<Row>;
  return { ...u, call };
}

describe("unpaid breaks by shift length", () => {
  it("new shifts get the job's break from the rule: six 7.5 h shifts are 42 paid hours", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library", hourlyRateCents: 2300 }));
    const set = await call("update_job", { id: job.id, breakRules: RULE });
    expect(set.unpaidBreakRule).toMatchObject({ breakRules: RULE, shiftsUpdated: 0, upcomingShifts: 0 });

    const added = await call("add_shifts", { shifts: sixShifts(job.id) });
    expect(added.total).toEqual({ shiftCount: 6, paidHours: 42 });
    expect(added.created.every((c: Row) => c.unpaidBreakMinutes === 30 && c.paidHours === 7)).toBe(true);

    const listed = await call("list_shifts", { from: DAYS[0], to: DAYS[5] });
    expect(listed.total).toEqual({ shiftCount: 6, paidHours: 42 });
    const earn = await call("work_earnings", { from: DAYS[0], to: DAYS[5] });
    expect(earn.jobs[0].estimate).toMatchObject({ shiftCount: 6, paidHours: 42, scheduledHours: 42 });

    // 9 h gets an hour; 4 h gets none; an explicit break wins over the rule
    const more = await call("add_shifts", {
      shifts: [
        { jobId: job.id, date: "2027-03-08", startTime: "08:00", endTime: "17:00" },
        { jobId: job.id, date: "2027-03-09", startTime: "08:00", endTime: "12:00" },
        { jobId: job.id, date: "2027-03-10", startTime: "08:00", endTime: "17:00", breakMinutes: 15 },
      ],
    });
    expect(more.created.map((c: Row) => c.unpaidBreakMinutes)).toEqual([60, 0, 15]);
  });

  it("correcting the rule fixes the upcoming shifts that have no break and reports the real paid hours", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library", hourlyRateCents: 2300 }));
    await call("add_shifts", { shifts: sixShifts(job.id) });
    expect((await call("work_earnings", { from: DAYS[0], to: DAYS[5] })).jobs[0].estimate.paidHours).toBe(45);

    // one shift already has a hand-set break; one is already worked (recorded)
    const rows = await run((s) => listShifts(s, TZ, DAYS[0], DAYS[5]));
    await call("update_shift", { shiftId: rows[0].id, breakMinutes: 15 });
    await call("record_shift_hours", { shiftId: rows[1].id, clockIn: "08:00", clockOut: "15:30" });

    const r = await call("update_job", { id: job.id, breakRules: RULE });
    // the worked shift gets its break too; the hand-set one keeps its 15 minutes
    expect(r.unpaidBreakRule.shiftsUpdated).toBe(5);
    const after = await run((s) => listShifts(s, TZ, DAYS[0], DAYS[5]));
    expect(after.map((x) => x.breakMinutes)).toEqual([15, 30, 30, 30, 30, 30]);

    // clearing the rule takes back the breaks it gave (not the hand-set 15); new shifts get none
    const cleared = await call("update_job", { id: job.id, breakRules: [] });
    expect(cleared.unpaidBreakRule.breakRules).toEqual([]);
    expect((await run((s) => listShifts(s, TZ, DAYS[0], DAYS[5]))).map((x) => x.breakMinutes)).toEqual([15, 0, 0, 0, 0, 0]);
    const added = await call("add_shifts", { shifts: [{ jobId: job.id, date: "2027-03-12", startTime: "08:00", endTime: "17:00" }] });
    expect(added.created[0].unpaidBreakMinutes).toBe(0);
  });

  it("the rule survives changing regular hours and works without any", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Target" }));
    await call("update_job", { id: job.id, breakRules: RULE });
    expect((await call("list_jobs", {})).jobs[0]).toMatchObject({ regularHours: null, unpaidBreakRule: RULE });
    await call("set_regular_hours", { jobId: job.id, regularHours: { days: [1, 2], start: "08:00", end: "17:00" } });
    expect((await call("list_jobs", {})).jobs[0]).toMatchObject({ regularHours: "Mon, Tue, 8 AM–5 PM", unpaidBreakRule: RULE });
    await call("set_regular_hours", { jobId: job.id, regularHours: null });
    expect((await call("list_jobs", {})).jobs[0]).toMatchObject({ regularHours: null, unpaidBreakRule: RULE });
  });

  it("another user's job and shifts are untouched", async () => {
    const a = await setup();
    const b = await setup();
    const jobA = await a.run((s) => createEmployer(s, { name: "A's job" }));
    await a.run((s) => createShift(s, TZ, { employerId: jobA.id, date: "2027-03-01", startTime: "08:00", endTime: "15:30" }));
    const res = await b.call("update_job", { id: jobA.id, breakRules: RULE }).then(
      () => "ok",
      () => "refused",
    );
    expect(res).toBe("refused");
    const [shift] = await a.run((s) => listShifts(s, TZ, "2027-03-01", "2027-03-01"));
    expect(shift.breakMinutes).toBe(0);
    const [job] = await a.run((s) => s.tx.query.employers.findMany());
    expect(job.schedule).toBeNull();
  });
});

describe("a rule set mid-week fixes the whole week", () => {
  // Wednesday afternoon: Mon, Tue, Wed 08:00 shifts are past, Thu-Sat are ahead.
  const MIDWEEK = new Date("2026-11-04T20:00:00Z");
  const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const week = (jobId: string) => WEEK.map((date) => ({ jobId, date, startTime: "08:00", endTime: "15:30" }));

  it("past and recorded shifts of this week get the break too: 42 paid hours this week", async () => {
    const { run, call } = await setup(MIDWEEK);
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await call("add_shifts", { shifts: week(job.id) });
    const rows = await run((s) => listShifts(s, TZ, WEEK[0], WEEK[5]));
    await call("record_shift_hours", { shiftId: rows[0].id, clockIn: "08:00", clockOut: "15:30" });
    const r = await call("update_job", { id: job.id, breakRules: RULE });
    expect(r.unpaidBreakRule).toMatchObject({ shiftsUpdated: 6, weekPaidHours: 42 });
    expect((await call("list_shifts", { from: WEEK[0], to: WEEK[5] })).total.paidHours).toBe(42);
  });

  it("when every shift is already past it is still 42", async () => {
    const { run, call } = await setup(new Date("2026-11-08T12:00:00Z"));
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await call("add_shifts", { shifts: week(job.id) });
    expect((await call("update_job", { id: job.id, breakRules: RULE })).unpaidBreakRule.weekPaidHours).toBe(42);
  });

  it("shifts from earlier weeks are left alone", async () => {
    const { run, call } = await setup(MIDWEEK);
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await call("add_shifts", { shifts: [{ jobId: job.id, date: "2026-10-28", startTime: "08:00", endTime: "15:30" }] });
    await call("update_job", { id: job.id, breakRules: RULE });
    expect((await run((s) => listShifts(s, TZ, "2026-10-28", "2026-10-28")))[0].breakMinutes).toBe(0);
  });
});

describe("rule-given breaks follow the rule, hand-set ones do not", () => {
  it("a changed rule recomputes breaks it gave, not hand-set ones", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await call("update_job", { id: job.id, breakRules: [{ minShiftMinutes: 360, unpaidMinutes: 30 }] });
    await call("add_shifts", {
      shifts: [
        { jobId: job.id, date: "2027-03-01", startTime: "08:00", endTime: "17:00" }, // 9 h, rule gave 30
        { jobId: job.id, date: "2027-03-02", startTime: "08:00", endTime: "17:00", breakMinutes: 45 }, // hand-set
      ],
    });
    await call("update_job", { id: job.id, breakRules: RULE });
    const rows = await run((s) => listShifts(s, TZ, "2027-03-01", "2027-03-02"));
    expect(rows.map((x) => x.breakMinutes)).toEqual([60, 45]);
  });

  it("changing a shift's times recomputes a rule-given break (9 h to 4 h loses the break)", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await call("update_job", { id: job.id, breakRules: RULE });
    await call("add_shifts", {
      shifts: [
        { jobId: job.id, date: "2027-03-01", startTime: "08:00", endTime: "17:00" },
        { jobId: job.id, date: "2027-03-02", startTime: "08:00", endTime: "17:00", breakMinutes: 45 },
      ],
    });
    const [a, b] = await run((s) => listShifts(s, TZ, "2027-03-01", "2027-03-02"));
    await call("update_shift", { shiftId: a.id, endTime: "12:00" });
    await call("update_shift", { shiftId: b.id, endTime: "12:00" });
    const rows = await run((s) => listShifts(s, TZ, "2027-03-01", "2027-03-02"));
    expect(rows.map((x) => x.breakMinutes)).toEqual([0, 45]);
  });

  it("an edit from the page that sends back the same break, and recorded hours, follow the rule (review)", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library", hourlyRateCents: 2300 }));
    await call("update_job", { id: job.id, breakRules: RULE });
    const added = await call("add_shifts", { shifts: [{ jobId: job.id, date: DAYS[0], startTime: "08:00", endTime: "12:00" }] });
    const id = added.created[0].id as string;
    expect(added.created[0].unpaidBreakMinutes).toBe(0);
    // The page's form sends the break it shows (0) with the new times: a 9 h shift now gets the rule's 60.
    await run((s) => updateShift(s, TZ, id, { startTime: "08:00", endTime: "17:00", breakMinutes: 0 }));
    expect((await run((s) => listShifts(s, TZ, DAYS[0], DAYS[0])))[0].breakMinutes).toBe(60);
    // A hand-set break the form changes stays as typed.
    await run((s) => updateShift(s, TZ, id, { breakMinutes: 45 }));
    expect((await run((s) => listShifts(s, TZ, DAYS[0], DAYS[0])))[0].breakMinutes).toBe(45);

    // Recorded hours: scheduled 5 h 50 (no break), worked 6 h 30, so the rule gives 30.
    const short = await call("add_shifts", { shifts: [{ jobId: job.id, date: DAYS[1], startTime: "08:00", endTime: "13:50" }] });
    const sid = short.created[0].id as string;
    expect(short.created[0].unpaidBreakMinutes).toBe(0);
    await call("record_shift_hours", { shiftId: sid, clockIn: "08:00", clockOut: "14:30" });
    expect((await run((s) => listShifts(s, TZ, DAYS[1], DAYS[1])))[0].breakMinutes).toBe(30);
  });

  it("refuses a break as long as the shift length it applies to", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library" }));
    await expect(call("update_job", { id: job.id, breakRules: [{ minShiftMinutes: 60, unpaidMinutes: 60 }] })).rejects.toThrow();
  });
});

describe("no pay predictions for hourly work", () => {
  it("work_earnings, list_jobs and the shift tools return hours only", async () => {
    const { run, call } = await setup();
    const job = await run((s) => createEmployer(s, { name: "Library", hourlyRateCents: 2300 }));
    await call("add_shifts", { shifts: sixShifts(job.id) });
    const outs = [
      await call("work_earnings", { from: DAYS[0], to: DAYS[5] }),
      await call("list_jobs", {}),
      await call("list_shifts", { from: DAYS[0], to: DAYS[5] }),
      await call("add_shifts", { shifts: [{ jobId: job.id, date: "2027-04-01", startTime: "08:00", endTime: "12:00" }] }),
      await call("update_job", { id: job.id, breakRules: RULE }),
    ];
    for (const o of outs) expect(JSON.stringify(o)).not.toMatch(/gross|hourlyRate|\$|"rate"/i);
  });
});
