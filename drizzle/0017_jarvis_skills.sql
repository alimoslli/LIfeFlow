ALTER TABLE "jarvis_runs" ADD COLUMN "skills" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jarvis_runs" ADD COLUMN "rating" integer;