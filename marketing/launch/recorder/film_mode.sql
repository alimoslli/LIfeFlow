-- Local filming database only: the demo account behaves like a normal connected account (same data, no "demo" labels).
DO $$
DECLARE uid uuid; t text;
BEGIN
  SELECT id INTO uid FROM users WHERE email = 'demo@budgetflow.local';
  UPDATE users SET account_kind = 'standard' WHERE id = uid;
  FOREACH t IN ARRAY ARRAY['assignments','calendar_events','course_materials','courses','employers','financial_accounts','goal_contributions','health_samples','holdings','life_milestones','memories','notes','paychecks','recurring_items','tasks','transactions','work_shifts'] LOOP
    EXECUTE format('UPDATE %I SET source = %L WHERE source = %L AND user_id = %L', t, 'manual', 'demo', uid);
  END LOOP;
END $$;
