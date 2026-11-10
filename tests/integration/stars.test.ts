import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createEvent } from "@/server/services/calendar";
import { createAssignment, createCourse } from "@/server/services/school";
import { claimStars } from "@/server/services/stars";
import { createTask } from "@/server/services/tasks";
import { createEmployer, createShift, setShiftStatus } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Tuesday 2026-11-10 in New York (UTC-5): 9 AM, then noon, then 9 PM.
const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00-05:00`);

describe("claiming the stars (owner, 2026-11-10: what the skyling passed while you were away)", () => {
  it("the first visit claims nothing; later, each class, shift and plan that ended since comes back once, oldest first", async () => {
    const { user, run } = await makeUser("Sky Stars");
    await run(async (s) => {
      const bio = await createCourse(s, { name: "Bio 101" });
      await createEvent(s, TZ, { title: "Bio 101", date: "2026-11-10", startTime: "09:30", endTime: "10:45", kind: "class", courseId: bio.id });
      await createEvent(s, TZ, { title: "Chem 110", date: "2026-11-10", startTime: "11:00", endTime: "11:50", kind: "class" });
      const job = await createEmployer(s, { name: "Target", position: "Cashier", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-10", startTime: "13:00", endTime: "17:00" });
      await createEvent(s, TZ, { title: "Gym", date: "2026-11-10", startTime: "18:00", endTime: "19:00", kind: "personal" });
      // never a star: a whole-day event, a deadline passing (not done), a to-do, and a class still going at 9 PM
      await createEvent(s, TZ, { title: "Spirit week", date: "2026-11-10", allDay: true, kind: "other" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Lab report", dueDate: "2026-11-10", dueTime: "12:00" });
      await createTask(s, TZ, { title: "Return library books", dueDate: "2026-11-10", dueTime: "12:00" });
      await createEvent(s, TZ, { title: "Night class", date: "2026-11-10", startTime: "20:00", endTime: "22:00", kind: "class" });
    });

    // 9 AM: the first visit only starts the clock
    expect(await run((s) => claimStars(s, TZ, at("09:00")))).toEqual([]);
    // noon: both classes passed
    const noon = await run((s) => claimStars(s, TZ, at("12:00")));
    expect(noon.map((x) => x.label)).toEqual(["Bio 101 · class done", "Chem 110 · class done"]);
    // the same noon again (a reload, another device): nothing twice
    expect(await run((s) => claimStars(s, TZ, at("12:00")))).toEqual([]);
    // 9 PM: the shift and the gym, not the class still going
    const night = await run((s) => claimStars(s, TZ, at("21:00")));
    expect(night.map((x) => x.label)).toEqual(["Target · shift done", "Gym · done"]);
    const [u] = await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, user.id));
    expect(u.p.starsClaimedAt).toBe(at("21:00").toISOString());
  });

  it("a cancelled shift is no star, and after days away only the last two days come back", async () => {
    const { user, run } = await makeUser("Away Days");
    const shiftId = await run(async (s) => {
      const job = await createEmployer(s, { name: "Cafe", position: "Barista", hourlyRateCents: 1400 });
      await createEvent(s, TZ, { title: "Old class", date: "2026-11-05", startTime: "09:00", endTime: "10:00", kind: "class" });
      await createEvent(s, TZ, { title: "Recent class", date: "2026-11-09", startTime: "09:00", endTime: "10:00", kind: "class" });
      const sh = await createShift(s, TZ, { employerId: job.id, date: "2026-11-09", startTime: "12:00", endTime: "16:00" });
      return sh.id;
    });
    await run((s) => setShiftStatus(s, shiftId, "cancelled"));
    await getDb()
      .update(users)
      .set({
        preferences: {
          ...(await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, user.id)))[0].p,
          starsClaimedAt: "2026-11-01T12:00:00.000Z",
        },
      })
      .where(eq(users.id, user.id));
    const back = await run((s) => claimStars(s, TZ, at("12:00")));
    expect(back.map((x) => x.title)).toEqual(["Recent class"]);
  });
});
