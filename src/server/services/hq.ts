import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { adminEmails, type Admin } from "../auth/admin";
import { addDaysStr, localDateOf } from "../../lib/dates";
import type { Database } from "../db/client";
import { adminActions, hqActivity, hqApprovals, hqChats, hqContent, hqKeys, hqMissions, hqUsageSamples, users, type HqLink, type HqRole, HQ_ROLES } from "../db/schema";
import { withUser } from "../db/with-user";
import { chatUrl, EMPLOYEES, employee, isHqRole, USAGE_PLAN } from "../hq/team";
import { employeeState, WORKING_WINDOW_MS } from "../hq/state";
import type {
  Activity,
  Approval,
  ApprovalKind,
  ApprovalStatus,
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
  })
  .partial();
const approvalInputSchema = z.object({
  role,
  kind: z.enum(APPROVAL_KINDS),
  title: line(1, 140),
  summary: line(1, 2000),
  links: linksSchema.optional(),
  missionId: z.uuid().nullish(),
});

const clampPct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.min(100, Math.max(0, n)));

// --- row mapping ------------------------------------------------------------------------------------------------------

type MissionRow = typeof hqMissions.$inferSelect;
type ApprovalRow = typeof hqApprovals.$inferSelect;
type ActivityRow = typeof hqActivity.$inferSelect;
type ChatRow = typeof hqChats.$inferSelect;

const toMission = (r: MissionRow): Mission => ({
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
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
const toApproval = (r: ApprovalRow): Approval => ({
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

const priorityRank = sql`case ${hqMissions.priority} when 'high' then 0 when 'normal' then 1 else 2 end`;
const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };
const byPriorityThenOldest = (a: Mission, b: Mission) =>
  (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime();

// --- activity log -----------------------------------------------------------------------------------------------------

const actorKind = (a: HqActor) => a.kind;
const actorSession = (a: HqActor) => (a.kind === "agent" ? (a.sessionId ?? null) : null);

// --- reads (pages) ------------------------------------------------------------------------------------------------

type Base = { chats: Chat[]; missions: Mission[]; pending: Approval[] };

/** Everything the cards need, in a few bounded queries run one after another. */
/** Every mapped chat (max 100), then the unmapped ones newest first (max 50), so new sessions can't push mapped chats out. */
async function loadChats(tx: Tx): Promise<Chat[]> {
  const mapped = await tx.select().from(hqChats).where(isNotNull(hqChats.role)).orderBy(asc(hqChats.createdAt)).limit(100);
  const unmapped = await tx.select().from(hqChats).where(isNull(hqChats.role)).orderBy(desc(hqChats.createdAt)).limit(50);
  return [...mapped, ...unmapped].map(toChat);
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
  const pending = await tx.select().from(hqApprovals).where(eq(hqApprovals.status, "pending")).orderBy(asc(hqApprovals.createdAt)).limit(500);
  return { chats, missions: missions.map(toMission), pending: pending.map(toApproval) };
}

function buildCard(role: HqRole, base: Base, now: Date): EmployeeCard {
  const e = employee(role);
  const isAssistant = role === "assistant";
  const chats = base.chats.filter((c) => c.role === role);
  const mine = base.missions.filter((m) => m.role === role);
  const myPending = base.pending.filter((a) => a.role === role).length;
  const stateMissions = mine.filter((m) => m.status !== "done" || (m.doneAt && now.getTime() - m.doneAt.getTime() <= DAY));
  let result = employeeState({ appLogic: isAssistant, chats, missions: stateMissions, pendingApprovals: myPending }, now);
  let line = result.reason;
  if (isAssistant && result.state === "sleeping" && base.pending.length > 0) {
    const n = base.pending.length;
    result = { state: "working", reason: n === 1 ? "Sorting 1 thing that needs you" : `Sorting ${n} things that need you` };
    line = result.reason;
  }
  // Work done for this employee in another chat (the night round fixing a Developer mission in the agents chat) is
  // real work: a mission in progress whose own chat checked in recently makes them "working". It never hides
  // "blocked" or "needs you".
  let viaChat: Chat | null = null;
  if (result.state === "sleeping" || result.state === "offline" || result.state === "done") {
    for (const m of mine) {
      if (m.status !== "doing" || !m.sessionId) continue;
      const c = base.chats.find((x) => x.id === m.sessionId && x.lastCheckinAt && now.getTime() - x.lastCheckinAt.getTime() <= WORKING_WINDOW_MS);
      if (c) {
        viaChat = c;
        result =
          myPending > 0
            ? { state: "needs_you", reason: myPending === 1 ? "1 thing needs your yes" : `${myPending} things need your yes` }
            : { state: "working", reason: c.role === role ? m.title : `${m.title} (in ${c.title})` };
        line = result.reason;
        break;
      }
    }
  }
  const open = mine.filter((m) => (OPEN as readonly string[]).includes(m.status)).sort(byPriorityThenOldest);
  const currentMission =
    open.find((m) => m.status === "doing") ??
    open.find((m) => m.status === "blocked" || m.status === "waiting") ??
    open.find((m) => m.status === "todo") ??
    null;
  let asOf: Date | null = null;
  for (const d of [...chats.map((c) => c.lastCheckinAt), ...mine.map((m) => m.updatedAt), viaChat?.lastCheckinAt ?? null])
    if (d && (!asOf || d > asOf)) asOf = d;
  return {
    role,
    title: e.title,
    tagline: e.tagline,
    state: result.state,
    line,
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
    const counts = { working: 0, done: 0, waiting: 0, asleep: 0, blocked: 0, offline: 0 };
    for (const c of employees) {
      if (c.state === "working") counts.working++;
      else if (c.state === "done") counts.done++;
      else if (c.state === "needs_you") counts.waiting++;
      else if (c.state === "sleeping") counts.asleep++;
      else if (c.state === "blocked") counts.blocked++;
      else counts.offline++;
    }
    const activityRows = await tx.select().from(hqActivity).orderBy(desc(hqActivity.createdAt)).limit(12);
    const budget = await budgetIn(tx, now);
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
    const [r] = await tx.select({ n: count() }).from(hqApprovals).where(eq(hqApprovals.status, "pending"));
    return r?.n ?? 0;
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
async function ownerTimeZone(tx: Tx): Promise<string> {
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
    const [pend] = await tx.select({ n: count() }).from(hqApprovals).where(eq(hqApprovals.status, "pending"));
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

/** Tells the owner's phone a chat asked for their yes. Never throws: a push problem must not fail the request. */
async function notifyApproval(db: Database, a: Approval): Promise<void> {
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
      await withUser(
        o.id,
        (scope) =>
          sendOnce(
            scope,
            `hq-approval:${a.id}`,
            { title: `${employee(a.role).title} needs your yes`, body: a.title, url: "/admin/hq/approvals", tag: `hq-${a.id}` },
            send,
          ),
        db,
      );
    }
  } catch (e) {
    console.error("HQ push failed:", e instanceof Error ? e.name : "error");
  }
}

export async function createApproval(db: Database, actor: HqActor, input: ApprovalInput): Promise<Approval> {
  const d = parse(approvalInputSchema, input);
  const approval = await db.transaction(async (tx) => {
    if (d.missionId) {
      const [m] = await tx.select({ id: hqMissions.id }).from(hqMissions).where(eq(hqMissions.id, d.missionId));
      if (!m) throw new HqError("That mission no longer exists.");
    }
    const [row] = await tx
      .insert(hqApprovals)
      .values({
        role: d.role,
        kind: d.kind,
        title: d.title,
        summary: d.summary,
        links: d.links ?? [],
        missionId: d.missionId ?? null,
        source: actorKind(actor),
      })
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
  if (actor.kind === "agent") await notifyApproval(db, approval);
  return approval;
}

/** Records the owner's decision. HQ never carries it out; the employee acts on it at their next round. */
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
            decision === "approved"
              ? `${quoted} approved`
              : decision === "declined"
                ? `${quoted} dropped`
                : `${quoted} sent back to draft${n ? `: ${n}` : ""}`,
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
    const set: Partial<typeof hqChats.$inferInsert> = { lastCheckinAt: now, updatedAt: now };
    if (d.title) set.title = d.title;
    if (d.branch !== undefined) set.branch = d.branch;
    if (d.commit !== undefined) set.lastCommit = d.commit;
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

    const u = d.usage;
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
  input: { role: HqRole; text: string; link?: string | null; sessionId?: string | null },
): Promise<void> {
  const d = parse(z.object({ role, text: line(1, 400), link: url.nullish() }), input);
  await db.transaction(async (tx) => {
    await logActivity(tx, {
      actor: actor.kind,
      role: d.role,
      kind: "note",
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
): Promise<{ missions: Mission[]; decisions: Approval[]; approvedContent: ContentItem[]; controls: HqControls }> {
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
    const approvedContent = await approvedContentIn(tx);
    const controls = await controlsIn(tx);
    return { missions: missions.map(toMission), decisions: decisions.map(toApproval), approvedContent, controls };
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
