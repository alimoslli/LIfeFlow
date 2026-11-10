import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { microsoftConfig } from "../integrations/microsoft";
import type { Database } from "../db/client";
import { adminActions, announcements, errorReports, ownerInbox, passkeys, rateLimitBuckets, rememberedDevices, sessions, users } from "../db/schema";
import { isAdminEmail, type Admin } from "../auth/admin";
import { billingConfig, inTestingPhase, LIMIT_MONTH_SECONDS, TESTING_LIMITS } from "../billing";
import { emailConfig } from "../integrations/email";
import { googleConfig } from "../integrations/google";
import { plaidConfig } from "../integrations/plaid";
import { smsConfig } from "../integrations/twilio";
import { rateLimit } from "../rate-limit";
import { DeletionBlockedError, revokeOutsideAccess, type CleanupDeps } from "./account-cleanup";

/**
 * Owner admin page (ADR 0022). Accounts and operations only: per-user content is protected by row-level security
 * and is deliberately not reachable from here. Reads have a 5 s statement timeout and hard limits, so a slow query
 * can't pile up connections; every change writes a row to admin_actions.
 */

export class AdminError extends Error {}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const PAGE_SIZE = 25;

async function timed<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', '5000', true)`);
    return fn(tx);
  });
}

const rows = <T>(res: { rows: unknown[] }) => res.rows as T[];

/** Runs one panel. A failure shows "couldn't load" for that panel instead of breaking the page. */
export async function safe<T>(panel: string, fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error(`admin panel "${panel}" failed:`, e instanceof Error ? e.name : "error");
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// overview

export type Overview = {
  users: number;
  new24h: number;
  new7d: number;
  new30d: number;
  pro: number;
  suspended: number;
  invited: number;
  active24h: number;
  sessions: number;
  signupsByDay: { day: string; n: number }[];
};

export async function overview(db: Database): Promise<Overview> {
  return timed(db, async (tx) => {
    const [u] = rows<Record<string, string>>(
      await tx.execute(sql`
        select
          count(*) as users,
          count(*) filter (where created_at > now() - interval '24 hours') as new24h,
          count(*) filter (where created_at > now() - interval '7 days') as new7d,
          count(*) filter (where created_at > now() - interval '30 days') as new30d,
          count(*) filter (where plan = 'pro') as pro,
          count(*) filter (where suspended_at is not null) as suspended,
          count(*) filter (where invited_by is not null) as invited
        from users where account_kind = 'standard'`),
    );
    const [s] = rows<Record<string, string>>(
      await tx.execute(sql`
        select
          count(*) as sessions,
          count(distinct s.user_id) filter (where s.last_seen_at > now() - interval '24 hours') as active24h
        from sessions s join users u on u.id = s.user_id
        where s.expires_at > now() and u.account_kind = 'standard'`),
    );
    const days = rows<{ day: string; n: string }>(
      await tx.execute(sql`
        select to_char(d::date, 'YYYY-MM-DD') as day, count(u.id) as n
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join users u on u.account_kind = 'standard' and u.created_at::date = d::date
        group by d order by d`),
    );
    const n = (v: string | undefined) => Number(v ?? 0);
    return {
      users: n(u.users),
      new24h: n(u.new24h),
      new7d: n(u.new7d),
      new30d: n(u.new30d),
      pro: n(u.pro),
      suspended: n(u.suspended),
      invited: n(u.invited),
      active24h: n(s.active24h),
      sessions: n(s.sessions),
      signupsByDay: days.map((d) => ({ day: d.day, n: n(d.n) })),
    };
  });
}

// ---------------------------------------------------------------------------
// users

export type UserRow = { id: string; email: string; name: string; plan: "free" | "pro"; createdAt: Date; suspendedAt: Date | null; lastSeenAt: Date | null };

/** Escapes % _ and \ so a search for "50%" matches that text and nothing else. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** `seen: "today"` keeps only accounts with a sign-in seen in the last 24 hours (the same rule as the "Active today" tiles), newest seen first. */
export type UserFilter = { q?: string; plan?: "free" | "pro"; status?: "active" | "suspended"; seen?: "today"; page?: number };

const SEEN_TODAY = sql`exists (select 1 from sessions s where s.user_id = "users"."id" and s.last_seen_at > now() - interval '24 hours')`;
const LAST_SEEN = sql<Date | null>`(select max(s.last_seen_at) from sessions s where s.user_id = "users"."id")`;

export async function listUsers(db: Database, f: UserFilter = {}): Promise<{ rows: UserRow[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const q = f.q?.trim().slice(0, 100);
  const where: SQL[] = [eq(users.accountKind, "standard")];
  if (q) where.push(or(ilike(users.email, likePattern(q)), ilike(users.name, likePattern(q)))!);
  if (f.plan) where.push(eq(users.plan, f.plan));
  if (f.status === "suspended") where.push(isNotNull(users.suspendedAt));
  if (f.status === "active") where.push(isNull(users.suspendedAt));
  if (f.seen === "today") where.push(SEEN_TODAY);
  return timed(db, async (tx) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(users)
      .where(and(...where));
    const list = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        plan: users.plan,
        createdAt: users.createdAt,
        suspendedAt: users.suspendedAt,
        lastSeenAt: LAST_SEEN,
      })
      .from(users)
      .where(and(...where))
      .orderBy(...(f.seen === "today" ? [sql`${LAST_SEEN} desc`, desc(users.createdAt)] : [desc(users.createdAt)]))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return {
      rows: list.map((r) => ({ ...r, lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : null })),
      total: n,
      page,
      pages: Math.max(1, Math.ceil(n / PAGE_SIZE)),
    };
  });
}

export type AgeLockRow = { id: string; email: string; lockedAt: string; paid: boolean; closing: boolean };

/**
 * Accounts locked under 13 that need the owner: one with a billing record or Pro (a plan is never cancelled from the lock;
 * owner, 2026-11-10: flag only, he reviews it in Stripe), or one whose bank or Google link is still being closed.
 */
export async function ageLocksToReview(db: Database): Promise<AgeLockRow[]> {
  return timed(db, async (tx) => {
    const rows = await tx
      .select({ id: users.id, email: users.email, prefs: users.preferences, customer: users.stripeCustomerId, plan: users.plan })
      .from(users)
      .where(
        and(
          sql`${users.preferences} ? 'ageBlockedAt'`,
          or(isNotNull(users.stripeCustomerId), eq(users.plan, "pro"), sql`${users.preferences} ? 'ageLockClosing'`),
        ),
      )
      .orderBy(desc(users.createdAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      lockedAt: r.prefs.ageBlockedAt ?? "",
      paid: !!r.customer || r.plan === "pro",
      closing: !!r.prefs.ageLockClosing,
    }));
  });
}

export type UserDetail = UserRow & {
  timezone: string;
  twoFactor: boolean;
  passkeys: number;
  sessions: number;
  hasPhone: boolean;
  hasStripeCustomer: boolean;
  isAdmin: boolean;
  isDemo: boolean;
  invitedBy: { id: string; email: string } | null;
  invitedCount: number;
};

export async function getUser(db: Database, id: string): Promise<UserDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return timed(db, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id));
    if (!u) return null;
    const [{ pk }] = await tx.select({ pk: count() }).from(passkeys).where(eq(passkeys.userId, id));
    const [inviter] = u.invitedBy ? await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, u.invitedBy)) : [];
    const [{ invited }] = await tx.select({ invited: count() }).from(users).where(eq(users.invitedBy, id));
    const [s] = await tx
      .select({ n: count(), last: sql<Date | null>`max(${sessions.lastSeenAt})` })
      .from(sessions)
      .where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > now()`));
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      plan: u.plan,
      createdAt: u.createdAt,
      suspendedAt: u.suspendedAt,
      lastSeenAt: s.last ? new Date(s.last) : null,
      timezone: u.timezone,
      twoFactor: !!u.totpEnabledAt,
      passkeys: pk,
      sessions: s.n,
      hasPhone: !!u.smsPhone,
      hasStripeCustomer: !!u.stripeCustomerId,
      isAdmin: isAdminEmail(u.email),
      isDemo: u.accountKind === "demo",
      invitedBy: inviter ?? null,
      invitedCount: invited,
    };
  });
}

// ---------------------------------------------------------------------------
// actions (each one is logged)

async function log(tx: Tx, actor: Admin, action: string, target: { id: string; email: string } | null, metadata: Record<string, unknown> = {}) {
  await tx
    .insert(adminActions)
    .values({ actorUserId: actor.id, actorEmail: actor.email, action, targetUserId: target?.id, targetEmail: target?.email, metadata });
}

async function limited(db: Database, actor: Admin) {
  const r = await rateLimit(db, `admin:${actor.id}`, 60, 60);
  if (!r.allowed) throw new AdminError("Too many admin actions. Wait a minute and try again.");
}

/** The account an action is aimed at. Never the admin themself, another admin, or the demo account. */
async function target(tx: Tx, actor: Admin, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminError("Unknown user.");
  const [u] = await tx.select().from(users).where(eq(users.id, id));
  if (!u) throw new AdminError("That user no longer exists.");
  if (u.id === actor.id) throw new AdminError("You can't do that to your own account.");
  if (isAdminEmail(u.email)) throw new AdminError("You can't do that to an admin account.");
  if (u.accountKind !== "standard") throw new AdminError("You can't do that to the demo account.");
  return u;
}

export async function signOutEverywhere(db: Database, actor: Admin, userId: string) {
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    await tx.delete(sessions).where(eq(sessions.userId, u.id));
    await tx.delete(rememberedDevices).where(eq(rememberedDevices.userId, u.id));
    await log(tx, actor, "user.sign_out_everywhere", u);
  });
}

export async function setSuspended(db: Database, actor: Admin, userId: string, suspend: boolean) {
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    await tx
      .update(users)
      .set({ suspendedAt: suspend ? new Date() : null })
      .where(eq(users.id, u.id));
    if (suspend) {
      await tx.delete(sessions).where(eq(sessions.userId, u.id));
      await tx.delete(rememberedDevices).where(eq(rememberedDevices.userId, u.id));
    }
    await log(tx, actor, suspend ? "user.suspend" : "user.unsuspend", u);
  });
}

export async function setPlan(db: Database, actor: Admin, userId: string, plan: string) {
  if (plan !== "free" && plan !== "pro") throw new AdminError("Plan must be free or pro.");
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    await tx.update(users).set({ plan }).where(eq(users.id, u.id));
    await log(tx, actor, "user.set_plan", u, { from: u.plan, to: plan });
  });
}

/** Permanent. The admin must type the user's exact email, and a user still on an active Pro plan is refused (they'd keep paying). */
export async function deleteUser(db: Database, actor: Admin, userId: string, confirmEmail: string, deps: CleanupDeps = {}) {
  await limited(db, actor);
  const found = await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    if (confirmEmail.trim().toLowerCase() !== u.email) throw new AdminError("The email you typed doesn't match. Nothing was deleted.");
    if (u.plan === "pro")
      throw new AdminError("This user is on Pro. Cancel their subscription in Stripe and set their plan to Free first, so they aren't charged after deletion.");
    return u;
  });
  // Close Plaid, Google and Stripe access outside the transaction (network calls), then delete.
  try {
    await revokeOutsideAccess(db, found, deps);
  } catch (e) {
    if (e instanceof DeletionBlockedError)
      throw new AdminError("Their plan couldn't be cancelled just now, so the account wasn't deleted. Try again in a minute.");
    throw e;
  }
  await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    await log(tx, actor, "user.delete", u, { createdAt: u.createdAt.toISOString() });
    await tx.delete(users).where(eq(users.id, u.id));
  });
}

export async function clearError(db: Database, actor: Admin, fingerprint: string) {
  if (!/^[0-9a-f]{1,64}$/.test(fingerprint)) throw new AdminError("Unknown error.");
  await limited(db, actor);
  await db.transaction(async (tx) => {
    await tx.delete(errorReports).where(eq(errorReports.fingerprint, fingerprint));
    await log(tx, actor, "error.clear", null, { fingerprint });
  });
}

// ---------------------------------------------------------------------------
// errors, activity, health

export async function listErrors(db: Database) {
  return timed(db, (tx) => tx.select().from(errorReports).orderBy(desc(errorReports.lastSeenAt)).limit(50));
}

export async function errorsLast24h(db: Database) {
  return timed(db, async (tx) => {
    const [r] = rows<{ kinds: string; hits: string }>(
      await tx.execute(sql`select count(*) as kinds, coalesce(sum(count), 0) as hits from error_reports where last_seen_at > now() - interval '24 hours'`),
    );
    return { kinds: Number(r?.kinds ?? 0), hits: Number(r?.hits ?? 0) };
  });
}

export async function recentActions(db: Database, limit = 30) {
  return timed(db, (tx) => tx.select().from(adminActions).orderBy(desc(adminActions.createdAt)).limit(Math.min(limit, 100)));
}

export type Health = {
  dbMs: number;
  dbBytes: number | null;
  migrations: number | null;
  integrations: { name: string; on: boolean }[];
  nodeVersion: string;
  uptimeMinutes: number;
};

export async function health(db: Database, env: Record<string, string | undefined> = process.env): Promise<Health> {
  const t0 = performance.now();
  await db.execute(sql`select 1`);
  const dbMs = Math.round(performance.now() - t0);
  const bytes = await timed(db, async (tx) => Number(rows<{ s: string }>(await tx.execute(sql`select pg_database_size(current_database()) as s`))[0]?.s)).catch(
    () => null,
  );
  const migrations = await timed(db, async (tx) =>
    Number(rows<{ n: string }>(await tx.execute(sql`select count(*) as n from drizzle.__drizzle_migrations`))[0]?.n),
  ).catch(() => null);
  return {
    dbMs,
    dbBytes: bytes,
    migrations,
    integrations: [
      { name: "AI (OpenAI)", on: !!env.OPENAI_API_KEY },
      { name: "Banks (Plaid)", on: !!plaidConfig(env) },
      { name: "Google sign-in, Gmail and Calendar", on: !!googleConfig(env) },
      { name: "Microsoft Teams and Outlook", on: !!microsoftConfig(env) },
      { name: "AI spend cap (model prices set)", on: !!(env.JARVIS_PRICE_INPUT_PER_MTOK && env.JARVIS_PRICE_OUTPUT_PER_MTOK) },
      { name: "Payments (Stripe)", on: !!billingConfig(env) },
      { name: "Email (Resend)", on: !!emailConfig(env) },
      { name: "Text messages (Twilio)", on: !!smsConfig(env) },
      { name: "Scheduled jobs secret", on: !!env.CRON_SECRET },
      { name: "Owner alert email", on: !!(env.ALERT_EMAIL || env.LEGAL_CONTACT_EMAIL) },
    ],
    nodeVersion: process.version,
    uptimeMinutes: Math.round(process.uptime() / 60),
  };
}

// ---------------------------------------------------------------------------
// AI use (testing-phase limits)

/**
 * How much of the testing limits people have used, read from the limiter's own counters (rate_limit_buckets
 * holds counts only, no content, and isn't per-user private data). Counts include tries that were blocked.
 */
export type UsageRow = { userId: string; email: string | null; messagesToday: number; messagesMonth: number; voiceToday: number; voiceMonth: number };
export type Usage = { testing: boolean; limits: typeof TESTING_LIMITS; messagesToday: number; voiceToday: number; people: UsageRow[]; atLimit: number };

const windowStart = (seconds: number) => new Date(Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000);
const USAGE_KEYS = {
  "jarvis:testing": "messagesToday",
  "jarvis:testing-month": "messagesMonth",
  "voice:testing": "voiceToday",
  "voice:testing-month": "voiceMonth",
} as const;

async function usageRows(tx: Tx, userId?: string) {
  const day = windowStart(86_400);
  const month = windowStart(LIMIT_MONTH_SECONDS);
  const buckets = await tx
    .select({ key: rateLimitBuckets.key, windowStart: rateLimitBuckets.windowStart, count: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(
      and(
        or(sql`${rateLimitBuckets.key} like 'jarvis:testing%'`, sql`${rateLimitBuckets.key} like 'voice:testing%'`),
        or(eq(rateLimitBuckets.windowStart, day), eq(rateLimitBuckets.windowStart, month)),
        ...(userId ? [sql`${rateLimitBuckets.key} like ${"%:" + userId}`] : []),
      ),
    );
  const byUser = new Map<string, UsageRow>();
  for (const b of buckets) {
    const i = b.key.lastIndexOf(":");
    const prefix = b.key.slice(0, i) as keyof typeof USAGE_KEYS;
    const id = b.key.slice(i + 1);
    const field = USAGE_KEYS[prefix];
    if (!field) continue;
    const isDayKey = field.endsWith("Today");
    if ((isDayKey ? day : month).getTime() !== b.windowStart.getTime()) continue;
    const row = byUser.get(id) ?? { userId: id, email: null, messagesToday: 0, messagesMonth: 0, voiceToday: 0, voiceMonth: 0 };
    row[field] = b.count;
    byUser.set(id, row);
  }
  return [...byUser.values()];
}

export async function usage(db: Database): Promise<Usage> {
  return timed(db, async (tx) => {
    const people = (await usageRows(tx)).sort((a, b) => b.messagesMonth - a.messagesMonth || b.voiceMonth - a.voiceMonth);
    const ids = people
      .slice(0, 20)
      .map((p) => p.userId)
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const emails = ids.length ? await tx.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
    const emailOf = new Map(emails.map((e) => [e.id, e.email]));
    const L = TESTING_LIMITS;
    return {
      testing: inTestingPhase(),
      limits: L,
      messagesToday: people.reduce((n, p) => n + Math.min(p.messagesToday, L.messagesPerDay), 0),
      voiceToday: people.reduce((n, p) => n + Math.min(p.voiceToday, L.voiceCallsPerDay), 0),
      atLimit: people.filter((p) => p.messagesToday >= L.messagesPerDay || p.messagesMonth >= L.messagesPerMonth || p.voiceMonth >= L.voiceCallsPerMonth)
        .length,
      people: people.slice(0, 20).map((p) => ({ ...p, email: emailOf.get(p.userId) ?? null })),
    };
  });
}

export async function usageFor(db: Database, userId: string): Promise<UsageRow> {
  return timed(db, async (tx) => {
    const [row] = await usageRows(tx, userId);
    return row ?? { userId, email: null, messagesToday: 0, messagesMonth: 0, voiceToday: 0, voiceMonth: 0 };
  });
}

/** Gives someone a fresh start on today's and this month's testing limits. Allowed on any standard account, the admin's own included. */
export async function resetLimits(db: Database, actor: Admin, userId: string) {
  await limited(db, actor);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new AdminError("Unknown user.");
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new AdminError("That user no longer exists.");
    if (u.accountKind !== "standard") throw new AdminError("You can't do that to the demo account.");
    await tx.delete(rateLimitBuckets).where(
      inArray(
        rateLimitBuckets.key,
        Object.keys(USAGE_KEYS).map((k) => `${k}:${userId}`),
      ),
    );
    await log(tx, actor, "reset_limits", { id: u.id, email: u.email });
  });
}

// ---------------------------------------------------------------------------
// feedback inbox (copies of Settings → Send feedback, addressed to the owner)

export type InboxItem = typeof ownerInbox.$inferSelect;
export type InboxFilter = { status?: "open" | "handled" | "all"; kind?: "bug" | "idea" | "other" };

export async function listInbox(db: Database, f: InboxFilter = {}): Promise<InboxItem[]> {
  return timed(db, (tx) => {
    const where = [
      f.status === "handled" ? isNotNull(ownerInbox.handledAt) : f.status === "all" ? undefined : isNull(ownerInbox.handledAt),
      f.kind ? eq(ownerInbox.kind, f.kind) : undefined,
    ].filter((x): x is SQL => !!x);
    return tx
      .select()
      .from(ownerInbox)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(ownerInbox.createdAt))
      .limit(200);
  });
}

export async function inboxCounts(db: Database): Promise<{ open: number; total: number }> {
  return timed(db, async (tx) => {
    const [r] = await tx.select({ total: count(), open: sql<number>`count(*) filter (where ${ownerInbox.handledAt} is null)::int` }).from(ownerInbox);
    return { open: Number(r?.open ?? 0), total: r?.total ?? 0 };
  });
}

/** Marks a message handled, or open again. Logged. */
export async function setInboxHandled(db: Database, actor: Admin, id: string, handled: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminError("Unknown feedback.");
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(ownerInbox)
      .set({ handledAt: handled ? new Date() : null })
      .where(eq(ownerInbox.id, id))
      .returning({ id: ownerInbox.id });
    if (!rows.length) throw new AdminError("That feedback no longer exists.");
    await log(tx, actor, handled ? "feedback.handled" : "feedback.reopened", null, { feedbackId: id });
  });
}

// ---------------------------------------------------------------------------
// announcements (a banner shown to everyone in the app)

/** Recent announcements, and which one (if any) is showing right now. */
export async function listAnnouncements(db: Database, now = new Date()) {
  const items = await timed(db, (tx) => tx.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(50));
  const live = items.find((a) => a.startsAt <= now && (!a.endsAt || a.endsAt > now)) ?? null;
  return { items, live };
}

const ANNOUNCE_DAYS = [1, 3, 7, 14, 30] as const;

/** Shows a banner to everyone from now on. Ends after `days` (or when ended by hand). Replaces any banner showing now. Logged. */
export async function createAnnouncement(db: Database, actor: Admin, input: { message: string; tone: string; linkUrl?: string; days?: number }) {
  const message = input.message.trim();
  if (message.length < 3 || message.length > 240) throw new AdminError("Write a message between 3 and 240 characters.");
  const tone = input.tone === "warning" ? "warning" : "info";
  const link = input.linkUrl?.trim() || null;
  if (link && !(/^\/[^/\\]/.test(link) || /^https:\/\/[^\s]+$/.test(link)))
    throw new AdminError("The link must start with / (a page in LifeFlow) or https://.");
  const days = ANNOUNCE_DAYS.includes(input.days as (typeof ANNOUNCE_DAYS)[number]) ? input.days! : null;
  await limited(db, actor);
  const now = new Date();
  await db.transaction(async (tx) => {
    // One banner at a time: end whatever is showing.
    await tx
      .update(announcements)
      .set({ endsAt: now })
      .where(or(isNull(announcements.endsAt), sql`${announcements.endsAt} > ${now}`));
    const [a] = await tx
      .insert(announcements)
      .values({ message, tone, linkUrl: link, startsAt: now, endsAt: days ? new Date(now.getTime() + days * 86_400_000) : null, createdByEmail: actor.email })
      .returning({ id: announcements.id });
    await log(tx, actor, "announcement.create", null, { announcementId: a.id, tone, days });
  });
}

/** Stops a banner now. Logged. */
export async function endAnnouncement(db: Database, actor: Admin, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminError("Unknown announcement.");
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const rows = await tx.update(announcements).set({ endsAt: new Date() }).where(eq(announcements.id, id)).returning({ id: announcements.id });
    if (!rows.length) throw new AdminError("That announcement no longer exists.");
    await log(tx, actor, "announcement.end", null, { announcementId: id });
  });
}

// ---------------------------------------------------------------------------
// growth

export type Growth = {
  active1d: number;
  active7d: number;
  active30d: number;
  invited: number;
  topInviters: { id: string; name: string; email: string; invited: number }[];
};

export async function growth(db: Database): Promise<Growth> {
  return timed(db, async (tx) => {
    const [a] = rows<Record<string, string>>(
      await tx.execute(sql`
        select
          count(distinct s.user_id) filter (where s.last_seen_at > now() - interval '1 day') as d1,
          count(distinct s.user_id) filter (where s.last_seen_at > now() - interval '7 days') as d7,
          count(distinct s.user_id) filter (where s.last_seen_at > now() - interval '30 days') as d30
        from sessions s join users u on u.id = s.user_id where u.account_kind = 'standard'`),
    );
    const [inv] = await tx.select({ n: count() }).from(users).where(isNotNull(users.invitedBy));
    const top = rows<{ id: string; name: string; email: string; invited: string }>(
      await tx.execute(sql`
        select i.id, i.name, i.email, count(f.id) as invited
        from users f join users i on i.id = f.invited_by
        group by i.id, i.name, i.email order by count(f.id) desc, i.name limit 10`),
    );
    return {
      active1d: Number(a?.d1 ?? 0),
      active7d: Number(a?.d7 ?? 0),
      active30d: Number(a?.d30 ?? 0),
      invited: inv?.n ?? 0,
      topInviters: top.map((t) => ({ ...t, invited: Number(t.invited) })),
    };
  });
}

// ---------------------------------------------------------------------------
// export

/** A CSV cell: quoted, inner quotes doubled, and a leading = + - @ neutralised so a spreadsheet won't run it as a formula. */
export function csvCell(v: unknown) {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Every standard account as CSV (accounts only, never their content). */
export async function usersCsv(db: Database, actor: Admin): Promise<string> {
  await limited(db, actor);
  const list = await timed(db, (tx) =>
    tx
      .select({
        name: users.name,
        email: users.email,
        plan: users.plan,
        joined: users.createdAt,
        suspended: users.suspendedAt,
        invitedBy: sql<string | null>`(select i.email from users i where i.id = "users"."invited_by")`,
        lastSeen: sql<Date | null>`(select max(s.last_seen_at) from sessions s where s.user_id = "users"."id")`,
      })
      .from(users)
      .where(eq(users.accountKind, "standard"))
      .orderBy(desc(users.createdAt))
      .limit(50_000),
  );
  await db.insert(adminActions).values({ actorUserId: actor.id, actorEmail: actor.email, action: "users.export", metadata: { rows: list.length } });
  const head = ["Name", "Email", "Plan", "Joined", "Last seen", "Suspended", "Invited by"];
  const lines = list.map((u) =>
    [u.name, u.email, u.plan, u.joined, u.lastSeen ? new Date(u.lastSeen) : "", u.suspended ?? "", u.invitedBy ?? ""].map(csvCell).join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
