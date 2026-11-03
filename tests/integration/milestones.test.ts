import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { saveLifeImport } from "@/server/services/life-import";
import { listActiveMemories, createMemory } from "@/server/services/memory";
import { createMilestone, deleteMilestone, lifeTimeline, updateMilestone, whenLabel } from "@/server/services/milestones";
import { createPersonalGoal, listPersonalGoals, updatePersonalGoal } from "@/server/services/personal-goals";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("life milestones", () => {
  it("keeps milestones newest first, adds reached goals, and drops them when un-done", async () => {
    const { run } = await makeUser();
    await run((s) => createMilestone(s, { title: "Graduated high school", category: "school", when: "2022" }));
    const job = await run((s) => createMilestone(s, { title: "First job", category: "work", when: "May 2023" }));
    await run((s) => createMilestone(s, { title: "Learned to swim" }));
    const goal = await run((s) => createPersonalGoal(s, { title: "Run a 5K" }));
    await run((s) => updatePersonalGoal(s, goal.id, { done: true }));

    let t = await run((s) => lifeTimeline(s, { includeMoney: true }));
    expect(t.map((i) => i.title)).toEqual(["Run a 5K", "First job", "Graduated high school", "Learned to swim"]);
    expect(t.map((i) => whenLabel(i))).toEqual([expect.any(String), "May 2023", "2022", null]);
    expect(t[0].kind).toBe("goal");

    await run((s) => updatePersonalGoal(s, goal.id, { done: false }));
    await run((s) => updateMilestone(s, job.id, { when: "2024-06-03", title: "First full-time job" }));
    t = await run((s) => lifeTimeline(s, { includeMoney: true }));
    expect(t.map((i) => i.title)).toEqual(["First full-time job", "Graduated high school", "Learned to swim"]);

    await run((s) => deleteMilestone(s, job.id));
    expect(await run((s) => lifeTimeline(s, { includeMoney: true }))).toHaveLength(2);
  });

  it("refuses a date it can't read and stays private to its owner", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await expect(a.run((s) => createMilestone(s, { title: "Moved out", when: "a while ago" }))).rejects.toThrow(/year like 2022/);
    const m = await a.run((s) => createMilestone(s, { title: "Moved out", when: "2021" }));
    expect(await b.run((s) => lifeTimeline(s, { includeMoney: true }))).toEqual([]);
    await expect(b.run((s) => deleteMilestone(s, m.id))).rejects.toThrow();
  });
});

describe("import from another AI", () => {
  it("saves only what was ticked, skipping private lines and things already saved", async () => {
    const { run } = await makeUser();
    await run((s) => createMemory(s, { content: "I study biology at Georgia State.", category: "fact" }, "user"));
    await run((s) => createMilestone(s, { title: "Graduated from Lincoln High", when: "2022", category: "school" }));
    const r = await run((s) =>
      saveLifeImport(s, [
        { kind: "fact", text: "I study biology at Georgia State.", category: "fact" },
        { kind: "fact", text: "I like short answers.", category: "preference" },
        { kind: "fact", text: "My password is hunter22", category: "fact" },
        { kind: "milestone", text: "Graduated from Lincoln High", when: "2022", category: "school" },
        { kind: "milestone", text: "Ran my first 5K", when: "sometime", category: "health" },
        { kind: "goal", text: "Get a 3.5 GPA" },
      ]),
    );
    expect(r).toEqual({ facts: 1, milestones: 1, goals: 1, skipped: 3 });
    const mems = await run((s) => listActiveMemories(s));
    expect(mems.find((m) => m.content === "I like short answers.")?.category).toBe("preference");
    const t = await run((s) => lifeTimeline(s, { includeMoney: false }));
    expect(t.find((i) => i.title === "Ran my first 5K")?.date).toBeNull(); // an unreadable date is dropped, not the milestone
    expect((await run((s) => listPersonalGoals(s))).map((g) => g.title)).toEqual(["Get a 3.5 GPA"]);
  });
});
