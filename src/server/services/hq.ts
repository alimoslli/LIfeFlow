import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { adminEmails, type Admin } from "../auth/admin";
import { addDaysStr, localDateOf } from "../../lib/dates";
import type { Database } from "../db/client";
import {
  adminActions,
  hqActivity,
  hqApprovals,
  hqBriefs,
  hqChats,
  hqContent,
  hqFiles,
  hqKeys,
  hqMissions,
  errorReports,
  hqUsageSamples,
  users,
  type HqLink,
  type HqPreview,
  type HqRole,
  HQ_ROLES,
} from "../db/schema";
import { withUser } from "../db/with-user";
import { chatUrl, EMPLOYEES, employee, isHqRole, USAGE_PLAN } from "../hq/team";
import { employeeState, WORKING_WINDOW_MS } from "../hq/state";
import { nextWake, ROUND_MAX_MS, roundOf, wakeLine, type Round } from "../hq/rounds";
import type {
  Activity,
  Approval,
  ApprovalKind,
  Brief,
  ErrorGroup,
  ApprovalStatus,
  DecisionCardFields,
  DecisionThread,
  Lifecycle,
  Budget,
  Chat,
  ChatStatus,
  ContentItem,
  HqControls,
  EmployeeCard,
  EmployeeDetail,
  Mission,
  MissionPriority,
  MissionStatus,
  OfficeSnapshot,
  WeeklySummary,
} from "../hq/types";
import {
  cleanLine,
  cleanText,
  deskPromptField,
  dueOn,
  HqError,
  isSafeLinkUrl,
  line,
  linksSchema,
  logActivity,
  logAdmin,
  normalizeSessionId,
  optLine,
  optText,
  parse,
  sessionIdField,
  timed,
  url,
  type Tx,
} from "../hq/validate";
import { sendOnce, webPushSender, type Sender } from "./push";
import { approvedContentIn, controlsIn, marketingWeekIn } from "./hq-marketing";

// Re-exported so existing callers (and tests) keep importing them from here.
export { cleanLine, cleanText, HqError, isSafeLinkUrl, normalizeSessionId };

/**
 * LifeFlow HQ (ADR 0024): the owner's office. Owner-only operations data (no user content, no RLS). Pages and
 * actions reach it only after requireAdmin(); agents only through /api/hq with an HQ key. Every change writes an
 * hq_activity row. Reads have a 5 s statement timeout and hard limits, like services/admin.ts. No AI is ever called
 * from here: HQ costs nothing to open.
 */

/** Who made a change, for the activity log. */
export type HqActor = { kind: "owner"; email: string } | { kind: "agent"; keyName: string; sessionId?: string | null };

export type MissionInput = {
  role: HqRole;
  title: string;
  detail?: string | null;
  priority?: MissionPriority;
  dueOn?: string | null;
  links?: HqLink[];
  sessionId?: string | null;
  /** Set = a task file on the CEO's desk (ADR 0029). */
  deskPrompt?: string | null;
};
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
  deskPrompt: string | null;
}>;
/** The decision card an agent sends (ADR 0028). Everything is required; `summary` is the optional extra detail on top of `why`. */
export type ApprovalInput = {
  role: HqRole;
  kind: ApprovalKind;
  title: string;
  why: string;
  changes: string[];
  onYes: string;
  onNo: string;
  effort: "small" | "medium" | "large";
  risk: string;
  recommendation: string;
  previews: { fileId: string; label?: string | null }[];
  summary?: string | null;
  links?: HqLink[];
  missionId?: string | null;
};
/** A new version of an existing ask: the full card again, plus what changed since the owner's note. */
export type ReviseInput = Omit<ApprovalInput, "role" | "kind"> & Partial<Pick<ApprovalInput, "role" | "kind">> & { changedSinceNote: string };
export type CheckinInput = {
  sessionId: string;
  /** The COO reporting another chat's status: only status, summary and needs change, and only for a chat HQ already knows. */
  relay?: boolean;
  /** With relay: when that chat was last really active (ISO). Never later than now, never older than what HQ already has. */
  activeAt?: string;
  title?: string | null;
  branch?: string | null;
  commit?: string | null;
  status?: ChatStatus | null;
  summary?: string | null;
  needsAction?: string | null;
  usage?: {
    fiveHourPct?: number | null;
    sevenDayPct?: number | null;
    sevenDayResetsAt?: string | null;
    readAt?: string | null;
    phase?: "sample" | "round_start" | "round_end";
  } | null;
};
export type HqKeyRow = { id: string; name: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };

// --- plumbing -------------------------------------------------------------------------------------------------------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const DAY = 24 * 3_600_000;

const MISSION_STATUSES = ["todo", "doing", "waiting", "blocked", "done", "dropped"] as const;
const PRIORITIES = ["high", "normal", "low"] as const;
const APPROVAL_KINDS = ["deploy", "v3_merge", "feature", "design", "publish", "outbound", "paid", "subscription", "destructive", "security", "other"] as const;
const CHAT_STATUSES = ["working", "idle", "blocked", "archived", "unknown"] as const;
const OPEN = ["todo", "doing", "waiting", "blocked"] as const;

const role = z.enum(HQ_ROLES);

const missionInputSchema = z.object({
  sessionId: sessionIdField,
  role,
  title: line(1, 140),
  detail: optText(4000),
  priority: z.enum(PRIORITIES).optional(),
  dueOn,
  links: linksSchema.optional(),
  deskPrompt: deskPromptField,
});
const missionPatchSchema = z
  .object({
    role,
    title: line(1, 140),
    detail: optText(4000),
    priority: z.enum(PRIORITIES),
    status: z.enum(MISSION_STATUSES),
    progress: optText(1000),
    blockedReason: optText(1000),
    result: optText(1000),
    links: linksSchema,
    sessionId: sessionIdField,
    branch: optLine(200),
    dueOn,
    deskPrompt: deskPromptField,
  })
  .partial();
const cardFields = {
  title: line(1, 140),
  why: line(1, 400),
  changes: z.array(line(1, 200), "is required (1 to 5 short lines)").min(1, "needs at least 1 line").max(5, "has too many lines (max 5)"),
  onYes: line(1, 600),
  onNo: line(1, 400),
  effort: z.enum(["small", "medium", "large"], "must be small, medium or large"),
  risk: line(1, 300),
  recommendation: line(1, 300),
  previews: z
    .array(z.object({ fileId: z.uuid("is not a stored picture id"), label: optLine(60) }), "is required: at least one picture")
    .min(1, "is required: at least one picture")
    .max(4, "has too many pictures (max 4)"),
  summary: optText(2000),
  links: linksSchema.optional(),
  missionId: z.uuid().nullish(),
};
const approvalInputSchema = z.object({ role, kind: z.enum(APPROVAL_KINDS), ...cardFields });
const reviseInputSchema = z.object({
  ...cardFields,
  role: role.optional(),
  kind: z.enum(APPROVAL_KINDS).optional(),
  changedSinceNote: line(1, 600),
});
/** Names the missing or wrong fields in plain words, so an agent can fix the request in one go. */
const FIELD_NAMES: Record<string, string> = {
  title: "title (the ask)",
  why: "why",
  changes: "changes (--change, 1 to 5 lines)",
  onYes: "onYes (--on-yes: exact next steps, who and when)",
  onNo: "onNo (--on-no)",
  effort: "effort (small, medium or large)",
  risk: "risk",
  recommendation: "recommendation (--recommend)",
  previews: "previews (--preview, at least one picture)",
  changedSinceNote: "changedSinceNote (--changed: what is different since the owner's note)",
};
function parseCard<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => {
    const k = String(i.path[0] ?? "request");
    const name = FIELD_NAMES[k] ?? k;
    const v = (input as Record<string, unknown> | null)?.[k];
    const missing = v === undefined || v === null || (typeof v === "string" && !cleanLine(v)) || (Array.isArray(v) && v.length === 0);
    return `${name} ${missing ? "is missing" : i.message}`;
  });
  throw new HqError(`The request is not a full decision card: ${[...new Set(lines)].join("; ")}.`);
}

const clampPct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.min(100, Math.max(0, n)));

// --- row mapping ------------------------------------------------------------------------------------------------------

type MissionRow = typeof hqMissions.$inferSelect;
type ApprovalRow = typeof hqApprovals.$inferSelect;
type ActivityRow = typeof hqActivity.$inferSelect;
type ChatRow = typeof hqChats.$inferSelect;

export const toMission = (r: MissionRow): Mission => ({
  id: r.id,
  role: r.role,
  title: r.title,
  detail: r.detail,
  priority: r.priority,
  status: r.status,
  progress: r.progress,
  blockedReason: r.blockedReason,
  result: r.result,
  links: r.links ?? [],
  sessionId: r.sessionId,
  branch: r.branch,
  source: r.source,
  dueOn: r.dueOn,
  startedAt: r.startedAt,
  doneAt: r.doneAt,
  seenAt: r.seenAt,
  deskPrompt: r.deskPrompt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
const toCard = (r: ApprovalRow): DecisionCardFields | null =>
  r.why == null || !r.changes || !r.onYes || !r.onNo || !r.effort || !r.risk || !r.recommendation || !r.previews?.length
    ? null
    : { why: r.why, changes: r.changes, onYes: r.onYes, onNo: r.onNo, effort: r.effort, risk: r.risk, recommendation: r.recommendation, previews: r.previews };
export const toApproval = (r: ApprovalRow): Approval => ({
  id: r.id,
  role: r.role,
  missionId: r.missionId,
  kind: r.kind,
  title: r.title,
  summary: r.summary,
  links: r.links ?? [],
  status: r.status,
  decisionNote: r.decisionNote,
  decidedAt: r.decidedAt,
  source: r.source,
  createdAt: r.createdAt,
  card: toCard(r),
  threadId: r.threadId,
  version: r.version,
  changedSinceNote: r.changedSinceNote,
  supersededAt: r.supersededAt,
  buildMissionId: r.buildMissionId,
});
const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  actor: r.actor,
  role: r.role,
  kind: r.kind,
  text: r.text,
  missionId: r.missionId,
  approvalId: r.approvalId,
  sessionId: r.sessionId,
  link: r.link,
  createdAt: r.createdAt,
});
const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  role: r.role,
  title: r.title,
  isPrimary: r.isPrimary,
  branch: r.branch,
  lastCommit: r.lastCommit,
  status: r.status,
  summary: r.summary,
  needsAction: r.needsAction,
  lastCheckinAt: r.lastCheckinAt,
  url: chatUrl(r.id),
});

/** What counts as "needs your yes": a pending request in the decision-card format. Old requests wait to be rewritten and are not counted. */
const NEEDS_YES = and(eq(hqApprovals.status, "pending"), isNotNull(hqApprovals.why));

const priorityRank = sql`case ${hqMissions.priority} when 'high' then 0 when 'normal' then 1 else 2 end`;
const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };
const byPriorityThenOldest = (a: Mission, b: Mission) =>
  (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime();

// --- activity log -----------------------------------------------------------------------------------------------------

const actorKind = (a: HqActor) => a.kind;
const actorSession = (a: HqActor) => (a.kind === "agent" ? (a.sessionId ?? null) : null);

// --- reads (pages) ------------------------------------------------------------------------------------------------

type Base = { chats: Chat[]; missions: Mission[]; pending: Approval[]; tz: string; round: LiveRound | null };

/** A COO round running now: its "working" check-in (round_start) within ROUND_MAX_MS, and which round it is. */
type LiveRound = { round: Round | null; chat: Chat };

/** Everything the cards need, in a few bounded queries run one after another. */
/** Every mapped chat (max 100), then the unmapped ones newest first (max 50), so new sessions can't push mapped chats out. */
async function loadChats(tx: Tx): Promise<Chat[]> {
  const mapped = await tx.select().from(hqChats).where(isNotNull(hqChats.role)).orderBy(asc(hqChats.createdAt)).limit(100);
  const unmapped = await tx.select().from(hqChats).where(isNull(hqChats.role)).orderBy(desc(hqChats.createdAt)).limit(50);
  return [...mapped, ...unmapped].map(toChat);
}

/**
 * The COO's round is running while its chat says "working" (the round_start check-in) and checked in within ROUND_MAX_MS;
 * its round_end check-in sets it back to idle (ADR 0029). Only the COO's own check-ins count: a relayed status can't start one.
 */
export function liveRound(chats: Chat[], now: Date): LiveRound | null {
  const chat = chats
    .filter((c) => c.role === "assistant" && c.status === "working" && c.lastCheckinAt && now.getTime() - c.lastCheckinAt.getTime() <= ROUND_MAX_MS)
    .sort((a, b) => b.lastCheckinAt!.getTime() - a.lastCheckinAt!.getTime())[0];
  return chat ? { round: roundOf(chat.summary, chat.lastCheckinAt!), chat } : null;
}

async function loadBase(tx: Tx, now: Date): Promise<Base> {
  const chats = await loadChats(tx);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const missions = await tx
    .select()
    .from(hqMissions)
    .where(or(inArray(hqMissions.status, [...OPEN]), and(eq(hqMissions.status, "done"), gte(hqMissions.doneAt, weekAgo))))
    .orderBy(priorityRank, asc(hqMissions.createdAt))
    .limit(500);
  const pending = await tx.select().from(hqApprovals).where(NEEDS_YES).orderBy(asc(hqApprovals.createdAt)).limit(500);
  const tz = await ownerTimeZone(tx);
  return { chats, missions: missions.map(toMission), pending: pending.map(toApproval), tz, round: liveRound(chats, now) };
}

/** The asleep line: when the department next wakes, or where it works when it has no round. */
function sleepLine(role: HqRole, tz: string, now: Date): string {
  const w = nextWake(role, now);
  if (!w) return "Works with you in its chat";
  return `${wakeLine(w.at, tz)}${role === "assistant" ? "" : `, ${w.round.name.toLowerCase()}`}`;
}

function buildCard(role: HqRole, base: Base, now: Date): EmployeeCard {
  const e = employee(role);
  // A department with no chat of its own works in the COO's chat: chats once mapped to it (an old chat) don't count.
  const chats = e.ownChat ? base.chats.filter((c) => c.role === role) : [];
  const mine = base.missions.filter((m) => m.role === role);
  const myPending = base.pending.filter((a) => a.role === role).length;
  const stateMissions = mine.filter((m) => m.status !== "done" || (m.doneAt && now.getTime() - m.doneAt.getTime() <= DAY));
  // The sleep rule (ADR 0029): working only while a round they work in runs, or while their chat checks in on a mission.
  const live = base.round;
  const inRound = live && (role === "assistant" || (live.round?.roles.includes(role) ?? false));
  const roundLine = inRound
    ? role === "assistant"
      ? live.chat.summary?.trim() || `${live.round?.name ?? "Round"} running`
      : `${e.workingLine} · ${live.round!.name.toLowerCase()}`
    : null;
  let result = employeeState(
    { noOwnChat: !e.ownChat, chats, missions: stateMissions, pendingApprovals: myPending, round: roundLine ? { line: roundLine } : null },
    now,
  );
  // Work done for this employee in another chat (the night round fixing an Engineering mission in the COO's chat) is
  // real work: a mission in progress whose own chat checked in recently makes them "working".
  let viaChat: Chat | null = null;
  if (result.state !== "working") {
    for (const m of mine) {
      if (m.status !== "doing" || !m.sessionId) continue;
      const c = base.chats.find((x) => x.id === m.sessionId && x.lastCheckinAt && now.getTime() - x.lastCheckinAt.getTime() <= WORKING_WINDOW_MS);
      if (c) {
        viaChat = c;
        result = { ...result, state: "working", reason: c.role === role ? m.title : `${m.title} (in ${c.title})` };
        break;
      }
    }
  }
  const line = result.state === "sleeping" ? sleepLine(role, base.tz, now) : result.reason;
  const open = mine.filter((m) => (OPEN as readonly string[]).includes(m.status)).sort(byPriorityThenOldest);
  const currentMission =
    open.find((m) => m.status === "doing") ??
    open.find((m) => m.status === "blocked" || m.status === "waiting") ??
    open.find((m) => m.status === "todo") ??
    null;
  let asOf: Date | null = null;
  for (const d of [
    ...chats.map((c) => c.lastCheckinAt),
    ...mine.map((m) => m.updatedAt),
    viaChat?.lastCheckinAt ?? null,
    inRound ? live.chat.lastCheckinAt : null,
  ])
    if (d && (!asOf || d > asOf)) asOf = d;
  return {
    role,
    title: e.title,
    tagline: e.tagline,
    state: result.state,
    line,
    note: result.note,
    asOf,
    pendingApprovals: myPending,
    currentMission,
    primaryChat: chats.find((c) => c.isPrimary) ?? chats[0] ?? null,
  };
}

export async function officeSnapshot(db: Database, now: Date = new Date()): Promise<OfficeSnapshot> {
  return timed(db, async (tx) => {
    const base = await loadBase(tx, now);
    const employees = EMPLOYEES.map((e) => buildCard(e.role, base, now));
    const counts = { working: 0, done: 0, asleep: 0, offline: 0 };
    for (const c of employees) {
      if (c.state === "working") counts.working++;
      else if (c.state === "done") counts.done++;
      else if (c.state === "sleeping") counts.asleep++;
      else counts.offline++;
    }
    const activityRows = await tx.select().from(hqActivity).orderBy(desc(hqActivity.createdAt)).limit(12);
    const budget = await budgetIn(tx, now);
    const brief = await latestBriefIn(tx);
    const decisionRows = await tx.select().from(hqActivity).where(eq(hqActivity.kind, "decision")).orderBy(desc(hqActivity.createdAt)).limit(5);
    const weekAgo = now.getTime() - 7 * DAY;
    const doneWeek = base.missions
      .filter((m) => m.status === "done" && m.doneAt && m.doneAt.getTime() >= weekAgo)
      .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime());
    const open = base.missions.filter((m) => (OPEN as readonly string[]).includes(m.status)).sort(byPriorityThenOldest);
    return {
      now,
      employees,
      founder: { pendingApprovals: base.pending.length },
      counts,
      approvals: base.pending.slice(0, 20),
      activity: activityRows.map(toActivity),
      weekMissions: [...open, ...doneWeek].slice(0, 8),
      doneThisWeek: doneWeek.length,
      budget,
      brief,
      decisions: decisionRows.map(toActivity),
    };
  });
}

export async function employeeDetail(db: Database, roleName: HqRole, now: Date = new Date()): Promise<EmployeeDetail> {
  if (!isHqRole(roleName)) throw new HqError("Unknown employee.");
  return timed(db, async (tx) => {
    const base = await loadBase(tx, now);
    const card = buildCard(roleName, base, now);
    const open = base.missions.filter((m) => m.role === roleName && (OPEN as readonly string[]).includes(m.status)).sort(byPriorityThenOldest);
    const doneRows = await tx
      .select()
      .from(hqMissions)
      .where(and(eq(hqMissions.role, roleName), eq(hqMissions.status, "done")))
      .orderBy(desc(hqMissions.doneAt))
      .limit(20);
    const decided = await tx
      .select()
      .from(hqApprovals)
      .where(and(eq(hqApprovals.role, roleName), ne(hqApprovals.status, "pending")))
      .orderBy(desc(hqApprovals.decidedAt))
      .limit(10);
    const act = await tx.select().from(hqActivity).where(eq(hqActivity.role, roleName)).orderBy(desc(hqActivity.createdAt)).limit(20);
    const briefs = roleName === "assistant" ? await listBriefsIn(tx, 10) : undefined;
    return {
      card,
      jobs: employee(roleName).jobs,
      chats: base.chats.filter((c) => c.role === roleName),
      current: open.filter((m) => m.status !== "todo"),
      pending: open.filter((m) => m.status === "todo"),
      done: doneRows.map(toMission),
      approvals: base.pending.filter((a) => a.role === roleName),
      decided: decided.map(toApproval),
      activity: act.map(toActivity),
      ...(briefs ? { briefs } : {}),
    };
  });
}

/** Max 200, open ones first (by priority, then oldest), then done/dropped newest first. */
export async function listMissions(db: Database, filter: { role?: HqRole; status?: MissionStatus[] } = {}): Promise<Mission[]> {
  return timed(db, async (tx) => {
    const where: SQL[] = [];
    if (filter.role) where.push(eq(hqMissions.role, filter.role));
    if (filter.status?.length) where.push(inArray(hqMissions.status, filter.status));
    const closed = sql`(${hqMissions.status} in ('done','dropped'))`;
    const rows = await tx
      .select()
      .from(hqMissions)
      .where(where.length ? and(...where) : undefined)
      .orderBy(
        sql`case when ${closed} then 1 else 0 end`,
        sql`case when ${closed} then 0 else ${priorityRank} end`,
        sql`case when ${closed} then null else ${hqMissions.createdAt} end asc nulls last`,
        sql`case when ${closed} then coalesce(${hqMissions.doneAt}, ${hqMissions.updatedAt}) else null end desc nulls last`,
      )
      .limit(200);
    return rows.map(toMission);
  });
}

export async function getMission(db: Database, id: string): Promise<Mission | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return timed(db, async (tx) => {
    const [r] = await tx.select().from(hqMissions).where(eq(hqMissions.id, id));
    return r ? toMission(r) : null;
  });
}

/** Max 100. Pending oldest first; decided newest first. */
export async function listApprovals(db: Database, filter: { status?: ApprovalStatus[]; role?: HqRole } = {}): Promise<Approval[]> {
  return timed(db, async (tx) => {
    const where: SQL[] = [];
    if (filter.role) where.push(eq(hqApprovals.role, filter.role));
    if (filter.status?.length) where.push(inArray(hqApprovals.status, filter.status));
    const pending = sql`(${hqApprovals.status} = 'pending')`;
    const rows = await tx
      .select()
      .from(hqApprovals)
      .where(where.length ? and(...where) : undefined)
      .orderBy(
        sql`case when ${pending} then 0 else 1 end`,
        sql`case when ${pending} then ${hqApprovals.createdAt} else null end asc nulls last`,
        sql`case when ${pending} then null else coalesce(${hqApprovals.decidedAt}, ${hqApprovals.createdAt}) end desc nulls last`,
      )
      .limit(100);
    return rows.map(toApproval);
  });
}

export async function pendingApprovalCount(db: Database): Promise<number> {
  return timed(db, async (tx) => {
    const [r] = await tx.select({ n: count() }).from(hqApprovals).where(NEEDS_YES);
    return r?.n ?? 0;
  });
}

// --- briefs, decisions and the error feed (ADR 0026) ------------------------------------------------------------

type BriefRow = typeof hqBriefs.$inferSelect;
const toBrief = (r: BriefRow): Brief => ({ id: r.id, body: r.body, needsYou: r.needsYou, sessionId: r.sessionId, createdAt: r.createdAt });

async function latestBriefIn(tx: Tx): Promise<Brief | null> {
  const [r] = await tx.select().from(hqBriefs).orderBy(desc(hqBriefs.createdAt)).limit(1);
  return r ? toBrief(r) : null;
}
async function listBriefsIn(tx: Tx, limit: number): Promise<Brief[]> {
  const rows = await tx.select().from(hqBriefs).orderBy(desc(hqBriefs.createdAt)).limit(limit);
  return rows.map(toBrief);
}

export async function latestBrief(db: Database): Promise<Brief | null> {
  return timed(db, latestBriefIn);
}
/** Newest first, default 10, max 20. */
export async function listBriefs(db: Database, limit = 10): Promise<Brief[]> {
  const n = Math.min(20, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 10)));
  return timed(db, (tx) => listBriefsIn(tx, n));
}
/** The decisions the COO made for the owner (activity kind "decision"), newest first, default 5, max 50. */
export async function listDecisions(db: Database, limit = 5): Promise<Activity[]> {
  const n = Math.min(50, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 5)));
  return timed(db, async (tx) => {
    const rows = await tx.select().from(hqActivity).where(eq(hqActivity.kind, "decision")).orderBy(desc(hqActivity.createdAt)).limit(n);
    return rows.map(toActivity);
  });
}

/** The COO's brief: plain text, 1–2000 characters. HQ stores it and pushes it; it never acts on it. */
export async function recordBrief(db: Database, actor: HqActor, input: { body: string; needsYou?: number | null }): Promise<Brief> {
  const d = parse(
    z.object({
      body: z.string().transform(cleanText).pipe(z.string().min(1, "is required").max(2000, "is too long (max 2000)")),
      needsYou: z.number("must be a number").int("must be a whole number").min(0, "can't be negative").max(999, "is too large (max 999)").nullish(),
    }),
    input,
  );
  const brief = await db.transaction(async (tx) => {
    const needsYou = d.needsYou ?? (await tx.select({ n: count() }).from(hqApprovals).where(NEEDS_YES))[0]?.n ?? 0;
    const [row] = await tx
      .insert(hqBriefs)
      .values({ body: d.body, needsYou, sessionId: actorSession(actor) })
      .returning();
    await logActivity(tx, {
      actor: actor.kind,
      role: "assistant",
      kind: "brief",
      text: "Brief from your COO",
      link: "/admin",
      sessionId: actorSession(actor),
    });
    return toBrief(row);
  });
  await notifyOwner(db, {
    key: `hq-brief:${brief.id}`,
    title: "Your COO",
    body: cleanLine(brief.body.split("\n").find((l) => l.trim()) ?? brief.body).slice(0, 140),
    url: "/admin",
    tag: `hq-brief-${brief.id}`,
  });
  return brief;
}

/** App error groups for Customer Success: already scrubbed of personal details by recordError. Newest first, max 100. */
export async function listErrorGroups(db: Database, limit = 50): Promise<ErrorGroup[]> {
  const n = Math.min(100, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50)));
  return timed(db, async (tx) => {
    const rows = await tx
      .select({
        fingerprint: errorReports.fingerprint,
        source: errorReports.source,
        route: errorReports.route,
        message: errorReports.message,
        count: errorReports.count,
        firstSeenAt: errorReports.firstSeenAt,
        lastSeenAt: errorReports.lastSeenAt,
      })
      .from(errorReports)
      .orderBy(desc(errorReports.lastSeenAt))
      .limit(n);
    return rows;
  });
}

export async function listChats(db: Database): Promise<Chat[]> {
  return timed(db, loadChats);
}

/** Newest first, default limit 30, max 100. */
export async function listActivity(db: Database, filter: { role?: HqRole | "founder"; limit?: number } = {}): Promise<Activity[]> {
  const limit = Math.min(100, Math.max(1, Math.floor(filter.limit ?? 30)));
  return timed(db, async (tx) => {
    const rows = await tx
      .select()
      .from(hqActivity)
      .where(filter.role ? eq(hqActivity.role, filter.role) : undefined)
      .orderBy(desc(hqActivity.createdAt))
      .limit(limit);
    return rows.map(toActivity);
  });
}

async function budgetIn(tx: Tx, now: Date): Promise<Budget> {
  const from = new Date(now.getTime() - 7 * DAY);
  const samples = await tx
    .select()
    .from(hqUsageSamples)
    .where(and(gte(hqUsageSamples.createdAt, from), lte(hqUsageSamples.createdAt, now), isNotNull(hqUsageSamples.sevenDayPct)))
    .orderBy(asc(hqUsageSamples.createdAt))
    .limit(5000);
  const latest = samples.at(-1);
  // A reading from before the weekly reset describes last week: show "not measured yet" until a new one arrives.
  const stale = !!latest?.sevenDayResetsAt && latest.sevenDayResetsAt.getTime() < now.getTime();
  return {
    weekPct: latest && !stale ? latest.sevenDayPct : null,
    roundsPct: stale ? null : roundsShare(samples),
    target: USAGE_PLAN.target,
    ceiling: USAGE_PLAN.ceiling,
    asOf: latest?.createdAt ?? null,
    resetsAt: latest?.sevenDayResetsAt ?? null,
  };
}

type UsageReading = { sessionId: string | null; phase: string; sevenDayPct: number | null; createdAt: Date };

/**
 * The share of the week used by automated rounds. The meter is account-wide, so rounds from different sessions that
 * overlap are merged into one span first; each span counts (last reading at or before its end) minus (first reading at
 * or after its start), never below 0. Null with no complete span (a round_start and a round_end with readings).
 */
export function roundsShare(samples: UsageReading[]): number | null {
  const sorted = samples.filter((s) => s.sevenDayPct != null).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const all = [...samples].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const open = new Map<string, number>();
  const spans: [number, number][] = [];
  for (const s of all) {
    const key = s.sessionId ?? "";
    const t = s.createdAt.getTime();
    if (s.phase === "round_start") {
      if (s.sevenDayPct != null) open.set(key, t);
      else open.delete(key);
    } else if (s.phase === "round_end") {
      const start = open.get(key);
      open.delete(key);
      if (start !== undefined && s.sevenDayPct != null) spans.push([start, t]);
    }
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged.at(-1);
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else merged.push([sp[0], sp[1]]);
  }
  let total = 0;
  let counted = 0;
  for (const [start, end] of merged) {
    const first = sorted.find((r) => r.createdAt.getTime() >= start);
    const lastR = [...sorted].reverse().find((r) => r.createdAt.getTime() <= end);
    if (!first || !lastR || first.createdAt.getTime() > lastR.createdAt.getTime()) continue;
    total += Math.max(0, lastR.sevenDayPct! - first.sevenDayPct!);
    counted++;
  }
  return counted ? Math.round(total * 10) / 10 : null;
}

export async function weeklyBudget(db: Database, now: Date = new Date()): Promise<Budget> {
  return timed(db, (tx) => budgetIn(tx, now));
}

/** The owner's time zone (first ADMIN_EMAILS user), so "today" and "due soon" match their calendar, not UTC. */
export async function ownerTimeZone(tx: Tx): Promise<string> {
  const emails = adminEmails();
  if (emails.length) {
    const [u] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(and(eq(users.accountKind, "standard"), eq(sql`lower(${users.email})`, emails[0])))
      .limit(1);
    if (u?.timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: u.timezone });
        return u.timezone;
      } catch {
        /* fall through */
      }
    }
  }
  return "America/Los_Angeles";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export async function weeklySummary(db: Database, now: Date = new Date()): Promise<WeeklySummary> {
  const from = new Date(now.getTime() - 7 * DAY);
  return timed(db, async (tx) => {
    const tz = await ownerTimeZone(tx);
    const today = localDateOf(now, tz);
    const soon = addDaysStr(today, 7);
    const done = await tx
      .select()
      .from(hqMissions)
      .where(and(eq(hqMissions.status, "done"), gte(hqMissions.doneAt, from)))
      .orderBy(desc(hqMissions.doneAt))
      .limit(100);
    const [st] = await tx
      .select({ n: count() })
      .from(hqMissions)
      .where(and(gte(hqMissions.startedAt, from), lte(hqMissions.startedAt, now)));
    const blocked = await tx.select().from(hqMissions).where(eq(hqMissions.status, "blocked")).orderBy(asc(hqMissions.updatedAt)).limit(50);
    const decided = await tx
      .select()
      .from(hqApprovals)
      .where(and(ne(hqApprovals.status, "pending"), gte(hqApprovals.decidedAt, from)))
      .orderBy(desc(hqApprovals.decidedAt))
      .limit(100);
    const [pend] = await tx.select({ n: count() }).from(hqApprovals).where(NEEDS_YES);
    const overdue = await tx
      .select()
      .from(hqMissions)
      .where(and(inArray(hqMissions.status, [...OPEN]), lt(hqMissions.dueOn, today)))
      .orderBy(asc(hqMissions.dueOn))
      .limit(50);
    const dueSoon = await tx
      .select()
      .from(hqMissions)
      .where(and(inArray(hqMissions.status, [...OPEN]), gte(hqMissions.dueOn, today), lte(hqMissions.dueOn, soon)))
      .orderBy(asc(hqMissions.dueOn))
      .limit(50);
    const budget = await budgetIn(tx, now);
    const marketing = await marketingWeekIn(tx, from, now);

    const headline: string[] = [];
    headline.push(done.length ? `${done.length} ${plural(done.length, "mission", "missions")} finished this week.` : "Nothing finished this week yet.");
    const waiting = pend?.n ?? 0;
    if (waiting) headline.push(waiting === 1 ? "1 thing is waiting for your yes." : `${waiting} things are waiting for your yes.`);
    if (blocked.length === 1) headline.push(`1 mission is blocked: ${blocked[0].title}.`);
    else if (blocked.length > 1)
      headline.push(
        `${blocked.length} missions are blocked: ${blocked
          .slice(0, 3)
          .map((m) => m.title)
          .join(", ")}.`,
      );
    if (overdue.length) headline.push(`${overdue.length} ${plural(overdue.length, "mission is", "missions are")} overdue.`);
    if (dueSoon.length) headline.push(`${dueSoon.length} ${plural(dueSoon.length, "mission is", "missions are")} due in the next 7 days.`);
    if (marketing.drafted + marketing.approved + marketing.scheduled + marketing.published > 0)
      headline.push(
        `Marketing: ${marketing.drafted} ${plural(marketing.drafted, "draft", "drafts")}, ${marketing.approved} approved, ${marketing.scheduled} scheduled, ${marketing.published} published.`,
      );
    headline.push(
      budget.roundsPct != null
        ? `Automated rounds used ${Math.round(budget.roundsPct)}% of the week (aim ${USAGE_PLAN.targetLow}–${USAGE_PLAN.target}%, ceiling ${USAGE_PLAN.ceiling}%).`
        : "Usage isn't measured yet.",
    );
    return {
      from,
      to: now,
      done: done.map(toMission),
      started: st?.n ?? 0,
      blocked: blocked.map(toMission),
      approvalsDecided: decided.map(toApproval),
      approvalsPending: waiting,
      overdue: overdue.map(toMission),
      dueSoon: dueSoon.map(toMission),
      budget,
      marketing,
      headline,
    };
  });
}

export async function listHqKeys(db: Database): Promise<HqKeyRow[]> {
  return timed(db, (tx) =>
    tx
      .select({ id: hqKeys.id, name: hqKeys.name, createdAt: hqKeys.createdAt, lastUsedAt: hqKeys.lastUsedAt, revokedAt: hqKeys.revokedAt })
      .from(hqKeys)
      .orderBy(desc(hqKeys.createdAt))
      .limit(50),
  );
}

// --- missions -----------------------------------------------------------------------------------------------------

export async function createMission(db: Database, actor: HqActor, input: MissionInput): Promise<Mission> {
  const d = parse(missionInputSchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(hqMissions)
      .values({
        role: d.role,
        title: d.title,
        detail: d.detail ?? null,
        priority: d.priority ?? "normal",
        links: d.links ?? [],
        dueOn: d.dueOn ?? null,
        deskPrompt: d.deskPrompt ?? null,
        source: actorKind(actor),
        sessionId: d.sessionId ?? (actor.kind === "agent" ? (actor.sessionId ?? null) : null),
      })
      .returning();
    await logActivity(tx, {
      actor: actor.kind,
      role: d.role,
      kind: "mission_added",
      text: `Added: ${d.title}`,
      missionId: row.id,
      sessionId: actorSession(actor),
    });
    return toMission(row);
  });
}

export async function updateMission(db: Database, actor: HqActor, id: string, patch: MissionPatch): Promise<Mission> {
  if (!z.uuid().safeParse(id).success) throw new HqError("Unknown mission.");
  const p = parse(missionPatchSchema, patch);
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(hqMissions).where(eq(hqMissions.id, id)).for("update");
    if (!cur) throw new HqError("That mission no longer exists.");
    const now = new Date();
    const next: Partial<typeof hqMissions.$inferInsert> = { updatedAt: now };
    if (p.role !== undefined) next.role = p.role;
    if (p.title !== undefined) next.title = p.title;
    if (p.detail !== undefined) next.detail = p.detail;
    if (p.priority !== undefined) next.priority = p.priority;
    if (p.progress !== undefined) next.progress = p.progress;
    if (p.result !== undefined) next.result = p.result;
    if (p.links !== undefined) next.links = p.links;
    if (p.sessionId !== undefined) next.sessionId = p.sessionId;
    if (p.branch !== undefined) next.branch = p.branch;
    if (p.dueOn !== undefined) next.dueOn = p.dueOn;
    if (p.deskPrompt !== undefined) next.deskPrompt = p.deskPrompt;

    const status = p.status ?? cur.status;
    const changed = status !== cur.status;
    let reason = p.blockedReason !== undefined ? p.blockedReason : cur.blockedReason;
    if (status === "blocked") {
      if (!reason) throw new HqError("Say what it's blocked on.");
      next.blockedReason = reason;
    } else {
      reason = null;
      next.blockedReason = null;
    }
    if (changed) {
      next.status = status;
      if (status === "doing" && !cur.startedAt) next.startedAt = now;
      if (status === "done") {
        next.doneAt = now;
        next.seenAt = null;
      } else if (cur.status === "done") {
        next.doneAt = null;
      }
    }
    const [row] = await tx.update(hqMissions).set(next).where(eq(hqMissions.id, id)).returning();
    const title = row.title;
    let line: string;
    let kind: string;
    if (changed && status === "doing") [kind, line] = ["mission_started", `Started: ${title}`];
    else if (changed && status === "done") [kind, line] = ["mission_done", `Finished: ${title}`];
    else if (changed && status === "blocked") [kind, line] = ["mission_blocked", `Blocked: ${title} (${reason})`];
    else if (changed && status === "dropped") [kind, line] = ["mission_dropped", `Dropped: ${title}`];
    else if (changed) [kind, line] = ["mission_updated", `Moved to ${status}: ${title}`];
    else [kind, line] = ["mission_updated", `Updated: ${title}`];
    await logActivity(tx, { actor: actor.kind, role: row.role, kind, text: line, missionId: row.id, sessionId: actorSession(actor) });
    return toMission(row);
  });
}

/** The owner opened a finished mission: its "done" sparkle stops. */
export async function markMissionSeen(db: Database, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) return;
  await db
    .update(hqMissions)
    .set({ seenAt: new Date() })
    .where(and(eq(hqMissions.id, id), eq(hqMissions.status, "done")));
}

// --- approvals ----------------------------------------------------------------------------------------------------

let pushSenderOverride: (() => Promise<Sender | null>) | null = null;
/** Tests inject their own web-push sender; null restores the real one. */
export function setHqPushSender(fn: (() => Promise<Sender | null>) | null) {
  pushSenderOverride = fn;
}

/** Tells the owner's phone something happened. Never throws: a push problem must not fail the request. */
async function notifyOwner(db: Database, p: { key: string; title: string; body: string; url: string; tag: string }): Promise<void> {
  try {
    const send = await (pushSenderOverride ?? webPushSender)();
    if (!send) return;
    const emails = adminEmails();
    if (!emails.length) return;
    const owners = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.accountKind, "standard"), inArray(sql`lower(${users.email})`, emails)))
      .limit(5);
    for (const o of owners) {
      await withUser(o.id, (scope) => sendOnce(scope, p.key, { title: p.title, body: p.body, url: p.url, tag: p.tag }, send), db);
    }
  } catch (e) {
    console.error("HQ push failed:", e instanceof Error ? e.name : "error");
  }
}

/** Sends the owner's phone the "needs your yes" push for an approval. Never throws. Call it after the transaction that made the approval has committed. */
export const sendApprovalPush = (db: Database, a: Approval, body?: string) =>
  notifyOwner(db, {
    key: `hq-approval:${a.id}`,
    title: body ? `${employee(a.role).title}: new version` : `${employee(a.role).title} needs your yes`,
    body: body ? `${body}: ${a.title}` : a.title,
    url: "/admin/work#approvals",
    tag: `hq-${a.id}`,
  });

const cardValues = (d: z.output<typeof approvalInputSchema> | z.output<typeof reviseInputSchema>) => ({
  title: d.title,
  summary: d.summary ?? d.why,
  why: d.why,
  changes: d.changes,
  onYes: d.onYes,
  onNo: d.onNo,
  effort: d.effort,
  risk: d.risk,
  recommendation: d.recommendation,
  previews: d.previews.map((p): HqPreview => ({ fileId: p.fileId, label: p.label ?? null })),
  links: d.links ?? [],
});

/**
 * Every picture a card lists must be one HQ stored: a made-up id is refused, never shown as a broken image. The pictures
 * are marked fresh in the card's own transaction: the row lock makes a running purge wait, and once the card is saved the
 * purge's re-check skips them. If the purge got there first, the card is refused cleanly instead of saved with a hole.
 */
async function assertPreviewsExist(tx: Tx, previews: { fileId: string }[]): Promise<void> {
  const ids = [...new Set(previews.map((p) => p.fileId))];
  const rows = await tx.update(hqFiles).set({ createdAt: new Date() }).where(inArray(hqFiles.id, ids)).returning({ id: hqFiles.id });
  if (rows.length !== ids.length) throw new HqError("A picture in previews was not uploaded. Upload it first (--preview path.png).");
}

/**
 * Creates a request for the owner's yes, as a full decision card (ADR 0028): the ask, why, exact changes, what happens on
 * yes and no, effort, risk, a recommendation and at least one picture. Anything missing is refused with a plain message
 * naming it. With `{ tx }` it joins the caller's transaction, and with `notify: false` it sends no push (the caller sends
 * it with sendApprovalPush after its own commit).
 */
export async function createApproval(db: Database, actor: HqActor, input: ApprovalInput, opts: { tx?: Tx; notify?: boolean } = {}): Promise<Approval> {
  const d = parseCard(approvalInputSchema, input);
  const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => (opts.tx ? fn(opts.tx) : db.transaction(fn));
  const approval = await run(async (tx) => {
    if (d.missionId) {
      const [m] = await tx.select({ id: hqMissions.id }).from(hqMissions).where(eq(hqMissions.id, d.missionId));
      if (!m) throw new HqError("That mission no longer exists.");
    }
    await assertPreviewsExist(tx, d.previews);
    const id = randomUUID();
    const [row] = await tx
      .insert(hqApprovals)
      .values({ id, threadId: id, version: 1, role: d.role, kind: d.kind, ...cardValues(d), missionId: d.missionId ?? null, source: actorKind(actor) })
      .returning();
    await logActivity(tx, {
      actor: actor.kind,
      role: d.role,
      kind: "approval_asked",
      text: `Asked for your yes: ${d.title}`,
      approvalId: row.id,
      missionId: row.missionId,
      sessionId: actorSession(actor),
    });
    return toApproval(row);
  });
  if (actor.kind === "agent" && opts.notify !== false) await sendApprovalPush(db, approval);
  return approval;
}

/**
 * Sends the next version of an ask the owner answered with "Changes". `target` is the thread id or any version's id.
 * Creates version n+1 (the full card again plus what changed since the owner's note), marks the old one superseded and
 * pushes the owner. Only the newest version, and only when it is waiting on changes, can be revised.
 */
export async function reviseApproval(db: Database, actor: HqActor, target: string, input: ReviseInput): Promise<Approval> {
  if (!z.uuid().safeParse(target).success) throw new HqError("Unknown request. Use the thread id or the request id.");
  const d = parseCard(reviseInputSchema, input);
  const approval = await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(hqApprovals)
      .where(or(eq(hqApprovals.id, target), eq(hqApprovals.threadId, target)))
      .orderBy(desc(hqApprovals.version))
      .limit(1)
      .for("update");
    if (!cur) throw new HqError("That request no longer exists.");
    if (!cur.threadId || cur.why == null) throw new HqError("That is an old request. Send a new request in the decision-card format instead.");
    if (cur.supersededAt) throw new HqError("A newer version already exists. Revise the newest one.");
    if (cur.status === "pending") throw new HqError("The owner hasn't answered this version yet. Wait for their answer before sending a new one.");
    if (cur.status !== "changes")
      throw new HqError(cur.status === "approved" ? "The owner already said yes to this." : "The owner already said no, so this ask is closed.");
    if (d.role && d.role !== cur.role) throw new HqError("A revision stays with the same department.");
    if (d.kind && d.kind !== cur.kind) throw new HqError("A revision keeps the same kind of request. Start a new request for a different kind.");
    if (d.missionId) {
      const [m] = await tx.select({ id: hqMissions.id }).from(hqMissions).where(eq(hqMissions.id, d.missionId));
      if (!m) throw new HqError("That mission no longer exists.");
    }
    await assertPreviewsExist(tx, d.previews);
    const now = new Date();
    await tx.update(hqApprovals).set({ supersededAt: now, updatedAt: now }).where(eq(hqApprovals.id, cur.id));
    const [row] = await tx
      .insert(hqApprovals)
      .values({
        threadId: cur.threadId,
        version: cur.version + 1,
        role: cur.role,
        kind: cur.kind,
        ...cardValues(d),
        changedSinceNote: d.changedSinceNote,
        missionId: d.missionId ?? cur.missionId,
        source: actorKind(actor),
      })
      .returning();
    // A publish ask's post follows the newest version, so the owner's answer on it moves the post (decideApproval).
    if (cur.kind === "publish")
      await tx
        .update(hqContent)
        .set({ approvalId: row.id, status: "waiting", updatedAt: now })
        .where(and(eq(hqContent.approvalId, cur.id), inArray(hqContent.status, ["draft", "idea", "waiting"])));
    await logActivity(tx, {
      actor: actor.kind,
      role: cur.role,
      kind: "approval_revised",
      text: `Sent version ${row.version} for your yes: ${row.title}`,
      approvalId: row.id,
      missionId: row.missionId,
      sessionId: actorSession(actor),
    });
    return toApproval(row);
  });
  if (actor.kind === "agent") await sendApprovalPush(db, approval, "Version " + approval.version + " is ready for your yes");
  return approval;
}

/** After a yes, the COO links the mission that builds it; from then on the card reports that mission's progress. */
export async function linkApprovalMission(db: Database, actor: HqActor, approvalId: string, missionId: string): Promise<Approval> {
  if (!z.uuid().safeParse(approvalId).success || !z.uuid().safeParse(missionId).success) throw new HqError("Unknown request or mission.");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(hqApprovals).where(eq(hqApprovals.id, approvalId)).for("update");
    if (!cur) throw new HqError("That request no longer exists.");
    if (cur.status !== "approved") throw new HqError("Only a request the owner said yes to can be linked to a mission.");
    const [m] = await tx.select({ id: hqMissions.id, status: hqMissions.status }).from(hqMissions).where(eq(hqMissions.id, missionId));
    if (!m) throw new HqError("That mission no longer exists.");
    if (m.status === "done" || m.status === "dropped") throw new HqError("That mission is already finished or dropped. Link the mission that builds this.");
    if (cur.buildMissionId && cur.buildMissionId !== missionId) {
      const [old] = await tx.select({ status: hqMissions.status }).from(hqMissions).where(eq(hqMissions.id, cur.buildMissionId));
      if (old && old.status !== "dropped") throw new HqError("That request already has a mission.");
    }
    const [row] = await tx.update(hqApprovals).set({ buildMissionId: missionId, updatedAt: new Date() }).where(eq(hqApprovals.id, approvalId)).returning();
    await logActivity(tx, {
      actor: actor.kind,
      role: row.role,
      kind: "approval_linked",
      text: `Started the work for: ${row.title}`,
      approvalId: row.id,
      missionId,
      sessionId: actorSession(actor),
    });
    return toApproval(row);
  });
}

/** Records the owner's decision. HQ never carries it out; the employee acts on it at their next round. "Changes" needs a note and keeps the thread open. */
export async function decideApproval(
  db: Database,
  admin: Admin,
  id: string,
  decision: "approved" | "declined" | "changes",
  note?: string | null,
): Promise<Approval> {
  if (!z.uuid().safeParse(id).success) throw new HqError("Unknown approval.");
  if (!["approved", "declined", "changes"].includes(decision)) throw new HqError("Pick yes, no or changes.");
  const n = parse(optText(1000), note ?? undefined) ?? null;
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(hqApprovals).where(eq(hqApprovals.id, id)).for("update");
    if (!cur) throw new HqError("That approval no longer exists.");
    if (cur.status !== "pending") throw new HqError("That one was already decided.");
    if (cur.why == null) throw new HqError("This request is being rewritten by your COO. Answer the new version when it arrives.");
    if (decision === "changes" && !n) throw new HqError("Say what to change, so they know what to fix.");
    const now = new Date();
    const [row] = await tx
      .update(hqApprovals)
      .set({ status: decision, decisionNote: n, decidedAt: now, updatedAt: now })
      .where(eq(hqApprovals.id, id))
      .returning();
    const lead = decision === "approved" ? "You said yes" : decision === "declined" ? "You said no" : "You asked for changes";
    await logActivity(tx, {
      actor: "owner",
      role: row.role,
      kind: `approval_${decision}`,
      text: `${lead}: ${row.title}`,
      approvalId: row.id,
      missionId: row.missionId,
    });
    await logAdmin(tx, admin, "hq.approval_decided", { approvalId: row.id, decision });
    if (row.kind === "publish") {
      // The owner's decision moves the post it was asked for (ADR 0025). HQ only records it; the marketing round acts on it.
      const to = decision === "approved" ? "approved" : decision === "declined" ? "dropped" : "draft";
      const moved = await tx
        .update(hqContent)
        .set({ status: to, updatedAt: now })
        .where(and(eq(hqContent.approvalId, id), eq(hqContent.status, "waiting")))
        .returning({ title: hqContent.title });
      for (const c of moved) {
        const quoted = `"${c.title.length > 80 ? `${c.title.slice(0, 77)}...` : c.title}"`;
        await logActivity(tx, {
          actor: "owner",
          role: "marketing",
          kind: decision === "approved" ? "content_approved" : "content_updated",
          text:
            decision === "approved" ? `${quoted} approved` : decision === "declined" ? `${quoted} dropped` : `${quoted} sent back to draft${n ? `: ${n}` : ""}`,
          approvalId: row.id,
        });
      }
    }
    return toApproval(row);
  });
}

// --- chats and keys (Settings) ----------------------------------------------------------------------------------

/** Settings: which chat belongs to which employee. */
export async function saveChat(
  db: Database,
  admin: Admin,
  input: { id: string; role: HqRole | null; title: string; isPrimary: boolean; branch?: string | null },
): Promise<Chat> {
  const id = normalizeSessionId(input.id);
  const d = parse(z.object({ role: role.nullable(), title: line(1, 140), isPrimary: z.boolean(), branch: optLine(200) }), input);
  return db.transaction(async (tx) => {
    const isPrimary = d.isPrimary && d.role !== null;
    if (isPrimary)
      await tx
        .update(hqChats)
        .set({ isPrimary: false })
        .where(and(eq(hqChats.role, d.role!), ne(hqChats.id, id)));
    const values = { role: d.role, title: d.title, isPrimary, ...(d.branch !== undefined ? { branch: d.branch } : {}) };
    const [row] = await tx
      .insert(hqChats)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: hqChats.id, set: { ...values, updatedAt: new Date() } })
      .returning();
    await logActivity(tx, { actor: "owner", role: row.role ?? "founder", kind: "chat_linked", text: `Chat linked: ${row.title}`, sessionId: id });
    await logAdmin(tx, admin, "hq.chat_saved", { chatId: id, role: row.role });
    return toChat(row);
  });
}

export async function removeChat(db: Database, admin: Admin, id: string): Promise<void> {
  const sid = normalizeSessionId(id);
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(hqChats).where(eq(hqChats.id, sid)).returning();
    if (!row) throw new HqError("That chat isn't linked.");
    await logActivity(tx, { actor: "owner", role: row.role ?? "founder", kind: "chat_removed", text: `Chat removed: ${row.title}`, sessionId: sid });
    await logAdmin(tx, admin, "hq.chat_removed", { chatId: sid });
  });
}

const KEY_PREFIX = "lfq_";
/** `lfq_` + 24 random bytes as base64url (32 characters). Anything else is never looked up or counted. */
export const isHqKeyFormat = (raw: unknown): raw is string => typeof raw === "string" && /^lfq_[A-Za-z0-9_-]{32}$/.test(raw);

/** The raw key is returned once and never stored. */
export async function createHqKey(db: Database, admin: Admin, name: string): Promise<{ id: string; token: string }> {
  const n = parse(line(1, 60), name);
  return db.transaction(async (tx) => {
    const [{ active }] = await tx.select({ active: count() }).from(hqKeys).where(isNull(hqKeys.revokedAt));
    if (active >= 5) throw new HqError("You already have 5 active keys. Revoke one first.");
    const token = KEY_PREFIX + randomBytes(24).toString("base64url");
    const [row] = await tx
      .insert(hqKeys)
      .values({ name: n, tokenHash: sha256(token), createdByEmail: admin.email })
      .returning({ id: hqKeys.id });
    await logActivity(tx, { actor: "owner", role: "founder", kind: "key_created", text: `HQ key created: ${n}` });
    await logAdmin(tx, admin, "hq.key_created", { keyId: row.id, name: n });
    return { id: row.id, token };
  });
}

export async function revokeHqKey(db: Database, admin: Admin, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) throw new HqError("Key not found.");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(hqKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(hqKeys.id, id), isNull(hqKeys.revokedAt)))
      .returning();
    if (!row) throw new HqError("Key not found.");
    await logActivity(tx, { actor: "owner", role: "founder", kind: "key_revoked", text: `HQ key revoked: ${row.name}` });
    await logAdmin(tx, admin, "hq.key_revoked", { keyId: row.id, name: row.name });
  });
}

// --- agent side (/api/hq, authenticated by an HQ key) ------------------------------------------------------------

export async function resolveHqKey(db: Database, raw: string): Promise<{ id: string; name: string } | null> {
  if (!isHqKeyFormat(raw)) return null;
  const [row] = await db
    .select({ id: hqKeys.id, name: hqKeys.name })
    .from(hqKeys)
    .where(and(eq(hqKeys.tokenHash, sha256(raw)), isNull(hqKeys.revokedAt)));
  if (!row) return null;
  await db.update(hqKeys).set({ lastUsedAt: new Date() }).where(eq(hqKeys.id, row.id));
  return row;
}

const checkinSchema = z.object({
  relay: z.boolean().optional(),
  activeAt: z.string().max(40).optional(),
  title: optLine(140),
  branch: optLine(200),
  commit: optLine(64),
  status: z.enum(CHAT_STATUSES).nullish(),
  summary: optText(1000),
  needsAction: optText(1000),
  usage: z
    .object({
      fiveHourPct: z.number().nullish(),
      sevenDayPct: z.number().nullish(),
      sevenDayResetsAt: z.string().max(40).nullish(),
      readAt: z.string().max(40).nullish(),
      phase: z.enum(["sample", "round_start", "round_end"]).optional(),
    })
    .nullish(),
});

/** When the meter was read: the reported time if it is not in the future and under 6 h old, else now. */
export function readingTime(readAt: string | null | undefined, now: Date): Date {
  const t = readAt ? new Date(readAt) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  const age = now.getTime() - t.getTime();
  return age < 0 || age > 6 * 3_600_000 ? now : t;
}

export async function recordCheckin(db: Database, input: CheckinInput): Promise<void> {
  const sessionId = normalizeSessionId(input?.sessionId);
  const d = parse(checkinSchema, input);
  await db.transaction(async (tx) => {
    const now = new Date();
    const [cur] = await tx.select().from(hqChats).where(eq(hqChats.id, sessionId)).for("update");
    const set: Partial<typeof hqChats.$inferInsert> = { updatedAt: now };
    if (d.relay) {
      // The COO reporting another chat: it can't create a chat, rename one or touch its branch, and it can't make a chat look active.
      if (!cur) throw new HqError("Unknown chat. A relayed status can only update a chat HQ already knows.");
      // The COO's own chat says when a round runs (ADR 0029): only its own check-ins may change it.
      if (cur.role === "assistant") throw new HqError("The COO's chat reports for itself. A relayed status can't change it.");
      const at = d.activeAt ? new Date(d.activeAt) : null;
      if (at && !Number.isNaN(at.getTime())) {
        const clamped = at.getTime() > now.getTime() ? now : at;
        if (!cur.lastCheckinAt || clamped.getTime() > cur.lastCheckinAt.getTime()) set.lastCheckinAt = clamped;
      }
    } else {
      set.lastCheckinAt = now;
      if (d.title) set.title = d.title;
      if (d.branch !== undefined) set.branch = d.branch;
      if (d.commit !== undefined) set.lastCommit = d.commit;
    }
    if (d.status) set.status = d.status;
    if (d.summary !== undefined) set.summary = d.summary;
    if (d.needsAction !== undefined) set.needsAction = d.needsAction;
    // A chat that reports it is working again no longer waits on anything.
    else if (d.status && d.status !== "blocked") set.needsAction = null;

    const [row] = await tx
      .insert(hqChats)
      .values({ id: sessionId, title: d.title ?? "Untitled chat", ...set })
      .onConflictDoUpdate({ target: hqChats.id, set })
      .returning();

    const becameBlocked = row.status === "blocked" && cur?.status !== "blocked";
    const newNeed = !!row.needsAction && row.needsAction !== (cur?.needsAction ?? null);
    if (becameBlocked || newNeed) {
      await logActivity(tx, {
        actor: "agent",
        role: row.role,
        kind: "chat_waiting",
        text: row.needsAction ? `${row.title} is waiting: ${row.needsAction}` : `${row.title} is blocked`,
        sessionId,
      });
    }

    const u = d.relay ? null : d.usage;
    const five = clampPct(u?.fiveHourPct);
    const seven = clampPct(u?.sevenDayPct);
    if (u && (five !== null || seven !== null)) {
      const resets = u.sevenDayResetsAt ? new Date(u.sevenDayResetsAt) : null;
      await tx.insert(hqUsageSamples).values({
        sessionId,
        fiveHourPct: five,
        sevenDayPct: seven,
        sevenDayResetsAt: resets && !Number.isNaN(resets.getTime()) ? resets : null,
        phase: u.phase ?? "sample",
        createdAt: readingTime(u.readAt, now),
      });
    }
  });
}

export async function recordAgentActivity(
  db: Database,
  actor: HqActor,
  input: { role: HqRole; text: string; link?: string | null; sessionId?: string | null; kind?: "note" | "decision" },
): Promise<void> {
  const d = parse(z.object({ role, text: line(1, 400), link: url.nullish(), kind: z.enum(["note", "decision"]).optional() }), input);
  // Only the COO makes (delegated) decisions; HQ just logs them. No API lets an agent decide an approval.
  if (d.kind === "decision" && d.role !== "assistant") throw new HqError("Only your COO logs decisions.");
  await db.transaction(async (tx) => {
    await logActivity(tx, {
      actor: actor.kind,
      role: d.role,
      kind: d.kind ?? "note",
      text: d.text,
      link: d.link ?? null,
      sessionId: input.sessionId ? normalizeSessionId(input.sessionId) : actorSession(actor),
    });
  });
}

/** What an agent should pick up: open missions (optionally for one role) and approval decisions since a time. */
export async function agentInbox(
  db: Database,
  input: { role?: HqRole; since?: Date } = {},
): Promise<{
  missions: Mission[];
  decisions: Approval[];
  /** Asks the owner answered "Changes": the owner's note is in `decisionNote`. Send the next version with `approval --revise`. */
  revisions: Approval[];
  /** Old requests with no decision card. Rewrite each in the new format as a new request. */
  needsRewrite: Approval[];
  /** Asks the owner said yes to that no mission builds yet. Create or link one (`approval --start <id> --mission <missionId>`). */
  approvedWithoutMission: Approval[];
  approvedContent: ContentItem[];
  controls: Omit<HqControls, "updatedByEmail" | "updatedAt">;
  chats: { id: string; title: string; role: HqRole }[];
}> {
  const since = input.since && !Number.isNaN(input.since.getTime()) ? input.since : new Date(Date.now() - 7 * DAY);
  return timed(db, async (tx) => {
    const missions = await tx
      .select()
      .from(hqMissions)
      .where(and(inArray(hqMissions.status, [...OPEN]), input.role ? eq(hqMissions.role, input.role) : undefined))
      .orderBy(priorityRank, asc(hqMissions.createdAt))
      .limit(50);
    const decisions = await tx
      .select()
      .from(hqApprovals)
      .where(and(ne(hqApprovals.status, "pending"), gte(hqApprovals.decidedAt, since), input.role ? eq(hqApprovals.role, input.role) : undefined))
      .orderBy(desc(hqApprovals.decidedAt))
      .limit(50);
    const mine = input.role ? eq(hqApprovals.role, input.role) : undefined;
    const revisions = await tx
      .select()
      .from(hqApprovals)
      .where(and(eq(hqApprovals.status, "changes"), isNull(hqApprovals.supersededAt), isNotNull(hqApprovals.why), mine))
      .orderBy(asc(hqApprovals.decidedAt))
      .limit(50);
    const needsRewrite = await tx
      .select()
      .from(hqApprovals)
      .where(and(eq(hqApprovals.status, "pending"), isNull(hqApprovals.why), mine))
      .orderBy(asc(hqApprovals.createdAt))
      .limit(50);
    const unlinked = await tx
      .select()
      .from(hqApprovals)
      .where(
        and(
          eq(hqApprovals.status, "approved"),
          isNotNull(hqApprovals.why),
          mine,
          or(
            isNull(hqApprovals.buildMissionId),
            sql`exists (select 1 from hq_missions bm where bm.id = ${hqApprovals.buildMissionId} and bm.status = 'dropped')`,
          ),
        ),
      )
      .orderBy(asc(hqApprovals.decidedAt))
      .limit(50);
    const approvedContent = await approvedContentIn(tx);
    // The owner's email and edit time are for the owner's pages only; an agent gets the switches and nothing else.
    const { updatedByEmail: _email, updatedAt: _at, ...controls } = await controlsIn(tx);
    const mapped = await tx
      .select({ id: hqChats.id, title: hqChats.title, role: hqChats.role })
      .from(hqChats)
      .where(isNotNull(hqChats.role))
      .orderBy(asc(hqChats.createdAt))
      .limit(100);
    const chats = mapped.flatMap((c) => (c.role ? [{ id: c.id, title: c.title, role: c.role }] : []));
    return {
      missions: missions.map(toMission),
      decisions: decisions.map(toApproval),
      revisions: revisions.map(toApproval),
      needsRewrite: needsRewrite.map(toApproval),
      approvedWithoutMission: unlinked.map(toApproval),
      approvedContent,
      controls,
      chats,
    };
  });
}

const seedSchema = z.object({
  chats: z
    .array(z.object({ id: z.string(), title: line(1, 140), role: role.nullable(), isPrimary: z.boolean(), branch: optLine(200) }))
    .max(50)
    .default([]),
  missions: z
    .array(
      z.object({
        role,
        title: line(1, 140),
        detail: optText(4000),
        priority: z.enum(PRIORITIES).optional(),
        status: z.enum(MISSION_STATUSES).optional(),
        progress: optText(1000),
        blockedReason: optText(1000),
        links: linksSchema.optional(),
        sessionId: z.string().nullish(),
        branch: optLine(200),
      }),
    )
    .max(200)
    .default([]),
  approvals: z
    .array(z.object({ role, kind: z.enum(APPROVAL_KINDS), title: line(1, 140), summary: line(1, 2000), links: linksSchema.optional() }))
    .max(200)
    .default([]),
});

/** Loads docs/hq/seed.json (real items from the handover). Safe to run twice: existing ids/titles are skipped. */
export async function importSeed(db: Database, actor: HqActor, seed: unknown): Promise<{ chats: number; missions: number; approvals: number }> {
  const d = parse(seedSchema, seed);
  return db.transaction(async (tx) => {
    const out = { chats: 0, missions: 0, approvals: 0 };
    for (const c of d.chats) {
      const id = normalizeSessionId(c.id);
      const [hit] = await tx.select({ id: hqChats.id }).from(hqChats).where(eq(hqChats.id, id));
      if (hit) continue;
      // Only the owner's import may map a chat to an employee; an agent's import leaves that to the owner in Settings.
      const role = actor.kind === "owner" ? c.role : null;
      const isPrimary = actor.kind === "owner" && c.isPrimary && role !== null;
      if (isPrimary) await tx.update(hqChats).set({ isPrimary: false }).where(eq(hqChats.role, role!));
      await tx.insert(hqChats).values({ id, title: c.title, role, isPrimary, branch: c.branch ?? null });
      out.chats++;
    }
    for (const m of d.missions) {
      const [hit] = await tx.select({ id: hqMissions.id }).from(hqMissions).where(eq(hqMissions.title, m.title));
      if (hit) continue;
      const status = m.status ?? "todo";
      if (status === "blocked" && !m.blockedReason) throw new HqError(`"${m.title}" is blocked but says nothing about why.`);
      const now = new Date();
      await tx.insert(hqMissions).values({
        role: m.role,
        title: m.title,
        detail: m.detail ?? null,
        priority: m.priority ?? "normal",
        status,
        progress: m.progress ?? null,
        blockedReason: status === "blocked" ? m.blockedReason! : null,
        links: m.links ?? [],
        sessionId: m.sessionId ? normalizeSessionId(m.sessionId) : null,
        branch: m.branch ?? null,
        source: "import",
        startedAt: status === "doing" ? now : null,
        doneAt: status === "done" ? now : null,
      });
      out.missions++;
    }
    for (const a of d.approvals) {
      const [hit] = await tx.select({ id: hqApprovals.id }).from(hqApprovals).where(eq(hqApprovals.title, a.title));
      if (hit) continue;
      await tx.insert(hqApprovals).values({ role: a.role, kind: a.kind, title: a.title, summary: a.summary, links: a.links ?? [], source: "import" });
      out.approvals++;
    }
    if (out.chats + out.missions + out.approvals > 0) {
      await logActivity(tx, {
        actor: actor.kind,
        role: "founder",
        kind: "import",
        text: `Imported ${out.chats} chats, ${out.missions} missions, ${out.approvals} approvals`,
        sessionId: actorSession(actor),
      });
    }
    return out;
  });
}

/** Settings: "Import the starting list". Owner-only (the caller has checked requireAdmin); may set roles and main chats. */
export async function importSeedAsOwner(db: Database, admin: Admin, seed: unknown): Promise<{ chats: number; missions: number; approvals: number }> {
  const out = await importSeed(db, { kind: "owner", email: admin.email }, seed);
  await db.insert(adminActions).values({ actorUserId: admin.id, actorEmail: admin.email, action: "hq.seed_imported", metadata: out });
  return out;
}

// --- decision threads and lifecycle (ADR 0028) ---------------------------------------------------------------------

/**
 * Where an approved card is, taken from its linked mission (nothing is stored twice):
 * approved = the owner's yes; being built = mission doing (or blocked); ready for your look = mission waiting;
 * live = mission done. The mission is the BUILD mission (`buildMissionId`, set by linkApprovalMission), never the one that asked. With none yet, or a todo one, it stays at "approved"; a dropped one stays there too, marked `stopped` with its reason.
 */
export function lifecycleOf(a: Approval, m: Mission | null): Lifecycle {
  const stopped = m?.status === "dropped" ? (m.result ?? m.blockedReason ?? m.progress ?? "the work was dropped") : null;
  const stage: Lifecycle["stage"] = !m
    ? "approved"
    : m.status === "done"
      ? "live"
      : m.status === "waiting"
        ? "look"
        : m.status === "doing" || m.status === "blocked"
          ? "built"
          : "approved";
  return {
    stage,
    dates: {
      approved: a.decidedAt,
      built: m && ["doing", "blocked", "waiting", "done"].includes(m.status) ? (m.startedAt ?? null) : null,
      look: m?.status === "waiting" ? m.updatedAt : null,
      live: m?.status === "done" ? m.doneAt : null,
    },
    stopped,
    mission: m ? { id: m.id, title: m.title, status: m.status, blockedReason: m.blockedReason, result: m.result, links: m.links } : null,
  };
}

/** Every decision card grouped by thread (newest activity first, max 400 requests), and the old requests waiting to be rewritten. */
export async function listDecisionThreads(db: Database): Promise<{ threads: DecisionThread[]; rewriting: Approval[] }> {
  return timed(db, async (tx) => {
    // Every waiting ask (the same set the badge counts), the newest others, and all versions of the waiting threads.
    const waitingRows = await tx.select().from(hqApprovals).where(NEEDS_YES).orderBy(desc(hqApprovals.createdAt)).limit(500);
    const recent = await tx.select().from(hqApprovals).where(isNotNull(hqApprovals.why)).orderBy(desc(hqApprovals.createdAt)).limit(400);
    const waitingThreads = [...new Set(waitingRows.map((r) => r.threadId).filter((x): x is string => !!x))];
    const versionsOf = waitingThreads.length ? await tx.select().from(hqApprovals).where(inArray(hqApprovals.threadId, waitingThreads)) : [];
    const rows = [...new Map([...waitingRows, ...recent, ...versionsOf].map((r) => [r.id, r])).values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const legacy = await tx
      .select()
      .from(hqApprovals)
      .where(and(eq(hqApprovals.status, "pending"), isNull(hqApprovals.why)))
      .orderBy(asc(hqApprovals.createdAt))
      .limit(50);
    const byThread = new Map<string, Approval[]>();
    for (const r of rows) {
      const a = toApproval(r);
      const k = a.threadId ?? a.id;
      byThread.set(k, [...(byThread.get(k) ?? []), a]);
    }
    const missionIds = [...new Set([...byThread.values()].flatMap((v) => v.map((a) => a.buildMissionId).filter((x): x is string => !!x)))];
    const missions = missionIds.length ? await tx.select().from(hqMissions).where(inArray(hqMissions.id, missionIds)) : [];
    const mById = new Map(missions.map((m) => [m.id, toMission(m)]));
    const threads: DecisionThread[] = [...byThread.entries()].map(([threadId, desc_]) => {
      const versions = [...desc_].sort((x, y) => x.version - y.version);
      const latest = versions[versions.length - 1];
      const state = latest.status === "pending" ? "waiting" : latest.status === "changes" ? "revising" : latest.status;
      return {
        threadId,
        role: latest.role,
        versions,
        latest,
        state,
        lifecycle: state === "approved" ? lifecycleOf(latest, latest.buildMissionId ? (mById.get(latest.buildMissionId) ?? null) : null) : null,
      };
    });
    return { threads, rewriting: legacy.map(toApproval) };
  });
}

/** One thread by id (the thread id or any version's id), for the card's own page and tests. */
export async function getDecisionThread(db: Database, id: string): Promise<DecisionThread | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { threads } = await listDecisionThreads(db);
  return threads.find((t) => t.threadId === id || t.versions.some((v) => v.id === id)) ?? null;
}
