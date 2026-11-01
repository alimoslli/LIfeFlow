"use server";
import { formNum, formObject, mutate, type ActionState } from "@/server/actions";
import { createPersonalGoal, deletePersonalGoal, updatePersonalGoal } from "@/server/services/personal-goals";

const fields = (fd: FormData) => {
  const f = formObject(fd);
  return { title: f.title ?? "", target: formNum(f.target) ?? null, unit: f.unit ?? null, targetDate: f.targetDate ?? null };
};

export async function createPersonalGoalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate("goal.personal.create", async (s) => {
    const g = await createPersonalGoal(s, fields(fd));
    return `Goal added: ${g.title}.`;
  });
}

export async function updatePersonalGoalAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const progress = formNum(formObject(fd).progress);
  return mutate("goal.personal.update", async (s) => {
    await updatePersonalGoal(s, id, { ...fields(fd), ...(progress != null && { progress }) });
    return "Goal saved.";
  });
}

/** +1 on a measured goal (one more book, one more run). */
export async function stepPersonalGoalAction(id: string, progress: number): Promise<ActionState> {
  return mutate("goal.personal.progress", async (s) => {
    const g = await updatePersonalGoal(s, id, { progress });
    return g.doneAt ? `Done: ${g.title}. Nice work.` : undefined;
  });
}

export async function setPersonalGoalDoneAction(id: string, done: boolean): Promise<ActionState> {
  return mutate("goal.personal.done", async (s) => {
    const g = await updatePersonalGoal(s, id, { done });
    return done ? `Done: ${g.title}. Nice work.` : undefined;
  });
}

export async function deletePersonalGoalAction(id: string): Promise<ActionState> {
  return mutate("goal.personal.delete", async (s) => {
    const g = await deletePersonalGoal(s, id);
    return `Deleted ${g.title}.`;
  });
}
