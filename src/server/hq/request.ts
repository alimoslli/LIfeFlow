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
