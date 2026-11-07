-- The CEO's desk and Goodnight (ADR 0029). A mission with a desk prompt is a task file on the CEO's desk: clicking it opens a
-- Claude Code chat with that first prompt typed in. goodnight_at is when the owner said goodnight (the office dims until
-- 5 AM in their time zone); it starts nothing. Owner-only operations data with no user_id, like the other hq_* tables, so
-- there is deliberately no row-level security.
ALTER TABLE "hq_missions" ADD COLUMN IF NOT EXISTS "desk_prompt" text;
--> statement-breakpoint
ALTER TABLE "hq_settings" ADD COLUMN IF NOT EXISTS "goodnight_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_missions_desk_idx" ON "hq_missions" USING btree ("created_at") WHERE "desk_prompt" IS NOT NULL;
