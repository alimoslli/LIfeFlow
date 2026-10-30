CREATE TABLE "gmail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"snippet" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "gmail_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gmail_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_messages_user_message_uq" ON "gmail_messages" USING btree ("user_id", "gmail_message_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_user_received_idx" ON "gmail_messages" USING btree ("user_id", "received_at");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "gmail_messages" AS PERMISSIVE FOR ALL TO public USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
