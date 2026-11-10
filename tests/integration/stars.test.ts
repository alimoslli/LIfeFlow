import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createEvent } from "@/server/services/calendar";
import { createAssignment, createCourse } from "@/server/services/school";
import { claimStars, pushStars, STAR_PUSHES_A_DAY } from "@/server/services/stars";
import { saveSubscription, type PushMessage, type Sender } from "@/server/services/push";
import { randomUUID } from "node:crypto";
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

const sub = () => ({
  endpoint: `https://push.example.com/send/${randomUUID()}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});
function fakeSender() {
  const sent: PushMessage[] = [];
  const send: Sender = async (_s, msg) => {
    sent.push(msg);
    return { ok: true, gone: false };
  };
  return { sent, send };
}
async function prefsOf(id: string) {
  return (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p;
}

describe("the note when something ends (owner, 2026-11-10: a shift ending at 6 gets its note by about 6:05)", () => {
  it("one note per thing, things ending together are one note, the tap opens Today; never twice", async () => {
    const { user, run } = await makeUser("Shift Ends");
    await run(async (s) => {
      await saveSubscription(s, sub());
      const job = await createEmployer(s, { name: "Target", position: "Cashier", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-10", startTime: "14:00", endTime: "18:00" });
      await createEvent(s, TZ, { title: "Bio 101", date: "2026-11-10", startTime: "09:30", endTime: "10:45", kind: "class" });
      await createEvent(s, TZ, { title: "Chem 110", date: "2026-11-10", startTime: "10:00", endTime: "10:50", kind: "class" });
    });
    await run((s) => claimStars(s, TZ, at("08:00"))); // they've had Today since stars arrived
    const p = await prefsOf(user.id);
    const { sent, send } = fakeSender();
    // 6:00 PM shift: the 6:05 run notes it
    expect(await run((s) => pushStars(s, TZ, p, send, at("18:05")))).toBe(1);
    expect(sent[0]).toEqual({
      title: "Ray has a star for you",
      body: "Your Target shift is over. Tap to claim your star on your sky.",
      url: "/",
      tag: "lf-stars",
    });
    // the next run (6:10) says nothing again about it
    expect(await run((s) => pushStars(s, TZ, p, send, at("18:10")))).toBe(0);
    // two classes ending in the same run: one note
    const two = fakeSender();
    const { user: u2, run: run2 } = await makeUser("Two Classes");
    await run2(async (s) => {
      await saveSubscription(s, sub());
      await createEvent(s, TZ, { title: "Bio 101", date: "2026-11-10", startTime: "09:30", endTime: "10:45", kind: "class" });
      await createEvent(s, TZ, { title: "Chem 110", date: "2026-11-10", startTime: "10:00", endTime: "10:48", kind: "class" });
    });
    await run2((s) => claimStars(s, TZ, at("08:00")));
    expect(await run2(async (s) => pushStars(s, TZ, await prefsOf(u2.id), two.send, at("10:50")))).toBe(1);
    expect(two.sent.map((m) => [m.title, m.body])).toEqual([["Ray has 2 stars for you", "Bio 101 and Chem 110 are over. Tap to claim them on your sky."]]);
  });

  it("stays quiet: at night, with the switch off, before they've had Today, for what they already claimed, and past the daily ceiling", async () => {
    const { user, run } = await makeUser("Quiet Stars");
    await run(async (s) => {
      await saveSubscription(s, sub());
      await createEvent(s, TZ, { title: "Late lab", date: "2026-11-10", startTime: "21:30", endTime: "22:30", kind: "class" });
      await createEvent(s, TZ, { title: "Gym", date: "2026-11-10", startTime: "17:00", endTime: "18:00", kind: "personal" });
    });
    const { sent, send } = fakeSender();
    // never had Today since stars arrived: nothing to claim yet, so no note
    expect(await run(async (s) => pushStars(s, TZ, await prefsOf(user.id), send, at("18:05")))).toBe(0);
    await run((s) => claimStars(s, TZ, at("08:00")));
    const p = await prefsOf(user.id);
    // the switch off
    expect(await run((s) => pushStars(s, TZ, { ...p, notifications: { stars: false } }, send, at("18:05")))).toBe(0);
    // the skyling told to send nothing of its own
    expect(await run((s) => pushStars(s, TZ, { ...p, jarvis: { pushLimit: 0 } }, send, at("18:05")))).toBe(0);
    // quiet hours (10 PM to 7 AM): the 10:35 PM run says nothing, and the star still waits on Today
    expect(await run((s) => pushStars(s, TZ, p, send, at("22:35")))).toBe(0);
    // already claimed by being on Today when it ended
    await run((s) => claimStars(s, TZ, at("18:02")));
    expect(await run(async (s) => pushStars(s, TZ, await prefsOf(user.id), send, at("18:05")))).toBe(0);
    expect(sent).toEqual([]);
  });

  it(`at most ${STAR_PUSHES_A_DAY} notes a day; the rest still wait on Today`, async () => {
    const { user, run } = await makeUser("Busy Day");
    await run(async (s) => {
      await saveSubscription(s, sub());
      for (let h = 9; h <= 14; h++)
        await createEvent(s, TZ, {
          title: `Class ${h}`,
          date: "2026-11-10",
          startTime: `${h}:00`.padStart(5, "0"),
          endTime: `${h}:50`.padStart(5, "0"),
          kind: "class",
        });
    });
    await run((s) => claimStars(s, TZ, at("08:00")));
    const p = await prefsOf(user.id);
    const { sent, send } = fakeSender();
    for (let h = 9; h <= 14; h++) await run((s) => pushStars(s, TZ, p, send, at(`${String(h).padStart(2, "0")}:55`)));
    expect(sent).toHaveLength(STAR_PUSHES_A_DAY);
    // and Today still has every one of them to claim
    expect((await run((s) => claimStars(s, TZ, at("15:00")))).map((x) => x.title)).toEqual([
      "Class 9",
      "Class 10",
      "Class 11",
      "Class 12",
      "Class 13",
      "Class 14",
    ]);
  });
});
