"use server";
import { formObject, mutate, type ActionState } from "@/server/actions";
import type { MilestoneCategory } from "@/server/db/schema";
import { createMilestone, deleteMilestone, updateMilestone } from "@/server/services/milestones";

const fields = (fd: FormData) => {
  const f = formObject(fd);
  return { title: f.title ?? "", when: f.when ?? null, category: (f.category ?? "personal") as MilestoneCategory, note: f.note ?? null };
};

export async function createMilestoneAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate("milestone.create", async (s) => {
    const m = await createMilestone(s, fields(fd));
    return { message: `Added to your milestones: ${m.title}.`, sun: m.sun };
  });
}

export async function updateMilestoneAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate("milestone.update", async (s) => {
    await updateMilestone(s, id, fields(fd));
    return "Milestone saved.";
  });
}

export async function deleteMilestoneAction(id: string): Promise<ActionState> {
  return mutate("milestone.delete", async (s) => {
    const m = await deleteMilestone(s, id);
    return `Deleted ${m.title}.`;
  });
}
