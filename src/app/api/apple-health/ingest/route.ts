import { appOpenFor } from "@/server/services/waitlist";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDb } from "@/server/db/client";
import { ipFromHeaders } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError, readLimitedBody } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { ingestHealth, isHealthKeyFormat, resolveHealthToken } from "@/server/services/health";

export const dynamic = "force-dynamic";

/**
 * Receives Apple Health daily totals from the user's iOS Shortcut.
 * Authenticated by a personal key (Authorization: Bearer lfh_...), not a
 * session cookie, so it is a public route in proxy.ts.
 *
 * A bearer that isn't shaped like a real key is refused before anything is counted (made-up values can't dodge a limit
 * or fill rate_limit_buckets). A well-shaped key is looked up; only a failed lookup counts against the caller's IP, so
 * people sharing one network (a campus, a carrier) can't block each other's sync with fake keys, and a real key is
 * limited per key. Keys are 192 random bits, so the IP limit is about load, not guessing.
 */
const NO_KEY = "Invalid or revoked key. Create a new one in LifeFlow Settings, Integrations.";
const MAX_BODY = 200_000;

export async function POST(req: Request) {
  try {
    const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    if (!isHealthKeyFormat(raw)) throw new HttpError(401, NO_KEY);
    const owner = await resolveHealthToken(getDb(), raw);
    if (!owner) {
      await enforceRateLimit(`health-ip:${ipFromHeaders(req.headers)}`, 300, 3600);
      throw new HttpError(401, NO_KEY);
    }
    await enforceRateLimit(`health-ingest:${owner.tokenId}`, 60, 3600);
    // nothing comes in for someone on the waitlist until they're let in
    if (!(await appOpenFor(getDb(), owner.userId))) throw new HttpError(403, "This account is on the waitlist.");
    const text = await readLimitedBody(req, MAX_BODY);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    try {
      const r = await withUser(owner.userId, (s) => ingestHealth(s, body, owner.timezone));
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof ZodError) throw new HttpError(400, `Invalid data: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}`);
      if (e instanceof ServiceError) throw new HttpError(400, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
