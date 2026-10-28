"use server";
import { z } from "zod";
import { mutate, type ActionState } from "@/server/actions";
import type { TrashKind } from "@/server/db/schema";
import { deleteForever, moveToTrash, restoreFromTrash } from "@/server/services/trash";

const KINDS = ["task", "note", "event", "assignment", "shift", "transaction", "goal", "budget", "course", "project"] as const satisfies TrashKind[];
const NOUN: Record<TrashKind, string> = {
  task: "To-do",
  note: "Note",
  event: "Event",
  assignment: "Assignment",
  shift: "Shift",
  transaction: "Transaction",
  goal: "Goal",
  budget: "Budget",
  course: "Class",
  project: "Project",
};

/** The one delete used across the app: moves to the trash and offers Undo. */
export async function trashAction(kind: TrashKind, id: string): Promise<ActionState> {
  const k = z.enum(KINDS).parse(kind);
  const uuid = z.string().uuid().parse(id);
  return mutate(`${k}.delete`, async (s) => {
    const t = await moveToTrash(s, k, uuid);
    return { message: `${NOUN[k]} "${t.label}" moved to trash.`, undo: t.trashId };
  });
}

export async function restoreAction(trashId: string): Promise<ActionState> {
  const id = z.string().uuid().parse(trashId);
  return mutate("trash.restore", async (s) => {
    const r = await restoreFromTrash(s, id);
    return `Restored "${r.label}".`;
  });
}

export async function deleteForeverAction(trashId: string): Promise<ActionState> {
  const id = z.string().uuid().parse(trashId);
  return mutate("trash.delete_forever", async (s) => {
    await deleteForever(s, [id]);
    return "Deleted permanently.";
  });
}
