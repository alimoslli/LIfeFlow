-- (journal `when` 1795100000000: after any migration a branch preview might already have applied.)
-- A send made by the app carries its own id, so a retry after a dropped connection can never run the turn twice.
-- Metadata-only on an existing table; row-level security is unchanged. NULLs (older messages) never collide.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "messages_client_message_uq" ON "messages" ("user_id", "client_message_id");
