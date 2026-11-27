-- The skyling's answer checks and the reason on a thumbs-down (owner, 2026-11-27, "do 1-9"): numbers and codes on the run,
-- never words of a chat. Safe to re-run.
ALTER TABLE "jarvis_runs" ADD COLUMN IF NOT EXISTS "rating_reason" text;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD COLUMN IF NOT EXISTS "answer_checks" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD COLUMN IF NOT EXISTS "answer_fixed" boolean;
