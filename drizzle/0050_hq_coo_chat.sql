-- The owner's decisions of 2026-11-07 (ADR 0029), applied to their HQ data once:
-- 1. The COO's chat is mapped as the COO's main chat, so its round_start check-in tells HQ a round is running (its first
--    round stopped before its check-in, and only the owner maps chats in Settings, so HQ never knew which chat was the COO).
-- 2. Research works in the COO's rounds and has no chat of its own: the old night-audits chat is unmapped and its stale
--    question cleared (the owner answered it: rounds run on their schedule only).
-- Owner operations data with no user_id and no row-level security, like the other hq_* tables. Safe to run on an empty database.
UPDATE "hq_chats" SET "is_primary" = false WHERE "role" = 'assistant' AND "id" <> 'session_01Mhcz6B4zzXGnxZwJcmd4dE';
--> statement-breakpoint
INSERT INTO "hq_chats" ("id", "title", "role", "is_primary") VALUES ('session_01Mhcz6B4zzXGnxZwJcmd4dE', 'LF COO', 'assistant', true)
ON CONFLICT ("id") DO UPDATE SET "role" = 'assistant', "is_primary" = true, "title" = 'LF COO', "updated_at" = now();
--> statement-breakpoint
UPDATE "hq_chats" SET "role" = NULL, "is_primary" = false, "needs_action" = NULL, "updated_at" = now()
WHERE "id" = 'session_01Mhcz6BYyF8TLLXwBiWcWyk' AND "role" = 'researcher';
