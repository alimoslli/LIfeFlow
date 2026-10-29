"use server";
import { trashAction } from "../trash-actions";
import { formBool, formObject, mutate, type ActionState } from "@/server/actions";
import { formatDateStr } from "@/lib/dates";
import { createEvent, moveAgendaItem } from "@/server/services/calendar";

export async function createEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  const days = fd.getAll("byDay").map(Number);
  const allDay = formBool(f.allDay);
  return mutate("event.create", async (s, u) => {
    await createEvent(s, u.timezone, {
      title: f.title ?? "",
      date: f.date ?? "",
      startTime: allDay ? null : f.startTime,
      endTime: allDay ? null : f.endTime,
      allDay,
      kind: (f.kind as "personal") ?? "personal",
      location: f.location,
      description: f.description,
      courseId: f.courseId,
      recurrence:
        f.repeat === "weekly"
          ? { freq: "weekly", byDay: days.length ? days : undefined, until: f.until }
          : f.repeat === "daily"
            ? { freq: "daily", until: f.until }
            : null,
    });
  });
}

export async function deleteEventAction(id: string): Promise<ActionState> {
  return trashAction("event", id);
}

/** Drag and drop on the calendar: move an item to another day. */
export async function moveItemAction(origin: "event" | "task" | "assignment", id: string, date: string): Promise<ActionState> {
  if (!["event", "task", "assignment"].includes(origin)) return { ok: false, error: "That can't be moved.", at: Date.now() };
  return mutate("calendar.move", async (s, u) => {
    await moveAgendaItem(s, u.timezone, origin, id, date);
    return `Moved to ${formatDateStr(date, "EEE, MMM d")}.`;
  });
}
