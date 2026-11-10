import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { calendarEvents, conversations, messages, tasks } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { deleteEvent } from "../services/calendar";
import { ServiceError } from "../services/errors";
import { deleteTask } from "../services/tasks";
import { UNDOABLE_TOOLS } from "@/components/jarvis/suggestions";
import { getConversation } from "./conversations";

// What the chat can take back in one tap (program item 8) is UNDOABLE_TOOLS: the records a turn just created, by the
// ids its tools saved. Edits and deletions are not there: they would need what was there before, and those tools ask first.
export { UNDOABLE_TOOLS };
/** Only a recent turn: the chip sits under the last answer, and older things are changed where they are. */
export const UNDO_WINDOW_MS = 24 * 3600_000;

type Saved = { id?: unknown; title?: unknown; subtasks?: { id?: unknown }[] };
const str = (x: unknown): x is string => typeof x === "string";
/** Created and never touched since: an edit, a tick or a move sets updatedAt later than createdAt. */
const untouched = (r: { createdAt: Date; updatedAt: Date }) => r.updatedAt.getTime() - r.createdAt.getTime() < 1000;

/**
 * Removes exactly what these tool calls created in this conversation (a to-do with its subtasks, calendar events),
 * once, and writes a note into the conversation so the next answer knows. Anything the person changed since (edited,
 * ticked, moved, gave new subtasks) is kept and named in the note. Returns the note.
 */
export async function undoChatTools(scope: UserScope, conversationId: string, callIds: string[], now = new Date()) {
  const calls = [...new Set(callIds)].filter((c) => typeof c === "string" && c.length > 0 && c.length <= 200).slice(0, 20);
  if (!calls.length) throw new ServiceError("There's nothing to undo here.");
  await getConversation(scope, conversationId);
  // locked, so a second tab waits here and then finds them already taken back
  const rows = await scope.tx
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, scope.userId),
        eq(messages.conversationId, conversationId),
        eq(messages.role, "tool"),
        inArray(messages.toolCallId, calls),
        inArray(messages.toolName, [...UNDOABLE_TOOLS]),
      ),
    )
    .for("update");
  const done = rows.filter((r) => r.toolResult?.ok);
  if (!done.length) throw new ServiceError("There's nothing to undo here.");
  if (done.some((r) => (r.toolResult?.data as { undone?: boolean } | undefined)?.undone)) throw new ServiceError("That was already taken back.");
  if (done.some((r) => now.getTime() - r.createdAt.getTime() > UNDO_WINDOW_MS))
    throw new ServiceError("That's too old to undo here. You can change it where it is.");

  const removed: string[] = [];
  const kept: string[] = [];
  let tasksRemoved = 0;
  let eventsRemoved = 0;
  for (const r of done) {
    const created = ((r.toolResult?.data as { created?: Saved[] } | undefined)?.created ?? []).filter((c) => c && typeof c === "object" && str(c.id));
    if (r.toolName === "create_tasks") {
      for (const t of created) {
        const id = t.id as string;
        const subIds = (t.subtasks ?? []).map((x) => x?.id).filter(str);
        const [parent] = await scope.tx
          .select({ id: tasks.id, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt })
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.userId, scope.userId)));
        if (!parent) continue; // already gone
        const children = await scope.tx
          .select({ id: tasks.id, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt })
          .from(tasks)
          .where(and(eq(tasks.parentId, id), eq(tasks.userId, scope.userId)));
        const moved = subIds.length
          ? await scope.tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.userId, scope.userId), inArray(tasks.id, subIds), or(isNull(tasks.parentId), ne(tasks.parentId, id))))
          : [];
        // one unit: the to-do and the subtasks it was made with, all as they were made
        const same = untouched(parent) && !moved.length && children.every((c) => subIds.includes(c.id) && untouched(c));
        const title = str(t.title) ? t.title : "a to-do";
        if (!same) {
          kept.push(title);
          continue;
        }
        await deleteTask(scope, id); // its subtasks go with it
        tasksRemoved++;
        removed.push(title);
      }
    } else {
      for (const e of created) {
        const [row] = await scope.tx
          .select({ id: calendarEvents.id, createdAt: calendarEvents.createdAt, updatedAt: calendarEvents.updatedAt })
          .from(calendarEvents)
          .where(and(eq(calendarEvents.id, e.id as string), eq(calendarEvents.userId, scope.userId)));
        if (!row) continue;
        const title = str(e.title) ? e.title : "an event";
        if (!untouched(row)) {
          kept.push(title);
          continue;
        }
        await deleteEvent(scope, row.id);
        eventsRemoved++;
        removed.push(title);
      }
    }
    await scope.tx
      .update(messages)
      .set({ toolResult: sql`jsonb_set(${messages.toolResult}, '{data,undone}', 'true'::jsonb)` })
      .where(and(eq(messages.id, r.id), eq(messages.userId, scope.userId)));
  }

  const parts = [
    tasksRemoved ? `${tasksRemoved} to-do${tasksRemoved === 1 ? "" : "s"}` : null,
    eventsRemoved ? `${eventsRemoved} calendar event${eventsRemoved === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const list = (xs: string[]) => (xs.length === 1 ? `"${xs[0]}"` : `${xs.length} things`);
  const keptLine = kept.length ? ` Kept ${list(kept)} because you changed ${kept.length === 1 ? "it" : "them"} since.` : "";
  const text = removed.length
    ? `Took that back: removed ${removed.length === 1 ? `"${removed[0]}"` : parts.join(" and ")}.${keptLine}`
    : kept.length
      ? `Nothing taken back: you changed ${list(kept)} since, so ${kept.length === 1 ? "it stays" : "they stay"}.`
      : "Took that back. It was already gone, so nothing else changed.";
  await scope.tx.insert(messages).values({ userId: scope.userId, conversationId, role: "assistant", content: text });
  await scope.tx
    .update(conversations)
    .set({ lastMessageAt: now })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, scope.userId)));
  return { text, tasksRemoved, eventsRemoved };
}
