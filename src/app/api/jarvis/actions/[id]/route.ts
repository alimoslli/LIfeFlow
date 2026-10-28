import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/current-user";
import { messages } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { makeToolContext } from "@/server/jarvis/agent";
import { moneyLocked } from "@/server/auth/money-lock";
import { resolvePendingAction } from "@/server/jarvis/executor";
import { ServiceError } from "@/server/services/errors";
import { audit } from "@/server/services/audit";

const body = z.object({ decision: z.enum(["confirm", "cancel"]) });

/** The user's explicit Confirm/Cancel on an action Jarvis proposed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request");
    await enforceRateLimit(`actions:${user.id}`, 30, 60);

    const toolCtx = makeToolContext(user, "00000000-0000-0000-0000-000000000000", new Date(), "", await moneyLocked(user));
    let outcome;
    try {
      outcome = await resolvePendingAction(id, parsed.data.decision, toolCtx);
    } catch (e) {
      if (e instanceof ServiceError) throw new HttpError(e.code === "not_found" ? 404 : e.code === "forbidden" ? 423 : 409, e.message);
      throw e;
    }
    const { action, status, result } = outcome;
    const message =
      status === "executed"
        ? `Confirmed and done: ${action.summary.replace(/\?$/, "")}.`
        : status === "cancelled"
          ? "Cancelled. Nothing was changed."
          : (result.error ?? "Failed.");
    await withUser(user.id, async (s) => {
      // Keep the transcript truthful for the model's next turn.
      await s.tx
        .update(messages)
        .set({
          toolResult: { ...result, data: { status, confirmedByUser: parsed.data.decision === "confirm", result: result.data } },
          status: result.ok ? "complete" : "error",
        })
        .where(and(eq(messages.conversationId, action.conversationId), eq(messages.toolCallId, action.toolCallId), eq(messages.userId, s.userId)));
      await s.tx.insert(messages).values({ userId: s.userId, conversationId: action.conversationId, role: "assistant", content: message });
      await audit(s, "user", `jarvis.action.${status}`, { type: "pending_action", id }, { tool: action.toolName });
    });
    return NextResponse.json({ status, message, ok: result.ok });
  } catch (e) {
    return errorResponse(e);
  }
}
