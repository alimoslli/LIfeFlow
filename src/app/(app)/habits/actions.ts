"use server";
import { todayIn } from "@/lib/dates";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { checkHabit, createHabit, deleteHabit, updateHabit } from "@/server/services/habits";

const REVALIDATE = { revalidate: ["/habits", "/"] };

export async function createHabitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate(
    "habit.create",
    async (s) => {
      const h = await createHabit(s, {
        title: f.title ?? "",
        kind: (f.kind || "custom") as "custom",
        cadence: (f.cadence || "daily") as "daily",
        target: f.target ? Math.round(Number(f.target) * (f.kind === "save" ? 100 : 1)) : null,
      });
      return `Habit added: ${h.title}. Check it off each time you do it.`;
    },
    REVALIDATE,
  );
}

export async function checkHabitAction(id: string, done: boolean): Promise<ActionState> {
  return mutate(
    "habit.check",
    async (s, u) => {
      await checkHabit(s, id, todayIn(u.timezone), done);
      return done ? "Nice. Streak updated." : "Unchecked.";
    },
    REVALIDATE,
  );
}

export async function shrinkHabitAction(id: string, target: number): Promise<ActionState> {
  return mutate(
    "habit.adjust",
    async (s) => {
      const h = await updateHabit(s, id, { target });
      return `Made it smaller: "${h.title}" is easier for now.`;
    },
    REVALIDATE,
  );
}

export async function archiveHabitAction(id: string, active: boolean): Promise<ActionState> {
  return mutate(
    "habit.archive",
    async (s) => {
      await updateHabit(s, id, { active });
      return active ? "Habit back on." : "Habit paused.";
    },
    REVALIDATE,
  );
}

export async function deleteHabitAction(id: string): Promise<ActionState> {
  return mutate(
    "habit.delete",
    async (s) => {
      await deleteHabit(s, id);
      return "Habit deleted.";
    },
    REVALIDATE,
  );
}
