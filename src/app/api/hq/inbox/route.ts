import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { isHqRole } from "@/server/hq/team";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { agentInbox, resolveHqKey } from "@/server/services/hq";

export const dynamic = "force-dynamic";

/** What a chat should pick up: its open missions and the owner's decisions. Authenticated by an HQ key (public route in proxy.ts). */
export async function GET(req: Request) {
  try {
    const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    await enforceRateLimit(`hq:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`, 600, 3600);
    const key = raw ? await resolveHqKey(getDb(), raw) : null;
    if (!key) throw new HttpError(401, "Invalid or revoked key.");
    const params = new URL(req.url).searchParams;
    const role = params.get("role");
    if (role && !isHqRole(role)) throw new HttpError(400, "Unknown role.");
    const sinceRaw = params.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    if (since && Number.isNaN(since.getTime())) throw new HttpError(400, "since must be a date.");
    const r = await agentInbox(getDb(), { role: role && isHqRole(role) ? role : undefined, since });
    return NextResponse.json({ missions: r.missions, decisions: r.decisions });
  } catch (e) {
    return errorResponse(e);
  }
}
