import { sql } from "drizzle-orm";
import { calendarEvents, type DataSource } from "../db/schema";
import type { UserScope } from "../db/with-user";

type Fields = Omit<typeof calendarEvents.$inferInsert, "id" | "userId" | "source" | "providerEventId" | "createdAt" | "updatedAt">;

/**
 * Saves a provider's event on its key (user, source, provider id): insert, or update the row that is
 * already there. One statement, so two syncs at once (or a sync racing the skyling adding the same
 * event) can never leave two copies. Returns whether a row was added.
 * `fields` are the provider's own facts and are refreshed on every sync. `initial` is only used when the row
 * is first added (e.g. the kind): what the person changed afterwards (kind, course link) is never reset.
 */
export async function upsertProviderEvent(scope: UserScope, source: DataSource, providerEventId: string, fields: Fields, initial: Partial<Fields> = {}) {
  const [row] = await scope.tx
    .insert(calendarEvents)
    .values({ ...initial, ...fields, userId: scope.userId, source, providerEventId })
    .onConflictDoUpdate({
      target: [calendarEvents.userId, calendarEvents.source, calendarEvents.providerEventId],
      set: { ...fields, updatedAt: new Date() },
    })
    .returning({ id: calendarEvents.id, inserted: sql<boolean>`(xmax = 0)` });
  return { id: row.id, added: row.inserted };
}
