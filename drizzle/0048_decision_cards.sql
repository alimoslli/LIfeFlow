-- Decision cards (ADR 0028): a request carries its why, exact changes, next steps, effort, risk, recommendation and
-- pictures, and versions of one ask share a thread. Old rows keep every new column null. hq_files holds the pictures.
-- Owner-only operations data with no user_id, like the other hq_* tables, so there is deliberately no row-level security.
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "why" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "changes" jsonb;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "on_yes" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "on_no" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "effort" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "risk" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "recommendation" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "previews" jsonb;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "thread_id" uuid;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "changed_since_note" text;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "superseded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "hq_approvals" ADD COLUMN IF NOT EXISTS "build_mission_id" uuid REFERENCES "hq_missions"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_approvals_thread_idx" ON "hq_approvals" USING btree ("thread_id","version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
