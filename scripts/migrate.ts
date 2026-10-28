/**
 * Applies pending migrations in ./drizzle, then verifies that row-level
 * security will actually be enforced for the connecting role.
 * Usage: npm run db:migrate   (uses DATABASE_URL)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    const { rows } = await pool.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    if (rows[0]?.rolsuper || rows[0]?.rolbypassrls) {
      console.warn("WARNING: the database role is a superuser or has BYPASSRLS. Row-level security will NOT be enforced. Use a dedicated non-superuser role.");
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.argv[2] === "--test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error("database url not set");
  runMigrations(url)
    .then(() => console.log("Migrations applied."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
