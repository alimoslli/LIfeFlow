CREATE TABLE "jarvis_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"topic" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb,
	"priority" integer DEFAULT 50 NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"rating" integer,
	"snoozed_until" timestamp with time zone,
	"acted_at" timestamp with time zone,
	"result" jsonb,
	"slot" text,
	"pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jarvis_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jarvis_messages" ADD CONSTRAINT "jarvis_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jarvis_messages_key_uq" ON "jarvis_messages" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "jarvis_messages_user_created_idx" ON "jarvis_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "jarvis_messages" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- FORCE RLS (see 0001).
ALTER TABLE "jarvis_messages" FORCE ROW LEVEL SECURITY;