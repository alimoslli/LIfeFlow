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
-- Counts only, no copy of the rows: a copy would hold u:<userId>:... keys that account deletion and the under-13 wipe can't reach.
DO $$ DECLARE c integer; o integer; BEGIN
	SELECT count(*) INTO c FROM "ai_budgets" b
		WHERE b."held" <> coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0) OR b."used" < 0;
	SELECT count(*) INTO o FROM "ai_holds" h WHERE NOT EXISTS (SELECT 1 FROM "ai_budgets" b WHERE b."key" = h."key");
	RAISE NOTICE 'ai holds repair: % counters to repair, % orphan holds to remove', c, o;
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
