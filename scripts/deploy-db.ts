/**
 * The database steps of a Vercel build: migrations, memory encryption and the demo account.
 * Only production deploys run them. A preview build (any pushed branch) shares the production database, so running
 * a branch's migrations there changed the live schema before the code shipped and could make drizzle skip a later
 * migration for good (2026-11-07). Local runs (no VERCEL_ENV) and production run them as before.
 */
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV === "preview") {
  console.log("Preview build: skipping migrations, memory encryption and demo seeding (only production deploys change the database).");
} else {
  execSync("tsx scripts/migrate.ts && tsx scripts/encrypt-memories.ts && tsx scripts/seed-demo.ts --from-env", { stdio: "inherit" });
}
