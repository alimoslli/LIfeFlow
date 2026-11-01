import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { errorReports } from "../db/schema";
import { emailConfig, sendEmail } from "../integrations/email";
import { rateLimit } from "../rate-limit";

/**
 * Error alerts for the owner. Server and browser errors are grouped by kind with a
 * count; the owner gets an email the first time a kind shows up, and again at
 * 10, 100 and 1,000 times (at most 20 alert emails a day). Nothing personal is kept:
 * emails, long numbers, ids and tokens are stripped from messages and routes.
 */

export type ErrorInput = { source: "server" | "client"; route: string; message: string; digest?: string | null };

/** Removes anything that could identify a person or leak a secret. */
export function scrub(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b(?:sk|pk|rk|ek|whsec|Bearer)[-_ ]?[A-Za-z0-9_-]{8,}/g, "[secret]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/\d{4,}/g, "[n]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Same kind of error = same source, route and message once numbers are ignored. */
export function fingerprint(e: Pick<ErrorInput, "source" | "route" | "message">) {
  const norm = `${e.source}|${e.route}|${e.message.replace(/\d+/g, "#")}`;
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

const ALERT_AT = new Set([1, 10, 100, 1000]);

export async function recordError(db: Database, input: ErrorInput, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}) {
  const route = scrub(input.route.split("?")[0] || "/").slice(0, 200);
  const message = scrub(input.message || "Unknown error") || "Unknown error";
  const fp = fingerprint({ source: input.source, route, message });
  const [row] = await db
    .insert(errorReports)
    .values({ fingerprint: fp, source: input.source, route, message, digest: input.digest?.slice(0, 64) ?? null })
    .onConflictDoUpdate({ target: errorReports.fingerprint, set: { count: sql`${errorReports.count} + 1`, lastSeenAt: new Date() } })
    .returning({ count: errorReports.count });
  const count = row?.count ?? 1;
  let alerted = false;
  if (ALERT_AT.has(count)) alerted = await alertOwner(db, { ...input, route, message, count }, deps);
  return { fingerprint: fp, count, alerted };
}

async function alertOwner(db: Database, e: ErrorInput & { count: number }, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> }) {
  const env = deps.env ?? process.env;
  const to = (env.ALERT_EMAIL || env.LEGAL_CONTACT_EMAIL)?.trim();
  const cfg = emailConfig(env);
  if (!to || !cfg) return false;
  if (!(await rateLimit(db, "error-alert-email", 20, 86_400)).allowed) return false;
  const what = e.count === 1 ? "New error" : `Error seen ${e.count} times`;
  const text = `${what} in LifeFlow (${e.source}).\n\nWhere: ${e.route}\nWhat: ${e.message}${e.digest ? `\nRef: ${e.digest}` : ""}\n\nNo personal details are included.`;
  try {
    await sendEmail(
      cfg,
      {
        to,
        subject: `LifeFlow: ${what.toLowerCase()} on ${e.route}`,
        text,
        html: `<pre style="font:14px/1.5 ui-monospace,monospace">${escapeHtml(text)}</pre>`,
      },
      deps.fetch,
    );
    return true;
  } catch {
    return false; // alerts never break the app
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
