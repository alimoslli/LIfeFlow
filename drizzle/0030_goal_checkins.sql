CREATE TABLE IF NOT EXISTS "goal_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_kind" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text NOT NULL,
	"amount_cents" integer,
	"progress" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_checkins_goal_idx" ON "goal_checkins" USING btree ("user_id","goal_id","date");--> statement-breakpoint
ALTER TABLE "goal_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goal_checkins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "owner_isolation" ON "goal_checkins" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
