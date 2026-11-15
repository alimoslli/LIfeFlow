import { afterAll, describe, expect, it } from "vitest";
import { getBriefing } from "@/server/briefing";
import { closeDb } from "@/server/db/client";
import { readOnce } from "@/server/db/with-user";
import { createEvent } from "@/server/services/calendar";
import { dayClockData } from "@/server/services/day-clock";
import { createManualAccount } from "@/server/services/finance/accounts";
import { getCategoryByName } from "@/server/services/finance/categories";
import { createGoal, createRecurring, setBudget } from "@/server/services/finance/planning";
import { createTransaction } from "@/server/services/finance/transactions";
import { logHealth } from "@/server/services/health";
import { ideaClouds } from "@/server/services/idea-clouds";
import { createAssignment, createCourse } from "@/server/services/school";
import { createTask } from "@/server/services/tasks";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Saturday, Nov 7 2026, 1:40 PM in New York.
const NOW = new Date("2026-11-07T18:40:00Z");

// Today's parts ask for the same base rows again and again (bills, categories, 13 months of transactions). With reads shared
// for the render, what Today shows must be exactly what it showed when each part read for itself.
describe("Today with reads shared for the render", () => {
  it("shows exactly the same clock, briefing and clouds as when every part reads for itself", async () => {
    const { user, run } = await makeUser("Read Once");
    await run(async (s) => {
      const checking = await createManualAccount(s, { name: "Checking", type: "depository", currentBalanceCents: 84_000 });
      const food = await getCategoryByName(s, "Groceries");
      // a monthly charge the detection can find, and everyday spending
      for (const [date, cents, what] of [
        ["2026-08-03", -1599, "Netflix"],
        ["2026-09-03", -1599, "Netflix"],
        ["2026-10-03", -1599, "Netflix"],
        ["2026-11-03", -1599, "Netflix"],
        ["2026-11-05", -4210, "Trader Joe's"],
        ["2026-11-06", -1875, "Chipotle"],
        ["2026-11-01", 62_000, "Campus Coffee payroll"],
      ] as const)
        await createTransaction(s, {
          accountId: checking.id,
          date,
          amountCents: Math.abs(cents),
          kind: cents < 0 ? "expense" : "income",
          description: what,
          categoryId: what === "Trader Joe's" ? food?.id : undefined,
        });
      await createRecurring(s, { name: "Rent", amountCents: 70_000, kind: "bill", frequency: "monthly", nextDueDate: "2026-11-10" });
      if (food) await setBudget(s, { categoryId: food.id, month: "2026-11-01", limitCents: 20_000 });
      await createGoal(s, { name: "Laptop", targetCents: 90_000, savedCents: 20_000 });
      const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-08", startTime: "09:00", endTime: "16:30" });
      await createEvent(s, TZ, { title: "Class", date: "2026-11-07", startTime: "18:00", endTime: "20:00", kind: "class" });
      const bio = await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-09", dueTime: "10:00" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Lab report", kind: "assignment", dueDate: "2026-11-08", dueTime: "23:59" });
      await createTask(s, TZ, { title: "Email the advisor", dueDate: "2026-11-07" });
      await logHealth(s, TZ, { metric: "steps", value: 5060, date: "2026-11-07" }, NOW);
    });
    const me = { ...user, timezone: TZ } as Parameters<typeof getBriefing>[1];
    const today = (shared: boolean) =>
      run(async (s) => {
        if (shared) readOnce(s);
        const clock = await dayClockData(s, TZ, NOW, { money: true });
        const { briefing, snapshot } = await getBriefing(s, me, NOW);
        const clouds = await ideaClouds(s, TZ, user.preferences, "Ray", NOW, {});
        return JSON.parse(JSON.stringify({ clock, briefing, snapshot, clouds }));
      });
    const each = await today(false);
    const once = await today(true);
    expect(once).toEqual(each);
    // and it really is this account's own week
    expect(JSON.stringify(each.clock)).toContain("Exam 2");
    expect(each.clouds.length).toBeGreaterThan(0);
  });
});
