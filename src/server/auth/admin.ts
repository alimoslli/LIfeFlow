import { count, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { passkeys, users } from "../db/schema";

/**
 * Who may open /admin (ADR 0022): the emails in ADMIN_EMAILS, and only when that account has two-step sign-in
 * (authenticator app) or a passkey. Pure helpers here; the page guard is in require-admin.ts.
 */
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdminEmail = (email: string, env: Record<string, string | undefined> = process.env) => adminEmails(env).includes(email.trim().toLowerCase());

export type Admin = { id: string; email: string };

/** The admin for this user id, or null. Null for anyone not listed, demo accounts, suspended accounts and accounts without 2FA or a passkey. */
export async function adminFor(db: Database, userId: string, env: Record<string, string | undefined> = process.env): Promise<Admin | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, accountKind: users.accountKind, totpEnabledAt: users.totpEnabledAt, suspendedAt: users.suspendedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!u || u.accountKind !== "standard" || u.suspendedAt || !isAdminEmail(u.email, env)) return null;
  if (!u.totpEnabledAt) {
    const [{ n }] = await db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId));
    if (n === 0) return null;
  }
  return { id: u.id, email: u.email };
}
