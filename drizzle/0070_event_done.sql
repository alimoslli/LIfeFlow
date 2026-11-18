-- A one-off hand-in on the calendar (a client delivery, "... due") can be ticked done (owner, 2026-11-18). Safe to re-run.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "done_at" timestamp with time zone;
