-- Google, Outlook and Canvas events: one row per (user, source, provider id) (audit 2026-11-06, D1/D2).
-- 1. Remove the extra copies that overlapping syncs left behind. Per key the kept row is the most complete
--    one (course link, repeat rule, description, location), then the newest. Before deleting, what the dropped
--    copies knew (course, kind, notes, place) is copied into the kept row when it lacks it, and every place that
--    holds an event id is pointed at the kept row: pending assistant actions, saved chat tool records, the
--    trash, and inbox "filed" links. (No table has a foreign key to an event. Events the inbox files have no
--    provider id, so they are never among the duplicates; their links are repointed only to be safe.)
--    Rows are rewritten per person (app.user_id), because the table is behind forced row-level security.
-- 2. Add the unique index the syncs upsert on. Null provider ids (manual events) stay distinct.
-- Safe to run twice. No new table, so the row-level security setup is unchanged.
CREATE TEMP TABLE "_cal_dups" ("dup_id" uuid PRIMARY KEY, "keep_id" uuid NOT NULL);
--> statement-breakpoint
DO $$
DECLARE u record; pr record;
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

    UPDATE "calendar_events" k SET
      "course_id" = coalesce(k."course_id", x."course_id"),
      "kind" = CASE WHEN k."kind" = 'personal' THEN coalesce(x."kind", k."kind") ELSE k."kind" END,
      "description" = coalesce(k."description", x."description"),
      "location" = coalesce(k."location", x."location")
    FROM (
      -- per kept row: the first non-empty value among its dropped copies (newest first)
      SELECT m."keep_id",
             (array_agg(d."course_id" ORDER BY d."updated_at" DESC) FILTER (WHERE d."course_id" IS NOT NULL))[1] AS "course_id",
             (array_agg(d."kind" ORDER BY d."updated_at" DESC) FILTER (WHERE d."kind" <> 'personal'))[1] AS "kind",
             (array_agg(d."description" ORDER BY d."updated_at" DESC) FILTER (WHERE d."description" IS NOT NULL))[1] AS "description",
             (array_agg(d."location" ORDER BY d."updated_at" DESC) FILTER (WHERE d."location" IS NOT NULL))[1] AS "location"
      FROM "_cal_dups" m JOIN "calendar_events" d ON d."id" = m."dup_id"
      GROUP BY m."keep_id"
    ) x
    WHERE k."id" = x."keep_id";

    -- Pending assistant actions that name a dropped copy (delete_event, update_event) now name the kept row.
    UPDATE "pending_actions" p SET "args" = jsonb_set(p."args", '{id}', to_jsonb(m."keep_id"::text))
    FROM "_cal_dups" m
    WHERE p."args"->>'id' = m."dup_id"::text;

    -- Saved chat tool calls and results, and trashed items, that mention a dropped copy's id (a plain id swap
    -- inside the JSON). One dropped copy at a time, so a record naming several of them gets every one repointed.
    FOR pr IN SELECT "dup_id", "keep_id" FROM "_cal_dups" LOOP
      UPDATE "messages" SET
        "tool_args" = replace("tool_args"::text, pr."dup_id"::text, pr."keep_id"::text)::jsonb,
        "tool_result" = replace("tool_result"::text, pr."dup_id"::text, pr."keep_id"::text)::jsonb
      WHERE "tool_args"::text LIKE '%' || pr."dup_id"::text || '%' OR "tool_result"::text LIKE '%' || pr."dup_id"::text || '%';

      UPDATE "trash" SET "payload" = replace("payload"::text, pr."dup_id"::text, pr."keep_id"::text)::jsonb
      WHERE "payload"::text LIKE '%' || pr."dup_id"::text || '%';
    END LOOP;

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
  PERFORM set_config('app.user_id', '', true);
END $$;
--> statement-breakpoint
DROP TABLE "_cal_dups";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_user_source_provider_uq" ON "calendar_events" USING btree ("user_id","source","provider_event_id");
