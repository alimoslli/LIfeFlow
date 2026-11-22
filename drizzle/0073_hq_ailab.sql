-- The owner's decision of 2026-11-21: a seventh HQ room, "AI Lab", for the own-model and GPU work. Its chat ("GPU rent work") is
-- mapped as the room's main chat so HQ knows it. hq_chats.role is plain text, so no schema change. Owner operations data (no
-- user_id, no row-level security). Safe to re-run and safe on an empty database.
INSERT INTO "hq_chats" ("id", "title", "role", "is_primary") VALUES ('session_01Mhcz6BvfTxKDtCuFGxTS8C', 'GPU rent work', 'ailab', true)
ON CONFLICT ("id") DO UPDATE SET "role" = 'ailab', "is_primary" = true, "updated_at" = now();
