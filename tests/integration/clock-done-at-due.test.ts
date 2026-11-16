import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { localToInstant } from "@/lib/dates";
import { closeDb } from "@/server/db/client";
import { assignments } from "@/server/db/schema";
import { dayClockData } from "@/server/services/day-clock";
import { createAssignment, createCourse } from "@/server/services/school";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// COO, 2026-11-16: the test students saw "Problem Set 12, 2:58 AM" on the line, the time it was handed in, while it was
// due at 11:59 PM. A done thing with a due time sits at its due time, ticked.
describe("a done assignment on the day's line", () => {
  it("sits at its due time, ticked, not when it was handed in", async () => {
    const u = await makeUser();
    const course = await u.run((s) => createCourse(s, { name: "Calculus I", code: "MATH 151" }));
    const a = await u.run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Problem Set 12", dueDate: "2026-11-16", dueTime: "23:59" }));
    const id = a.assignment.id;
    await u.run((s) =>
      s.tx
        .update(assignments)
        .set({ status: "done", completedAt: localToInstant("2026-11-16", "02:58", TZ) })
        .where(eq(assignments.id, id)),
    );
    const data = await u.run((s) => dayClockData(s, TZ, localToInstant("2026-11-16", "09:00", TZ)));
    const done = data.items.find((it) => it.id === `done:assignment:${id}`);
    expect(done?.done).toBe(true);
    expect(done?.atDue).toBe(true);
    expect(done?.start).toBe(23 * 60 + 59);
  });
});
