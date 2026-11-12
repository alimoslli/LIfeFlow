-- Counters and holds for AI allowances and spending ceilings (ADR 0035). Operations data: keys, counts and
-- micro-dollar amounts only, no user content and no row per message, so no RLS (like rate_limit_buckets and job_locks).
-- Per-person counter keys start "u:<user id>:" and are removed with the account. Safe to re-run (IF NOT EXISTS, CREATE OR REPLACE).
CREATE TABLE IF NOT EXISTS "ai_budgets" (
	"key" text PRIMARY KEY NOT NULL,
	"used" bigint DEFAULT 0 NOT NULL,
	"held" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_holds" (
	"hold_id" uuid NOT NULL,
	"key" text NOT NULL,
	"amount" bigint NOT NULL,
	"kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_holds_hold_id_key_pk" PRIMARY KEY("hold_id","key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_holds_key_idx" ON "ai_holds" USING btree ("key","expires_at");--> statement-breakpoint
-- Sets aside the amounts for one piece of work, in ONE statement, or changes nothing.
-- Locks the counter rows in key order (so two requests can't deadlock), lets expired holds on those keys go (their estimate then counts
-- as used, cost unknown), and refuses when any key would pass its limit (a null limit only counts). Returns null when reserved,
-- otherwise the key that would have gone over.
CREATE OR REPLACE FUNCTION ai_reserve(p_hold uuid, p_keys text[], p_kinds text[], p_amounts bigint[], p_limits bigint[], p_ttl_seconds integer)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
	n integer := coalesce(array_length(p_keys, 1), 0);
	i integer;
	have bigint;
BEGIN
	IF n = 0 THEN RETURN NULL; END IF;
	INSERT INTO ai_budgets (key) SELECT unnest(p_keys) ON CONFLICT (key) DO NOTHING;
	PERFORM 1 FROM ai_budgets WHERE key = ANY (p_keys) ORDER BY key FOR UPDATE;
	WITH gone AS (DELETE FROM ai_holds WHERE key = ANY (p_keys) AND expires_at < now() RETURNING key, amount),
	     per AS (SELECT key, sum(amount) AS amt FROM gone GROUP BY key)
	UPDATE ai_budgets b SET held = b.held - per.amt, used = b.used + per.amt, updated_at = now() FROM per WHERE b.key = per.key;
	FOR i IN 1..n LOOP
		IF p_limits[i] IS NOT NULL THEN
			SELECT used + held INTO have FROM ai_budgets WHERE key = p_keys[i];
			IF have + p_amounts[i] > p_limits[i] THEN RETURN p_keys[i]; END IF;
		END IF;
	END LOOP;
	UPDATE ai_budgets b SET held = b.held + t.amt, updated_at = now() FROM unnest(p_keys, p_amounts) AS t(key, amt) WHERE b.key = t.key;
	INSERT INTO ai_holds (hold_id, key, amount, kind, expires_at)
		SELECT p_hold, t.key, t.amt, t.kind, now() + make_interval(secs => p_ttl_seconds) FROM unnest(p_keys, p_amounts, p_kinds) AS t(key, amt, kind);
	RETURN NULL;
END $fn$;
--> statement-breakpoint
-- Settles a hold: the set-aside amount leaves "held" and what really happened is added to "used" (money keys: the measured cost, or
-- the estimate when unknown; time keys: the measured seconds, else the reserved ones; counts: the reserved amount). Works once: a repeat, or a
-- hold that already expired and was counted, changes nothing and returns false.
CREATE OR REPLACE FUNCTION ai_settle(p_hold uuid, p_micros bigint, p_seconds bigint)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE changed integer;
BEGIN
	PERFORM 1 FROM ai_budgets WHERE key IN (SELECT key FROM ai_holds WHERE hold_id = p_hold) ORDER BY key FOR UPDATE;
	WITH gone AS (DELETE FROM ai_holds WHERE hold_id = p_hold RETURNING key, amount, kind),
	     actual AS (
		SELECT key, amount, CASE WHEN kind = 'micros' THEN coalesce(p_micros, amount) WHEN kind = 'seconds' THEN coalesce(p_seconds, amount) ELSE amount END AS used_now FROM gone
	     )
	UPDATE ai_budgets b SET held = b.held - actual.amount, used = b.used + actual.used_now, updated_at = now() FROM actual WHERE b.key = actual.key;
	GET DIAGNOSTICS changed = ROW_COUNT;
	RETURN changed > 0;
END $fn$;
--> statement-breakpoint
-- Gives a hold back without counting it (nothing was spent: the provider refused before doing any work).
CREATE OR REPLACE FUNCTION ai_release(p_hold uuid)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE changed integer;
BEGIN
	PERFORM 1 FROM ai_budgets WHERE key IN (SELECT key FROM ai_holds WHERE hold_id = p_hold) ORDER BY key FOR UPDATE;
	WITH gone AS (DELETE FROM ai_holds WHERE hold_id = p_hold RETURNING key, amount)
	UPDATE ai_budgets b SET held = b.held - gone.amount, updated_at = now() FROM gone WHERE b.key = gone.key;
	GET DIAGNOSTICS changed = ROW_COUNT;
	RETURN changed > 0;
END $fn$;
--> statement-breakpoint
-- Counts every hold that expired at least a minute ago as used (the daily clean-up), so an unused key can't keep a stale hold.
CREATE OR REPLACE FUNCTION ai_sweep()
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE changed integer;
BEGIN
	PERFORM 1 FROM ai_budgets WHERE key IN (SELECT key FROM ai_holds WHERE expires_at < now() - interval '1 minute') ORDER BY key FOR UPDATE;
	WITH gone AS (DELETE FROM ai_holds WHERE expires_at < now() - interval '1 minute' RETURNING key, amount),
	     per AS (SELECT key, sum(amount) AS amt FROM gone GROUP BY key)
	UPDATE ai_budgets b SET held = b.held - per.amt, used = b.used + per.amt, updated_at = now() FROM per WHERE b.key = per.key;
	GET DIAGNOSTICS changed = ROW_COUNT;
	RETURN changed;
END $fn$;
