import { afterAll, describe, expect, it } from "vitest";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { jarvisMessages } from "@/server/db/schema";
import { createEvent } from "@/server/services/calendar";
import { morningBriefLine, nextUpNote } from "@/server/services/next-up";
import { createAssignment, createCourse } from "@/server/services/school";
import { createEmployer, createShift } from "@/server/services/work";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The owner's Today list, item 1 (2026-11-16): the note is the next real thing in the next 24 hours, from any source.
describe("Today's note from real records", () => {
  it("names the next class, carries tonight's deadline along, and never reaches past 24 hours", async () => {
    const u = await makeUser();
    const course = await u.run((s) => createCourse(s, { name: "Calculus I", code: "MATH 151" }));
    await u.run((s) => createEvent(s, TZ, { title: "Calculus I", date: "2026-11-16", startTime: "10:00", endTime: "10:50", kind: "class" }));
    await u.run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Problem set 9", dueDate: "2026-11-16", dueTime: "23:59" }));
    await u.run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Midterm review", dueDate: "2026-11-20", dueTime: "09:00" }));
    const note = await u.run((s) => nextUpNote(s, TZ, localToInstant("2026-11-16", "07:40", TZ)));
    expect(note?.text).toBe("Next: Calculus I at 10:00 AM · Problem set 9 due tonight 11:59 PM");
    // what it talks about, so no idea cloud repeats it
    expect(note?.topics).toEqual(["due", "due:problem set 9"]);
    // late at night, only the farther things are left: nothing in the next 24 hours, so no note from here
    const late = await u.run((s) => nextUpNote(s, TZ, localToInstant("2026-11-17", "23:30", TZ)));
    expect(late).toBeNull();
  });

  it("a shift, a client meeting and an all-day delivery are all real things; the delivery rides along once it is within 24 hours", async () => {
    const u = await makeUser();
    const job = await u.run((s) => createEmployer(s, { name: "Target", hourlyRateCents: 1600 }));
    await u.run((s) => createShift(s, TZ, { employerId: job.id, date: "2026-11-16", startTime: "17:00", endTime: "22:00" }));
    await u.run((s) => createEvent(s, TZ, { title: "Pitch with Northside Bakery", date: "2026-11-16", startTime: "13:00", endTime: "14:00", kind: "work" }));
    await u.run((s) => createEvent(s, TZ, { title: "Deliver Rivera wedding gallery", date: "2026-11-17", allDay: true, kind: "work" }));
    const noon = localToInstant("2026-11-16", "12:00", TZ);
    expect((await u.run((s) => nextUpNote(s, TZ, noon)))?.text).toBe(
      "Next: Pitch with Northside Bakery at 1:00 PM · Deliver Rivera wedding gallery due tomorrow",
    );
    const evening = localToInstant("2026-11-16", "15:00", TZ);
    expect((await u.run((s) => nextUpNote(s, TZ, evening)))?.text).toBe("Next: Target shift at 5:00 PM · Deliver Rivera wedding gallery due tomorrow");
    const night = localToInstant("2026-11-16", "23:00", TZ);
    expect((await u.run((s) => nextUpNote(s, TZ, night)))?.text).toBe("Deliver Rivera wedding gallery due tomorrow");
  });

  it("the morning brief on Today is the one the skyling wrote today, without money under the lock", async () => {
    const u = await makeUser();
    const now = localToInstant("2026-11-16", "08:10", TZ);
    expect(await u.run((s) => morningBriefLine(s, TZ, now, { money: true }))).toBeNull();
    await u.run((s) =>
      s.tx.insert(jarvisMessages).values({
        userId: s.userId,
        kind: "morning_brief",
        topic: "general",
        dedupeKey: "morning_brief:2026-11-16",
        title: "Your morning brief",
        body: "3 things on today's list.",
        facts: { count: 3, money: "$420.00 available now", oneThing: "Finish Problem set 9" },
      }),
    );
    expect(await u.run((s) => morningBriefLine(s, TZ, now, { money: true }))).toBe("3 things on today's list, $420.00 available now");
    expect(await u.run((s) => morningBriefLine(s, TZ, now, { money: false }))).toBe("3 things on today's list");
  });
});
