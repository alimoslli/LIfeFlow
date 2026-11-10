import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addDaysStr, todayIn } from "@/lib/dates";
import { pickClouds } from "@/lib/idea-clouds";
import { closeDb, getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { cloudFacts, recordCloudTap } from "@/server/services/idea-clouds";
import { createPromise } from "@/server/services/promises";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);

const TZ = "America/Chicago";
const prefsOf = async (id: string) => (await getDb().select({ p: users.preferences }).from(users).where(eq(users.id, id)))[0].p;

describe("idea cloud facts come from the person's own records only", () => {
  it("a new account: nothing assumed, so only the clouds that fit anyone", async () => {
    const { user, run } = await makeUser("Fresh Start");
    const prefs = await prefsOf(user.id);
    const f = await run((s) => cloudFacts(s, TZ, prefs));
    expect(f).toMatchObject({ student: false, worker: false, dueSoon: false, bank: false, shifts: false, health: false, moneyLocked: false });
    expect(f.ageDays).toBe(0);
    expect(
      pickClouds(f, "Ray", 1, 14)
        .map((c) => c.key)
        .sort(),
    ).toEqual(["first_today", "free_time", "goal"]);
  });

  it("classes, a due date, a bank and the Money lock: study clouds yes, money clouds no", async () => {
    const { user, run } = await makeUser("Kai Busy");
    await run(async (s) => {
      const c = await createCourse(s, { name: "Biology" });
      await createAssignment(s, TZ, { courseId: c.id, title: "Lab 4", dueDate: addDaysStr(todayIn(TZ), 2), dueTime: "23:59" });
      await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 10_000 });
    });
    await getDb()
      .update(users)
      .set({ preferences: { ...(await prefsOf(user.id)), moneyLock: { enabled: true, idleMinutes: 5 } } })
      .where(eq(users.id, user.id));
    const locked = await prefsOf(user.id);
    const f = await run((s) => cloudFacts(s, TZ, locked));
    expect(f).toMatchObject({ student: true, dueSoon: true, bank: true, moneyLocked: true, nextAssignment: "Lab 4" });
    const keys = pickClouds(f, "Ray", 1, 14).map((c) => c.key);
    expect(keys).toContain("plan_week");
    expect(keys).toContain("finished");
    expect(keys).not.toContain("afford");
    expect(keys).not.toContain("subscriptions");
  });

  it("a tap counts (never the text); a promise or goal already made counts as used", async () => {
    const { user, run } = await makeUser("Tap Tap");
    await run((s) => recordCloudTap(s, "free_time"));
    await run((s) => recordCloudTap(s, "free_time"));
    await run((s) => recordCloudTap(s, "not_a_cloud"));
    const p = await prefsOf(user.id);
    expect(p.ideaTaps).toEqual({ free_time: 2 });
    await run((s) => createPromise(s, TZ, { text: "study tonight" }));
    const f = await run((s) => cloudFacts(s, TZ, p));
    expect(f.used).toMatchObject({ free_time: true, promise: true, goal: false });
  });
});
