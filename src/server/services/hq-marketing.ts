import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import {
  HQ_CONTENT_KINDS,
  HQ_CONTENT_STATUSES,
  HQ_NETWORKS,
  hqActivity,
  hqApprovals,
  hqContent,
  hqMetrics,
  hqSettings,
  type HqContentKind,
  type HqContentStatus,
  type HqLink,
  type HqNetwork,
  type HqRoundSwitches,
} from "../db/schema";
import type { Approval, ContentItem, HqControls, MarketingView, MarketingWeek, NetworkPerformance } from "../hq/types";
import { HqError, line, linksSchema, logActivity, logAdmin, optLine, optText, parse, sessionIdField, timed, url, type Tx } from "../hq/validate";
import { createApproval, type HqActor } from "./hq";

/**
 * LifeFlow HQ marketing and controls (ADR 0025). Content, research and real metrics arrive from the owner's chats
 * (the weekly marketing round, through /api/hq/report); the owner approves, drops and controls the rounds here.
 * Nothing is published from HQ: an approved post is put into Metricool "for review" by the next marketing round, and
 * the owner presses the final button there. Marketing numbers are only ever real readings a chat sent; nothing is
 * estimated. Same rules as services/hq.ts: zod validation with plain messages, reads in a 5 s transaction with hard
 * limits, no Promise.all inside a transaction, and every write appends an hq_activity line.
 */

export type ContentInput = {
  kind: HqContentKind;
  title: string;
  hook?: string | null;
  body?: string | null;
  platforms?: HqNetwork[];
  status?: Extract<HqContentStatus, "idea" | "draft">;
  scheduledFor?: string | null; // ISO
  links?: HqLink[];
  sessionId?: string | null;
  /** Ask the owner: creates a "publish" approval for this item and sets it to "waiting". */
  ask?: boolean;
};
export type ContentPatch = Partial<{
  title: string;
  hook: string | null;
  body: string | null;
  platforms: HqNetwork[];
  status: HqContentStatus;
  scheduledFor: string | null;
  publishedUrl: string | null;
  externalId: string | null;
  links: HqLink[];
}>;
export type MetricInput = { takenOn: string; network: HqNetwork; metric: string; value: number; contentId?: string | null };
export type ControlsPatch = Partial<{ autonomous: boolean; rounds: Partial<HqRoundSwitches>; creditBudget: number }>;

// --- validation -----------------------------------------------------------------------------------------------------

const DAY = 24 * 3_600_000;
const kind = z.enum(HQ_CONTENT_KINDS);
const statusEnum = z.enum(HQ_CONTENT_STATUSES);
const platforms = z
  .array(z.enum(HQ_NETWORKS, { error: "isn't a network HQ knows (instagram, tiktok, youtube, facebook, linkedin)" }))
  .max(5, "has too many networks (max 5)")
  .transform((a) => [...new Set(a)]);
const when = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "must be a date and time like 2026-11-30T18:00:00Z")
  .refine((s) => !Number.isNaN(Date.parse(s)), "is not a real date")
  .transform((s) => new Date(s))
  .nullish();

const contentInputSchema = z.object({
  kind,
  title: line(1, 140),
  hook: optLine(300),
  body: optText(8000),
  platforms: platforms.optional(),
  status: z.enum(["idea", "draft"]).optional(),
  scheduledFor: when,
  links: linksSchema.optional(),
  sessionId: sessionIdField,
  ask: z.boolean().optional(),
});
const contentPatchSchema = z
  .object({
    title: line(1, 140),
    hook: optLine(300),
    body: optText(8000),
    platforms,
    status: statusEnum,
    scheduledFor: when,
    publishedUrl: z.union([url, z.literal("")]).nullable(),
    externalId: optLine(200),
    links: linksSchema,
  })
  .partial()
  .strict();

const today = (now: Date) => now.toISOString().slice(0, 10);
const metricRow = z.object({
  takenOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must look like 2026-11-30")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "is not a real date"),
  network: z.enum(HQ_NETWORKS, { error: "isn't a network HQ knows (instagram, tiktok, youtube, facebook, linkedin)" }),
  metric: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "must be lowercase letters, digits and underscores (like followers or reach)"),
  value: z.number("must be a number").finite("must be a real number").min(0, "can't be negative").max(1e12, "is too large"),
  contentId: z.uuid().nullish(),
});
const MAX_METRIC_ROWS = 200;

// --- row mapping ----------------------------------------------------------------------------------------------------

type ContentRow = typeof hqContent.$inferSelect;
const toContent = (r: ContentRow): ContentItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  hook: r.hook,
  body: r.body,
  platforms: r.platforms ?? [],
  status: r.status,
  scheduledFor: r.scheduledFor,
  publishedUrl: r.publishedUrl,
  externalId: r.externalId,
  links: r.links ?? [],
  approvalId: r.approvalId,
  sessionId: r.sessionId,
  source: r.source,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
const toApprovalView = (r: typeof hqApprovals.$inferSelect): Approval => ({
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

const actorSession = (a: HqActor) => (a.kind === "agent" ? (a.sessionId ?? null) : null);
const quoted = (t: string) => `"${t.length > 80 ? `${t.slice(0, 77)}...` : t}"`;

// --- reads ----------------------------------------------------------------------------------------------------------

const NETWORK_NAMES: Record<HqNetwork, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn" };

/** Latest and previous account-level reading of every metric, per network. Only real readings; empty when none. */
async function performanceIn(tx: Tx): Promise<NetworkPerformance[]> {
  const res = await tx.execute(sql`
    select network, metric, value::float8 as value, taken_on::text as taken_on, rn from (
      select network, metric, value, taken_on,
             row_number() over (partition by network, metric order by taken_on desc) as rn
      from hq_metrics where content_ref = ''
    ) t where rn <= 2 order by network, metric, rn limit 2000`);
  const rows = res.rows as { network: HqNetwork; metric: string; value: number; taken_on: string; rn: number | string }[];
  return HQ_NETWORKS.map((network) => {
    const mine = rows.filter((r) => r.network === network);
    const metrics = [...new Set(mine.map((r) => r.metric))].sort();
    const latest = metrics.map((metric) => {
      const [cur, prev] = mine.filter((r) => r.metric === metric).sort((a, b) => Number(a.rn) - Number(b.rn));
      return { metric, value: Number(cur.value), takenOn: cur.taken_on, previous: prev ? Number(prev.value) : null };
    });
    const asOf = latest.reduce<string | null>((m, l) => (m === null || l.takenOn > m ? l.takenOn : m), null);
    return { network, latest, asOf };
  });
}

export async function marketingView(db: Database, now: Date = new Date()): Promise<MarketingView> {
  return timed(db, async (tx) => {
    const soon = new Date(now.getTime() + 14 * DAY);
    const week = await tx
      .select()
      .from(hqContent)
      .where(and(inArray(hqContent.status, ["scheduled", "approved", "waiting"]), gte(hqContent.scheduledFor, now), lte(hqContent.scheduledFor, soon)))
      .orderBy(asc(hqContent.scheduledFor), asc(hqContent.createdAt))
      .limit(30);
    const unscheduled = await tx
      .select()
      .from(hqContent)
      .where(and(inArray(hqContent.status, ["idea", "draft"]), isNull(hqContent.scheduledFor), ne(hqContent.kind, "research")))
      .orderBy(desc(hqContent.createdAt))
      .limit(20);
    const waitingRows = await tx
      .select({ content: hqContent, approval: hqApprovals })
      .from(hqContent)
      .leftJoin(hqApprovals, eq(hqApprovals.id, hqContent.approvalId))
      .where(eq(hqContent.status, "waiting"))
      .orderBy(asc(hqContent.createdAt))
      .limit(20);
    const research = await tx
      .select()
      .from(hqContent)
      .where(and(eq(hqContent.kind, "research"), ne(hqContent.status, "dropped")))
      .orderBy(desc(hqContent.createdAt))
      .limit(20);
    const happened = sql`coalesce(${hqContent.scheduledFor}, ${hqContent.updatedAt})`;
    const published = await tx
      .select()
      .from(hqContent)
      .where(and(eq(hqContent.status, "published"), gte(happened, new Date(now.getTime() - 30 * DAY))))
      .orderBy(desc(happened))
      .limit(20);
    const performance = await performanceIn(tx);
    return {
      now,
      week: week.map(toContent),
      unscheduled: unscheduled.map(toContent),
      waiting: waitingRows.map((r) => ({ content: toContent(r.content), approval: r.approval ? toApprovalView(r.approval) : null })),
      research: research.map(toContent),
      published: published.map(toContent),
      performance,
    };
  });
}

/** Max 200, newest first. */
export async function listContent(db: Database, filter: { status?: HqContentStatus[]; kind?: HqContentKind[] } = {}): Promise<ContentItem[]> {
  return timed(db, async (tx) => {
    const rows = await tx
      .select()
      .from(hqContent)
      .where(
        and(
          filter.status?.length ? inArray(hqContent.status, filter.status) : undefined,
          filter.kind?.length ? inArray(hqContent.kind, filter.kind) : undefined,
        ),
      )
      .orderBy(desc(hqContent.createdAt))
      .limit(200);
    return rows.map(toContent);
  });
}

export async function getContent(db: Database, id: string): Promise<ContentItem | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return timed(db, async (tx) => {
    const [r] = await tx.select().from(hqContent).where(eq(hqContent.id, id)).limit(1);
    return r ? toContent(r) : null;
  });
}

/** Approved posts the marketing round still has to put into Metricool (no scheduler id yet), oldest first (max 20). */
export async function approvedContentIn(tx: Tx): Promise<ContentItem[]> {
  const rows = await tx
    .select()
    .from(hqContent)
    .where(and(eq(hqContent.status, "approved"), isNull(hqContent.externalId)))
    .orderBy(asc(hqContent.updatedAt))
    .limit(20);
  return rows.map(toContent);
}

// --- writes ---------------------------------------------------------------------------------------------------------

const whenWords = (d: Date | null | undefined) =>
  d
    ? `${d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} (UTC)`
    : "no date yet";

/** What the owner reads on the approval card, in plain words. */
function askSummary(c: { hook: string | null; title: string; platforms: HqNetwork[]; scheduledFor: Date | null }): string {
  const where = c.platforms.length ? c.platforms.map((p) => NETWORK_NAMES[p]).join(", ") : "no network picked yet";
  const hook = c.hook ? `Hook: ${c.hook}. ` : "";
  return `${hook}For ${where}. Planned for ${whenWords(c.scheduledFor)}. Saying yes only lets the next marketing round put it into Metricool for your final review; nothing is published from here.`.slice(
    0,
    2000,
  );
}

export async function createContent(db: Database, actor: HqActor, input: ContentInput): Promise<ContentItem> {
  const d = parse(contentInputSchema, input);
  if (d.kind === "research" && !(d.links && d.links.length > 0)) throw new HqError("Research needs at least one source link.");
  if (d.ask && d.kind === "research") throw new HqError("Research isn't published, so it has no publish request.");
  const sessionId = d.sessionId ?? (actor.kind === "agent" ? (actor.sessionId ?? null) : null);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(hqContent)
      .values({
        kind: d.kind,
        title: d.title,
        hook: d.hook ?? null,
        body: d.body ?? null,
        platforms: d.platforms ?? [],
        status: d.status ?? "draft",
        scheduledFor: d.scheduledFor ?? null,
        links: d.links ?? [],
        sessionId,
        source: actor.kind,
      })
      .returning();
    await logActivity(tx, {
      actor: actor.kind,
      role: "marketing",
      kind: "content_created",
      text: d.kind === "research" ? `Added research: ${quoted(d.title)}` : `Added a ${d.kind}: ${quoted(d.title)}`,
      sessionId: actorSession(actor) ?? sessionId,
    });
    return row;
  });
  if (!d.ask) return toContent(created);
  // The approval is created through hq.ts so the owner's phone gets the push and the activity line is written.
  const approval = await createApproval(db, actor, {
    role: "marketing",
    kind: "publish",
    title: `Publish: ${created.title}`.slice(0, 140),
    summary: askSummary(created),
    links: created.links ?? [],
  });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(hqContent)
      .set({ approvalId: approval.id, status: "waiting", updatedAt: new Date() })
      .where(eq(hqContent.id, created.id))
      .returning();
    return toContent(row);
  });
}

const CONTENT_FIELDS = ["title", "hook", "body", "platforms", "scheduledFor", "links"] as const;
/** Statuses an actor may move an item to with an update. Approval is only ever the owner's decision (decideApproval). */
const AGENT_TARGETS: HqContentStatus[] = ["idea", "draft", "scheduled", "published"];
const OWNER_TARGETS: HqContentStatus[] = ["idea", "draft", "scheduled", "published", "dropped"];
const LIVE: HqContentStatus[] = ["approved", "scheduled"];

export async function updateContent(db: Database, actor: HqActor, id: string, patch: ContentPatch): Promise<ContentItem> {
  if (!z.uuid().safeParse(id).success) throw new HqError("Unknown content.");
  const d = parse(contentPatchSchema, patch);
  if (d.status === "approved") throw new HqError("Only your yes on the publish request approves a post.");
  if (d.status === "waiting") throw new HqError("Ask for a yes (ask) to put a post on the waiting list.");
  if (d.status === "dropped" && actor.kind !== "owner") throw new HqError("Only the owner can drop an item.");
  if (d.status && !(actor.kind === "owner" ? OWNER_TARGETS : AGENT_TARGETS).includes(d.status)) throw new HqError("That status can't be set here.");
  const now = new Date();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(hqContent).where(eq(hqContent.id, id)).for("update");
    if (!cur) throw new HqError("That item no longer exists.");
    const set: Partial<typeof hqContent.$inferInsert> = {};
    const lines: string[] = [];

    if (cur.status === "published" && actor.kind !== "owner") throw new HqError("That post is already published.");
    if (cur.status === "dropped" && actor.kind !== "owner") throw new HqError("That item was dropped.");

    // After a yes (or while waiting for one) an agent can't change what was approved; changes go through a new draft.
    if (actor.kind === "agent" && ["waiting", "approved", "scheduled", "published"].includes(cur.status)) {
      const touched = CONTENT_FIELDS.filter((f) => d[f] !== undefined);
      if (touched.length) throw new HqError(`Can't change ${touched[0]} after it was sent for a yes. Make a new draft instead.`);
    }

    // Publishing details exist only once the owner said yes.
    const wantsLive = d.status === "scheduled" || d.status === "published";
    const hasIds = d.externalId !== undefined || d.publishedUrl !== undefined;
    if ((wantsLive || hasIds) && !LIVE.includes(cur.status)) throw new HqError("Only an approved post can be scheduled or published.");

    for (const f of CONTENT_FIELDS) if (d[f] !== undefined) (set as Record<string, unknown>)[f] = d[f];
    if (d.externalId !== undefined) set.externalId = d.externalId || null;
    if (d.publishedUrl !== undefined) set.publishedUrl = d.publishedUrl || null;

    const next = d.status ?? cur.status;
    const kindNow = cur.kind;
    if (kindNow === "research" && d.links !== undefined && d.links.length === 0) throw new HqError("Research needs at least one source link.");
    if (next === "published") {
      const hasProof = (set.publishedUrl ?? cur.publishedUrl) || (set.externalId ?? cur.externalId);
      if (!hasProof) throw new HqError("To mark it published, add its link (publishedUrl) or the scheduler id (externalId).");
    }
    if (d.status && d.status !== cur.status) {
      set.status = d.status;
      const word =
        d.status === "scheduled" ? "scheduled" : d.status === "published" ? "published" : d.status === "dropped" ? "dropped" : `moved to ${d.status}`;
      lines.push(`${quoted(cur.title)} ${word}`);
    } else if (Object.keys(set).length) {
      lines.push(`Updated ${quoted(cur.title)}`);
    }
    if (Object.keys(set).length === 0) return toContent(cur);
    const [row] = await tx
      .update(hqContent)
      .set({ ...set, updatedAt: now })
      .where(eq(hqContent.id, id))
      .returning();
    const activityKind = set.status === "scheduled" ? "content_scheduled" : set.status === "published" ? "content_published" : "content_updated";
    for (const text of lines) await logActivity(tx, { actor: actor.kind, role: "marketing", kind: activityKind, text, sessionId: actorSession(actor) });
    return toContent(row);
  });
}

/** Upserts real readings (max 200 per call). Returns how many were saved. */
export async function recordMetrics(db: Database, actor: HqActor, rows: MetricInput[]): Promise<{ saved: number }> {
  if (!Array.isArray(rows)) throw new HqError("rows must be a list of readings.");
  if (rows.length > MAX_METRIC_ROWS) throw new HqError(`Too many readings in one call (max ${MAX_METRIC_ROWS}).`);
  const limit = today(new Date());
  const clean = rows.map((r, i) => {
    try {
      const m = parse(metricRow, r);
      if (m.takenOn > limit) throw new HqError("takenOn can't be in the future.");
      return m;
    } catch (e) {
      throw new HqError(`Reading ${i + 1}: ${e instanceof Error ? e.message : "isn't valid"}`.slice(0, 160));
    }
  });
  if (clean.length === 0) return { saved: 0 };
  // One reading per day, network, metric and post: the last one in the call wins.
  const byKey = new Map<string, (typeof clean)[number]>();
  for (const m of clean) byKey.set(`${m.takenOn}|${m.network}|${m.metric}|${m.contentId ?? ""}`, m);
  const unique = [...byKey.values()];
  return db.transaction(async (tx) => {
    const ids = [...new Set(unique.map((m) => m.contentId).filter((x): x is string => !!x))];
    if (ids.length) {
      const found = await tx.select({ id: hqContent.id }).from(hqContent).where(inArray(hqContent.id, ids));
      if (found.length !== ids.length) throw new HqError("A reading points at content that doesn't exist.");
    }
    await tx
      .insert(hqMetrics)
      .values(
        unique.map((m) => ({
          takenOn: m.takenOn,
          network: m.network,
          metric: m.metric,
          value: m.value,
          contentId: m.contentId ?? null,
          contentRef: m.contentId ?? "",
        })),
      )
      .onConflictDoUpdate({
        target: [hqMetrics.takenOn, hqMetrics.network, hqMetrics.metric, hqMetrics.contentRef],
        set: { value: sql`excluded.value`, contentId: sql`excluded.content_id` },
      });
    const nets = [...new Set(unique.map((m) => NETWORK_NAMES[m.network]))].join(", ");
    await logActivity(tx, {
      actor: actor.kind,
      role: "marketing",
      kind: "metrics_recorded",
      text: `Saved ${unique.length} marketing ${unique.length === 1 ? "number" : "numbers"} (${nets})`,
      sessionId: actorSession(actor),
    });
    return { saved: unique.length };
  });
}

// --- controls -------------------------------------------------------------------------------------------------------

const DEFAULT_ROUNDS: HqRoundSwitches = { night: true, research: true, marketing: true };

export async function controlsIn(tx: Tx): Promise<HqControls> {
  await tx.insert(hqSettings).values({ id: "hq" }).onConflictDoNothing();
  const [r] = await tx.select().from(hqSettings).where(eq(hqSettings.id, "hq")).limit(1);
  return {
    autonomous: r.autonomous,
    rounds: { ...DEFAULT_ROUNDS, ...(r.rounds ?? {}) },
    creditBudget: r.creditBudget,
    updatedAt: r.updatedAt,
    updatedByEmail: r.updatedByEmail,
  };
}

/** The owner's switches; creates the row if it is missing. */
export async function getControls(db: Database): Promise<HqControls> {
  return timed(db, controlsIn);
}

const controlsPatchSchema = z
  .object({
    autonomous: z.boolean("must be on or off"),
    rounds: z
      .object({ night: z.boolean("must be on or off"), research: z.boolean("must be on or off"), marketing: z.boolean("must be on or off") })
      .partial()
      .strict(),
    creditBudget: z.number("must be a number").int("must be a whole number").min(0, "can't be negative").max(10000, "is too large (max 10000)"),
  })
  .partial()
  .strict();

const ROUND_NAMES: Record<keyof HqRoundSwitches, string> = { night: "Night round", research: "Research round", marketing: "Marketing round" };

/** Owner only (called after requireAdmin). Writes hq_activity and admin_actions. */
export async function saveControls(db: Database, admin: Admin, patch: ControlsPatch): Promise<HqControls> {
  const d = parse(controlsPatchSchema, patch);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', '5000', true)`);
    const cur = await controlsIn(tx);
    const lines: string[] = [];
    const next = { autonomous: cur.autonomous, rounds: { ...cur.rounds }, creditBudget: cur.creditBudget };
    if (d.autonomous !== undefined && d.autonomous !== cur.autonomous) {
      next.autonomous = d.autonomous;
      lines.push(d.autonomous ? "Autonomous mode on" : "Autonomous mode off");
    }
    for (const k of ["night", "research", "marketing"] as const) {
      const v = d.rounds?.[k];
      if (v !== undefined && v !== cur.rounds[k]) {
        next.rounds[k] = v;
        lines.push(`${ROUND_NAMES[k]} turned ${v ? "on" : "off"}`);
      }
    }
    if (d.creditBudget !== undefined && d.creditBudget !== cur.creditBudget) {
      next.creditBudget = d.creditBudget;
      lines.push(d.creditBudget === 0 ? "Credit budget set to 0 (always ask)" : `Credit budget set to ${d.creditBudget} credits a week`);
    }
    if (lines.length === 0) return cur;
    const [row] = await tx
      .update(hqSettings)
      .set({ ...next, updatedByEmail: admin.email, updatedAt: new Date() })
      .where(eq(hqSettings.id, "hq"))
      .returning();
    for (const text of lines) await logActivity(tx, { actor: "owner", role: "founder", kind: "controls_changed", text });
    await logAdmin(tx, admin, "hq.controls_saved", { changes: lines });
    return {
      autonomous: row.autonomous,
      rounds: { ...DEFAULT_ROUNDS, ...row.rounds },
      creditBudget: row.creditBudget,
      updatedAt: row.updatedAt,
      updatedByEmail: row.updatedByEmail,
    };
  });
}

// --- weekly numbers -------------------------------------------------------------------------------------------------

/**
 * Drafted = content created in the window (research excluded). Approved, scheduled and published count the status
 * changes recorded in hq_activity (content_approved / content_scheduled / content_published) in the window: one change,
 * one count, so an item that moves twice in a week counts twice. Dates in the window are inclusive.
 */
export async function marketingWeekIn(tx: Tx, from: Date, to: Date): Promise<MarketingWeek> {
  const [d] = await tx
    .select({ n: count() })
    .from(hqContent)
    .where(and(gte(hqContent.createdAt, from), lte(hqContent.createdAt, to), ne(hqContent.kind, "research")));
  const rows = await tx
    .select({ kind: hqActivity.kind, n: count() })
    .from(hqActivity)
    .where(
      and(
        gte(hqActivity.createdAt, from),
        lte(hqActivity.createdAt, to),
        or(...["content_approved", "content_scheduled", "content_published"].map((k) => eq(hqActivity.kind, k))),
      ),
    )
    .groupBy(hqActivity.kind);
  const n = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
  return { drafted: d?.n ?? 0, approved: n("content_approved"), scheduled: n("content_scheduled"), published: n("content_published") };
}

export async function marketingWeek(db: Database, from: Date, to: Date): Promise<MarketingWeek> {
  return timed(db, (tx) => marketingWeekIn(tx, from, to));
}
