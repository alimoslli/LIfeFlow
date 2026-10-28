import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { ingestHealth, resolveHealthToken } from "@/server/services/health";

export const dynamic = "force-dynamic";

/**
 * Receives Apple Health daily totals from the user's iOS Shortcut.
 * Authenticated by a personal key (Authorization: Bearer lfh_...), not a
 * session cookie, so it is a public route in proxy.ts.
 */
export async function POST(req: Request) {
  try {
    const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    await enforceRateLimit(`health-ingest:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`, 60, 3600);
    const owner = raw ? await resolveHealthToken(getDb(), raw) : null;
    if (!owner) throw new HttpError(401, "Invalid or revoked key. Create a new one in LifeFlow Settings, Integrations.");
    const text = await req.text();
    if (text.length > 200_000) throw new HttpError(413, "Too much data in one request");
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
