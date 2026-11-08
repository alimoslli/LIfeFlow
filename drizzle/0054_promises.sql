-- Promises: things the user said they would do, checked back once at the due time (kept or broken only by their answer or a finished to-do).
CREATE TABLE IF NOT EXISTS "promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"task_id" uuid,
	"moves" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promises" ADD CONSTRAINT "promises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promises" ADD CONSTRAINT "promises_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promises_user_status_idx" ON "promises" USING btree ("user_id","status","due_at");--> statement-breakpoint
ALTER TABLE "promises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promises" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "owner_isolation" ON "promises" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
