-- The owner's decision of 2026-11-07 (later, ADR 0029 addendum): the COO runs on Opus in a new chat, with a light pass every
-- 2 hours. The new chat becomes the COO's main chat; the old Sonnet COO chat is unmapped (its scheduled tasks are paused).
-- Owner operations data with no user_id and no row-level security, like the other hq_* tables. Safe to run again.
UPDATE "hq_chats" SET "role" = NULL, "is_primary" = false, "updated_at" = now()
WHERE "id" = 'session_01Mhcz6B4zzXGnxZwJcmd4dE' AND "role" = 'assistant';
--> statement-breakpoint
UPDATE "hq_chats" SET "is_primary" = false WHERE "role" = 'assistant' AND "id" <> 'session_01Mhcz6DL7P1jhw4V8cnh4pE';
--> statement-breakpoint
INSERT INTO "hq_chats" ("id", "title", "role", "is_primary") VALUES ('session_01Mhcz6DL7P1jhw4V8cnh4pE', 'LF COO', 'assistant', true)
ON CONFLICT ("id") DO UPDATE SET "role" = 'assistant', "is_primary" = true, "updated_at" = now();
