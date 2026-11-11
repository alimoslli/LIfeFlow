import { and, asc, count, eq, inArray, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { adminEmails } from "../auth/admin";
import type { Database } from "../db/client";
import { appAccess, users } from "../db/schema";

/**
 * The waitlist (owner, 2026-11-11; docs/backlog/2026-11-11-audit-and-waitlist.md). Everyone is "waiting" in sign-up
 * order until the owner accepts them in HQ; the queue only closes the app while the owner's switch is on. Access is
 * separate from the plan: being let in never gives Pro. Accounts live on `users` (no RLS), like invites.
 */

export type AccessSettings = { waitlistOn: boolean; launchNote: string | null };

/** The owner's switch and launch line. No row yet means the waitlist is off. */
export async function accessSettings(db: Database): Promise<AccessSettings> {
  const [r] = await db.select({ on: appAccess.waitlistOn, note: appAccess.launchNote }).from(appAccess).where(eq(appAccess.id, "app"));
  return { waitlistOn: r?.on ?? false, launchNote: r?.note ?? null };
}

type Person = { email: string; accountKind: "standard" | "demo"; access: "waiting" | "in" };

/** Admins and the demo account are always in, whatever their row says. */
export function alwaysIn(u: Pick<Person, "email" | "accountKind">, env: Record<string, string | undefined> = process.env) {
  return u.accountKind === "demo" || adminEmails(env).includes(u.email.trim().toLowerCase());
}

/** Whether this person can use the app right now. */
export function canUseApp(u: Person, waitlistOn: boolean, env: Record<string, string | undefined> = process.env) {
  return !waitlistOn || u.access === "in" || alwaysIn(u, env);
}

/** Who holds a place in line: waiting, not suspended, not the demo account, not an admin. */
function inLine(): SQL {
  const admins = adminEmails();
  return and(
    eq(users.access, "waiting"),
    isNull(users.suspendedAt),
    eq(users.accountKind, "standard"),
    admins.length ? notInArray(sql`lower(${users.email})`, admins) : undefined,
  )!;
}

/** This person's place (1 = next to be let in), or null when they aren't in line. */
export async function waitlistPlace(db: Database, userId: string): Promise<number | null> {
  const [me] = await db
    .select({ rank: users.waitlistRank })
    .from(users)
    .where(and(eq(users.id, userId), inLine()));
  if (!me) return null;
  const [r] = await db
    .select({ n: count() })
    .from(users)
    .where(and(inLine(), lt(users.waitlistRank, me.rank)));
  return (r?.n ?? 0) + 1;
}

/** How many people are waiting. */
export async function waitingCount(db: Database): Promise<number> {
  const [r] = await db.select({ n: count() }).from(users).where(inLine());
  return r?.n ?? 0;
}

/** The next people in line, first first (for the owner's batch preview). */
export async function nextInLine(db: Database, n: number): Promise<{ id: string; name: string; email: string; createdAt: Date }[]> {
  const take = Math.max(0, Math.min(Math.floor(n), 500));
  if (!take) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(inLine())
    .orderBy(asc(users.waitlistRank))
    .limit(take);
}

/**
 * Lets these people in (the exact ones the owner confirmed). Safe to retry: someone already in is left alone and
 * reported as such. The demo account is never touched. It grants app access only, never a plan.
 */
export async function acceptUsers(db: Database, ids: string[]): Promise<{ accepted: string[]; already: string[] }> {
  const want = [...new Set(ids)];
  if (!want.length) return { accepted: [], already: [] };
  const rows = await db
    .update(users)
    .set({ access: "in", acceptedAt: new Date() })
    .where(and(inArray(users.id, want), eq(users.access, "waiting"), eq(users.accountKind, "standard")))
    .returning({ id: users.id });
  const accepted = rows.map((r) => r.id);
  const done = new Set(accepted);
  return { accepted, already: want.filter((id) => !done.has(id)) };
}

/**
 * Moves this person ahead of the one just above them in line (a referral, step 5 of the backlog). First place stays
 * first and nothing is banked. One move at a time across the whole queue (a transaction lock), so concurrent moves
 * can't lose or duplicate a place. Returns false when they're first or not in line.
 */
export async function moveUpOne(db: Database, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lifeflow:waitlist'))`);
    const [me] = await tx
      .select({ rank: users.waitlistRank })
      .from(users)
      .where(and(eq(users.id, userId), inLine()));
    if (!me) return false;
    const [above] = await tx
      .select({ id: users.id, rank: users.waitlistRank })
      .from(users)
      .where(and(inLine(), lt(users.waitlistRank, me.rank)))
      .orderBy(sql`${users.waitlistRank} desc`)
      .limit(1);
    if (!above) return false;
    // One statement swaps both places (the unique check runs at the end of the statement).
    await tx
      .update(users)
      .set({ waitlistRank: sql`case when ${users.id} = ${userId} then ${above.rank}::bigint else ${me.rank}::bigint end` })
      .where(inArray(users.id, [userId, above.id]));
    return true;
  });
}
