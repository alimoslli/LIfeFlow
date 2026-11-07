"use server";
import { mutate, type ActionState } from "@/server/actions";
import { completeOnboarding, finishOnboarding, setDisplayName, setTourState, type OnboardingInput } from "@/server/services/onboarding";

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
