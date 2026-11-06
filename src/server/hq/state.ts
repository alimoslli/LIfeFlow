/**
 * How an HQ employee looks right now, worked out only from real records (ADR 0024). Nothing here is invented: when
 * there's no data the answer is "sleeping" or "offline", never "working".
 *
 * Order of precedence: offline (only for roles with their own chat), blocked, needs you, working, done, sleeping.
 */
export type EmployeeState = "offline" | "blocked" | "needs_you" | "working" | "done" | "sleeping";

export type StateInput = {
  /**
   * True for a department with no chat of its own (QA, Customer Success: they work inside the Chief of Staff's
   * rounds). It is never "offline" for lacking a chat; it sleeps until a mission in progress shows real work.
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
};

export type StateResult = { state: EmployeeState; reason: string };

/** A chat that checked in this recently while a mission is in progress counts as working. */
export const WORKING_WINDOW_MS = 20 * 60_000;
/** No check-in at all for this long means offline. */
export const OFFLINE_AFTER_MS = 7 * 24 * 3_600_000;
/** A finished mission shows the "done" sparkle this long, until the owner opens it. */
export const DONE_WINDOW_MS = 24 * 3_600_000;

export function employeeState(input: StateInput, now: Date): StateResult {
  const t = now.getTime();
  const primary = input.chats.find((c) => c.isPrimary) ?? input.chats[0];
  const lastCheckin = input.chats.reduce<number | null>((m, c) => (c.lastCheckinAt ? Math.max(m ?? 0, c.lastCheckinAt.getTime()) : m), null);

  if (!input.noOwnChat) {
    if (!primary) return { state: "offline", reason: "No chat connected yet" };
    if (primary.status === "archived") return { state: "offline", reason: "Their chat is archived" };
    if (lastCheckin === null) return { state: "offline", reason: "Hasn't checked in yet" };
    if (t - lastCheckin > OFFLINE_AFTER_MS) return { state: "offline", reason: "No check-in for over a week" };
  }

  const blockedMission = input.missions.find((m) => m.status === "blocked");
  if (blockedMission) return { state: "blocked", reason: blockedMission.blockedReason?.trim() || `Blocked: ${blockedMission.title}` };
  const blockedChat = input.chats.find((c) => c.status === "blocked" || (c.needsAction && c.status !== "archived"));
  if (blockedChat) return { state: "blocked", reason: blockedChat.needsAction?.trim() || "Their chat is waiting on something" };

  if (input.pendingApprovals > 0) {
    return { state: "needs_you", reason: input.pendingApprovals === 1 ? "1 thing needs your yes" : `${input.pendingApprovals} things need your yes` };
  }

  const doing = input.missions.find((m) => m.status === "doing");
  const recentlyActive = lastCheckin !== null && t - lastCheckin <= WORKING_WINDOW_MS;
  if (doing && recentlyActive) return { state: "working", reason: doing.title };

  const freshDone = input.missions
    .filter((m) => m.status === "done" && m.doneAt && !m.seenAt && t - m.doneAt.getTime() <= DONE_WINDOW_MS)
    .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())[0];
  if (freshDone) return { state: "done", reason: `Finished: ${freshDone.title}` };

  return { state: "sleeping", reason: doing ? `Resting. Next: ${doing.title}` : "Resting" };
}

export const STATE_LABEL: Record<EmployeeState, string> = {
  offline: "Offline",
  blocked: "Blocked",
  needs_you: "Needs you",
  working: "Working",
  done: "Done",
  sleeping: "Asleep",
};
