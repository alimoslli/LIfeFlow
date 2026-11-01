import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createPersonalGoal, deletePersonalGoal, listPersonalGoals, updatePersonalGoal } from "@/server/services/personal-goals";
import { goalsWithPlans } from "@/server/services/finance/goals";
import { createGoal } from "@/server/services/finance/planning";
import { checkedInOn, logGoalCheckin, openGoals } from "@/server/services/goal-checkins";
import { DETECTORS } from "@/server/services/proactive/detectors";
import { makeUser, TZ } from "../helpers";

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

  it("check-ins: in the user's words, money adds to the goal, a count moves forward, and Jarvis asks once a day", async () => {
    const { run } = await makeUser();
    const today = "2026-11-02";
    const books = await run((s) => createPersonalGoal(s, { title: "Read 12 books", target: 12, unit: "books" }));
    const walk = await run((s) => createPersonalGoal(s, { title: "Lose 10 lbs" }));
    const car = await run((s) => createGoal(s, { name: "Car fund", targetCents: 300_000, savedCents: 80_000 }));
    expect((await run((s) => openGoals(s))).map((g) => `${g.kind}:${g.title}`)).toEqual(["personal:Read 12 books", "personal:Lose 10 lbs", "money:Car fund"]);

    // Jarvis's evening question names the open goals.
    const ask = async () => run((s) => DETECTORS.goalCheckin({ scope: s, tz: TZ, today, now: new Date(`${today}T23:00:00Z`) }));
    expect((await ask())[0]).toMatchObject({ kind: "goal_checkin", facts: { goals: "Read 12 books, Lose 10 lbs, Car fund" } });

    await run((s) => logGoalCheckin(s, today, { goalKind: "money", goalId: car.id, note: "Skipped takeout", amountCents: 2_000 }));
    await run((s) => logGoalCheckin(s, today, { goalKind: "personal", goalId: walk.id, note: "Walked 30 minutes, ate less" }));
    await run((s) => logGoalCheckin(s, today, { goalKind: "personal", goalId: books.id, note: "Finished Dune", progress: 1 }));
    expect((await run((s) => goalsWithPlans(s, today))).find((g) => g.id === car.id)?.savedCents).toBe(82_000);
    expect((await run(listPersonalGoals)).find((g) => g.id === books.id)?.progress).toBe(1);
    expect([...(await run((s) => checkedInOn(s, today)))].sort()).toEqual([books.id, walk.id, car.id].sort());
    expect(await ask()).toEqual([]); // everything checked in: no question tonight

    // Never an amount on a goal that isn't about money.
    await expect(run((s) => logGoalCheckin(s, today, { goalKind: "personal", goalId: walk.id, note: "x", amountCents: 500 }))).rejects.toThrow(
      /isn't about money/,
    );
  });
});
