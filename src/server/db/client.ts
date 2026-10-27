import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __bfPool?: Pool; __bfDb?: Database };

/** One pool per process (survives Next.js dev hot reloads). */
export function getDb(): Database {
  if (!globalForDb.__bfDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__bfPool = new Pool({ connectionString: url, max: 10 });
    globalForDb.__bfDb = drizzle(globalForDb.__bfPool, { schema });
  }
  return globalForDb.__bfDb;
}

export async function closeDb() {
  await globalForDb.__bfPool?.end();
  globalForDb.__bfPool = undefined;
  globalForDb.__bfDb = undefined;
}
