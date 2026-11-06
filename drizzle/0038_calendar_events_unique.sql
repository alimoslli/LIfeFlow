-- Google, Outlook and Canvas events: one row per (user, source, provider id) (audit 2026-11-06, D1/D2).
-- 1. Remove the extra copies that overlapping syncs left behind. Per key the kept row is the most complete
--    one (course link, repeat rule, description, location), then the newest. Before deleting, "filed" links
--    in the inbox are pointed at the kept row. (Nothing else in the schema points at an event.)
--    Rows are rewritten per person (app.user_id), because the table is behind forced row-level security.
-- 2. Add the unique index the syncs upsert on. Null provider ids (manual events) stay distinct.
-- Safe to run twice. No new table, so the row-level security setup is unchanged.
CREATE TEMP TABLE "_cal_dups" ("dup_id" uuid PRIMARY KEY, "keep_id" uuid NOT NULL);
--> statement-breakpoint
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT "id" FROM "users" LOOP
    PERFORM set_config('app.user_id', u."id"::text, true);
    TRUNCATE "_cal_dups";

    INSERT INTO "_cal_dups" ("dup_id", "keep_id")
    SELECT "id", "keep_id" FROM (
      SELECT "id",
             first_value("id") OVER w AS "keep_id",
             row_number() OVER w AS "rn"
      FROM "calendar_events"
      WHERE "provider_event_id" IS NOT NULL
      WINDOW w AS (
        PARTITION BY "user_id", "source", "provider_event_id"
        ORDER BY ("course_id" IS NOT NULL) DESC,
                 ("recurrence" IS NOT NULL) DESC,
                 (("description" IS NOT NULL)::int + ("location" IS NOT NULL)::int) DESC,
                 "updated_at" DESC,
                 "id"
      )
    ) ranked
    WHERE "rn" > 1;

    UPDATE "inbox_items" i SET "filed" = (
      SELECT jsonb_agg(
        CASE WHEN f->>'kind' = 'event' AND m."keep_id" IS NOT NULL
          THEN jsonb_set(f, '{id}', to_jsonb(m."keep_id"::text))
          ELSE f END
        ORDER BY ord)
      FROM jsonb_array_elements(i."filed") WITH ORDINALITY AS t(f, ord)
      LEFT JOIN "_cal_dups" m ON f->>'kind' = 'event' AND m."dup_id"::text = f->>'id'
    )
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(i."filed") e
      JOIN "_cal_dups" m ON e->>'kind' = 'event' AND m."dup_id"::text = e->>'id'
    );

    DELETE FROM "calendar_events" WHERE "id" IN (SELECT "dup_id" FROM "_cal_dups");
  END LOOP;
END $$;
--> statement-breakpoint
DROP TABLE "_cal_dups";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_user_source_provider_uq" ON "calendar_events" USING btree ("user_id","source","provider_event_id");
