import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { makeToolContext } from "@/server/jarvis/agent";
import { createConversation } from "@/server/jarvis/conversations";
import { executeToolCall } from "@/server/jarvis/executor";
import { createAssignment, createCourse } from "@/server/services/school";
import { TICK_STARS_A_DAY } from "@/server/services/sky-home";
import { createTask } from "@/server/services/tasks";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser, TZ } from "../helpers";

/**
 * The owner's note on a graded answer (2026-11-26): "remember the stars?". When the skyling ticks a to-do or an assignment,
 * the result says whether that tick really earned a star, read back from the person's own records, so the skyling can say so
 * and never claims one that wasn't earned (the day has a limit).
 */
afterAll(closeDb);

const NOW = new Date("2026-11-21T18:30:00Z");

async function setup() {
  const u = await makeUser("Robin Vale");
  const session: SessionUser = { id: u.user.id, email: u.user.email, name: u.user.name, timezone: TZ, accountKind: "standard" };
  const conversationId = (await u.run((s) => createConversation(s, "home", "Stars"))).id;
  const ctx = makeToolContext(session, conversationId, NOW, "done with it");
  const call = async (name: string, args: unknown) => {
    const out = await executeToolCall(name, JSON.stringify(args), ctx, `c-${Math.random()}`);
    if (out.kind !== "result" || !out.result.ok) throw new Error(`${name} failed: ${JSON.stringify(out)}`);
    return out.result.data as { star?: boolean; updated: { status?: string } };
  };
  return { u, call };
}

describe("a tick through the skyling says when it earned a star", () => {
  it("a to-do marked done: star true; any other change: no star in the result", async () => {
    const { u, call } = await setup();
    const task = await u.run((s) => createTask(s, TZ, { title: "Email my advisor" }));
    const renamed = await call("update_task", { id: task.id, title: "Email Dr. Osei" });
    expect("star" in renamed).toBe(false);
    const done = await call("update_task", { id: task.id, status: "done" });
    expect(done.star).toBe(true);
    // done again: nothing new was earned, so no star is claimed
    const again = await call("update_task", { id: task.id, status: "done" });
    expect("star" in again).toBe(false);
    // unticking takes the star back, and the result no longer says there is one
    const undone = await call("update_task", { id: task.id, status: "todo" });
    expect("star" in undone).toBe(false);
  });

  it("an assignment marked done: star true", async () => {
    const { u, call } = await setup();
    const a = await u.run(async (s) => {
      const course = await createCourse(s, { name: "Intro to Biology", code: "BIO 110" });
      return (await createAssignment(s, TZ, { courseId: course.id, title: "Lab report", kind: "lab", dueDate: "2026-11-23" })).assignment;
    });
    expect((await call("update_assignment", { id: a.id, status: "done" })).star).toBe(true);
    expect("star" in (await call("update_assignment", { id: a.id, status: "done" }))).toBe(false);
  });

  it("past the day's limit a tick earns no star, and the result does not claim one", async () => {
    const { u, call } = await setup();
    const made = await u.run(async (s) => {
      const out = [];
      for (let i = 0; i <= TICK_STARS_A_DAY; i++) out.push(await createTask(s, TZ, { title: `Small thing ${i + 1}` }));
      return out;
    });
    const stars = [];
    for (const t of made) stars.push((await call("update_task", { id: t.id, status: "done" })).star === true);
    expect(stars.filter(Boolean)).toHaveLength(TICK_STARS_A_DAY);
    expect(stars[stars.length - 1]).toBe(false);
  }, 60_000);
});
