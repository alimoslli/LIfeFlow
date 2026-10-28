"use server";
import { z } from "zod";
import { mutate, type ActionState } from "@/server/actions";
import { markMilestoneCelebrated } from "@/server/services/finance/goals";

export async function celebrateMilestoneAction(goalId: string, percent: number): Promise<ActionState> {
  const p = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).parse(percent);
  return mutate("goal.milestone_seen", async (s) => markMilestoneCelebrated(s, z.string().uuid().parse(goalId), p), { revalidate: [] });
}
