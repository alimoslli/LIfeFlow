import { and, eq } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { UserScope } from "../db/with-user";

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid" | "conflict" | "forbidden" = "invalid",
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ServiceError(`${what} not found`, "not_found");

type OwnedTable = PgTable & { id: PgColumn; userId: PgColumn };

/**
 * Foreign-key checks in Postgres bypass RLS, so before linking a row to
 * another record we confirm that record belongs to the current user.
 */
export async function assertOwned(scope: UserScope, table: OwnedTable, id: string | null | undefined, what: string) {
  if (!id) return;
  const rows = await scope.tx
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.userId, scope.userId)));
  if (!rows.length) throw notFound(what);
}
