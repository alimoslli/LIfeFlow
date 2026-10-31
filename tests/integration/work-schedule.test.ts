import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { workShifts } from "@/server/db/schema";
import { createEmployer, fillRegularShifts, listShifts, updateEmployer } from "@/server/services/work";
import { scheduleLabel } from "@/lib/work-schedule";
import { makeUser } from "../helpers";

afterAll(closeDb);

const TZ = "America/New_York";
const MONDAY = "2027-01-04";

describe("regular work hours", () => {
  it("fills 3 weeks of full-time shifts once, keeps deleted days off, and replaces them when the hours change", async () => {
    const { run } = await makeUser();
    const job = await run((s) => createEmployer(s, { name: "Target", schedule: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" } }));
    expect(scheduleLabel(job.schedule!)).toBe("Mon–Fri, 8 AM–5 PM");

    expect(await run((s) => fillRegularShifts(s, TZ, MONDAY))).toBe(15);
    expect(await run((s) => fillRegularShifts(s, TZ, MONDAY))).toBe(0); // already filled

    const [first] = await run((s) => listShifts(s, TZ, MONDAY, MONDAY));
    expect(first.startsAt.toISOString()).toBe("2027-01-04T13:00:00.000Z"); // 8 AM in New York
    await run((s) => s.tx.delete(workShifts).where(eq(workShifts.id, first.id))); // a day off
    expect(await run((s) => fillRegularShifts(s, TZ, MONDAY))).toBe(0);
    expect(await run((s) => listShifts(s, TZ, MONDAY, MONDAY))).toHaveLength(0);

    await run((s) => updateEmployer(s, job.id, { schedule: { days: [1, 3], start: "09:00", end: "13:00" } }));
    expect(await run((s) => fillRegularShifts(s, TZ, MONDAY))).toBe(6);
    const rows = await run((s) =>
      s.tx
        .select()
        .from(workShifts)
        .where(and(eq(workShifts.employerId, job.id), eq(workShifts.source, "schedule"))),
    );
    expect(rows).toHaveLength(6);

    await run((s) => updateEmployer(s, job.id, { schedule: null }));
    expect(await run((s) => fillRegularShifts(s, TZ, MONDAY))).toBe(0);
    expect(await run((s) => listShifts(s, TZ, MONDAY, "2027-01-24"))).toHaveLength(0);
  });

  it("labels other schedules plainly", () => {
    expect(scheduleLabel({ days: [5, 1, 3], start: "09:30", end: "13:00" })).toBe("Mon, Wed, Fri, 9:30 AM–1 PM");
    expect(scheduleLabel({ days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "06:00" })).toBe("Sun–Sat, 10 PM–6 AM");
  });
});
