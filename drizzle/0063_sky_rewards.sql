-- The skyling's cloud (owner, 2026-11-11): one row per star or sun earned; each thing counts once (user_id, key). Safe to re-run.
CREATE TABLE IF NOT EXISTS "sky_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sky_rewards" ADD CONSTRAINT "sky_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sky_rewards_user_key_uq" ON "sky_rewards" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sky_rewards_user_kind_idx" ON "sky_rewards" USING btree ("user_id","kind","earned_at");--> statement-breakpoint
ALTER TABLE "sky_rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sky_rewards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "owner_isolation" ON "sky_rewards" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
