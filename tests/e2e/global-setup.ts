import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrate";

// The layout the desktop specs check (the 44 px name box, one "See what it does" link per screen size, one birthday card on
// Today) comes from Tailwind utilities. They are compiled into the build only when it was made with its own dependencies. A
// build from a worktree whose node_modules is linked to another checkout, or a stale .next, has none of them, and the specs
// then fail on missing styles that look like app bugs. Stop first and say how to fix it. Any one of these is enough.
const LAYOUT_CLASSES = [".min-h-11{", ".h-10{", ".max-lg\\:hidden{"];

function builtCss(dir: string): string {
  let css = "";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) css += builtCss(path);
    else if (entry.name.endsWith(".css")) css += readFileSync(path, "utf8");
  }
  return css;
}

function hasLayoutClasses(): boolean {
  let css = "";
  try {
    css = builtCss(".next/static");
  } catch {
    return false; // no build at all
  }
  return LAYOUT_CLASSES.some((name) => css.includes(name));
}

export default async function setup() {
  if (!hasLayoutClasses()) {
    throw new Error(
      "The build has no layout classes (Tailwind utilities such as .min-h-11 are missing from .next/static). Build this checkout with its own dependencies: rm -rf .next && npm ci && npm run build.",
    );
  }
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";
  if (url === process.env.DATABASE_URL) throw new Error("E2E database must differ from DATABASE_URL");
  await runMigrations(url);
  const pool = new Pool({ connectionString: url });
  await pool.query("TRUNCATE users, rate_limit_buckets RESTART IDENTITY CASCADE");
  await pool.end();
}
