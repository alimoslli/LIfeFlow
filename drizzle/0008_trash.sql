CREATE TABLE "trash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trash" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trash" ADD CONSTRAINT "trash_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trash_user_deleted_idx" ON "trash" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "trash" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- FORCE RLS (see 0001).
ALTER TABLE "trash" FORCE ROW LEVEL SECURITY;
