import { describe, expect, it } from "vitest";
import { OFFLINE_BATCH_MAX } from "@/lib/offline-limits";
import {
  applyOutcome,
  backoffMs,
  chunk,
  classifyHttp,
  failDependents,
  MAX_ATTEMPTS,
  nextSeq,
  orderOps,
  readyOps,
  type OpLike,
} from "@/lib/offline-queue-logic";

const op = (id: string, more: Partial<OpLike> = {}): OpLike => ({ id, kind: "task.create", data: {}, ...more });

describe("offline queue logic", () => {
  it("replays in creation order, not id order", () => {
    const ops = [op("zzz", { seq: 1 }), op("aaa", { seq: 3 }), op("mmm", { seq: 2 })];
    expect(orderOps(ops).map((o) => o.id)).toEqual(["zzz", "mmm", "aaa"]);
    // Older rows without a sequence number fall back to when they were queued.
    expect(orderOps([op("b", { queuedAt: 20 }), op("a", { queuedAt: 10 })]).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("numbers new changes above everything stored, even if the clock went back", () => {
    expect(nextSeq([], 1000)).toBe(1000);
    expect(nextSeq([{ seq: 5000 }, { queuedAt: 7000 }], 1000)).toBe(7001);
  });

  it("sends in batches within the server's limit", () => {
    const ops = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunk(ops);
    expect(OFFLINE_BATCH_MAX).toBe(100);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(ops);
  });

  it("makes a change that depends on an earlier one wait for it", () => {
    const create = op("t1", { seq: 1 });
    const tick = op("s1", { seq: 2, kind: "task.status", data: { taskId: "t1", done: true } });
    expect(readyOps([tick, create], "u", 0).map((o) => o.id)).toEqual(["t1"]);
    expect(readyOps([tick], "u", 0).map((o) => o.id)).toEqual(["s1"]); // the earlier one is saved: go
    // When the create fails for good, what depended on it fails with it (it could never be saved).
    const [c2, t2] = failDependents([{ ...create, state: "failed" as const }, tick], "t1");
    expect(c2.state).toBe("failed");
    expect(t2).toMatchObject({ state: "failed" });
    expect(readyOps([c2, t2], "u", 0)).toEqual([]);
    // Other changes are left alone.
    expect(failDependents([op("x", { seq: 3 })], "t1")[0].state).toBeUndefined();
  });

  it("keeps two changes to the same item in order: tick done, undo, with the first retrying", () => {
    const done = op("d1", { seq: 1, kind: "task.status", data: { taskId: "t", done: true } });
    const undo = op("d2", { seq: 2, kind: "task.status", data: { taskId: "t", done: false } });
    let stored = [undo, done]; // stored order doesn't matter
    let state: boolean | undefined; // the server's copy of the to-do
    let deadlock = true; // the first attempt hits a temporary database error
    let now = 0;
    for (let round = 0; round < 6 && stored.length; round++) {
      const ready = readyOps(stored, "u", now);
      for (const o of ready) {
        const r = deadlock && o.id === "d1" ? { id: o.id, status: "failed" as const, retryable: true } : { id: o.id, status: "applied" as const };
        if (r.status === "applied") state = o.data.done as boolean;
        deadlock = false;
        stored = stored.map((x) => (x.id === o.id ? applyOutcome(x, r, now) : x)).filter((x): x is OpLike => !!x);
      }
      // While the first is backing off, the undo must not be sent past it.
      if (round === 0) expect(state).toBeUndefined();
      now += 60_000;
    }
    expect(stored).toEqual([]);
    expect(state).toBe(false); // ends undone
  });

  it("gives up on a change that keeps failing, and keeps it visible", () => {
    let o: OpLike | null = op("a");
    for (let i = 1; i < MAX_ATTEMPTS; i++) o = applyOutcome(o!, { id: "a", status: "failed", retryable: true }, 0);
    expect(o).toMatchObject({ attempts: MAX_ATTEMPTS - 1 });
    expect(o!.state).toBeUndefined();
    o = applyOutcome(o!, { id: "a", status: "failed", retryable: true }, 0);
    expect(o).toMatchObject({ state: "failed" });
  });

  it("holds changes during backoff, but not when the person asks to retry", () => {
    const waiting = op("a", { nextTryAt: 5000 });
    expect(readyOps([waiting], "u", 1000)).toEqual([]);
    expect(readyOps([waiting], "u", 6000)).toHaveLength(1);
    expect(readyOps([waiting], "u", 1000, true)).toHaveLength(1);
  });

  it("never sends another account's changes, and keeps them", () => {
    const mine = op("a", { userId: "u1" });
    const theirs = op("b", { userId: "u2" });
    const old = op("c"); // saved before accounts were recorded
    expect(
      readyOps([mine, theirs, old], "u1", 0)
        .map((o) => o.id)
        .sort(),
    ).toEqual(["a", "c"]);
    expect(readyOps([mine, theirs], "u3", 0)).toEqual([]);
  });

  it("retries temporary failures with growing waits and drops nothing", () => {
    for (const s of [408, 429, 500, 502, 503]) expect(classifyHttp(s)).toBe("retry");
    for (const s of [400, 401, 403, 409]) expect(classifyHttp(s)).toBe("stop");
    expect([1, 2, 3, 20].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 900_000]);
    const o = op("a");
    expect(applyOutcome(o, { id: "a", status: "failed", retryable: true }, 1000)).toMatchObject({ attempts: 1, nextTryAt: 6000 });
    expect(applyOutcome(o, undefined, 1000)).toMatchObject({ attempts: 1 }); // the server said nothing about it
  });

  it("deletes only what was saved, and keeps a permanent refusal as failed", () => {
    const o = op("a");
    expect(applyOutcome(o, { id: "a", status: "applied" }, 0)).toBeNull();
    expect(applyOutcome(o, { id: "a", status: "already_applied" }, 0)).toBeNull();
    expect(applyOutcome(o, { id: "a", status: "failed", error: "Not found" }, 0)).toMatchObject({ state: "failed", error: "Not found" });
  });
});
