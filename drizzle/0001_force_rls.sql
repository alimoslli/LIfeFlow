-- The app connects as the table owner, and owners bypass RLS unless it is
-- FORCED. Force it on every table that has an owner_isolation policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'owner_isolation'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
