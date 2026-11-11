-- Optional public nickname on the waitlist (owner, 2026-11-11, backlog step 6). Safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "waitlist_nickname" text;
