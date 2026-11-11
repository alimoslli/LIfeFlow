-- Their full name (optional, private; owner, 2026-11-11). Safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" text;
