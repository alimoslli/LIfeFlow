import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createEvent } from "@/server/services/calendar";
import { dayClockData } from "@/server/services/day-clock";
import { createManualAccount } from "@/server/services/finance/accounts";
import { createTransaction } from "@/server/services/finance/transactions";
import { logHealth } from "@/server/services/health";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// Saturday, Nov 7 2026, 1:40 PM in New York.
const NOW = new Date("2026-11-07T18:40:00Z");

describe("day clock data", () => {
  it("reads the week around today from the person's own calendar, shifts, classes and health", async () => {
    const { run } = await makeUser("Clock Owner");
    const data = await run(async (s) => {
      const job = await createEmployer(s, { name: "Campus Coffee", position: "Barista", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-07", startTime: "09:00", endTime: "16:30" });
      await createEvent(s, TZ, { title: "Class", date: "2026-11-07", startTime: "18:00", endTime: "20:00", kind: "class" }, "google");
      await createEvent(s, TZ, { title: "Run with Sam", date: "2026-11-08", startTime: "08:00", endTime: "08:45", kind: "personal" });
      await createEvent(s, TZ, { title: "Too far out", date: "2026-11-20", startTime: "08:00", endTime: "09:00", kind: "personal" });
      const bio = await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Exam 2", kind: "exam", dueDate: "2026-11-09", dueTime: "10:00" });
      await logHealth(s, TZ, { metric: "steps", value: 5060, date: "2026-11-07" }, NOW);
      return dayClockData(s, TZ, NOW);
    });

    expect(data.today).toBe("2026-11-07");
    expect(data.days.map((d) => d.short)).toEqual(["Wed", "Thu", "Fri", "Today", "Sun", "Mon", "Tue"]);
    expect(data.steps).toBe(5060);
    expect(data.empty).toBe(false);
    expect(data.base).toBe(new Date("2026-11-07T05:00:00Z").getTime());

    const byTitle = Object.fromEntries(data.items.map((i) => [i.title, i]));
    expect(Object.keys(byTitle).sort()).toEqual(["Class", "Exam 2", "Run with Sam", "Work"]);
    expect(byTitle.Work).toMatchObject({
      kind: "block",
      cat: "work",
      icon: "💼",
      start: 540,
      end: 990,
      subtitle: "Campus Coffee",
      source: "From your work schedule",
    });
    expect(byTitle.Class).toMatchObject({ cat: "class", icon: "🎓", start: 1080, end: 1200, source: "From Google Calendar" });
    expect(byTitle["Run with Sam"]).toMatchObject({ start: 1440 + 480, icon: "🏃", cat: "other" });
    expect(byTitle["Exam 2"]).toMatchObject({ kind: "due", cat: "due", start: 2880 + 600, source: "From your classes" });
  });

  it("adds last night's sleep, and today's spending only while money is shown", async () => {
    const { run } = await makeUser("Money Owner");
    const [shown, hidden] = await run(async (s) => {
      await logHealth(s, TZ, { metric: "sleep_hours", value: 7.3, date: "2026-11-07" }, NOW);
      const bank = await createManualAccount(s, {
        name: "Checking",
        type: "depository",
        subtype: "checking",
        institutionName: "Chase",
        currentBalanceCents: 50000,
      });
      for (const [description, amountCents, date] of [
        ["Lunch at work", -1420, "2026-11-07"],
        ["Shell gas", -5500, "2026-11-07"],
        ["Yesterday's coffee", -540, "2026-11-06"],
      ] as const)
        await createTransaction(s, {
          accountId: bank.id,
          date,
          description,
          merchantName: description,
          amountCents,
          kind: "expense",
          categoryId: null,
          pending: false,
        });
      return [await dayClockData(s, TZ, NOW, { money: true }), await dayClockData(s, TZ, NOW)];
    });
    expect(shown.sleepHours).toBeCloseTo(7.3);
    expect(shown.spentTodayCents).toBe(6920);
    // The Money lock is on (or money isn't asked for): nothing about money, not even a zero.
    expect(hidden.spentTodayCents).toBeNull();
    expect(hidden.items.some((i) => i.amountCents != null)).toBe(false);
  });

  it("is empty for someone with nothing connected or added, and never makes up steps", async () => {
    const { run } = await makeUser("New Person");
    const data = await run((s) => dayClockData(s, TZ, NOW));
    expect(data.items).toEqual([]);
    expect(data.steps).toBeNull();
    expect(data.sleepHours).toBeNull();
    expect(data.spentTodayCents).toBeNull();
    expect(data.empty).toBe(true);
  });
});
