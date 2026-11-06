import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HQ_ROLES } from "@/server/db/schema";
import { getDb } from "@/server/db/client";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import {
  createApproval,
  createMission,
  HqError,
  importSeed,
  recordAgentActivity,
  recordCheckin,
  resolveHqKey,
  updateMission,
  type HqActor,
} from "@/server/services/hq";

export const dynamic = "force-dynamic";

const role = z.enum(HQ_ROLES);
const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("checkin") }).passthrough(),
  z.object({ type: z.literal("mission"), id: z.string().optional() }).passthrough(),
  z.object({ type: z.literal("approval") }).passthrough(),
  z.object({ type: z.literal("activity"), role, text: z.string(), link: z.string().nullish(), sessionId: z.string().nullish() }),
  z.object({ type: z.literal("import"), seed: z.unknown() }),
]);

/** Receives reports from the owner's chats (check-ins, missions, approvals, notes). Authenticated by an HQ key, so it is a public route in proxy.ts. */
export async function POST(req: Request) {
  try {
    const raw = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    await enforceRateLimit(`hq:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`, 600, 3600);
    const key = raw ? await resolveHqKey(getDb(), raw) : null;
    if (!key) throw new HttpError(401, "Invalid or revoked key.");
    const text = await req.text();
    if (text.length > 64_000) throw new HttpError(413, "Too much data in one request");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    const parsed = body.safeParse(json);
    if (!parsed.success) throw new HttpError(400, "Unknown or missing type (checkin, mission, approval, activity, import).");
    const b = parsed.data as Record<string, unknown> & { type: string };
    const sessionId = typeof b.sessionId === "string" ? b.sessionId : null;
    const actor: HqActor = { kind: "agent", keyName: key.name, sessionId: null };
    const db = getDb();
    try {
      switch (b.type) {
        case "checkin": {
          const { type: _t, ...rest } = b;
          await recordCheckin(db, rest as never);
          return NextResponse.json({ ok: true });
        }
        case "mission": {
          const { type: _t, id, ...rest } = b;
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
