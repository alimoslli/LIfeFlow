import { eq } from "drizzle-orm";
import type { SessionUser } from "../auth/sessions";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { isWhatsApp, toSmsText } from "../integrations/twilio";
import { setSms, smsDecision, userForPhone } from "../services/sms";
import { runJarvisTurn } from "./agent";
import { decidePendingAction } from "./decide";
import type { ModelProvider } from "./providers/types";
import { isPro } from "../billing";
import { aiAllowed } from "@/lib/ai-consent";

/**
 * One incoming text from a verified number: a YES/NO answers the pending action;
 * anything else is a normal Jarvis turn in the user's SMS conversation. Money stays
 * hidden by text unless the user turned it on. Returns the reply text, or null for
 * unknown numbers (they get no answer).
 */
export async function answerText(
  db: Database,
  from: string,
  body: string,
  deps: { provider: () => ModelProvider; send: (to: string, text: string) => Promise<unknown> },
) {
  const userId = await userForPhone(db, from);
  if (!userId) return null;
  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      timezone: users.timezone,
      accountKind: users.accountKind,
      preferences: users.preferences,
      phone: users.smsPhone,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId));
  // Reply on the channel the message came in on: WhatsApp back to WhatsApp, texts to the saved number.
  const replyTo = isWhatsApp(from) ? from : u.phone!;
  const user: SessionUser = {
    id: u.id,
    email: u.email,
    name: u.name,
    timezone: u.timezone,
    accountKind: u.accountKind,
    preferences: u.preferences,
    plan: u.plan,
  };
  if (!isPro(user)) {
    const note = "Texting LifeFlow is part of Pro. Upgrade in the app under Settings, Plan.";
    await deps.send(replyTo, note);
    return note;
  }
  if (!aiAllowed(u.preferences)) {
    const note = "To text your skyling, open LifeFlow and allow it to use AI (in Settings).";
    await deps.send(replyTo, note);
    return note;
  }
  const sms = u.preferences.sms ?? {};
  const moneyLocked = sms.money !== true;
  let reply: string;

  const decision = smsDecision(body);
  if (decision && sms.pendingActionId) {
    const r = await decidePendingAction(user, sms.pendingActionId, decision, moneyLocked, "sms").catch(() => ({
      message: "That request expired. Ask me again.",
    }));
    await setSms(db, user.id, { pendingActionId: undefined });
    reply = r.message;
  } else {
    let text = "";
    let pending: string | undefined;
    let pendingSummary = "";
    let conversationId = sms.conversationId;
    try {
      await runJarvisTurn({
        user,
        conversationId: sms.conversationId ?? null,
        text: body.slice(0, 4000),
        provider: deps.provider(),
        moneyLocked,
        emit: (e) => {
          if (e.type === "tool_start") text = ""; // one reply, not "let me check…" first
          if (e.type === "text") text += e.delta;
          if (e.type === "conversation") conversationId = e.id;
          if (e.type === "confirmation") {
            // A text is cut at 1500 characters and strips some marks, but YES would send the whole thing.
            // If the person can't see exactly what would go out, they review and send in the app.
            const shown = e.summary.includes("\n") ? toSmsText(e.summary) : e.summary;
            const exact = shown === e.summary.trim() && `${text}\n\n${shown} Reply YES to confirm or NO to cancel.`.length <= 1400;
            if (exact) {
              pending = e.actionId;
              pendingSummary = e.summary;
              text += `\n\n${e.summary} Reply YES to confirm or NO to cancel.`;
            } else {
              text += "\n\nThis needs your review before it sends. Open LifeFlow to review and send.";
            }
          }
          if (e.type === "error") text += `\n${e.message}`;
        },
      });
    } catch (e) {
      // Only the kind of failure: an error's message can quote the text that was sent.
      const err = e as { status?: number; code?: string } | undefined;
      console.error("[sms] reply failed:", e instanceof Error ? e.constructor.name : typeof e, err?.status ?? err?.code ?? null);
      text = "I can't answer texts right now. Try again in a bit, or open LifeFlow.";
    }
    // YES may only run what the person was shown. A later tool call resets the text, so check the
    // final reply still contains the confirmation; if not, the action waits for the app instead.
    if (pending && !toSmsText(text).includes(toSmsText(pendingSummary))) {
      pending = undefined;
      text = `${text.trim()}\n\nThere's an action waiting for your review. Open LifeFlow to review and confirm it.`.trim();
    }
    await setSms(db, user.id, { conversationId, pendingActionId: pending });
    reply = text.trim() || "Done.";
  }
  const out = toSmsText(reply);
  await deps.send(replyTo, out);
  return out;
}
