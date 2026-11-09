-- Sign in with Apple: keep Apple's refresh token (encrypted by the app) so deleting the account or unlinking can revoke it at Apple.
ALTER TABLE "oauth_identities" ADD COLUMN IF NOT EXISTS "encrypted_refresh_token" text;
