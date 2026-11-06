-- LifeFlow HQ (ADR 0024): the owner's private office. Owner-only operations data with no user_id, like admin_actions
-- and owner_inbox, so there is deliberately no row-level security here. Read and written only through services/hq.ts.
CREATE TABLE IF NOT EXISTS "hq_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"progress" text,
	"blocked_reason" text,
	"result" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_id" text,
	"branch" text,
	"source" text NOT NULL,
	"due_on" date,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"mission_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"role" text,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"mission_id" uuid,
	"approval_id" uuid,
	"session_id" text,
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text,
	"title" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"branch" text,
	"last_commit" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"summary" text,
	"needs_action" text,
	"last_checkin_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_usage_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text,
	"five_hour_pct" numeric,
	"seven_day_pct" numeric,
	"seven_day_resets_at" timestamp with time zone,
	"phase" text DEFAULT 'sample' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_email" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hq_approvals" ADD CONSTRAINT "hq_approvals_mission_id_hq_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."hq_missions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_missions_role_status_idx" ON "hq_missions" USING btree ("role","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_missions_updated_idx" ON "hq_missions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_approvals_status_idx" ON "hq_approvals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_activity_created_idx" ON "hq_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_activity_role_idx" ON "hq_activity" USING btree ("role","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_usage_created_idx" ON "hq_usage_samples" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hq_keys_hash_uq" ON "hq_keys" USING btree ("token_hash");
