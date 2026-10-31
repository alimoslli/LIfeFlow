ALTER TABLE "users" ADD COLUMN "sms_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sms_phone_unique" UNIQUE("sms_phone");