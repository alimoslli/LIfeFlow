import "dotenv/config";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrate";

export default async function setup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
  if (url === process.env.DATABASE_URL) throw new Error("E2E database must differ from DATABASE_URL");
  await runMigrations(url);
  const pool = new Pool({ connectionString: url });
  await pool.query("TRUNCATE users, rate_limit_buckets RESTART IDENTITY CASCADE");
  await pool.end();
}
