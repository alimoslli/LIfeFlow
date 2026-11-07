import { NextResponse } from "next/server";
import { z } from "zod";
import { HQ_ROLES } from "@/server/db/schema";
import { getDb } from "@/server/db/client";
import { errorResponse, HttpError } from "@/server/http";
import { authenticateHq, hasHqKeyShape, isLiveOnly, readLimitedBody } from "@/server/hq/request";
import {
  recordSessionSync,
  createApproval,
  createMission,
  HqError,
  importSeed,
  linkApprovalMission,
  reviseApproval,
  recordAgentActivity,
  recordBrief,
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
  z.object({
    type: z.literal("activity"),
    role,
    text: z.string(),
    kind: z.enum(["note", "decision"]).optional(),
    link: z.string().nullish(),
    sessionId: z.string().nullish(),
  }),
  z.object({ type: z.literal("brief"), body: z.string(), needsYou: z.number().nullish(), sessionId: z.string().nullish() }),
  z.object({ type: z.literal("import"), seed: z.unknown() }),
  z.object({ type: z.literal("sessions"), sessions: z.array(z.unknown()).max(100, "Too many chats in one sync (max 100).") }),
  z.object({ type: z.literal("content"), id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("metrics"), rows: z.array(z.unknown()).max(200, "Too many readings in one call (max 200).") }),
]);

/** Receives reports from the owner's chats (check-ins, missions, approvals, notes). Authenticated by an HQ key, so it is a public route in proxy.ts. */
export async function POST(req: Request) {
  try {
    if (!hasHqKeyShape(req)) throw new HttpError(401, "Invalid or revoked key.");
    const text = await readLimitedBody(req);
    let json: unknown;
    let bad = false;
    try {
      json = JSON.parse(text);
    } catch {
      bad = true;
    }
    // Live pings (ADR 0030) count in their own limit; one over it is dropped quietly (the next one says the same).
    const live = !bad && isLiveOnly(json);
    let key: { id: string; name: string };
    try {
      key = await authenticateHq(req, { live });
    } catch (e) {
      if (live && e instanceof HttpError && e.status === 429) return NextResponse.json({ ok: true, dropped: true });
      throw e;
    }
    if (bad) throw new HttpError(400, "Body must be JSON");
    const parsed = body.safeParse(json);
    if (!parsed.success) throw new HttpError(400, "Unknown or missing type (checkin, mission, approval, activity, brief, content, metrics, import).");
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
        case "sessions": {
          // The hourly sync of Claude's own chat list (ADR 0030 addendum).
          const r = await recordSessionSync(db, { sessions: b.sessions });
          return NextResponse.json({ ok: true, ...r });
        }
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
          const { type: _t, revise, link, sessionId: _s, ...rest } = b;
          // A new version of an ask the owner sent back with changes (`revise`: the thread id or a version's id).
          if (typeof revise === "string" && revise) {
            const a = await reviseApproval(db, actor, revise, rest as never);
            return NextResponse.json({ ok: true, id: a.id, threadId: a.threadId, version: a.version });
          }
          // After a yes: the COO links the mission that builds it (`link`: the approval id).
          if (typeof link === "string" && link) {
            const a = await linkApprovalMission(db, actor, link, String(rest.missionId ?? ""));
            return NextResponse.json({ ok: true, id: a.id });
          }
          const a = await createApproval(db, actor, rest as never);
          return NextResponse.json({ ok: true, id: a.id, threadId: a.threadId, version: a.version });
        }
        case "activity":
          await recordAgentActivity(db, actor, {
            role: b.role as never,
            text: b.text as string,
            link: (b.link as string | null) ?? null,
            sessionId,
            kind: (b.kind as "note" | "decision" | undefined) ?? "note",
          });
          return NextResponse.json({ ok: true });
        case "brief": {
          const r = await recordBrief(db, actor, { body: b.body as string, needsYou: (b.needsYou as number | null) ?? null });
          return NextResponse.json({ ok: true, id: r.id });
        }
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
