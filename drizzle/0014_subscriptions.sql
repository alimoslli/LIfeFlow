ALTER TABLE "recurring_items" ADD COLUMN "usage" text;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "trial_ends_on" date;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "kept_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "cancel_help" jsonb;