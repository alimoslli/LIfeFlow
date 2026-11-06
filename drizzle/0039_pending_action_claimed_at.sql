-- When a Confirm claimed an action. A run that stays "running" past the limit is treated as lost (audit review).
-- Metadata-only on an existing table; its row-level security is unchanged.
ALTER TABLE "pending_actions" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
