import { queryAsUser } from "./helpers";

/**
 * A busy student for the insight clouds (owner, 2026-11-12), written straight into the e2e database the way a connected
 * account would hold it: a class's quiz due within a day, a lab due after a late shift, a connected bank with rent due in
 * two days that checking can't cover, and two to-dos past due. Times are relative to now, so the clouds are always real.
 * `locked` also turns the Money lock on.
 */
export async function seedBusyStudent(email: string, opts: { locked?: boolean } = {}) {
  const me = `current_setting('app.user_id')::uuid`;
  await queryAsUser(email, `insert into courses (user_id, name, code) values (${me}, 'Intro to Biology', 'BIO 110')`);
  await queryAsUser(
    email,
    `insert into assignments (user_id, course_id, title, due_at, dedupe_key)
     select ${me}, c.id, 'Quiz 2', now() + interval '20 hours', md5('quiz2') from courses c where c.user_id = ${me}`,
  );
  await queryAsUser(
    email,
    `insert into assignments (user_id, course_id, title, due_at, dedupe_key)
     select ${me}, c.id, 'Lab 4', date_trunc('day', now()) + interval '2 days 23 hours 59 minutes', md5('lab4') from courses c where c.user_id = ${me}`,
  );
  await queryAsUser(email, `insert into employers (user_id, name, hourly_rate_cents) values (${me}, 'Campus Cafe', 1500)`);
  await queryAsUser(
    email,
    `insert into work_shifts (user_id, employer_id, starts_at, ends_at)
     select ${me}, e.id, date_trunc('day', now()) + interval '1 day 17 hours', date_trunc('day', now()) + interval '1 day 22 hours' from employers e where e.user_id = ${me}`,
  );
  await queryAsUser(
    email,
    `insert into financial_accounts (user_id, name, type, subtype, current_balance_cents) values (${me}, 'Checking', 'depository', 'checking', 62000)`,
  );
  await queryAsUser(
    email,
    `insert into recurring_items (user_id, name, amount_cents, frequency, kind, next_due_date) values (${me}, 'Rent', -85000, 'monthly', 'bill', current_date + 1)`,
  );
  for (const t of ["Call the bank", "Return library books"])
    await queryAsUser(email, `insert into tasks (user_id, title, due_at) values (${me}, $1, now() - interval '2 days')`, [t]);
  if (opts.locked)
    await queryAsUser(email, `update users set preferences = preferences || '{"moneyLock":{"enabled":true,"idleMinutes":5}}'::jsonb where id = ${me}`);
}
