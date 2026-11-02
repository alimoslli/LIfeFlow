-- Feedback addressed to the owner (a copy of each Settings → Send feedback message, like the email they also get),
-- and announcements the owner shows to everyone. Neither is per-user private data, so neither is row-level secured
-- (like error_reports and admin_actions). The per-user feedback table keeps its RLS. See ADR 0022.
CREATE TABLE IF NOT EXISTS "owner_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"emailed_at" timestamp with time zone,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "owner_inbox" ADD CONSTRAINT "owner_inbox_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_inbox_created_idx" ON "owner_inbox" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"link_url" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_window_idx" ON "announcements" USING btree ("starts_at","ends_at");
