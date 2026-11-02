import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { doneToday } from "@/server/services/done-today";
import { createTask, updateTask } from "@/server/services/tasks";
import { makeUser, TZ } from "../helpers";
import { todayIn } from "@/lib/dates";

afterAll(closeDb);

describe("done today", () => {
  it("lists to-dos finished today, newest first, and nothing still open or from another user", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const today = todayIn(TZ);
    await u.run(async (s) => {
      const a = await createTask(s, TZ, { title: "First" });
      const b = await createTask(s, TZ, { title: "Second" });
      await createTask(s, TZ, { title: "Still open" });
      await updateTask(s, TZ, a.id, { status: "done" });
      await updateTask(s, TZ, b.id, { status: "done" });
    });
    await other.run(async (s) => {
      const t = await createTask(s, TZ, { title: "Not mine" });
      await updateTask(s, TZ, t.id, { status: "done" });
    });
    const done = await u.run((s) => doneToday(s, today, TZ));
    expect(done.map((d) => d.title)).toEqual(["Second", "First"]);
    expect(done[0]).toMatchObject({ kind: "task", href: expect.stringMatching(/^\/tasks\//) });
  });
});
