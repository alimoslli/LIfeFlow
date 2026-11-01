import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createPersonalGoal, deletePersonalGoal, listPersonalGoals, updatePersonalGoal } from "@/server/services/personal-goals";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("personal goals (not about money)", () => {
  it("tracks a number, finishes itself at the target, and can be un-done", async () => {
    const { run } = await makeUser();
    const g = await run((s) => createPersonalGoal(s, { title: "Read 12 books", target: 12, unit: "books", targetDate: "2026-12-31" }));
    expect(g).toMatchObject({ progress: 0, doneAt: null });
    expect((await run((s) => updatePersonalGoal(s, g.id, { progress: 11 }))).doneAt).toBeNull();
    const done = await run((s) => updatePersonalGoal(s, g.id, { progress: 12 }));
    expect(done.doneAt).not.toBeNull();
    expect((await run((s) => updatePersonalGoal(s, g.id, { progress: 99 }))).progress).toBe(12); // never past the target
    expect((await run((s) => updatePersonalGoal(s, g.id, { progress: 10 }))).doneAt).toBeNull();

    // A goal without a number is just done or not.
    const run5k = await run((s) => createPersonalGoal(s, { title: "Run a 5K" }));
    expect((await run((s) => updatePersonalGoal(s, run5k.id, { done: true }))).doneAt).not.toBeNull();
    const list = await run(listPersonalGoals);
    expect(list.map((x) => x.title)).toEqual(["Read 12 books", "Run a 5K"]); // open first, done last
    await expect(run((s) => createPersonalGoal(s, { title: "  " }))).rejects.toThrow(/name/);
  });

  it("is private to its owner", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const g = await a.run((s) => createPersonalGoal(s, { title: "Get a B in Chem" }));
    expect(await b.run(listPersonalGoals)).toEqual([]);
    await expect(b.run((s) => updatePersonalGoal(s, g.id, { done: true }))).rejects.toThrow(/not found/);
    await expect(b.run((s) => deletePersonalGoal(s, g.id))).rejects.toThrow(/not found/);
  });
});
