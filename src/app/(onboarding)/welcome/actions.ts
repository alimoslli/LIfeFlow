"use server";
import { mutate, type ActionState } from "@/server/actions";
import { completeOnboarding, finishOnboarding, setTourState, type OnboardingInput } from "@/server/services/onboarding";

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionState> {
  return mutate("onboarding.completed", async (s) => {
    await completeOnboarding(s, input);
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
