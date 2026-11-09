"use server";
import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import type { ClockData } from "@/lib/day-clock";
import { plainValidation } from "@/lib/validation-message";
import { mutate, type ActionState } from "@/server/actions";
import { withCurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/services/audit";
import { dayClockData } from "@/server/services/day-clock";
import { ServiceError } from "@/server/services/errors";
import {
  addDueSoon,
  addRegularWork,
  addWeeklyClass,
  completeOnboarding,
  finishOnboarding,
  setDisplayName,
  setTourState,
  type OnboardingInput,
  type WeeklyInput,
} from "@/server/services/onboarding";

/** What "Build your sky" gets back: the person's sky as it is now (no money on it), or why it didn't save. */
export type SkyResult = { ok: true; clock: ClockData } | { ok: false; error: string };

async function onSky(name: string, save?: (s: Parameters<Parameters<typeof withCurrentUser>[0]>[0], tz: string) => Promise<unknown>): Promise<SkyResult> {
  try {
    return await withCurrentUser(async (s, u) => {
      const tz = u.timezone || "UTC";
      if (save) {
        await save(s, tz);
        await audit(s, "user", name);
      }
      return { ok: true as const, clock: await dayClockData(s, tz, new Date(), { money: false }) };
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
export async function addClassAction(input: WeeklyInput): Promise<SkyResult> {
  return onSky("onboarding.class", (s, tz) => addWeeklyClass(s, tz, input));
}
export async function addWorkAction(input: WeeklyInput): Promise<SkyResult> {
  return onSky("onboarding.work", (s, tz) => addRegularWork(s, tz, input));
}
export async function addDueAction(input: { title: string; date: string; time?: string }): Promise<SkyResult> {
  return onSky("onboarding.due", (s, tz) => addDueSoon(s, tz, input));
}

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionState> {
  return mutate("onboarding.completed", async (s, u) => {
    await completeOnboarding(s, input, u.timezone);
  });
}

export async function skipOnboardingAction(): Promise<ActionState> {
  return mutate("onboarding.skipped", async (s) => {
    await finishOnboarding(s);
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
