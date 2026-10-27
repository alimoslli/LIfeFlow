ALTER TABLE "memories" ADD COLUMN "basis" text DEFAULT 'stated' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "supersedes_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_supersedes_id_memories_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Memories that existed before approvals were added were saved by the user or at their explicit request.
UPDATE "memories" SET "confirmed_at" = "created_at" WHERE "confirmed_at" IS NULL;
