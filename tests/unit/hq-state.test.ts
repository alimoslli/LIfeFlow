import { describe, expect, it } from "vitest";
import { employeeState, type StateInput } from "@/server/hq/state";
import { roundsShare } from "@/server/services/hq";

const now = new Date("2026-11-06T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 3_600_000;
const chat = (o: Partial<StateInput["chats"][number]> = {}) => ({ status: "idle" as const, needsAction: null, lastCheckinAt: ago(MIN), isPrimary: true, ...o });
const mission = (o: Partial<StateInput["missions"][number]> = {}) => ({
  status: "todo" as const,
  blockedReason: null,
  title: "M",
  doneAt: null,
  seenAt: null,
  updatedAt: ago(MIN),
  ...o,
});
const input = (o: Partial<StateInput> = {}): StateInput => ({ noOwnChat: false, chats: [chat()], missions: [], pendingApprovals: 0, ...o });

describe("employeeState: the sleep rule (ADR 0029)", () => {
  it("is offline with no chat, an archived chat, or a stale one", () => {
    expect(employeeState(input({ chats: [] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ status: "archived" })] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: ago(7 * 24 * HOUR + 1) })] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: ago(7 * 24 * HOUR) })] }), now).state).toBe("sleeping");
  });
  it("a connected chat that hasn't checked in yet is asleep with a note, not offline (the COO before its first round)", () => {
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: null })] }), now)).toEqual({
      state: "sleeping",
      reason: "Asleep",
      note: "Hasn't checked in yet",
    });
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: null })], pendingApprovals: 1 }), now).note).toBe(
      "Hasn't checked in yet · 1 thing for your yes",
    );
    // A mission in progress without any check-in is still not work.
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: null })], missions: [mission({ status: "doing" })] }), now).state).toBe("sleeping");
  });
  it("never shows Blocked or Needs you: a blocked mission, a chat's question and a yes are notes on the door of a sleeping room", () => {
    const r = employeeState(
      input({ missions: [mission({ status: "blocked", blockedReason: "Higgsfield credits ran out" }), mission()], pendingApprovals: 2 }),
      now,
    );
    expect(r).toEqual({ state: "sleeping", reason: "Asleep", note: "2 things for your yes · Waiting: Higgsfield credits ran out" });
    expect(employeeState(input({ missions: [mission({ status: "blocked", title: "T" })] }), now).note).toBe("Waiting: T");
    expect(employeeState(input({ chats: [chat({ needsAction: "Approve the deploy" })] }), now)).toEqual({
      state: "sleeping",
      reason: "Asleep",
      note: "Waiting: Approve the deploy",
    });
    expect(employeeState(input({ chats: [chat({ status: "blocked" })] }), now).note).toBe("Waiting on something in its chat");
    expect(employeeState(input({ pendingApprovals: 1 }), now)).toEqual({ state: "sleeping", reason: "Asleep", note: "1 thing for your yes" });
    expect(employeeState(input(), now).note).toBeNull();
    // An archived chat's old question is not shown.
    expect(employeeState(input({ chats: [chat({ isPrimary: false, status: "archived", needsAction: "Old" }), chat()] }), now).note).toBeNull();
    // Offline keeps the note too.
    expect(employeeState(input({ chats: [], pendingApprovals: 1 }), now)).toMatchObject({ state: "offline", note: "1 thing for your yes" });
  });
  it("working needs a doing mission AND a check-in within 20 minutes", () => {
    const doing = [mission({ status: "doing", title: "Build" })];
    expect(employeeState(input({ missions: doing, chats: [chat({ lastCheckinAt: ago(20 * MIN) })] }), now)).toEqual({
      state: "working",
      reason: "Build",
      note: null,
    });
    expect(employeeState(input({ missions: doing, chats: [chat({ lastCheckinAt: ago(20 * MIN + 1) })] }), now)).toEqual({
      state: "sleeping",
      reason: "Asleep",
      note: null,
    });
    expect(employeeState(input({ missions: [mission()] }), now).state).toBe("sleeping");
    // A fresh check-in with nothing in progress is not work.
    expect(employeeState(input({ chats: [chat({ status: "working", lastCheckinAt: ago(MIN) })] }), now).state).toBe("sleeping");
  });
  it("a running round they work in makes them working, even with no chat of their own or an offline chat", () => {
    expect(employeeState(input({ noOwnChat: true, chats: [], round: { line: "Testing every screen · night round" } }), now)).toEqual({
      state: "working",
      reason: "Testing every screen · night round",
      note: null,
    });
    expect(employeeState(input({ chats: [], round: { line: "x" } }), now).state).toBe("working");
    expect(employeeState(input({ noOwnChat: true, chats: [], round: null }), now).state).toBe("sleeping");
  });
  it("done shows for 24h until the owner has seen it", () => {
    const d = (o: object) => input({ missions: [mission({ status: "done", title: "Ship", doneAt: ago(HOUR), ...o })] });
    expect(employeeState(d({}), now)).toEqual({ state: "done", reason: "Finished: Ship", note: null });
    expect(employeeState(d({ seenAt: ago(MIN) }), now).state).toBe("sleeping");
    expect(employeeState(d({ doneAt: ago(24 * HOUR) }), now).state).toBe("done");
    expect(employeeState(d({ doneAt: ago(24 * HOUR + 1) }), now).state).toBe("sleeping");
  });
  it("a role with no chat of its own is never offline; it sleeps, with notes, until a round or real work wakes it", () => {
    expect(employeeState(input({ noOwnChat: true, chats: [] }), now).state).toBe("sleeping");
    // A mission in progress alone is not proof of work (no check-in): the cross-chat rule in the service decides that.
    expect(employeeState(input({ noOwnChat: true, chats: [], missions: [mission({ status: "doing" })] }), now).state).toBe("sleeping");
    expect(employeeState(input({ noOwnChat: true, chats: [], missions: [mission({ status: "blocked", blockedReason: "Needs a key" })] }), now)).toEqual({
      state: "sleeping",
      reason: "Asleep",
      note: "Waiting: Needs a key",
    });
  });
  it("cuts a long note", () => {
    const n = employeeState(input({ missions: [mission({ status: "blocked", blockedReason: "x".repeat(200) })] }), now).note!;
    expect(n.length).toBeLessThanOrEqual(100);
    expect(n.endsWith("…")).toBe(true);
  });
});

describe("roundsShare (budget math)", () => {
  let t = 0;
  const at = (min: number) => new Date(Date.parse("2026-11-06T00:00:00Z") + min * 60_000);
  const s = (sessionId: string | null, phase: string, sevenDayPct: number | null, min: number = ++t) => ({ sessionId, phase, sevenDayPct, createdAt: at(min) });
  it("sums end minus start for separate rounds", () => {
    expect(roundsShare([s("a", "round_start", 10, 1), s("a", "round_end", 15, 2), s("b", "round_start", 20, 10), s("b", "round_end", 27, 11)])).toBe(12);
  });
  it("merges overlapping rounds from different sessions (the meter is account-wide)", () => {
    // a: 1..4, b: 2..6 overlap into one span 1..6 (1% -> 6% = 5), not (3) + (4) = 7.
    expect(
      roundsShare([
        s("a", "round_start", 1, 1),
        s("b", "round_start", 2, 2),
        s("a", "round_end", 4, 4),
        s("b", "round_end", 6, 6),
        s("a", "round_start", 7, 20),
        s("a", "round_end", 8, 21),
      ]),
    ).toBe(6);
  });
  it("clamps negatives (a weekly reset) to zero", () => {
    expect(roundsShare([s("a", "round_start", 90, 1), s("a", "round_end", 2, 2)])).toBe(0);
  });
  it("is null without a complete span or with null readings", () => {
    expect(roundsShare([])).toBeNull();
    expect(roundsShare([s("a", "round_start", 10)])).toBeNull();
    expect(roundsShare([s("a", "round_end", 10)])).toBeNull();
    expect(roundsShare([s("a", "round_start", null, 1), s("a", "round_end", 10, 2)])).toBeNull();
    expect(roundsShare([s("a", "round_start", 5, 1), s("a", "round_end", null, 2)])).toBeNull();
    expect(roundsShare([s("a", "sample", 5)])).toBeNull();
  });
});
