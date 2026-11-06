import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Admin } from "../auth/admin";
import type { Database } from "../db/client";
import { adminActions, hqActivity, type HqRole } from "../db/schema";

/**
 * Shared HQ plumbing: errors, text cleaning, safe links, zod helpers, the timed read transaction and the activity /
 * admin logs. Lives here (not in services/hq.ts) so services/hq-marketing.ts can use it without a circular import.
 */

export class HqError extends Error {}

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function timed<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', '5000', true)`);
    return fn(tx);
  });
}

// Control characters, bidi overrides and zero-width characters never belong in HQ text.
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
/** One line of plain text: control characters removed, whitespace collapsed. */
export const cleanLine = (s: string) => s.replace(BAD_CHARS, "").replace(/\s+/g, " ").trim();
/** Several lines: control characters removed, newlines and tabs kept. */
export const cleanText = (s: string) => s.replace(BAD_CHARS, "").replace(/\r\n?/g, "\n").trim();

/** Only https links or same-site paths ("/admin/hq"). Never javascript:, data:, http:, "//host" or "/\host". */
export function isSafeLinkUrl(u: string): boolean {
  if (typeof u !== "string" || u.length === 0 || u.length > 2000) return false;
  if (/[\u0000-\u0020\u007F\\]/.test(u)) return false;
  if (u.startsWith("/")) return !u.startsWith("//");
  if (!u.startsWith("https://")) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export const line = (min: number, max: number) =>
  z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(min, "is required").max(max, `is too long (max ${max})`));
/** Optional text; an empty string means "nothing" (null). */
export const optLine = (max: number) =>
  z
    .string()
    .transform((s) => cleanLine(s) || null)
    .pipe(z.string().max(max, `is too long (max ${max})`).nullable())
    .nullish();
export const optText = (max: number) =>
  z
    .string()
    .transform((s) => cleanText(s) || null)
    .pipe(z.string().max(max, `is too long (max ${max})`).nullable())
    .nullish();
export const url = z.string().refine(isSafeLinkUrl, "must be an https:// link or a path like /admin/hq");
export const linkSchema = z.object({ label: line(1, 60), url });
export const linksSchema = z.array(linkSchema).max(10, "has too many links (max 10)");
export const dueOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must look like 2026-11-30")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "is not a real date")
  .nullish();

/** A chat id (session_…) or nothing. Anything else is refused with a plain message. */
export const sessionIdField = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (v == null || v.trim() === "") return null;
    try {
      return normalizeSessionId(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "isn't a chat id" });
      return z.NEVER;
    }
  });

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const i = r.error.issues[0];
  const where = i?.path.length ? `${i.path.join(".")} ` : "";
  throw new HqError(`${where}${i?.message ?? "is not valid"}`.slice(0, 160));
}

/** Accepts `session_<id>` or `cse_<id>` and returns `session_<id>`. */
export function normalizeSessionId(raw: string): string {
  const m = /^(?:session|cse)_([A-Za-z0-9]{10,64})$/.exec(typeof raw === "string" ? raw.trim() : "");
  if (!m) throw new HqError("That isn't a chat id (it looks like session_01ABC...).");
  return `session_${m[1]}`;
}

export type ActivityInput = {
  actor: "owner" | "agent" | "system";
  role: HqRole | "founder" | null;
  kind: string;
  text: string;
  missionId?: string | null;
  approvalId?: string | null;
  sessionId?: string | null;
  link?: string | null;
};

export async function logActivity(tx: Tx, a: ActivityInput) {
  await tx.insert(hqActivity).values({
    actor: a.actor,
    role: a.role,
    kind: a.kind,
    text: cleanLine(a.text).slice(0, 400),
    missionId: a.missionId ?? null,
    approvalId: a.approvalId ?? null,
    sessionId: a.sessionId ?? null,
    link: a.link ?? null,
  });
}
export async function logAdmin(tx: Tx, admin: Admin, action: string, metadata: Record<string, unknown>) {
  await tx.insert(adminActions).values({ actorUserId: admin.id, actorEmail: admin.email, action, metadata });
}
