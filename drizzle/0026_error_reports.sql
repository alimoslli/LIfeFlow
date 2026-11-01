CREATE TABLE IF NOT EXISTS "error_reports" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"route" text NOT NULL,
	"message" text NOT NULL,
	"digest" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
