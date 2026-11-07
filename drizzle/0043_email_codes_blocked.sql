-- After a password reset, email sign-in codes stay off until the person signs in once with their authenticator, a
-- backup code or a passkey, so control of the inbox alone can never get past two-step sign-in (security review, 2026-11-06).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_codes_blocked_at" timestamp with time zone;
