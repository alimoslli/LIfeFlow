import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { isHqRole } from "@/server/hq/team";
import { errorResponse, HttpError } from "@/server/http";
import { authenticateHq } from "@/server/hq/request";
import { agentInbox, getMission } from "@/server/services/hq";

export const dynamic = "force-dynamic";

/** What a chat should pick up: its open missions and the owner's decisions. Authenticated by an HQ key (public route in proxy.ts). */
export async function GET(req: Request) {
  try {
    await authenticateHq(req);
    const params = new URL(req.url).searchParams;
    // One desk task by id (`scripts/hq.ts desk <id>`, ADR 0030), however long the open list is.
    const mission = params.get("mission");
    if (mission !== null) {
      if (!/^[0-9a-f-]{36}$/i.test(mission)) throw new HttpError(400, "mission must be a mission id.");
      const m = await getMission(getDb(), mission);
      const open = !!m && !!m.deskPrompt && m.status !== "done" && m.status !== "dropped";
      return NextResponse.json({ missions: open ? [m] : [] });
    }
    const role = params.get("role");
    if (role && !isHqRole(role)) throw new HttpError(400, "Unknown role.");
    const sinceRaw = params.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    if (since && Number.isNaN(since.getTime())) throw new HttpError(400, "since must be a date.");
    const r = await agentInbox(getDb(), { role: role && isHqRole(role) ? role : undefined, since });
    return NextResponse.json({
      missions: r.missions,
      decisions: r.decisions,
      revisions: r.revisions,
      needsRewrite: r.needsRewrite,
      approvedWithoutMission: r.approvedWithoutMission,
      approvedContent: r.approvedContent,
      controls: r.controls,
      chats: r.chats,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
