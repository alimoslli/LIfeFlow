"use server";
import { ZodError } from "zod";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ClockData } from "@/lib/day-clock";
import { plainValidation } from "@/lib/validation-message";
import { mutate, type ActionState } from "@/server/actions";
import { endSession, requireUserForWelcome, withCurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/services/audit";
import { dayClockData } from "@/server/services/day-clock";
import { ServiceError } from "@/server/services/errors";
import { AGE_LINE } from "@/lib/birthday";
import {
  afterAgeLock,
  completeOnboarding,
  finishOnboarding,
  saveWelcomeProgress,
  setDisplayName,
  setTourState,
  type OnboardingInput,
} from "@/server/services/onboarding";
import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { firstFix, saveFirstThing, type FirstThing, type WeekFix } from "@/server/services/welcome-week";
import { AuthError, deleteLockedAccount } from "@/server/services/accounts";

/** The person's sky as it is now (no money on it), for "Connect your sky" after Canvas connects; or why it couldn't load. */
export type SkyResult = { ok: true; clock: ClockData } | { ok: false; error: string };

async function onSky(name: string, save?: (s: Parameters<Parameters<typeof withCurrentUser>[0]>[0], tz: string) => Promise<unknown>): Promise<SkyResult> {
  try {
    return await withCurrentUser(async (s, u) => {
      const tz = u.timezone || "UTC";
      if (save) {
        await save(s, tz);
        await audit(s, "user", name);
      }
      return { ok: true as const, clock: await dayClockData(s, tz, new Date(), { money: false, ownBills: true }) };
    });
  } catch (e) {
    unstable_rethrow(e);
    const error = e instanceof ZodError ? plainValidation(e.issues) : e instanceof ServiceError ? e.message : "That didn't save. Try again.";
    return { ok: false, error };
  }
}

export async function skyNowAction(): Promise<SkyResult> {
  return onSky("onboarding.sky");
}

/** "Here's your week so far": the one first fix for what landed (an ordinary skyling suggestion; Yes and Undo are its own), or none. */
export async function weekFixAction(): Promise<{ ok: true; fix: WeekFix | null } | { ok: false; error: string }> {
  try {
    const fix = await withCurrentUser((s, u) => firstFix(s, u.timezone || "UTC", u.preferences));
    return { ok: true, fix };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof ServiceError ? e.message : "Couldn't look at your week. Try again." };
  }
}

/** With nothing connected: one real class, shift, bill or to-do, saved like the forms do, and the sky back with it. */
export async function saveFirstThingAction(input: FirstThing): Promise<SkyResult> {
  return onSky("onboarding.first_thing", (s, tz) => saveFirstThing(s, tz, input));
}
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

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionState> {
  return mutate("onboarding.completed", async (s, u) => {
    await completeOnboarding(s, input, u.timezone);
  });
}

export async function skipOnboardingAction(): Promise<ActionState> {
  // skipping still needs a birthday (the welcome sends them to "About you" first); the server checks it too
  return mutate("onboarding.skipped", async (s, u) => {
    await finishOnboarding(s, {}, u.timezone || "UTC");
  });
}

export async function setTourAction(state: "pending" | "done"): Promise<ActionState> {
  return mutate(`tour.${state}`, async (s) => {
    await setTourState(s, state);
  });
}

export async function setNameAction(name: string): Promise<ActionState> {
  return mutate("onboarding.name", async (s) => {
    await setDisplayName(s, name);
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
