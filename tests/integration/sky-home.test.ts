import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { contributeToGoal } from "@/server/services/finance/goals";
import { createGoal } from "@/server/services/finance/planning";
import { createMilestone, deleteMilestone } from "@/server/services/milestones";
import { createPersonalGoal, updatePersonalGoal } from "@/server/services/personal-goals";
import { createCourse, createAssignment, updateAssignment } from "@/server/services/school";
import { SUNS_A_DAY, TICK_STARS_A_DAY, awardStar, skyCounts } from "@/server/services/sky-home";
import { createTask, updateTask } from "@/server/services/tasks";
import { unlocked } from "@/lib/sky-home";
import { localDateOf } from "@/lib/dates";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);

// The skyling's cloud (owner, 2026-11-11): stars from what you finish, suns only from the big things; each thing counts
// once, undoing it takes it back, and nothing can be farmed.
describe("stars and suns for the skyling's cloud", () => {
  it("a ticked to-do or assignment is a star, once; unticking takes it back", async () => {
    const { run } = await makeUser();
    const t = await run((s) => createTask(s, TZ, { title: "Email advisor" }));
    await run((s) => updateTask(s, TZ, t.id, { status: "done" }));
    await run((s) => updateTask(s, TZ, t.id, { status: "done" }));
    expect(await run((s) => skyCounts(s))).toEqual({ stars: 1, suns: 0 });
    await run((s) => updateTask(s, TZ, t.id, { status: "todo" }));
    expect(await run((s) => skyCounts(s))).toEqual({ stars: 0, suns: 0 });

    const course = await run((s) => createCourse(s, { name: "Biology" }));
    const a = await run((s) => createAssignment(s, TZ, { courseId: course.id, title: "Lab report" }));
    await run((s) => updateAssignment(s, TZ, a.assignment.id, { status: "done" }));
    expect((await run((s) => skyCounts(s))).stars).toBe(1);
  });

  it("ticks earn at most a day's worth of stars", async () => {
    const { run } = await makeUser();
    const now = new Date("2026-11-11T18:00:00Z");
    for (let i = 0; i < TICK_STARS_A_DAY + 5; i++) await run((s) => awardStar(s, `task:${i}`, TZ, now));
    expect((await run((s) => skyCounts(s))).stars).toBe(TICK_STARS_A_DAY);
    // a class the skyling passed isn't a tick, so it still counts
    expect(await run((s) => awardStar(s, "sky:event:x", TZ, now))).toBe(true);
  });

  it("a goal reached is a sun; setting it back takes it back; a money goal reached is a sun too", async () => {
    const { run } = await makeUser();
    const g = await run((s) => createPersonalGoal(s, { title: "Read 3 books", target: 3 }));
    expect((await run((s) => updatePersonalGoal(s, g.id, { progress: 2 }))).sun).toBe(false);
    expect((await run((s) => updatePersonalGoal(s, g.id, { progress: 3 }))).sun).toBe(true);
    // done again, or edited while done: no second sun
    expect((await run((s) => updatePersonalGoal(s, g.id, { title: "Read three books" }))).sun).toBe(false);
    expect(await run((s) => skyCounts(s))).toEqual({ stars: 0, suns: 1 });
    await run((s) => updatePersonalGoal(s, g.id, { done: false }));
    expect((await run((s) => skyCounts(s))).suns).toBe(0);

    const m = await run((s) => createGoal(s, { name: "Laptop", targetCents: 50_000 }));
    expect((await run((s) => contributeToGoal(s, { goalId: m.id, amountCents: 20_000, date: "2026-11-11" }))).sun).toBe(false);
    expect((await run((s) => contributeToGoal(s, { goalId: m.id, amountCents: 30_000, date: "2026-11-11" }))).sun).toBe(true);
  });

  it("a milestone that just happened is a sun; last year's or an import's is not; deleting takes it back; two a day at most", async () => {
    const { run } = await makeUser();
    // the person's own today (New York): the UTC date is tomorrow there for five hours each night, and a milestone tomorrow hasn't happened
    const today = localDateOf(new Date(), TZ);
    expect((await run((s) => createMilestone(s, { title: "Graduated", when: "2019" }))).sun).toBe(false);
    expect((await run((s) => createMilestone(s, { title: "First job", when: today }, "import"))).sun).toBe(false);
    const first = await run((s) => createMilestone(s, { title: "Ran a 5K", when: today }));
    expect(first.sun).toBe(true);
    await run((s) => deleteMilestone(s, first.id));
    expect((await run((s) => skyCounts(s))).suns).toBe(0);
    // the day's cap: suns are for the big things
    for (let i = 0; i < SUNS_A_DAY; i++) expect((await run((s) => createMilestone(s, { title: `Big thing ${i}` }))).sun).toBe(true);
    expect((await run((s) => createMilestone(s, { title: "One more" }))).sun).toBe(false);
    expect((await run((s) => skyCounts(s))).suns).toBe(SUNS_A_DAY);
  });

  it("what's on the cloud follows the counts", () => {
    expect([...unlocked({ stars: 4, suns: 0 })]).toEqual([]);
    expect([...unlocked({ stars: 34, suns: 1 })].sort()).toEqual(["balloon", "kite", "lights"]);
    expect(unlocked({ stars: 400, suns: 15 }).size).toBe(11);
  });

  it("another person can't see or count my stars", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await me.run((s) => awardStar(s, "sky:event:mine", TZ));
    expect(await other.run((s) => skyCounts(s))).toEqual({ stars: 0, suns: 0 });
  });
});
