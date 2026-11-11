import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { getTool } from "@/server/jarvis/registry";
import { listEventsInRange } from "@/server/services/calendar";
import { createCourse } from "@/server/services/school";
import { listTasks } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

const NOW = new Date("2026-11-11T15:00:00Z");

// COO, 2026-11-11 (seen while filming): the model passed a courseId that didn't exist, got "Course not found" and saved
// the class without its course. Events and to-dos now take the course by name or code; an unknown one lists the real ones.
describe("events and to-dos take their course by name", () => {
  it("matches a name or code, still takes a real id, and refuses a made-up one with the real list, saving nothing", async () => {
    const { user, run } = await makeUser();
    const ctx = { userId: user.id, tz: TZ, today: "2026-11-11", now: NOW, conversationId: "", userText: "", memorySuggestions: false, run };
    const call = (name: string, args: Record<string, unknown>) => getTool(name)!.execute(args as never, ctx) as Promise<Record<string, unknown>>;
    const bio = await run((s) => createCourse(s, { name: "Intro to Biology", code: "BIO 110" }));
    await run((s) => createCourse(s, { name: "Calculus II", code: "MATH 152" }));

    await call("create_events", { events: [{ title: "BIO lab", date: "2026-11-12", startTime: "10:00", endTime: "12:00", kind: "class", course: "bio 110" }] });
    await call("create_events", { events: [{ title: "Bio review", date: "2026-11-13", startTime: "15:00", endTime: "16:00", course: bio.id }] });
    await call("create_tasks", { tasks: [{ title: "Read chapter 4", course: "Biology" }] });
    const listEvents = () => run((s) => listEventsInRange(s, TZ, "2026-11-10", "2026-11-20"));
    const events = await listEvents();
    expect(
      events
        .filter((e) => e.courseId === bio.id)
        .map((e) => e.title)
        .sort(),
    ).toEqual(["BIO lab", "Bio review"]);
    expect((await run((s) => listTasks(s))).find((t) => t.title === "Read chapter 4")?.courseId).toBe(bio.id);

    // a made-up id or an unknown name: the real courses come back, and nothing in that call is saved
    for (const course of ["7d0f6a2e-1111-4222-8333-944455556666", "Chemistry"]) {
      await expect(
        call("create_events", {
          events: [
            { title: "Fine", date: "2026-11-14" },
            { title: "Wrong course", date: "2026-11-14", course },
          ],
        }),
      ).rejects.toThrow(/Their courses: Calculus II \(MATH 152\), Intro to Biology \(BIO 110\)\./);
    }
    expect((await listEvents()).map((e) => e.title)).not.toContain("Fine");
  });
});
