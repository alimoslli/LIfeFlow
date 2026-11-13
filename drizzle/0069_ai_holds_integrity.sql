-- A counter can't lose or gain a hold behind the functions' backs (ADR 0035). Before this, a hold could outlive its counter row
-- (the row removed on its own); when that hold later expired, ai_reserve subtracted it from a fresh counter and "held" went negative,
-- so used + held no longer told the truth. Now: a hold belongs to its counter row and goes with it, "held" is always the sum of the
-- holds, and neither "used" nor "held" can be negative. Safe to re-run (IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE).
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
