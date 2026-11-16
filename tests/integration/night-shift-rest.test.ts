import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { freeSlots, getAgenda, SLEEP_AFTER_NIGHT_SHIFT_HOURS } from "@/server/services/calendar";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The test user (2026-11-16): a student who works Thursday 10 PM to 6:30 AM Friday was offered "Block Fri 9 AM". Friday's
// agenda didn't hold the shift (it starts on Thursday), and nothing knew she sleeps after it.
describe("sleep after an overnight shift", () => {
  it("the next day's agenda holds the overnight shift, and no free time is offered until 8 hours after it ends", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Fulfillment Center", hourlyRateCents: 1900 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-19", startTime: "22:00", endTime: "06:30" }));
    const friday = await u.run((s) => getAgenda(s, TZ, "2026-11-20", "2026-11-20"));
    expect(friday.filter((i) => i.origin === "shift").map((i) => i.title)).toEqual(["Work · Fulfillment Center"]);

    expect(SLEEP_AFTER_NIGHT_SHIFT_HOURS).toBe(8);
    const slots = freeSlots(friday, "2026-11-20", TZ, "09:00", "21:00", 120);
    // 6:30 AM + 8 hours: nothing before 2:30 PM
    expect(slots[0].startsAt.getTime()).toBe(localToInstant("2026-11-20", "14:30", TZ).getTime());
  });

  it("a day shift leaves the evening free as before", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Campus Cafe", hourlyRateCents: 1500 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-20", startTime: "09:00", endTime: "13:00" }));
    const day = await u.run((s) => getAgenda(s, TZ, "2026-11-20", "2026-11-20"));
    const slots = freeSlots(day, "2026-11-20", TZ, "09:00", "21:00", 120);
    expect(slots[0].startsAt.getTime()).toBe(localToInstant("2026-11-20", "13:00", TZ).getTime());
  });

  it("an early opener (5 AM to 9:30 AM) is awake after it: the afternoon stays free", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Corner Coffee", hourlyRateCents: 1500 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-20", startTime: "05:00", endTime: "09:30" }));
    const day = await u.run((s) => getAgenda(s, TZ, "2026-11-20", "2026-11-20"));
    const slots = freeSlots(day, "2026-11-20", TZ, "09:00", "21:00", 120);
    expect(slots[0].startsAt.getTime()).toBe(localToInstant("2026-11-20", "09:30", TZ).getTime());
  });

  it("a shift that starts after midnight (2 AM to 8 AM) is a night shift", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Fulfillment Center", hourlyRateCents: 1900 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-20", startTime: "02:00", endTime: "08:00" }));
    const day = await u.run((s) => getAgenda(s, TZ, "2026-11-20", "2026-11-20"));
    const slots = freeSlots(day, "2026-11-20", TZ, "09:00", "21:00", 120);
    expect(slots[0].startsAt.getTime()).toBe(localToInstant("2026-11-20", "16:00", TZ).getTime());
  });

  it("the day before an overnight shift is unchanged: the evening up to the shift is free", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Fulfillment Center", hourlyRateCents: 1900 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-19", startTime: "22:00", endTime: "06:30" }));
    const thursday = await u.run((s) => getAgenda(s, TZ, "2026-11-19", "2026-11-19"));
    const slots = freeSlots(thursday, "2026-11-19", TZ, "09:00", "21:00", 120);
    expect(slots.map((x) => x.minutes)).toEqual([720]);
  });
});
