"use server";
import { todayIn } from "@/lib/dates";
import { mutate, type ActionState } from "@/server/actions";
import { withCurrentUser } from "@/server/auth/current-user";
import { WebSearchError } from "@/server/integrations/web-search";
import { setRecurringStatus } from "@/server/services/finance/planning";
import { findCancelHelp, remindBeforeRenewal, trackFound, updateSubscription } from "@/server/services/finance/subscriptions";

const R = { revalidate: ["/finances/subscriptions", "/money"] };

export async function keepSubscriptionAction(id: string): Promise<ActionState> {
  return mutate("subscription.keep", async (s) => (await updateSubscription(s, id, { kept: true }), "Kept. I won't flag it unless the price changes."), R);
}

export async function notUsingAction(id: string): Promise<ActionState> {
  return mutate(
    "subscription.not_using",
    async (s) => (await updateSubscription(s, id, { usage: "not_using" }), "Noted. It's flagged so you can cancel it."),
    R,
  );
}

export async function setTrialAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const date = String(fd.get("trialEndsOn") ?? "") || null;
  return mutate(
    "subscription.trial",
    async (s) => (await updateSubscription(s, id, { trialEndsOn: date }), date ? `I'll warn you before the trial ends on ${date}.` : "Trial date cleared."),
    R,
  );
}

export async function remindRenewalAction(id: string): Promise<ActionState> {
  return mutate(
    "subscription.remind",
    async (s, u) => {
      const r = await remindBeforeRenewal(s, u.timezone, id, 3, todayIn(u.timezone));
      return `Reminder set for ${r.day}, 3 days before it renews.`;
    },
    R,
  );
}

export async function markCancelledAction(id: string): Promise<ActionState> {
  return mutate("subscription.cancelled", async (s) => (await setRecurringStatus(s, id, "cancelled"), "Marked as cancelled. Watch for one last charge."), R);
}

export async function trackFoundAction(key: string): Promise<ActionState> {
  return mutate("subscription.track", async (s, u) => `Now tracking ${(await trackFound(s, todayIn(u.timezone), key)).name}.`, R);
}

/** Live search for the official cancellation steps. Never cancels anything. */
export async function cancelHelpAction(
  id: string,
): Promise<{ ok: true; answer: string; sources: { title: string; url: string }[] } | { ok: false; error: string }> {
  try {
    const help = await withCurrentUser((s) => findCancelHelp(s, id));
    return { ok: true, answer: help.answer, sources: help.sources };
  } catch (e) {
    return { ok: false, error: e instanceof WebSearchError ? e.message : "Couldn't look that up right now." };
  }
}
