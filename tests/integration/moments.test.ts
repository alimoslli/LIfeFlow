import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { pickMoment, momentThanks, QUIET_ON_EASY_DAYS } from "@/lib/moment-question";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { answerMoment, easyDay, momentAfterStars } from "@/server/services/moments";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The skyling's one question on a real moment (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md item 7), off until
// the owner decides on the crisis path and the SB 243 read (research 2026-11-22).
const NOW = localToInstant("2026-11-24", "18:10", TZ);
const shift = { key: "shift:1", title: "Target", kind: "work" };
const lecture = { key: "event:2", title: "Bio 101", kind: "class" };
const dinner = { key: "event:3", title: "Dinner with Sam", kind: "personal" };

async function person(birthDate: string | null) {
  const u = await makeUser("Moment Person");
  if (birthDate)
    await getDb()
      .update(users)
      .set({ preferences: { ...u.user.preferences, birthDate } })
      .where(eq(users.id, u.user.id));
  return u;
}

describe("the moment question", () => {
  beforeEach(() => {
    process.env.MOMENT_QUESTIONS = "on";
  });
  afterEach(() => {
    delete process.env.MOMENT_QUESTIONS;
  });

  it("asks about the latest shift, class or exam just claimed, never a plan or a personal event", () => {
    expect(pickMoment([shift, dinner])?.ask).toBe("How was the Target shift?");
    expect(pickMoment([shift, lecture])?.ask).toBe("How was Bio 101 today?");
    expect(pickMoment([{ key: "event:4", title: "Midterm", kind: "exam" }])?.ask).toBe("How did Midterm feel?");
    expect(pickMoment([dinner])).toBeNull();
    for (const a of ["Good", "Okay", "Rough"] as const) expect(momentThanks(a)).not.toMatch(/—|should|why/i);
  });

  it("asks once a day at most, and only adults with a birthday on file", async () => {
    const adult = await person("2000-01-15");
    expect((await adult.run((s) => momentAfterStars(s, TZ, [shift], NOW)))?.ask).toBe("How was the Target shift?");
    expect(await adult.run((s) => momentAfterStars(s, TZ, [lecture], new Date(NOW.getTime() + 3600_000)))).toBeNull();
    // the next day, again
    expect(await adult.run((s) => momentAfterStars(s, TZ, [lecture], new Date(NOW.getTime() + 24 * 3600_000)))).not.toBeNull();

    const teen = await person("2010-03-01");
    expect(await teen.run((s) => momentAfterStars(s, TZ, [shift], NOW))).toBeNull();
    const unknown = await person(null);
    expect(await unknown.run((s) => momentAfterStars(s, TZ, [shift], NOW))).toBeNull();
  });

  it("is off unless the owner turns it on", async () => {
    delete process.env.MOMENT_QUESTIONS;
    const adult = await person("2000-01-15");
    expect(await adult.run((s) => momentAfterStars(s, TZ, [shift], NOW))).toBeNull();
  });

  it("Rough keeps the rest of that day quiet; nothing about the feeling is stored", async () => {
    const adult = await person("2000-01-15");
    await adult.run((s) => answerMoment(s, TZ, "Good", NOW));
    let [row] = await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, adult.user.id));
    expect(row.p.easyUntil).toBeUndefined();
    await adult.run((s) => answerMoment(s, TZ, "Rough", NOW));
    [row] = await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, adult.user.id));
    expect(easyDay(row.p, NOW)).toBe(true);
    expect(easyDay(row.p, localToInstant("2026-11-25", "00:01", TZ))).toBe(false);
    expect(JSON.stringify(row.p)).not.toMatch(/rough|good|okay/i);
    // coaching goes quiet; real trouble (a clash, a bill, a promise) never does
    expect(QUIET_ON_EASY_DAYS.has("evening_wrap")).toBe(true);
    for (const k of ["deadline_conflict", "bill_due", "bill_short", "promise_check", "double_charge"]) expect(QUIET_ON_EASY_DAYS.has(k)).toBe(false);
  });
});
