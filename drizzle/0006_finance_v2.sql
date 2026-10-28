CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_key" text NOT NULL,
	"label" text NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" text,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"net_worth_cents" bigint NOT NULL,
	"cash_cents" bigint NOT NULL,
	"savings_cents" bigint NOT NULL,
	"investments_cents" bigint NOT NULL,
	"debt_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "apr_bps" integer;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "min_payment_cents" bigint;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "next_payment_due_date" date;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD COLUMN "purpose" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD COLUMN "monthly_plan_cents" bigint;--> statement-breakpoint
ALTER TABLE "financial_goals" ADD COLUMN "celebrated_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "expense_ratio_bps" integer;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_financial_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."financial_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_user_merchant_uq" ON "category_rules" USING btree ("user_id","merchant_key");--> statement-breakpoint
CREATE INDEX "goal_contrib_goal_idx" ON "goal_contributions" USING btree ("goal_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_user_day_uq" ON "net_worth_snapshots" USING btree ("user_id","day");--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "category_rules" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "goal_contributions" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "owner_isolation" ON "net_worth_snapshots" AS PERMISSIVE FOR ALL TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- FORCE RLS for the new user-owned tables (see 0001).
ALTER TABLE "goal_contributions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" FORCE ROW LEVEL SECURITY;
