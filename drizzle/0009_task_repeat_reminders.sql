ALTER TABLE "tasks" ADD COLUMN "repeat" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "remind_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_remind_idx" ON "tasks" USING btree ("remind_at") WHERE reminded_at is null;