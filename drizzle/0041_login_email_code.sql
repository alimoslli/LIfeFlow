-- "Email me a code" on the two-step sign-in screen (owner, 2026-11-06). The code is stored only as a hash on the
-- short-lived sign-in challenge it belongs to, works once and expires.
ALTER TABLE "login_challenges" ADD COLUMN IF NOT EXISTS "email_code_hash" text;--> statement-breakpoint
ALTER TABLE "login_challenges" ADD COLUMN IF NOT EXISTS "email_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "login_challenges" ADD COLUMN IF NOT EXISTS "email_sends" integer DEFAULT 0 NOT NULL;
