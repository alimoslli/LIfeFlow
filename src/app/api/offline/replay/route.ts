import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";
import { OFFLINE_BATCH_MAX } from "@/lib/offline-limits";
import { failureOf, offlineOpSchema, replayOp, type ReplayResult } from "@/server/services/offline";

export const dynamic = "force-dynamic";

/** Applies writes the phone queued while offline. Each op runs in its own transaction so one bad op can't block the rest. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`offline-replay:${user.id}`, 30, 600);
    const body = z
      .object({ userId: z.string().uuid().optional(), ops: z.array(z.unknown()).max(OFFLINE_BATCH_MAX) })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Invalid request");
    // Changes belong to the account that made them: never apply them to another one.
    if (body.data.userId && body.data.userId !== user.id) throw new HttpError(409, "These changes were made in a different account.");
    const results: ReplayResult[] = [];
    for (const raw of body.data.ops) {
      const op = offlineOpSchema.safeParse(raw);
      const id = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : "unknown";
      if (!op.success) {
        results.push({ id, status: "failed", error: "Invalid change" });
        continue;
      }
      try {
        const r = await withUser(user.id, async (s) => {
          const out = await replayOp(s, user.timezone, op.data);
          if (out.status === "applied") await audit(s, "user", `offline.${op.data.kind}`);
          return out;
        });
        results.push({ id: op.data.id, ...r });
      } catch (e) {
        // Only our own validation messages go back; database errors stay in the server log.
        // (Log the kind and error code only: query errors can include the user's text.)
        const out = failureOf(e);
        if (out.retryable)
          console.error(
            "offline replay failed",
            op.data.kind,
            (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code ?? "unknown",
          );
        results.push({ id: op.data.id, ...out });
      }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
