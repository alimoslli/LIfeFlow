-- When a purchase happened, to the minute, when the bank says so (Plaid's authorized_datetime, else datetime). Today's
-- timeline puts a purchase with a real time at that time; one without a time is never given a made-up one
-- (docs/backlog/2026-11-12-useful-sky.md). Safe to re-run.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "authorized_at" timestamp with time zone;
