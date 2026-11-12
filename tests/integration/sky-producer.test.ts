import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { calendarEvents } from "@/server/db/schema";
import { createEvent } from "@/server/services/calendar";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { listInsights } from "@/server/services/insights";
import { doCloud } from "@/server/services/idea-clouds";
import { makeUser, TZ } from "../helpers";

// The sky's own noticing (docs/backlog/2026-11-12-useful-sky.md) reaches the clouds through the shared shape (lib/insights):
// a free gap is a tip with its Block it fix, which the cloud runs from the key alone, with Undo like every Do it.

afterAll(closeDb);

/** Tuesday Nov 17, 2026, 9:30 AM in New York. */
const NOW = localToInstant("2026-11-17", "09:30", TZ);

describe("the sky producer", () => {
  it("gives the clouds a free gap with its fix, which runs from the key and books the time", async () => {
    const { user, run } = await makeUser("Cloud Gap");
    await run(async (s) => {
      const bio = await createCourse(s, { name: "Biology", code: "BIO 101" });
      await createEvent(s, TZ, { title: "BIO 101", date: "2026-11-17", startTime: "10:00", endTime: "11:00", kind: "class", courseId: bio.id });
      const job = await createEmployer(s, { name: "Campus Coffee", hourlyRateCents: 1500 });
      await createShift(s, TZ, { employerId: job.id, date: "2026-11-17", startTime: "13:00", endTime: "17:00" });
      await createAssignment(s, TZ, { courseId: bio.id, title: "Lab report", dueDate: "2026-11-18", dueTime: "23:59" });
    });
    const list = await run((s) => listInsights(s, TZ, user.preferences, NOW));
    const gap = list.find((i) => i.source === "sky" && i.kind === "gap")!;
    expect(gap).toMatchObject({ tone: "tip", headline: "2 hours free at 11 AM, after BIO 101", about: ["free"] });
    expect(gap.action?.doIt).toEqual({ kind: "block", payload: { block: { date: "2026-11-17", start: "11:00", end: "12:30", title: "Work on Lab report" } } });
    await run((s) => doCloud(s, user, gap.key, NOW));
    const booked = await run((s) =>
      s.tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, user.id), eq(calendarEvents.kind, "study"))),
    );
    expect(booked.map((e) => e.title)).toEqual(["Work on Lab report"]);
  });

  it("never says money while the Money lock is on", async () => {
    const { user, run } = await makeUser("Cloud Locked");
    const evening = localToInstant("2026-11-17", "17:00", TZ);
    const list = await run((s) => listInsights(s, TZ, { ...user.preferences, moneyLock: { enabled: true } } as never, evening));
    expect(list.filter((i) => i.source === "sky").some((i) => i.money || /\$/.test(`${i.headline} ${i.why}`))).toBe(false);
  });
});
