import { and, eq, inArray, sql } from "drizzle-orm";
import { conversations, messages } from "../db/schema";
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
const ids = (xs: unknown[]) => xs.filter((x): x is string => typeof x === "string");

async function gone(fn: () => Promise<unknown>) {
  try {
    await fn();
    return true;
  } catch (e) {
    // already removed by the person: nothing to take back
    if (e instanceof ServiceError && e.code === "not_found") return false;
    throw e;
  }
}

/**
 * Removes exactly what these tool calls created in this conversation (to-dos with their subtasks, calendar events),
 * once, and writes a note into the conversation so the next answer knows. Returns the note.
 */
export async function undoChatTools(scope: UserScope, conversationId: string, callIds: string[], now = new Date()) {
  const calls = [...new Set(callIds)].filter((c) => typeof c === "string" && c.length > 0 && c.length <= 200).slice(0, 20);
  if (!calls.length) throw new ServiceError("There's nothing to undo here.");
  await getConversation(scope, conversationId);
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
    );
  const done = rows.filter((r) => r.toolResult?.ok);
  if (!done.length) throw new ServiceError("There's nothing to undo here.");
  if (done.some((r) => (r.toolResult?.data as { undone?: boolean } | undefined)?.undone)) throw new ServiceError("That was already taken back.");
  if (done.some((r) => now.getTime() - r.createdAt.getTime() > UNDO_WINDOW_MS))
    throw new ServiceError("That's too old to undo here. You can change it where it is.");

  let tasksRemoved = 0;
  let eventsRemoved = 0;
  const titles: string[] = [];
  for (const r of done) {
    const created = ((r.toolResult?.data as { created?: Saved[] } | undefined)?.created ?? []).filter((c) => c && typeof c === "object");
    if (r.toolName === "create_tasks") {
      for (const t of created) {
        // subtasks first, so a cascade on the parent can't make them look already gone
        for (const id of ids((t.subtasks ?? []).map((x) => x?.id))) await gone(() => deleteTask(scope, id));
        if (typeof t.id === "string" && (await gone(() => deleteTask(scope, t.id as string)))) {
          tasksRemoved++;
          if (typeof t.title === "string") titles.push(t.title);
        }
      }
    } else {
      for (const e of created)
        if (typeof e.id === "string" && (await gone(() => deleteEvent(scope, e.id as string)))) {
          eventsRemoved++;
          if (typeof e.title === "string") titles.push(e.title);
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
  const text = !parts.length
    ? "Took that back. It was already gone, so nothing else changed."
    : titles.length === 1
      ? `Took that back: removed "${titles[0]}".`
      : `Took that back: removed ${parts.join(" and ")}.`;
  await scope.tx.insert(messages).values({ userId: scope.userId, conversationId, role: "assistant", content: text });
  await scope.tx
    .update(conversations)
    .set({ lastMessageAt: now })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, scope.userId)));
  return { text, tasksRemoved, eventsRemoved };
}
