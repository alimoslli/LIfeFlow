-- One usage record for every paid AI use (ADR 0034). Numbers only, never content. Safe to re-run.
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"feature" text NOT NULL,
	"door" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"state" text DEFAULT 'settled' NOT NULL,
	"conversation_id" uuid,
	"run_id" uuid,
	"parent_id" uuid,
	"hold_id" uuid,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"search_calls" integer,
	"seconds" integer,
	"steps" integer,
	"usage_from" text,
	"cost_micros" bigint,
	"price_key" text,
	"counted_micros" bigint
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_feature_idx" ON "ai_usage" USING btree ("user_id","feature","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_hold_idx" ON "ai_usage" USING btree ("hold_id");--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
	CREATE POLICY "owner_isolation" ON "ai_usage" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
