# Situation library coverage

Updated by the situation writer after every batch. Run `python3 docs/situations/validate.py` for live counts.

**Cases:** 15 (s0001 to s0015, batch 1, 2026-11-05) · **Stay-quiet share:** 4 of 15 (27%) · **Targets:** 30 before Dev's brain is built, 300 before the 10-student test, about a quarter stay-quiet.

Stay-quiet cases: s0010 (pay $18.40 lower after daylight saving), s0012 (cancelled tutorial, essay already handled by her morning routine), s0013 (sick day covered by paid sick leave), s0014 (food spending spike from hosting Thanksgiving).

## By kind of life

A case can carry more than one kind.

| Kind | Cases |
|---|---|
| shift worker | 5 (s0002, s0006, s0007, s0010, s0015) |
| student who works | 4 (s0001, s0009, s0011, s0013) |
| roommates | 4 (s0003, s0004, s0009, s0012) |
| far from home | 4 (s0006, s0008, s0012, s0015) |
| lives with family | 3 (s0001, s0013, s0015) |
| salaried | 3 (s0005, s0008, s0014) |
| parent | 2 (s0002, s0014) |
| night shift | 2 (s0006, s0010) |
| new to the country | 2 (s0012, s0015) |
| single parent | 1 (s0002) |
| gig worker | 1 (s0003) |
| freelancer | 1 (s0004) |
| caregiver | 1 (s0005) |
| two jobs | 1 (s0007) |
| chronic condition | 1 (s0011) |
| student (no job) | 1 (s0012) |
| retired | 0 |
| between jobs | 0 |

## By check

Counted from `dev_must_notice` (stay-quiet cases have none).

| Check | Cases |
|---|---|
| late fact | 4 (s0001, s0004, s0011, s0015) |
| rest | 3 (s0001, s0006, s0011) |
| time | 3 (s0001, s0009, s0011) |
| afford | 3 (s0003, s0004, s0015) |
| collision | 2 (s0002, s0007) |
| pattern | 1 (s0005, over 12 weeks) |
| drift | 1 (s0008) |
| heavy stretch | 1 (s0009) |
| real life squeezed | 1 (s0007) |

## Routine fit (owner's rule, 2026-11-05)

Every case lists the person's routines in `known` with a source, places fixes inside them, and has a `must_not` for the tempting routine-breaking suggestion. Mainly about routine fit: s0001 (afternoon-only study around a moved exam), s0009 (morning-only study versus holiday opening shifts), s0011 (morning-only grading versus a moved treatment), s0012 (stay quiet: her morning routine already covers the essay).

## Edge cases

| Edge case | Cases |
|---|---|
| overtime | s0009 |
| holiday | s0002, s0014 (Thanksgiving), s0015 (Remembrance Day) |
| missed or late pay | s0004 (late client payment), s0015 (first pay issued as a cheque) |
| duplicate charge | s0003 |
| refund | none yet |
| subscription price change | s0004 |
| daylight saving | s0010 |
| split shift | s0007 |
| cancelled class | s0012 |
| trip across time zones | s0006 |
| sick day | s0013 |
| kid's school closing | s0002, s0014 |

## Time zones and pay periods

- **Time zones:** America/Chicago (2), America/New_York, America/Phoenix, America/Denver, America/Detroit, America/Indiana/Indianapolis, America/Los_Angeles, America/Toronto, America/Vancouver, America/Edmonton, Pacific/Honolulu, Europe/Berlin, Europe/London, Australia/Melbourne.
- **Pay:** hourly biweekly (5), hourly weekly (2), salary semi-monthly, salary monthly, salary biweekly, stipend monthly, per gig with weekly payouts, per project, family support monthly, two jobs with two pay periods.

## Gaps to fill next

1. **The vision's own seeds are not cases yet:** the aunt away (food and cooking), the $85 purchase before payday, the Cairo trip (five midterms before a flight), and the paycheck prediction as a range (situation 4). Write them first, as broad variants, not copies.
2. **Pay prediction cases** (vision section 4): enough history versus too little, a raise, tips, a call-out, two jobs, a schedule changed after it dropped, and a prediction that drifted past 5% so Dev stops predicting.
3. **Thin checks:** pattern, drift, heavy stretch and real life squeezed have one case each; collision has two. Aim for 3 or more each, with different lives.
4. **Stay-quiet cases for every check:** so far they cover pay, a free afternoon, a sick day and a spending spike. Missing: a rest dip the routine already handles (the gym already done today, a nap already planned), a drift that's still on track, a heavy stretch that's already planned, a squeeze the person chose.
5. **Lives not covered:** retired, between jobs, shared custody as the main story, a parent with a partner (non-quiet), a second freelancer or gig worker with one-off income on the calendar, a chronic condition in a non-student.
6. **Edge cases not covered:** a refund that looks like income, a raise, aid or a scholarship landing, textbook week, a professor moving a due date later, a subscription price change on its own (a "just so you know" case).
7. **Places and money:** no case yet in Asia, Africa or South America, or with a weekly-paid salary or tips. Research seeds still unused: the student at the 25-hour work-study cap, the commuter student whose month breaks on one surprise expense, notification overload (two things competing for the one daily push), and the Money lock on.
8. **Check-backs:** no case yet tests the follow-up a week later (a real number, or quiet when the data can't support one).
