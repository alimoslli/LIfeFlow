import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";

/**
 * Every table with a foreign key to users(id) (other than users itself), found from the database, with the columns that point
 * at it and whether it has a user_id column. The guards for the under-13 sweep and for row-level security start from this, not
 * from a column name, so a table that points at a user by another name (account_id, inviter_id, ...) can't slip past.
 */
export async function tablesPointingAtUsers(db: Database): Promise<{ name: string; columns: string[]; hasUserId: boolean }[]> {
  const { rows } = await db.execute<{ name: string; columns: string[]; has_user_id: boolean }>(sql`
    select c.conrelid::regclass::text as name,
           array_agg(distinct a.attname::text) as columns,
           exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = c.conrelid::regclass::text and ic.column_name = 'user_id') as has_user_id
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.users'::regclass and c.conrelid <> 'public.users'::regclass
      and c.connamespace = 'public'::regnamespace
    group by c.conrelid
    order by 1`);
  return rows.map((r) => ({ name: r.name, columns: r.columns, hasUserId: r.has_user_id }));
}

export type FkTable = Awaited<ReturnType<typeof tablesPointingAtUsers>>[number];

/** The tables a guard still has to decide on: they point at a user by a name other than user_id and aren't in `decided`. */
export const undecidedTables = (tables: FkTable[], decided: (name: string) => boolean) =>
  tables.filter((t) => !t.hasUserId && !decided(t.name)).map((t) => t.name);
