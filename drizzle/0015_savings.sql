CREATE TABLE "savings_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recurring_id" uuid,
	"account_id" uuid,
	"bill_name" text NOT NULL,
	"category" text NOT NULL,
	"current_monthly_cents" integer NOT NULL,
	"provider" text NOT NULL,
	"plan" text NOT NULL,
	"offer_monthly_cents" integer NOT NULL,
	"yearly_savings_cents" integer NOT NULL,
	"details" text,
	"source_url" text NOT NULL,
	"source_title" text NOT NULL,
	"status" text DEFAULT 'found' NOT NULL,
	"searched_at" timestamp with time zone NOT NULL,
	"acted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_recurring_id_recurring_items_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_opportunities" ADD CONSTRAINT "savings_opportunities_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_user_idx" ON "savings_opportunities" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "savings_opportunities" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- FORCE RLS (see 0001).
ALTER TABLE "savings_opportunities" FORCE ROW LEVEL SECURITY;