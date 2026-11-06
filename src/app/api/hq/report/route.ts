import { NextResponse } from "next/server";
import { z } from "zod";
import { HQ_ROLES } from "@/server/db/schema";
import { getDb } from "@/server/db/client";
import { errorResponse, HttpError } from "@/server/http";
import { authenticateHq, readLimitedBody } from "@/server/hq/request";
import {
  createApproval,
  createMission,
  HqError,
  importSeed,
  recordAgentActivity,
  recordCheckin,
  normalizeSessionId,
  updateMission,
  type HqActor,
} from "@/server/services/hq";
import { createContent, recordMetrics, updateContent } from "@/server/services/hq-marketing";

export const dynamic = "force-dynamic";

const role = z.enum(HQ_ROLES);
const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("checkin") }).passthrough(),
  z.object({ type: z.literal("mission"), id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("approval") }).passthrough(),
  z.object({ type: z.literal("activity"), role, text: z.string(), link: z.string().nullish(), sessionId: z.string().nullish() }),
  z.object({ type: z.literal("import"), seed: z.unknown() }),
  z.object({ type: z.literal("content"), id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("metrics"), rows: z.array(z.unknown()).max(200, "Too many readings in one call (max 200).") }),
]);

/** Receives reports from the owner's chats (check-ins, missions, approvals, notes). Authenticated by an HQ key, so it is a public route in proxy.ts. */
export async function POST(req: Request) {
  try {
    const key = await authenticateHq(req);
    const text = await readLimitedBody(req);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    const parsed = body.safeParse(json);
    if (!parsed.success) throw new HttpError(400, "Unknown or missing type (checkin, mission, approval, activity, content, metrics, import).");
    const b = parsed.data as Record<string, unknown> & { type: string };
    let sessionId: string | null = null;
    if (typeof b.sessionId === "string" && b.sessionId) {
      try {
        sessionId = normalizeSessionId(b.sessionId);
      } catch {
        throw new HttpError(400, "That isn't a chat id (it looks like session_01ABC...).");
      }
    }
    const actor: HqActor = { kind: "agent", keyName: key.name, sessionId };
    const db = getDb();
    try {
      switch (b.type) {
        case "checkin": {
          const { type: _t, ...rest } = b;
          await recordCheckin(db, rest as never);
          return NextResponse.json({ ok: true });
        }
        case "mission": {
          const { type: _t, id, sessionId: _s, ...rest } = b;
          if (sessionId) (rest as Record<string, unknown>).sessionId = sessionId;
          if (typeof id === "string" && id) return NextResponse.json({ ok: true, id: (await updateMission(db, actor, id, rest as never)).id });
          return NextResponse.json({ ok: true, id: (await createMission(db, actor, rest as never)).id });
        }
        case "approval": {
          const { type: _t, ...rest } = b;
          return NextResponse.json({ ok: true, id: (await createApproval(db, actor, rest as never)).id });
        }
        case "activity":
          await recordAgentActivity(db, actor, { role: b.role as never, text: b.text as string, link: (b.link as string | null) ?? null, sessionId });
          return NextResponse.json({ ok: true });
        case "content": {
          const { type: _t, id, sessionId: _s, ...rest } = b;
          // The chat doing the work is recorded; an agent can never approve (updateContent refuses it).
          if (typeof id === "string" && id) return NextResponse.json({ ok: true, id: (await updateContent(db, actor, id, rest as never)).id });
          return NextResponse.json({ ok: true, id: (await createContent(db, actor, { ...rest, sessionId } as never)).id });
        }
        case "metrics":
          return NextResponse.json({ ok: true, ...(await recordMetrics(db, actor, b.rows as never)) });
        default:
          return NextResponse.json({ ok: true, ...(await importSeed(db, actor, b.seed)) });
      }
    } catch (e) {
      if (e instanceof HqError) throw new HttpError(400, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
