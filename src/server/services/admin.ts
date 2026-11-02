import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { adminActions, errorReports, passkeys, sessions, users } from "../db/schema";
import { isAdminEmail, type Admin } from "../auth/admin";
import { billingConfig } from "../billing";
import { emailConfig } from "../integrations/email";
import { googleConfig } from "../integrations/google";
import { plaidConfig } from "../integrations/plaid";
import { smsConfig } from "../integrations/twilio";
import { rateLimit } from "../rate-limit";

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
          count(*) filter (where suspended_at is not null) as suspended
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

export type UserFilter = { q?: string; plan?: "free" | "pro"; status?: "active" | "suspended"; page?: number };

export async function listUsers(db: Database, f: UserFilter = {}): Promise<{ rows: UserRow[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const q = f.q?.trim().slice(0, 100);
  const where: SQL[] = [eq(users.accountKind, "standard")];
  if (q) where.push(or(ilike(users.email, likePattern(q)), ilike(users.name, likePattern(q)))!);
  if (f.plan) where.push(eq(users.plan, f.plan));
  if (f.status === "suspended") where.push(isNotNull(users.suspendedAt));
  if (f.status === "active") where.push(isNull(users.suspendedAt));
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
        lastSeenAt: sql<Date | null>`(select max(s.last_seen_at) from sessions s where s.user_id = "users"."id")`,
      })
      .from(users)
      .where(and(...where))
      .orderBy(desc(users.createdAt))
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

export type UserDetail = UserRow & {
  timezone: string;
  twoFactor: boolean;
  passkeys: number;
  sessions: number;
  hasPhone: boolean;
  hasStripeCustomer: boolean;
  isAdmin: boolean;
  isDemo: boolean;
};

export async function getUser(db: Database, id: string): Promise<UserDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return timed(db, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id));
    if (!u) return null;
    const [{ pk }] = await tx.select({ pk: count() }).from(passkeys).where(eq(passkeys.userId, id));
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
    if (suspend) await tx.delete(sessions).where(eq(sessions.userId, u.id));
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
export async function deleteUser(db: Database, actor: Admin, userId: string, confirmEmail: string) {
  await limited(db, actor);
  await db.transaction(async (tx) => {
    const u = await target(tx, actor, userId);
    if (confirmEmail.trim().toLowerCase() !== u.email) throw new AdminError("The email you typed doesn't match. Nothing was deleted.");
    if (u.plan === "pro")
      throw new AdminError("This user is on Pro. Cancel their subscription in Stripe and set their plan to Free first, so they aren't charged after deletion.");
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
