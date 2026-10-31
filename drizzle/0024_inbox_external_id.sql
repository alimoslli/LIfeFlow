ALTER TABLE "inbox_items" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_items_external_uq" ON "inbox_items" USING btree ("user_id","external_id") WHERE external_id is not null;
