import { ipFromHeaders } from "../auth/current-user";
import { getDb } from "../db/client";
import { enforceRateLimit, HttpError } from "../http";
import { isHqKeyFormat, resolveHqKey } from "../services/hq";

/** The same plain answer for a missing, malformed, wrong or revoked key. */
const NO_KEY = "Invalid or revoked key.";

/** Live pings (ADR 0030) are counted apart, so many busy chats can never use up the limit the real reports need. */
export const HQ_LIMITS = { ip: 1200, key: 600, liveIp: 6000, liveKey: 4000 } as const;

/**
 * Authenticates an /api/hq request (ADR 0024). A bearer that isn't the exact key shape is refused before anything is
 * counted, so a caller can't make up values to dodge a limit or fill rate_limit_buckets. Then: by IP first, then by key.
 * `live`: a live-only check-in (ADR 0030), counted in its own buckets.
 */
export async function authenticateHq(req: Request, opts: { live?: boolean } = {}): Promise<{ id: string; name: string }> {
  const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!isHqKeyFormat(raw)) throw new HttpError(401, NO_KEY);
  const ip = ipFromHeaders(req.headers);
  await enforceRateLimit(opts.live ? `hq-live-ip:${ip}` : `hq-ip:${ip}`, opts.live ? HQ_LIMITS.liveIp : HQ_LIMITS.ip, 3600);
  const key = await resolveHqKey(getDb(), raw);
  if (!key) throw new HttpError(401, NO_KEY);
  await enforceRateLimit(opts.live ? `hq-live:${key.id}` : `hq:${key.id}`, opts.live ? HQ_LIMITS.liveKey : HQ_LIMITS.key, 3600);
  return key;
}

/** The bearer is shaped like an HQ key (nothing counted, nothing read): checked before a body is read. */
export function hasHqKeyShape(req: Request): boolean {
  return isHqKeyFormat(req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "");
}

/** A check-in that only says what the chat is doing right now (the live hooks), and nothing else. */
export function isLiveOnly(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const b = json as Record<string, unknown>;
  if (b.type !== "checkin" || !b.live || typeof b.live !== "object") return false;
  return Object.keys(b).every((k) => k === "type" || k === "live" || k === "sessionId");
}

export { readLimitedBody } from "../http";

/** Reads a request body as raw bytes with a hard limit (pictures). Refuses early on content-length. */
export async function readLimitedBytes(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, "The picture is too big (max 2 MB).");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "The picture is too big (max 2 MB).");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
