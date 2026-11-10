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
import { completeOnboarding, finishOnboarding, saveWelcomeProgress, setDisplayName, setTourState, type OnboardingInput } from "@/server/services/onboarding";

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
/** Keeps the skyling and "about you" on the account, so connecting (which leaves the page) can come back to them. */
export async function saveWelcomeAction(input: Parameters<typeof saveWelcomeProgress>[2]): Promise<ActionState> {
  return mutate("onboarding.progress", async (s, u) => {
    await saveWelcomeProgress(s, u.timezone || "UTC", input);
  });
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
