import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { rememberedDevices } from "../db/schema";
import { adminFor } from "./admin";

/**
 * "Remember this phone for 30 days" (owner, 2026-11-10, ADR 0009 addendum). After the second step, the browser gets a
 * cookie "<id>.<token>"; only the SHA-256 of the token is stored. It is looked at only after a correct password, never
 * starts a session by itself, and is revoked on a password change or reset, two-step off or restart, sign out
 * everywhere, suspension and deletion.
 */
export const DEVICE_COOKIE = "lf_device";
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function rememberDevice(db: Database, userId: string, userAgent?: string | null, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(rememberedDevices).where(lt(rememberedDevices.expiresAt, new Date(now)));
  const expiresAt = new Date(now + DEVICE_TTL_MS);
  const [row] = await db
    .insert(rememberedDevices)
    .values({ userId, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 300), expiresAt })
    .returning({ id: rememberedDevices.id });
  return { value: `${row.id}.${token}`, expiresAt };
}

/** True only for a live, unrevoked cookie that belongs to this user. Stamps "last used". */
export async function isRememberedDevice(db: Database, userId: string, cookie: string | undefined, now = Date.now()): Promise<boolean> {
  if (!cookie || cookie.length > 120) return false;
  const [id, token] = cookie.split(".");
  if (!id || !token || !UUID.test(id)) return false;
  const [row] = await db
    .select()
    .from(rememberedDevices)
    .where(and(eq(rememberedDevices.id, id), eq(rememberedDevices.userId, userId)));
  if (!row || row.expiresAt.getTime() <= now) return false;
  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(sha256(token), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  await db
    .update(rememberedDevices)
    .set({ lastUsedAt: new Date(now) })
    .where(eq(rememberedDevices.id, id));
  return true;
}

export async function revokeRememberedDevices(db: Database, userId: string) {
  await db.delete(rememberedDevices).where(eq(rememberedDevices.userId, userId));
}

/**
 * Who earns the 30 days after a correct second step (owner, 2026-11-14, choice A): the authenticator, a backup code and an
 * emailed code alike, for normal accounts. The admin account never does, whatever the method: it types the code or uses a
 * passkey every time. (Before this, an emailed code never earned it: QA review, 2026-11-10.)
 */
export const earnsRememberedDevice = (method: "totp" | "recovery" | "email", account: { admin: boolean }) =>
  !account.admin && (method === "totp" || method === "recovery" || method === "email");

/** The verify step's one decision: the box was ticked, the method earns it, and the account isn't the admin. */
export async function shouldRememberDevice(
  db: Database,
  userId: string,
  method: "totp" | "recovery" | "email",
  ticked: boolean,
  env: Record<string, string | undefined> = process.env,
) {
  if (!ticked) return false;
  return earnsRememberedDevice(method, { admin: !!(await adminFor(db, userId, env)) });
}
