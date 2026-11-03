-- Life milestones: things the user has done (graduated, first job, ran a 5K). Reached goals join them on the
-- Milestones page at read time, so they aren't copied here. Per-user data: row-level secured like personal_goals.
CREATE TABLE IF NOT EXISTS "life_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'personal' NOT NULL,
	"happened_on" date,
	"precision" text DEFAULT 'day' NOT NULL,
	"note" text,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "life_milestones" ADD CONSTRAINT "life_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "life_milestones_user_idx" ON "life_milestones" USING btree ("user_id","happened_on");--> statement-breakpoint
ALTER TABLE "life_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "life_milestones" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "owner_isolation" ON "life_milestones" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
