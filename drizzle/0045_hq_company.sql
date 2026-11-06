-- LifeFlow HQ company layer (ADR 0026): what the Chief of Staff may decide, and its briefs to the owner.
-- Owner-only operations data with no user_id, like the other hq_* tables, so there is deliberately no row-level security.
ALTER TABLE "hq_settings" ADD COLUMN IF NOT EXISTS "delegations" jsonb DEFAULT '{"fixOrder":true,"researchTopics":true,"postingTimes":true}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"needs_you" integer DEFAULT 0 NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_briefs_created_idx" ON "hq_briefs" USING btree ("created_at");
