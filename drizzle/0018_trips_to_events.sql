-- Trips become calendar events (ADR 0015). Bookings already have their own events; each trip becomes one all-day event.
INSERT INTO "calendar_events" ("user_id", "title", "description", "location", "starts_at", "ends_at", "all_day", "kind", "source")
SELECT t."user_id", t."name", t."notes", t."destination",
  (t."start_date"::timestamp AT TIME ZONE u."timezone"), ((t."end_date" + 1)::timestamp AT TIME ZONE u."timezone"), true, 'personal', 'manual'
FROM "trips" t JOIN "users" u ON u."id" = t."user_id";--> statement-breakpoint
DROP POLICY "owner_isolation" ON "trip_items" CASCADE;--> statement-breakpoint
DROP TABLE "trip_items" CASCADE;--> statement-breakpoint
DROP POLICY "owner_isolation" ON "trips" CASCADE;--> statement-breakpoint
DROP TABLE "trips" CASCADE;
