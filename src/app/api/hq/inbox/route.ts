import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { isHqRole } from "@/server/hq/team";
import { errorResponse, HttpError } from "@/server/http";
import { authenticateHq } from "@/server/hq/request";
import { agentInbox } from "@/server/services/hq";

export const dynamic = "force-dynamic";

/** What a chat should pick up: its open missions and the owner's decisions. Authenticated by an HQ key (public route in proxy.ts). */
export async function GET(req: Request) {
  try {
    await authenticateHq(req);
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
