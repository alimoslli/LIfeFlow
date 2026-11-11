-- Confirm your email, and friends who count (owner, 2026-11-11). Safe to re-run. Existing accounts stay unverified (null).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint
-- The 6-digit code for "Confirm your email": only a hash, one row per person. Account data like login_challenges, so no RLS.
CREATE TABLE IF NOT EXISTS "email_confirmations" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "email_confirmations" ADD CONSTRAINT "email_confirmations_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- One row per friend who confirmed their email from a link. The email hash is unique so a recycled email never credits twice.
CREATE TABLE IF NOT EXISTS "waitlist_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_id" uuid,
	"invitee_id" uuid,
	"invitee_email_hash" text NOT NULL,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "waitlist_referrals" ADD CONSTRAINT "waitlist_referrals_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "waitlist_referrals" ADD CONSTRAINT "waitlist_referrals_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_referrals_email_uniq" ON "waitlist_referrals" USING btree ("invitee_email_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_referrals_inviter_idx" ON "waitlist_referrals" USING btree ("inviter_id");
