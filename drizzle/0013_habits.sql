CREATE TABLE "habit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"day" date NOT NULL,
	"done" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"target" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checks_day_uq" ON "habit_checks" USING btree ("habit_id","day");--> statement-breakpoint
CREATE INDEX "habits_user_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "habit_checks" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "habits" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- FORCE RLS (see 0001).
ALTER TABLE "habits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habit_checks" FORCE ROW LEVEL SECURITY;