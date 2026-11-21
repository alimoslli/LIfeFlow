# AI holds integrity: migration 0070 on production-shaped data (2026-11-13)

Branch `fix/ai-reserve-race`. Migration `drizzle/0070_ai_holds_integrity.sql`, journal `when` 1798900000000. It was first 0069; the plans branch took 0069 (`0069_student_verifications`, 1798800000000), so ours is 0070 and sorts after it. The 0067 functions and every limit number are untouched. Nothing here ran against production; the copy below is made-up data in a scratch schema of the test database.

## What it does to real counter rows, in order

0. `SET LOCAL lock_timeout = '5s'; LOCK TABLE "ai_budgets", "ai_holds" IN SHARE ROW EXCLUSIVE MODE;` first, then a `RAISE NOTICE` with how many counters will be repaired and how many orphan holds removed. The migration does NOT keep a copy of the changed rows: a copy would hold `u:<userId>:...` keys in a table with no `user_id`, which account deletion, the under-13 wipe and the fk-guard cannot reach (a redacted copy was ruled out too). The counts are the only record; on the copy below they read "20 counters to repair, 60 orphan holds to remove".
1. Drop holds whose counter row no longer exists (the orphans that later drove `held` negative):
   `DELETE FROM "ai_holds" h WHERE NOT EXISTS (SELECT 1 FROM "ai_budgets" b WHERE b."key" = h."key");`
2. Recompute every counter's `held` as the sum of its holds, only where it differs:
   `UPDATE "ai_budgets" b SET "held" = coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0) WHERE b."held" <> coalesce((SELECT sum(h."amount") FROM "ai_holds" h WHERE h."key" = b."key"), 0);`
3. Repair a negative `used`: `UPDATE "ai_budgets" SET "used" = 0 WHERE "used" < 0;`
4. Add the foreign key (after the orphans are gone): `ALTER TABLE "ai_holds" ADD CONSTRAINT "ai_holds_key_fk" FOREIGN KEY ("key") REFERENCES "ai_budgets"("key") ON DELETE CASCADE;`
5. Add the check (after the repairs): `ALTER TABLE "ai_budgets" ADD CONSTRAINT "ai_budgets_nonnegative" CHECK ("held" >= 0 AND "used" >= 0);`

Steps 4 and 5 are wrapped in `DO ... EXCEPTION WHEN duplicate_object THEN NULL`, so a re-run is a no-op.

## Copy of production-shaped data

6,003 counters: 2,000 users x (day msgs, month msgs, month vcalls), two company counters, one warning marker. 210 holds. Seeded problems: 60 orphan holds (40 counters removed on their own), 12 counters with `held` 3 and no holds, 5 counters with negative `held` (-2), 3 with negative `used` (-1).

| | before | after |
|---|---|---|
| counters | 6,003 | 6,003 |
| holds | 210 | 150 |
| orphan holds | 60 | 0 |
| sum of `held` | 176 | 150 |
| sum of `used` | 51,198,309 | 51,198,312 |
| negative `held` | 5 | 0 |
| negative `used` | 3 | 0 |
| counters where `held` differs from the sum of its holds | 17 | 0 |

Orphans removed: 60.

## Do any values change

Yes, only on rows that were already wrong. 17 counters change `held` (net -26): the 5 negatives go to 0, the 12 drifted ones (3 with no holds) go to 0. The 150 counters with a live hold keep `held` 1. 3 counters change `used` (net +3): -1 becomes 0. No counter is removed and no other `used` value moves. On real data, the count is however many such rows exist; clean data changes nothing but the orphan holds.

## Negative value present when the migration runs

The seeded copy had 5 negative `held` and 3 negative `used` when the migration ran. It finished without error: the repairs (steps 2 and 3) run before the CHECK (step 5), so it never sees a bad row. Afterwards an insert of a hold with no counter is refused (foreign key), and setting `held` to -1 is refused (check).

## Runs

- Fresh database: all 64 migrations in the journal, in order, applied with no failure; both constraints exist; a second run of 0070 printed no error.
- Database with 0067 and orphans (the copy above): run 1 as in the table; run 2 changed nothing (0 rows differ in `ai_budgets` and `ai_holds`; both constraints present once).

## The foreign key with ON DELETE CASCADE and existing code paths

All of them delete holds first, then the counters, so the cascade finds nothing left and changes no outcome.
- `deleteUserBudgets` (`services/ai-budget.ts`): deletes holds `u:<id>:%`, then counters. Same result. It is used by account deletion (`accounts.ts`), the owner's delete in HQ (`admin.ts`) and the under-13 lock (`onboarding.ts`). The counters have no `user_id`, so the lock's table sweep never touches them; this call is what clears them, and it still does.
- `resetLimits` (`admin.ts`): deletes holds then the day and month counters in one transaction. Same result.
- `purgeOldBudgets`: deletes counters older than 13 months with `held = 0`. A counter with `held = 0` has no holds once step 2 has run and the functions keep `held` equal to the holds, so nothing extra goes. If a hold did remain, it now goes with its counter instead of being orphaned (the bug).
- `ai-ceiling.ts`: inserts and deletes `gw:` warning markers, which never have holds. No change.
- `ai_reserve` / settle (0067, unchanged): they insert holds only after locking and creating the counter row, so the foreign key is satisfied.

## Merge note

The plans branch's 0069 is journal idx 65; ours is also idx 65 on this branch because 0068 and 0069 are not on it. When both land, this branch merges second and must renumber `idx` (ours becomes 66). `when` and the tag already sort correctly.

## Review changes (lock, record, gate)

- Lock: the migrator (`scripts/migrate.ts`, drizzle) runs a migration in one transaction, so the lock holds until the repair commits. SHARE ROW EXCLUSIVE blocks the writes `ai_reserve`, settle, release and sweep make, so no reservation can commit between reading the holds and writing `held`; a reservation that arrives waits and then sees repaired rows. Tested on the copy: the migration held open in a transaction for 4 s, a reservation started 1.5 s in waited 2.6 s until the commit, then succeeded; afterwards 0 counters differ from the sum of their holds. With another session holding a conflicting lock, the migration failed after 5 s ("canceling statement due to lock timeout") and changed nothing, so the deploy can be retried.
- Counts on the copy (after the repair table was removed): the NOTICE read "20 counters to repair, 60 orphan holds to remove" (12 drifted, 5 negative held, 3 negative used, 60 orphans). After: 0 counters differ from their holds, 150 holds, 0 orphans, no negatives, no repair table. A second run (inside a transaction) printed 0 and 0 and changed nothing. Outside a transaction (plain psql autocommit) the lock lines fail by design; the migrator always uses one.
- Gate: `reserveAi` does not catch database errors from `ai_reserve`; only `AiRefusedError` is the "limit reached" path. Can a foreign-key error happen? `ai_reserve` inserts the counter (ON CONFLICT DO NOTHING, which takes no lock on an existing row), then locks the counters FOR UPDATE, then inserts the holds, all in one transaction. A delete of the counter that commits in the gap between the insert and the lock leaves the lock finding no row, and the hold insert would then raise a foreign-key error (23503). Window: microseconds, needs an account deletion, an admin reset or a purge at that exact moment for the same key. In that case the error is not handled in `ai-gate.ts`: it travels up as an ordinary error (chat turn error, a 500 on a route that doesn't catch). Not changed, as asked; reported to the COO. No test added because the race can't be produced reliably and the gate has no handler to test.
- Order: this branch merges AFTER the plans branch (`0069_student_verifications`, when 1798800000000). Drizzle skips a migration whose `when` is not newer than the newest one applied, so 0070 (1798900000000) must not reach production before 0069. On merging, the journal `idx` becomes 66 (it is 65 here).
