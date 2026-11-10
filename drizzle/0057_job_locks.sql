-- Job leases: one row per running cron or per-connection sync, so overlapping runs skip instead of doubling work.
-- Operations data only (a job name, a random holder id, an expiry): no user content, so no RLS, like the hq_ tables.
-- A crashed or killed run simply lets its lease expire. "skips" counts requests skipped while a lease was held and "live_wanted" whether one asked for live data (both reset on a claim); the holder runs once more before letting go.
CREATE TABLE IF NOT EXISTS "job_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"skips" integer DEFAULT 0 NOT NULL,
	"live_wanted" boolean DEFAULT false NOT NULL
);
ALTER TABLE "job_locks" ADD COLUMN IF NOT EXISTS "skips" integer DEFAULT 0 NOT NULL;
ALTER TABLE "job_locks" ADD COLUMN IF NOT EXISTS "live_wanted" boolean DEFAULT false NOT NULL;
