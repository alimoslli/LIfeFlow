import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { checkPassword } from "@/lib/password-strength";
import type { Database } from "../db/client";
import { passwordResets, users } from "../db/schema";
import { withUser } from "../db/with-user";
import { emailConfig, sendEmail } from "../integrations/email";
import { audit } from "../services/audit";
import { signupSchema } from "../services/accounts";
import { hashPassword } from "./password";
import { deleteUserSessions } from "./sessions";

/**
 * "Forgot password": a one-time link, valid for an hour, sent by email. Only
 * the token's SHA-256 is stored. The answer is the same whether or not the
 * email has an account, so the form can't be used to find out who uses LifeFlow.
 * Resetting signs out every session (a stolen session stops working too).
 */

export const RESET_TTL_MS = 60 * 60_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class ResetError extends Error {}

export const passwordResetAvailable = () => !!emailConfig();

/** Creates and emails a reset link if the account exists. Returns the provider id when sent (for logs/tests), or null. */
export async function requestPasswordReset(db: Database, email: string, appUrl: string, fetchImpl: typeof fetch = fetch) {
  const cfg = emailConfig();
  if (!cfg) throw new ResetError("Password reset by email isn't available yet.");
  const [u] = await db.select({ id: users.id, name: users.name, kind: users.accountKind }).from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u || u.kind === "demo") return null;
  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResets).values({ id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  const link = `${appUrl.replace(/\/$/, "")}/reset-password#${token}`;
  const first = u.name.split(" ")[0];
  const sent = await sendEmail(
    cfg,
    {
      to: email.trim().toLowerCase(),
      subject: "Reset your LifeFlow password",
      text: `Hi ${first},\n\nUse this link to choose a new password. It works once, for one hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email. Your password stays the same.\n\nLifeFlow`,
      html: `<p>Hi ${escapeHtml(first)},</p><p>Use this link to choose a new password. It works once, for one hour:</p><p><a href="${link}">Choose a new password</a></p><p>If you didn't ask for this, you can ignore this email. Your password stays the same.</p><p>LifeFlow</p>`,
    },
    fetchImpl,
  );
  await withUser(u.id, (s) => audit(s, "user", "auth.password_reset_requested"), db);
  return sent.id;
}

/** Sets the new password if the token is valid, unused and not expired. Returns the user id. */
export async function resetPassword(db: Database, token: string, password: string) {
  if (!token || token.length > 100) throw new ResetError("This link isn't valid. Ask for a new one.");
  const [r] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, name: users.name, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.id, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!r) throw new ResetError("This link has expired or was already used. Ask for a new one.");
  const parsed = signupSchema.shape.password.safeParse(password);
  if (!parsed.success) throw new ResetError(parsed.error.issues[0].message);
  const strength = checkPassword(password, [r.name, r.email]);
  if (!strength.ok) throw new ResetError(`Choose a stronger password. ${strength.message}`);
  // Mark used first (only one request can win), then change the password.
  const [won] = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, r.id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!won) throw new ResetError("This link was already used. Ask for a new one.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, r.userId));
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, r.userId), isNull(passwordResets.usedAt)));
  await deleteUserSessions(db, r.userId);
  await withUser(r.userId, (s) => audit(s, "user", "auth.password_reset"), db);
  return r.userId;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
