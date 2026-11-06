-- Rows tidied while the AI was off (or not yet asked) and still unknown: the AI pass picks them up once allowed.
-- Metadata-only on an existing table; its row-level security is unchanged.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "tidy_ai_pending" boolean DEFAULT false NOT NULL;
