-- How the first sign-in step was passed ("password" or "oauth"). Email codes are offered only after the password, so
-- a Google or Apple account (the same inbox) can't get past two-step sign-in on its own (security review, 2026-11-06).
ALTER TABLE "login_challenges" ADD COLUMN IF NOT EXISTS "first_factor" text;
