-- Gmail items must show up once: the email's Message-ID and a content key on inbox items, the item a duplicate
-- points at, and a subscription's earlier prices. Metadata-only on existing tables; row-level security is unchanged.
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "message_id" text;
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "content_sig" text;
ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "duplicate_of" uuid;
CREATE INDEX IF NOT EXISTS "inbox_items_message_idx" ON "inbox_items" ("user_id", "message_id") WHERE message_id is not null;
CREATE INDEX IF NOT EXISTS "inbox_items_content_sig_idx" ON "inbox_items" ("user_id", "content_sig") WHERE content_sig is not null;
ALTER TABLE "recurring_items" ADD COLUMN IF NOT EXISTS "price_history" jsonb DEFAULT '[]'::jsonb NOT NULL;
