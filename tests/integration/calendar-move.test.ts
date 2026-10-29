import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { localDateOf, localTimeOf } from "@/lib/dates";
import { createEvent, moveAgendaItem } from "@/server/services/calendar";
import { createAssignment, createCourse, getAssignment } from "@/server/services/school";
import { createTask, getTask } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("calendar drag and drop", () => {
  it("moves events, to-dos and assignments to another day and keeps their time", async () => {
    const { run } = await makeUser();
    await run(async (s) => {
      const ev = await createEvent(s, TZ, { title: "Study group", date: "2026-11-02", startTime: "15:00", endTime: "16:30", kind: "study" });
      const moved = (await moveAgendaItem(s, TZ, "event", ev.id, "2026-11-04")) as { startsAt: Date; endsAt: Date };
      expect([localDateOf(moved.startsAt, TZ), localTimeOf(moved.startsAt, TZ), localTimeOf(moved.endsAt, TZ)]).toEqual(["2026-11-04", "15:00", "16:30"]);

      const t = await createTask(s, TZ, { title: "Call bank", dueDate: "2026-11-02", dueTime: "09:30" });
      await moveAgendaItem(s, TZ, "task", t.id, "2026-11-05");
      const t2 = await getTask(s, t.id);
      expect([localDateOf(t2.dueAt!, TZ), localTimeOf(t2.dueAt!, TZ)]).toEqual(["2026-11-05", "09:30"]);

      const c = await createCourse(s, { name: "Biology" });
      const a = await createAssignment(s, TZ, { courseId: c.id, title: "Lab report", dueDate: "2026-11-03" });
      const aid = a.assignment.id;
      await moveAgendaItem(s, TZ, "assignment", aid, "2026-11-06");
      const a2 = await getAssignment(s, aid);
      expect(localDateOf(a2.dueAt!, TZ)).toBe("2026-11-06");

      const weekly = await createEvent(s, TZ, { title: "Class", date: "2026-11-02", startTime: "10:00", endTime: "11:00", recurrence: { freq: "weekly" } });
      await expect(moveAgendaItem(s, TZ, "event", weekly.id, "2026-11-03")).rejects.toThrow(/Repeating events/);
    });
  });
});
