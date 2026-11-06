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

describe("employeeState", () => {
  it("is offline with no chat, an archived chat, no check-in, or a stale one", () => {
    expect(employeeState(input({ chats: [] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ status: "archived" })] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: null })] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: ago(7 * 24 * HOUR + 1) })] }), now).state).toBe("offline");
    expect(employeeState(input({ chats: [chat({ lastCheckinAt: ago(7 * 24 * HOUR) })] }), now).state).toBe("sleeping");
  });
  it("offline beats blocked and needs_you", () => {
    expect(employeeState(input({ chats: [], missions: [mission({ status: "blocked", blockedReason: "x" })], pendingApprovals: 2 }), now).state).toBe("offline");
  });
  it("blocked beats needs_you and working; the reason is shown", () => {
    const r = employeeState(
      input({ missions: [mission({ status: "blocked", blockedReason: "No credits" }), mission({ status: "doing" })], pendingApprovals: 1 }),
      now,
    );
    expect(r).toEqual({ state: "blocked", reason: "No credits" });
    expect(employeeState(input({ missions: [mission({ status: "blocked", title: "T" })] }), now).reason).toBe("Blocked: T");
  });
  it("a chat that is blocked or needs action blocks too", () => {
    expect(employeeState(input({ chats: [chat({ status: "blocked" })] }), now).state).toBe("blocked");
    expect(employeeState(input({ chats: [chat({ needsAction: "Approve the deploy" })] }), now).reason).toBe("Approve the deploy");
  });
  it("needs_you when approvals are pending", () => {
    expect(employeeState(input({ pendingApprovals: 1 }), now)).toEqual({ state: "needs_you", reason: "1 thing needs your yes" });
    expect(employeeState(input({ pendingApprovals: 3 }), now).reason).toBe("3 things need your yes");
  });
  it("working needs a doing mission AND a check-in within 20 minutes", () => {
    const doing = [mission({ status: "doing", title: "Build" })];
    expect(employeeState(input({ missions: doing, chats: [chat({ lastCheckinAt: ago(20 * MIN) })] }), now).state).toBe("working");
    expect(employeeState(input({ missions: doing, chats: [chat({ lastCheckinAt: ago(20 * MIN + 1) })] }), now)).toEqual({
      state: "sleeping",
      reason: "Resting. Next: Build",
    });
    expect(employeeState(input({ missions: [mission()] }), now).state).toBe("sleeping");
  });
  it("done shows for 24h until the owner has seen it", () => {
    const d = (o: object) => input({ missions: [mission({ status: "done", title: "Ship", doneAt: ago(HOUR), ...o })] });
    expect(employeeState(d({}), now)).toEqual({ state: "done", reason: "Finished: Ship" });
    expect(employeeState(d({ seenAt: ago(MIN) }), now).state).toBe("sleeping");
    expect(employeeState(d({ doneAt: ago(24 * HOUR) }), now).state).toBe("done");
    expect(employeeState(d({ doneAt: ago(24 * HOUR + 1) }), now).state).toBe("sleeping");
  });
  it("a role with no chat of its own is never offline; it sleeps until something blocks or needs you", () => {
    expect(employeeState(input({ noOwnChat: true, chats: [] }), now).state).toBe("sleeping");
    // A mission in progress alone is not proof of work (no check-in): the cross-chat rule in the service decides that.
    expect(employeeState(input({ noOwnChat: true, chats: [], missions: [mission({ status: "doing" })] }), now).state).toBe("sleeping");
    expect(employeeState(input({ noOwnChat: true, chats: [], missions: [mission({ status: "blocked", blockedReason: "Needs a key" })] }), now)).toEqual({
      state: "blocked",
      reason: "Needs a key",
    });
    expect(employeeState(input({ noOwnChat: true, chats: [], pendingApprovals: 2 }), now).state).toBe("needs_you");
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
