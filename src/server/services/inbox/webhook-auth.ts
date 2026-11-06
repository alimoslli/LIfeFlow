import { createHash, timingSafeEqual } from "node:crypto";

/** A dedicated header for services that can't send basic auth. */
export const INBOX_SECRET_HEADER = "x-inbox-secret";

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Constant time whatever the lengths (compares SHA-256 digests). Empty never matches. */
export function sameSecret(given: string, secret: string) {
  return !!given && !!secret && timingSafeEqual(digest(given), digest(secret));
}

/** The password part of `Authorization: Basic base64(user:password)`; the user name is ignored. */
function basicPassword(header: string | null) {
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header ?? "");
  if (!m) return null;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const i = decoded.indexOf(":");
  return i < 0 ? null : decoded.slice(i + 1);
}

/**
 * How the inbound email webhook proved it knows INBOX_WEBHOOK_SECRET.
 * "header": basic auth (Postmark: https://inbox:<secret>@<site>/api/inbox/email) or the x-inbox-secret header.
 * "query": the old ?key=<secret> form, which lands in access logs; still accepted until the live setup moves.
 * null: refused. When either header is present (even malformed or not Basic), only the headers count: a key in the URL never rescues it.
 */
export function inboxWebhookAuth(req: Request, secret = process.env.INBOX_WEBHOOK_SECRET ?? ""): "header" | "query" | null {
  if (!secret) return null;
  const authorization = req.headers.get("authorization");
  const custom = req.headers.get(INBOX_SECRET_HEADER);
  if (authorization !== null || custom !== null) {
    const given = [basicPassword(authorization), custom];
    return given.some((v) => v !== null && sameSecret(v, secret)) ? "header" : null;
  }
  const key = new URL(req.url).searchParams.get("key");
  if (key !== null) return sameSecret(key, secret) ? "query" : null;
  return null;
}
