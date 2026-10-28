import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { goalContributions, tasks } from "@/server/db/schema";
import { contributeToGoal, goalsWithPlans } from "@/server/services/finance/goals";
import { createGoal } from "@/server/services/finance/planning";
import { createTask } from "@/server/services/tasks";
import { deleteForever, listTrash, moveToTrash, restoreFromTrash } from "@/server/services/trash";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

describe("trash and undo", () => {
  it("deletes a task with its subtasks and restores them exactly", async () => {
    const { run } = await makeUser();
    const parent = await run((s) => createTask(s, TZ, { title: "Essay", dueDate: "2026-11-02", priority: "high" }));
    await run((s) => createTask(s, TZ, { title: "Outline", parentId: parent.id }));
    const t = await run((s) => moveToTrash(s, "task", parent.id));
    expect(t.label).toBe("Essay");
    expect(await run((s) => s.tx.select().from(tasks))).toHaveLength(0);
    expect((await run(listTrash)).map((x) => x.label)).toEqual(["Essay"]);
    await run((s) => restoreFromTrash(s, t.trashId));
    const back = await run((s) => s.tx.select().from(tasks));
    expect(back.map((x) => x.title).sort()).toEqual(["Essay", "Outline"]);
    expect(back.find((x) => x.title === "Essay")).toMatchObject({ id: parent.id, priority: "high", dueAt: parent.dueAt });
    expect(back.find((x) => x.title === "Outline")!.parentId).toBe(parent.id);
    expect(await run(listTrash)).toHaveLength(0);
  });

  it("restores a goal with its contribution history", async () => {
    const { run } = await makeUser();
    const g = await run((s) => createGoal(s, { name: "Laptop", targetCents: 100_000 }));
    await run((s) => contributeToGoal(s, { goalId: g.id, amountCents: 20_000, date: "2026-10-28" }));
    const t = await run((s) => moveToTrash(s, "goal", g.id));
    expect(await run((s) => s.tx.select().from(goalContributions))).toHaveLength(0);
    await run((s) => restoreFromTrash(s, t.trashId));
    const [back] = await run((s) => goalsWithPlans(s, "2026-10-28"));
    expect(back).toMatchObject({ id: g.id, savedCents: 20_000 });
    expect(await run((s) => s.tx.select().from(goalContributions).where(eq(goalContributions.goalId, g.id)))).toHaveLength(1);
  });

  it("keeps trash private, expires it after 30 days, and can empty it", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const task = await a.run((s) => createTask(s, TZ, { title: "Private" }));
    const t = await a.run((s) => moveToTrash(s, "task", task.id));
    await expect(b.run((s) => restoreFromTrash(s, t.trashId))).rejects.toThrow(/no longer in the trash/);
    expect(await b.run(listTrash)).toHaveLength(0);
    expect(await a.run((s) => listTrash(s, new Date(Date.now() + 31 * 86_400_000)))).toHaveLength(0);
    const t2 = await a.run(async (s) => moveToTrash(s, "task", (await createTask(s, TZ, { title: "Again" })).id));
    expect(await a.run((s) => deleteForever(s, [t2.trashId]))).toBe(1);
  });
});
