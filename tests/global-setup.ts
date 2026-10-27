import "dotenv/config";
import { Pool } from "pg";
import { runMigrations } from "../scripts/migrate";

/** Migrates the test database and wipes all rows before the run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required for tests");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  await runMigrations(url);
  const pool = new Pool({ connectionString: url });
  await pool.query("TRUNCATE users, rate_limit_buckets RESTART IDENTITY CASCADE");
  await pool.end();
}
