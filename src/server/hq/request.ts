import { ipFromHeaders } from "../auth/current-user";
import { getDb } from "../db/client";
import { enforceRateLimit, HttpError } from "../http";
import { isHqKeyFormat, resolveHqKey } from "../services/hq";

/** The same plain answer for a missing, malformed, wrong or revoked key. */
const NO_KEY = "Invalid or revoked key.";

/**
 * Authenticates an /api/hq request (ADR 0024). A bearer that isn't the exact key shape is refused before anything is
 * counted, so a caller can't make up values to dodge a limit or fill rate_limit_buckets. Then: by IP first, then by key.
 */
export async function authenticateHq(req: Request): Promise<{ id: string; name: string }> {
  const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!isHqKeyFormat(raw)) throw new HttpError(401, NO_KEY);
  await enforceRateLimit(`hq-ip:${ipFromHeaders(req.headers)}`, 1200, 3600);
  const key = await resolveHqKey(getDb(), raw);
  if (!key) throw new HttpError(401, NO_KEY);
  await enforceRateLimit(`hq:${key.id}`, 600, 3600);
  return key;
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
