/**
 * How an HQ employee looks right now, worked out only from real records (ADR 0024, 0029). Nothing here is invented: when
 * there's no data the answer is "asleep" or "offline", never "working".
 *
 * The sleep rule (owner, 2026-11-07): everyone is asleep unless real work is running. Working = a scheduled round they work in
 * is running, or their chat checked in within WORKING_WINDOW_MS while a mission is in progress. Anything waiting on the owner
 * (a yes, a blocked mission, a chat's question) is a note on the door, never the room's state.
 *
 * Order: working in a round, offline (only for roles with their own chat), working, done, asleep.
 */
export type EmployeeState = "offline" | "working" | "done" | "sleeping";

/** The chip tones: the four room states plus "needs_you" (gold), which other lists (content, the founder's door) reuse. */
export type ChipState = EmployeeState | "needs_you";

export type StateInput = {
  /**
   * True for a department with no chat of its own (QA, Customer Success, Research: they work inside the COO's rounds). It is
   * never "offline" for lacking a chat; it sleeps until a round or a mission in progress shows real work.
   */
  noOwnChat: boolean;
  /** Their chats, if any. */
  chats: { status: "working" | "idle" | "blocked" | "archived" | "unknown"; needsAction: string | null; lastCheckinAt: Date | null; isPrimary: boolean }[];
  missions: {
    status: "todo" | "doing" | "waiting" | "blocked" | "done" | "dropped";
    blockedReason: string | null;
    title: string;
    doneAt: Date | null;
    seenAt: Date | null;
    updatedAt: Date;
  }[];
  pendingApprovals: number;
  /** A COO round this department works in is running now (from the COO's check-ins); `line` says what they're doing. */
  round?: { line: string } | null;
};

export type StateResult = { state: EmployeeState; reason: string; note: string | null };

/** A chat that checked in this recently while a mission is in progress counts as working. */
export const WORKING_WINDOW_MS = 20 * 60_000;
/** No check-in at all for this long means offline. */
export const OFFLINE_AFTER_MS = 7 * 24 * 3_600_000;
/** A finished mission shows the "done" sparkle this long, until the owner opens it. */
export const DONE_WINDOW_MS = 24 * 3_600_000;

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** What waits on the owner, as one short door note ("2 things for your yes · Waiting: Higgsfield credits"), or null. */
export function doorNote(input: Pick<StateInput, "chats" | "missions" | "pendingApprovals">): string | null {
  const parts: string[] = [];
  if (input.pendingApprovals > 0) parts.push(input.pendingApprovals === 1 ? "1 thing for your yes" : `${input.pendingApprovals} things for your yes`);
  const blocked = input.missions.find((m) => m.status === "blocked");
  const chatWaiting = input.chats.find((c) => c.status !== "archived" && (c.needsAction?.trim() || c.status === "blocked"));
  if (blocked) parts.push(`Waiting: ${short(blocked.blockedReason?.trim() || blocked.title)}`);
  else if (chatWaiting) parts.push(chatWaiting.needsAction?.trim() ? `Waiting: ${short(chatWaiting.needsAction.trim())}` : "Waiting on something in its chat");
  return parts.length ? parts.join(" · ") : null;
}

export function employeeState(input: StateInput, now: Date): StateResult {
  const t = now.getTime();
  let note = doorNote(input);
  if (input.round) return { state: "working", reason: input.round.line, note };

  const primary = input.chats.find((c) => c.isPrimary) ?? input.chats[0];
  const lastCheckin = input.chats.reduce<number | null>((m, c) => (c.lastCheckinAt ? Math.max(m ?? 0, c.lastCheckinAt.getTime()) : m), null);
  if (!input.noOwnChat) {
    if (!primary) return { state: "offline", reason: "No chat connected yet", note };
    if (primary.status === "archived") return { state: "offline", reason: "Their chat is archived", note };
    if (t - (lastCheckin ?? t) > OFFLINE_AFTER_MS) return { state: "offline", reason: "No check-in for over a week", note };
    // A connected chat that hasn't reported yet is resting, not gone (the COO before its first round): say so on the door.
    if (lastCheckin === null) note = note ? `Hasn't checked in yet · ${note}` : "Hasn't checked in yet";
  }

  const doing = input.missions.find((m) => m.status === "doing");
  const recentlyActive = lastCheckin !== null && t - lastCheckin <= WORKING_WINDOW_MS;
  if (doing && recentlyActive) return { state: "working", reason: doing.title, note };

  const freshDone = input.missions
    .filter((m) => m.status === "done" && m.doneAt && !m.seenAt && t - m.doneAt.getTime() <= DONE_WINDOW_MS)
    .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())[0];
  if (freshDone) return { state: "done", reason: `Finished: ${freshDone.title}`, note };

  return { state: "sleeping", reason: "Asleep", note };
}

export const STATE_LABEL: Record<ChipState, string> = {
  offline: "Offline",
  needs_you: "Needs you",
  working: "Working",
  done: "Done",
  sleeping: "Asleep",
};
