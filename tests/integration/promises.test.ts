import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createTask, updateTask } from "@/server/services/tasks";
import {
  createPromise,
  dropStalePromises,
  keepFinishedTaskPromises,
  cancelPromise,
  listPromises,
  movePromise,
  promisesDue,
  promiseStats,
  resolvePromise,
} from "@/server/services/promises";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
const H = 3600_000;

describe("promises", () => {
  it("saves what was said, checks back at 9 PM, and never duplicates the same words", async () => {
    const { run } = await makeUser();
    const now = new Date("2026-11-08T15:00:00Z"); // 10 AM in New York
    const a = await run((s) => createPromise(s, TZ, { text: "Study for Bio" }, now));
    expect(a.created).toBe(true);
    expect(a.promise.dueAt.toISOString()).toBe("2026-11-09T02:00:00.000Z"); // 9 PM EST
    const again = await run((s) => createPromise(s, TZ, { text: "study for bio" }, now));
    expect(again.created).toBe(false);
    expect(again.promise.id).toBe(a.promise.id);
    expect((await run((s) => listPromises(s))).length).toBe(1);
    // Said late at night with no time: the check-in is tomorrow, not a minute from now.
    const late = new Date("2026-11-09T01:50:00Z");
    const b = await run((s) => createPromise(s, TZ, { text: "Call mom" }, late));
    expect(b.promise.dueAt.getTime()).toBeGreaterThan(late.getTime() + 12 * H);
  });

  it("is kept or broken only by an answer, never by waiting; an unanswered one is dropped, not broken", async () => {
    const { run } = await makeUser();
    const now = new Date("2026-11-08T15:00:00Z");
    const p = (await run((s) => createPromise(s, TZ, { text: "Gym", dueDate: "2026-11-08", dueTime: "18:00" }, now))).promise;
    const later = new Date(p.dueAt.getTime() + 2 * H);
    expect((await run((s) => promisesDue(s, later))).map((x) => x.id)).toEqual([p.id]);
    expect((await run((s) => promisesDue(s, now))).length).toBe(0); // not yet
    expect(await run((s) => dropStalePromises(s, later))).toEqual([]); // two hours is not a week
    const week = new Date(p.dueAt.getTime() + 8 * 86_400_000);
    expect((await run((s) => dropStalePromises(s, week))).length).toBe(1);
    expect(await run(promiseStats)).toMatchObject({ brokenRecent: 0 });
  });

  it("finishing the linked to-do keeps the promise without asking; the user's own answer works too", async () => {
    const { run } = await makeUser();
    const now = new Date("2026-11-08T15:00:00Z");
    const t = await run((s) => createTask(s, TZ, { title: "Finish lab report" }));
    const p = (await run((s) => createPromise(s, TZ, { text: "Finish the lab report tonight", taskId: t.id }, now))).promise;
    expect(await run((s) => keepFinishedTaskPromises(s, now))).toEqual([]); // not done yet
    await run((s) => updateTask(s, TZ, t.id, { status: "done" }));
    const kept = await run((s) => keepFinishedTaskPromises(s, now));
    expect(kept.map((k) => k.id)).toEqual([p.id]);
    const res = await run((s) => resolvePromise(s, p.id, "broken", "you", now));
    expect(res.changed).toBe(false); // already settled, so a late answer doesn't flip it
    expect((await run((s) => listPromises(s, "all")))[0]).toMatchObject({ status: "kept", resolvedBy: "task" });
  });

  it("counts broken promises over 14 days, moves at most twice, and is private", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const now = new Date("2026-11-08T15:00:00Z");
    const ids: string[] = [];
    for (const text of ["One", "Two", "Three"]) ids.push((await a.run((s) => createPromise(s, TZ, { text, dueDate: "2026-11-09" }, now))).promise.id);
    for (const id of ids) await a.run((s) => resolvePromise(s, id, "broken", "you", now));
    expect((await a.run((s) => promiseStats(s, now))).brokenRecent).toBe(3);
    expect((await a.run((s) => promiseStats(s, new Date(now.getTime() + 15 * 86_400_000)))).brokenRecent).toBe(0);

    const m = (await a.run((s) => createPromise(s, TZ, { text: "Move me", dueDate: "2026-11-10" }, now))).promise;
    await a.run((s) => movePromise(s, m.id, TZ, now));
    await a.run((s) => movePromise(s, m.id, TZ, now));
    await expect(a.run((s) => movePromise(s, m.id, TZ, now))).rejects.toThrow(/twice/);

    expect(await b.run((s) => listPromises(s, "all"))).toEqual([]);
    await expect(b.run((s) => resolvePromise(s, m.id, "kept", "you"))).rejects.toThrow(/not found/);
  });

  it("cancelling removes a mis-sorted promise: no check-in, never broken, private", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const now = new Date("2026-11-08T15:00:00Z");
    const p = (await a.run((s) => createPromise(s, TZ, { text: "Wrong kind", dueDate: "2026-11-08", dueTime: "18:00" }, now))).promise;
    await expect(b.run((s) => cancelPromise(s, p.id))).rejects.toThrow(/not found/);
    expect(await a.run((s) => cancelPromise(s, p.id))).toEqual({ id: p.id });
    const later = new Date(p.dueAt.getTime() + 2 * H);
    expect(await a.run((s) => promisesDue(s, later))).toEqual([]);
    expect(await a.run((s) => listPromises(s, "all"))).toEqual([]);
    expect((await a.run((s) => promiseStats(s, later))).brokenRecent).toBe(0);
    // An answered promise is history, not removable.
    const k = (await a.run((s) => createPromise(s, TZ, { text: "Done one", dueDate: "2026-11-09" }, now))).promise;
    await a.run((s) => resolvePromise(s, k.id, "kept", "you", now));
    await expect(a.run((s) => cancelPromise(s, k.id))).rejects.toThrow(/not found/);
  });

  it("'Tomorrow instead' after a late answer lands tomorrow (from now) at the same time, not already in the past", async () => {
    const { run } = await makeUser();
    const made = new Date("2026-11-07T15:00:00Z");
    const p = (await run((s) => createPromise(s, TZ, { text: "Late answer", dueDate: "2026-11-07" }, made))).promise; // 9 PM EST Nov 7
    const answered = new Date("2026-11-10T15:00:00Z"); // the card sat for days
    const moved = await run((s) => movePromise(s, p.id, TZ, answered));
    expect(moved.dueAt.toISOString()).toBe("2026-11-12T02:00:00.000Z"); // 9 PM EST on Nov 11
    expect(await run((s) => promisesDue(s, answered))).toEqual([]); // no instant re-ask
    // Answered the same evening: simply the next day.
    const q = (await run((s) => createPromise(s, TZ, { text: "Same night", dueDate: "2026-11-08" }, made))).promise;
    const m2 = await run((s) => movePromise(s, q.id, TZ, new Date("2026-11-09T02:05:00Z")));
    expect(m2.dueAt.toISOString()).toBe("2026-11-10T02:00:00.000Z");
  });
});
