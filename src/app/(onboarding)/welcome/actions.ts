"use server";
import { ZodError } from "zod";
import { redirect, unstable_rethrow } from "next/navigation";
import { plainValidation } from "@/lib/validation-message";
import { mutate, type ActionState } from "@/server/actions";
import { endSession, requireUserForWelcome, withCurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";
import { AGE_LINE } from "@/lib/birthday";
import { afterAgeLock, saveWelcomeProgress, setTourState } from "@/server/services/onboarding";
import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { AuthError, deleteLockedAccount } from "@/server/services/accounts";

/**
 * Keeps the skyling and "about you" on the account, so connecting (which leaves the page) can come back to them. Under
 * 13, the account's welcome is locked and the same calm line comes back (the lock is committed, so it isn't thrown).
 */
export async function saveWelcomeAction(input: Parameters<typeof saveWelcomeProgress>[2]): Promise<ActionState> {
  try {
    const r = await withCurrentUser(async (s, u) => {
      const out = await saveWelcomeProgress(s, u.timezone || "UTC", input);
      await audit(s, "user", out.blocked ? "onboarding.age_blocked" : "onboarding.progress");
      return { ...out, userId: u.id };
    });
    // the lock is committed: now close their bank and Google links where they live (retried by the sync cron if this fails)
    if (r.blocked) after(() => afterAgeLock(getDb(), r.userId));
    return r.blocked ? { ok: false, error: AGE_LINE, at: Date.now() } : { ok: true, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof ZodError ? plainValidation(e.issues) : e instanceof ServiceError ? e.message : "Couldn't save. Try again.";
    return { ok: false, error, at: Date.now() };
  }
}

export async function setTourAction(state: "pending" | "done"): Promise<ActionState> {
  return mutate(`tour.${state}`, async (s) => {
    await setTourState(s, state);
  });
}

/**
 * "Delete my account" on the lock screen (an account locked under 13): the same deletion as Settings, with its rules (the
 * password if they have one, a plan that can't be cancelled stops it), after typing DELETE. Only for a locked account.
 */
export async function deleteLockedAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUserForWelcome();
  if (!user.preferences?.ageBlockedAt) redirect("/settings/data");
  try {
    await deleteLockedAccount(getDb(), user.id, fd.get("confirm"), String(fd.get("password") ?? ""));
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Couldn't delete the account. Try again.", at: Date.now() };
  }
  await endSession();
  redirect("/");
}
