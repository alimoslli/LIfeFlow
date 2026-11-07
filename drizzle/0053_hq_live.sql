-- (journal `when` 1795900000000, numbered 0053: after 0052_chat_client_message_id. Safe to re-run.)
-- Live HQ (ADR 0030): each chat's hooks report what it is doing right now, in one short line, kept apart from the
-- chat's status and summary (the COO's rounds use those). Nullable, so existing chats are untouched.
ALTER TABLE "hq_chats" ADD COLUMN IF NOT EXISTS "live_state" text;
ALTER TABLE "hq_chats" ADD COLUMN IF NOT EXISTS "live_line" text;
ALTER TABLE "hq_chats" ADD COLUMN IF NOT EXISTS "live_at" timestamp with time zone;
-- Starting a desk task from HQ (ADR 0030): who last wrote the task's prompt or title ("owner" or "agent"), so the desk
-- can say "your team wrote this" truthfully; and a short hold while a start is on its way (one start per task at a time).
ALTER TABLE "hq_missions" ADD COLUMN IF NOT EXISTS "desk_prompt_by" text;
ALTER TABLE "hq_missions" ADD COLUMN IF NOT EXISTS "start_hold_until" timestamp with time zone;
