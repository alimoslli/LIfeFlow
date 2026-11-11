-- The waitlist (owner, 2026-11-11; docs/backlog/2026-11-11-audit-and-waitlist.md). Safe to re-run.
-- Everyone starts "waiting", ranked by sign-up; the owner accepts people in HQ before he switches the waitlist on
-- (app_access.waitlist_on, off here), so nobody loses access when this runs. Admins and the demo account are let in by code.
CREATE SEQUENCE IF NOT EXISTS "waitlist_rank_seq";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access" text DEFAULT 'waiting' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "waitlist_rank" bigint;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
--> statement-breakpoint
-- Existing accounts: sign-up order, after anyone already ranked.
UPDATE "users" u SET "waitlist_rank" = r.n
FROM (
	SELECT "id", (SELECT coalesce(max("waitlist_rank"), 0) FROM "users") + row_number() OVER (ORDER BY "created_at", "id") AS n
	FROM "users" WHERE "waitlist_rank" IS NULL
) r
WHERE u."id" = r."id";
--> statement-breakpoint
SELECT setval('"waitlist_rank_seq"', (SELECT coalesce(max("waitlist_rank"), 0) + 1 FROM "users"), false);
--> statement-breakpoint
ALTER SEQUENCE "waitlist_rank_seq" OWNED BY "users"."waitlist_rank";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "waitlist_rank" SET DEFAULT nextval('"waitlist_rank_seq"');
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "waitlist_rank" SET NOT NULL;
--> statement-breakpoint
-- Deferrable so a referral move can swap two places in one statement.
DO $$ BEGIN
	ALTER TABLE "users" ADD CONSTRAINT "users_waitlist_rank_unique" UNIQUE ("waitlist_rank") DEFERRABLE INITIALLY IMMEDIATE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_waiting_rank_idx" ON "users" USING btree ("waitlist_rank") WHERE "access" = 'waiting';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_access" (
	"id" text PRIMARY KEY DEFAULT 'app' NOT NULL,
	"waitlist_on" boolean DEFAULT false NOT NULL,
	"launch_note" text,
	"updated_by_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_access" ("id") VALUES ('app') ON CONFLICT ("id") DO NOTHING;
