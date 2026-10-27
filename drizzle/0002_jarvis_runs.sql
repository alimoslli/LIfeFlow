CREATE TABLE "jarvis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"provider" text NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"outcome" text NOT NULL,
	"error_kind" text,
	"latency_ms" integer NOT NULL,
	"first_token_ms" integer,
	"steps" integer NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"tool_errors" integer DEFAULT 0 NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"tool_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"cost_micros" bigint,
	"memory_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jarvis_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD CONSTRAINT "jarvis_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD CONSTRAINT "jarvis_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD CONSTRAINT "jarvis_runs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jarvis_runs_user_created_idx" ON "jarvis_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "jarvis_runs_conversation_idx" ON "jarvis_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "jarvis_runs" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- The app connects as the table owner; FORCE makes RLS apply to it too (see 0001).
ALTER TABLE "jarvis_runs" FORCE ROW LEVEL SECURITY;
