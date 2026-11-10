-- "Remember this phone for 30 days" (owner, 2026-11-10, ADR 0009 addendum). Only the SHA-256 of the cookie's random token is stored.
-- Read before a session exists (like sessions and login_challenges), so no RLS. Cascades with the account.
CREATE TABLE IF NOT EXISTS "remembered_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "remembered_devices" ADD CONSTRAINT "remembered_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remembered_devices_user_idx" ON "remembered_devices" USING btree ("user_id");--> statement-breakpoint
-- A session that started without a second step (a remembered phone, or Google): never enough for /admin.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "second_step_skipped" boolean DEFAULT false NOT NULL;
