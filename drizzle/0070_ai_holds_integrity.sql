-- A counter can't lose or gain a hold behind the functions' backs (ADR 0035). Before this, a hold could outlive its counter row
-- (the row removed on its own); when that hold later expired, ai_reserve subtracted it from a fresh counter and "held" went negative,
-- so used + held no longer told the truth. Now: a hold belongs to its counter row and goes with it, "held" is always the sum of the
-- holds, and neither "used" nor "held" can be negative. Safe to re-run (IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE).
-- Locks first (drizzle runs a migration in one transaction): no reservation can commit between reading the holds and writing "held",
-- and a stuck deploy fails after 5 seconds so it can be retried. Reservations wait for the lock and then see the repaired rows.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
LOCK TABLE "ai_budgets", "ai_holds" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- A record of what the repair changes (operations data only: counter keys, amounts and hold ids, no personal content). Kept so the
-- change can be reviewed; it can be dropped after review: DROP TABLE ai_holds_repair_0070. Not recreated on a re-run.
CREATE TABLE IF NOT EXISTS "ai_holds_repair_0070" AS
	SELECT 'counter'::text AS "what", b."key" AS "key", NULL::uuid AS "hold_id", b."used" AS "old_used", greatest(b."used", 0) AS "new_used",
		b."held" AS "old_held", coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0)::bigint AS "new_held",
		NULL::bigint AS "amount", NULL::text AS "kind", NULL::timestamptz AS "expires_at", now() AS "repaired_at"
	FROM "ai_budgets" b
	WHERE b."held" <> coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0) OR b."used" < 0
	UNION ALL
	SELECT 'orphan_hold', h."key", h."hold_id", NULL, NULL, NULL, NULL, h."amount", h."kind", h."expires_at", now()
	FROM "ai_holds" h WHERE NOT EXISTS (SELECT 1 FROM "ai_budgets" b WHERE b."key" = h."key");
--> statement-breakpoint
DO $$ DECLARE c integer; o integer; BEGIN
	SELECT count(*) FILTER (WHERE "what" = 'counter'), count(*) FILTER (WHERE "what" = 'orphan_hold') INTO c, o FROM "ai_holds_repair_0070";
	RAISE NOTICE 'ai_holds_repair_0070: % counters to repair, % orphan holds to remove (see table ai_holds_repair_0070)', c, o;
END $$;
--> statement-breakpoint
-- Existing rows first: holds with no counter row are dropped, then every counter's "held" is recomputed from its holds.
DELETE FROM "ai_holds" h WHERE NOT EXISTS (SELECT 1 FROM "ai_budgets" b WHERE b."key" = h."key");
--> statement-breakpoint
UPDATE "ai_budgets" b SET "held" = coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0)
	WHERE b."held" <> coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0);
--> statement-breakpoint
UPDATE "ai_budgets" SET "used" = 0 WHERE "used" < 0;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_holds" ADD CONSTRAINT "ai_holds_key_fk" FOREIGN KEY ("key") REFERENCES "ai_budgets"("key") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_budgets" ADD CONSTRAINT "ai_budgets_nonnegative" CHECK ("held" >= 0 AND "used" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
