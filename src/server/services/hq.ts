import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import type { HqLink, HqRole } from "../db/schema";
import type {
  Activity,
  Approval,
  ApprovalKind,
  ApprovalStatus,
  Budget,
  Chat,
  ChatStatus,
  EmployeeDetail,
  Mission,
  MissionPriority,
  MissionStatus,
  OfficeSnapshot,
  WeeklySummary,
} from "../hq/types";

/**
 * LifeFlow HQ (ADR 0024): the owner's office. Owner-only operations data (no user content, no RLS). Pages and
 * actions reach it only after requireAdmin(); agents only through /api/hq with an HQ key. Every change writes an
 * hq_activity row. Reads have a 5 s statement timeout and hard limits, like services/admin.ts. No AI is ever called
 * from here: HQ costs nothing to open.
 *
 * CONTRACT STUB: signatures are fixed; bodies are filled in by the backend build step.
 */

export class HqError extends Error {}

/** Who made a change, for the activity log. */
export type HqActor = { kind: "owner"; email: string } | { kind: "agent"; keyName: string; sessionId?: string | null };

export type MissionInput = { role: HqRole; title: string; detail?: string | null; priority?: MissionPriority; dueOn?: string | null; links?: HqLink[] };
export type MissionPatch = Partial<{
  role: HqRole;
  title: string;
  detail: string | null;
  priority: MissionPriority;
  status: MissionStatus;
  progress: string | null;
  blockedReason: string | null;
  result: string | null;
  links: HqLink[];
  sessionId: string | null;
  branch: string | null;
  dueOn: string | null;
}>;
export type ApprovalInput = { role: HqRole; kind: ApprovalKind; title: string; summary: string; links?: HqLink[]; missionId?: string | null };
export type CheckinInput = {
  sessionId: string;
  title?: string | null;
  branch?: string | null;
  commit?: string | null;
  status?: ChatStatus | null;
  summary?: string | null;
  needsAction?: string | null;
  usage?: { fiveHourPct?: number | null; sevenDayPct?: number | null; sevenDayResetsAt?: string | null; phase?: "sample" | "round_start" | "round_end" } | null;
};
export type HqKeyRow = { id: string; name: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };

const notBuilt = (): never => {
  throw new HqError("HQ service not built yet");
};

// --- reads (pages) ------------------------------------------------------------------------------------------------
export async function officeSnapshot(db: Database, now?: Date): Promise<OfficeSnapshot> {
  return notBuilt();
}
export async function employeeDetail(db: Database, role: HqRole, now?: Date): Promise<EmployeeDetail> {
  return notBuilt();
}
/** Max 200, open ones first (by priority, then oldest), then done/dropped newest first. */
export async function listMissions(db: Database, filter?: { role?: HqRole; status?: MissionStatus[] }): Promise<Mission[]> {
  return notBuilt();
}
export async function getMission(db: Database, id: string): Promise<Mission | null> {
  return notBuilt();
}
/** Max 100. Pending oldest first; decided newest first. */
export async function listApprovals(db: Database, filter?: { status?: ApprovalStatus[]; role?: HqRole }): Promise<Approval[]> {
  return notBuilt();
}
export async function pendingApprovalCount(db: Database): Promise<number> {
  return notBuilt();
}
export async function listChats(db: Database): Promise<Chat[]> {
  return notBuilt();
}
/** Newest first, default limit 30, max 100. */
export async function listActivity(db: Database, filter?: { role?: HqRole | "founder"; limit?: number }): Promise<Activity[]> {
  return notBuilt();
}
export async function weeklyBudget(db: Database, now?: Date): Promise<Budget> {
  return notBuilt();
}
export async function weeklySummary(db: Database, now?: Date): Promise<WeeklySummary> {
  return notBuilt();
}
export async function listHqKeys(db: Database): Promise<HqKeyRow[]> {
  return notBuilt();
}

// --- owner writes (actions call these after requireAdmin) --------------------------------------------------------
export async function createMission(db: Database, actor: HqActor, input: MissionInput): Promise<Mission> {
  return notBuilt();
}
export async function updateMission(db: Database, actor: HqActor, id: string, patch: MissionPatch): Promise<Mission> {
  return notBuilt();
}
/** The owner opened a finished mission: its "done" sparkle stops. */
export async function markMissionSeen(db: Database, id: string): Promise<void> {
  return notBuilt();
}
export async function createApproval(db: Database, actor: HqActor, input: ApprovalInput): Promise<Approval> {
  return notBuilt();
}
/** Records the owner's decision. HQ never carries it out; the employee acts on it at their next round. */
export async function decideApproval(
  db: Database,
  admin: Admin,
  id: string,
  decision: "approved" | "declined" | "changes",
  note?: string | null,
): Promise<Approval> {
  return notBuilt();
}
/** Settings: which chat belongs to which employee. */
export async function saveChat(
  db: Database,
  admin: Admin,
  input: { id: string; role: HqRole | null; title: string; isPrimary: boolean; branch?: string | null },
): Promise<Chat> {
  return notBuilt();
}
export async function removeChat(db: Database, admin: Admin, id: string): Promise<void> {
  return notBuilt();
}
/** The raw key is returned once and never stored. */
export async function createHqKey(db: Database, admin: Admin, name: string): Promise<{ id: string; token: string }> {
  return notBuilt();
}
export async function revokeHqKey(db: Database, admin: Admin, id: string): Promise<void> {
  return notBuilt();
}

// --- agent side (/api/hq, authenticated by an HQ key) ------------------------------------------------------------
export async function resolveHqKey(db: Database, raw: string): Promise<{ id: string; name: string } | null> {
  return notBuilt();
}
export async function recordCheckin(db: Database, input: CheckinInput): Promise<void> {
  return notBuilt();
}
export async function recordAgentActivity(
  db: Database,
  actor: HqActor,
  input: { role: HqRole; text: string; link?: string | null; sessionId?: string | null },
): Promise<void> {
  return notBuilt();
}
/** What an agent should pick up: open missions (optionally for one role) and approval decisions since a time. */
export async function agentInbox(db: Database, input: { role?: HqRole; since?: Date }): Promise<{ missions: Mission[]; decisions: Approval[] }> {
  return notBuilt();
}
/** Loads docs/hq/seed.json (real items from the handover). Safe to run twice: existing ids/titles are skipped. */
export async function importSeed(db: Database, actor: HqActor, seed: unknown): Promise<{ chats: number; missions: number; approvals: number }> {
  return notBuilt();
}
