CREATE TABLE "health_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"day" date NOT NULL,
	"value" numeric NOT NULL,
	"source" text DEFAULT 'apple_health' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_samples" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_samples" ADD CONSTRAINT "health_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_tokens" ADD CONSTRAINT "health_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_samples_user_metric_day_uq" ON "health_samples" USING btree ("user_id","metric","day");--> statement-breakpoint
CREATE UNIQUE INDEX "health_tokens_hash_uq" ON "health_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "health_tokens_user_idx" ON "health_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "health_samples" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- The app connects as the table owner; FORCE makes RLS apply to it too (see 0001).
ALTER TABLE "health_samples" FORCE ROW LEVEL SECURITY;
