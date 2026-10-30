import { eq } from "drizzle-orm";
import type { SessionUser } from "../auth/sessions";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { toSmsText } from "../integrations/twilio";
import { setSms, smsDecision, userForPhone } from "../services/sms";
import { runJarvisTurn } from "./agent";
import { decidePendingAction } from "./decide";
import type { ModelProvider } from "./providers/types";
import { isPro } from "../billing";

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
    await deps.send(u.phone!, note);
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
    let conversationId = sms.conversationId;
    try {
      await runJarvisTurn({
        user,
        conversationId: sms.conversationId ?? null,
        text: body.slice(0, 4000),
        provider: deps.provider(),
        moneyLocked,
        emit: (e) => {
          if (e.type === "text") text += e.delta;
          if (e.type === "conversation") conversationId = e.id;
          if (e.type === "confirmation") {
            pending = e.actionId;
            text += `\n\n${e.summary} Reply YES to confirm or NO to cancel.`;
          }
          if (e.type === "error") text += `\n${e.message}`;
        },
      });
    } catch {
      text = "I can't answer texts right now. Try again in a bit, or open LifeFlow.";
    }
    await setSms(db, user.id, { conversationId, pendingActionId: pending });
    reply = text.trim() || "Done.";
  }
  const out = toSmsText(reply);
  await deps.send(u.phone!, out);
  return out;
}
