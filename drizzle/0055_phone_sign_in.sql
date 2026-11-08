-- Sign in with a phone number (optional). login_phone is separate from sms_phone on purpose: a number proven only by an emailed code
-- must never receive or send texts for the account. phone_codes holds hashed one-time codes, like login_challenges (no row-level security: used before sign-in).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_phone" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_phone_via" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_login_phone_unique" UNIQUE ("login_phone");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phone_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "phone_codes" ADD CONSTRAINT "phone_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_codes_phone_idx" ON "phone_codes" USING btree ("phone","purpose","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_codes_user_idx" ON "phone_codes" USING btree ("user_id");
