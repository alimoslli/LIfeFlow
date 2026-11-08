import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { jarvisMessages, type UserPreferences } from "@/server/db/schema";
import { runProactive } from "@/server/services/proactive/engine";
import { respondToMessage } from "@/server/services/proactive/respond";
import { createPromise, listPromises } from "@/server/services/promises";
import { createTask, updateTask } from "@/server/services/tasks";
import { toCard } from "@/server/services/proactive/present";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const user = (id: string, preferences: UserPreferences = {}) => ({ id, timezone: TZ, preferences });
const H = 3600_000;

describe("promise check-ins", () => {
  it("asks once when the time has come, with three answers, and never before", async () => {
    const { user: u, run } = await makeUser();
    const said = new Date("2026-11-08T15:00:00Z");
    const p = (await run((s) => createPromise(s, TZ, { text: "Study for Bio", dueDate: "2026-11-08", dueTime: "18:00" }, said))).promise;
    const early = new Date(p.dueAt.getTime() - H);
    expect(await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now: early }))).toEqual([]);
    const due = new Date(p.dueAt.getTime() + 5 * 60_000);
    const [m] = await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now: due }));
    expect(m.kind).toBe("promise_check");
    expect(m.title).toContain("Study for Bio");
    expect(m.action).toMatchObject({ type: "promise_check", promiseId: p.id });
    expect(toCard(m, TZ).action?.choices).toEqual(["Yes, I did it", "Tomorrow instead", "It didn't happen"]);
    // The same check-in is never sent twice.
    expect(await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now: new Date(due.getTime() + H) }))).toEqual([]);
    expect(await run((s) => listPromises(s))).toHaveLength(1); // still open: nothing was decided for them
  });

  it("'Yes, I did it' keeps it warmly; 'It didn't happen' is gentle once and gets an attitude at three", async () => {
    const { user: u, run } = await makeUser();
    const said = new Date("2026-11-08T15:00:00Z");
    const answer = async (text: string, choice: string) => {
      const p = (await run((s) => createPromise(s, TZ, { text, dueDate: "2026-11-08", dueTime: "18:00" }, said))).promise;
      const now = new Date(p.dueAt.getTime() + 60_000);
      const [m] = await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now }));
      return run((s) => respondToMessage(s, user(u.id, { assistantStyle: "friend" }), m.id, "answer", "2026-11-08", choice));
    };
    expect((await answer("Gym", "Yes, I did it")).text).toMatch(/did it|Look at you/i);
    const first = await answer("Laundry", "It didn't happen");
    expect(first.text).not.toMatch(/\b3\b/);
    await answer("Read", "It didn't happen");
    const third = await answer("Email prof", "It didn't happen");
    expect(third.text).toMatch(/3 in two weeks/);
    const all = await run((s) => listPromises(s, "all"));
    expect(all.filter((x) => x.status === "broken")).toHaveLength(3);
    expect(all.filter((x) => x.status === "kept")).toHaveLength(1);
  });

  it("'Tomorrow instead' moves it a day and is not a broken promise", async () => {
    const { user: u, run } = await makeUser();
    const said = new Date("2026-11-08T15:00:00Z");
    const p = (await run((s) => createPromise(s, TZ, { text: "Call Dad", dueDate: "2026-11-08", dueTime: "18:00" }, said))).promise;
    const now = new Date(p.dueAt.getTime() + 60_000);
    const [m] = await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now }));
    await run((s) => respondToMessage(s, user(u.id), m.id, "answer", "2026-11-08", "Tomorrow instead"));
    const [after] = await run((s) => listPromises(s));
    expect(after.status).toBe("open");
    expect(after.dueAt.getTime()).toBe(p.dueAt.getTime() + 24 * H);
    // Tomorrow it asks again.
    const next = new Date(after.dueAt.getTime() + 60_000);
    const [m2] = await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "promise", now: next }));
    expect(m2.kind).toBe("promise_check");
  });

  it("finishing the linked to-do says something good and asks nothing", async () => {
    const { user: u, run } = await makeUser();
    const said = new Date("2026-11-08T15:00:00Z");
    const t = await run((s) => createTask(s, TZ, { title: "Lab report" }));
    const p = (await run((s) => createPromise(s, TZ, { text: "Finish the lab report", taskId: t.id, dueDate: "2026-11-08", dueTime: "18:00" }, said))).promise;
    await run((s) => updateTask(s, TZ, t.id, { status: "done" }));
    const [m] = await run((s) => runProactive({ scope: s, tz: TZ, prefs: u.preferences, trigger: "task", now: new Date(p.dueAt.getTime() - 3 * H) }));
    expect(m.kind).toBe("promise_kept");
    expect(m.title).toBe("Promise kept: Finish the lab report");
    expect(m.action).toBeNull();
    const rows = await run((s) => s.tx.select().from(jarvisMessages));
    expect(rows.some((r) => r.kind === "promise_check")).toBe(false);
  });
});
