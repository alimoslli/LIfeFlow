-- LifeFlow HQ marketing and controls (ADR 0025). Owner-only operations data with no user_id, like the other hq_* tables,
-- so there is deliberately no row-level security here. Read and written only through services/hq-marketing.ts.
CREATE TABLE IF NOT EXISTS "hq_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"hook" text,
	"body" text,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"published_url" text,
	"external_id" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_id" uuid,
	"session_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taken_on" date NOT NULL,
	"network" text NOT NULL,
	"metric" text NOT NULL,
	"value" numeric NOT NULL,
	"content_id" uuid,
	"content_ref" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'metricool' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hq_settings" (
	"id" text PRIMARY KEY DEFAULT 'hq' NOT NULL,
	"autonomous" boolean DEFAULT true NOT NULL,
	"rounds" jsonb DEFAULT '{"night":true,"research":true,"marketing":true}'::jsonb NOT NULL,
	"credit_budget" integer DEFAULT 0 NOT NULL,
	"updated_by_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hq_content" ADD CONSTRAINT "hq_content_approval_id_hq_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."hq_approvals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hq_metrics" ADD CONSTRAINT "hq_metrics_content_id_hq_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."hq_content"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_content_status_idx" ON "hq_content" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_content_kind_idx" ON "hq_content" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hq_metrics_reading_uq" ON "hq_metrics" USING btree ("taken_on","network","metric","content_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hq_metrics_network_idx" ON "hq_metrics" USING btree ("network","taken_on");--> statement-breakpoint
INSERT INTO "hq_settings" ("id") VALUES ('hq') ON CONFLICT DO NOTHING;
