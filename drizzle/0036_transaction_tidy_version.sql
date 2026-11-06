-- Which version of the vendor/category tidy last went over each transaction (0 = never). Existing rows start at 0,
-- so the next tidy runs reach all of them once, 600 per run. Existing table: its row-level security is unchanged.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "tidy_version" integer DEFAULT 0 NOT NULL;
