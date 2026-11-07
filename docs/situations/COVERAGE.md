# Situation library coverage

Updated by the situation writer after every batch. Run `python3 docs/situations/validate.py` for live counts.

**Cases:** 25 (s0001 to s0015 batch 1, s0016 to s0020 batch 2, s0021 to s0025 batch 3, 2026-11-07) · **Stay-quiet share:** 6 of 25 (24%) · **Student share:** 15 of 25 (60%, the last two batches are 10 of 10) · **Routine-fit share:** 17 of 25 (68%) · **Targets:** 30 before Dev's brain is built, 300 before the 10-student test, about a quarter stay-quiet, **at least 70% students** (owner, 2026-11-05), at least one in five testing routine fit.

Worked examples (full cases with generated connections, not counted above): `examples/e0001-student-aunt-away-short-before-payday` (community college student who works) and `examples/e0002-night-nurse-school-closure`.

Stay-quiet cases: s0010 (pay $18.40 lower after daylight saving), s0012 (cancelled tutorial, essay already handled by her morning routine), s0013 (sick day covered by paid sick leave), s0014 (food spending spike from hosting Thanksgiving).

## Batch 3 (s0021 to s0025, 2026-11-07): all students

| Case | Student | Covers |
|---|---|---|
| s0021 | adult learner, evening program, nearly full-time grocery job, own place, night owl crammer, Canvas | the owner's 2026-11-07 case: six 7.5 hour shifts are 42 paid hours (45 on the clock); the unpaid lunch rule is saved when told (30 min on 6 and 7.5 hour shifts, 60 min on 9); hourly pay never predicted; heavy stretch with two midterms; week check |
| s0022 | university, dorm, first-generation, campus tutor, 19 credits, morning crammer, Canvas | money on its way (Friday paycheck and a $312 refund, neither counted) against a $250 housing draft; late schedule shown as expected usual work days; move-a-bill draft |
| s0023 | university, dorm, no job, 19 credits, afternoon steady, Moodle, online midterm window | student week check, stay quiet (looks heavy, inside her routine) |
| s0024 | international university, campus info desk, evening crammer, Canvas | notification-worthy catch: two supervisor-added shifts make 22 hours against his 20 hour visa limit; draft for the supervisor |
| s0025 | university, roommates, campus tutor and clinical, evening steady, Canvas | off-track money goal said plainly ($150 behind on $500 textbooks), a way back with one tap, no guilt words |

Kinds added: adult learner (s0021), own place, international student with a work limit (s0024), student with a savings goal (s0025). Stay-quiet: s0023 (and s0020). Gaps still open: student parent, athlete (s0018 only), gig work, community college day students, Blackboard, a first-hand follow-up a week later.

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

## By kind of student

Target: at least 70% of cases are students (`student` or `student who works`, or a persona with a `student` profile); `validate.py` warns below it. Today 5 of 15 (33%), so the next batches should be almost all students. Generated personas (`simulator/personas.py`) are 70% students by default and carry a profile the validator counts.

| Kind of student | Cases |
|---|---|
| student who works | 4 (s0001, s0009, s0011, s0013) |
| student, no job | 1 (s0012) |
| community college | 2 (s0001, s0013) |
| university | 1 (s0009) |
| grad | 2 (s0011 PhD with a stipend, s0012 master's) |
| part-time adult learner | 0 |
| lives with family | 2 (s0001, s0013) |
| roommates | 2 (s0009, s0012) |
| international or far from home | 1 (s0012) |
| dorm | 0 |
| commuter | 0 |
| campus job or work-study | 1 (s0011, teaching assistant) |
| part-time job | 3 (s0001, s0009, s0013) |
| nearly full-time, gig or two jobs | 0 |
| student parent | 0 |
| student athlete | 0 |
| first-generation | 0 |
| chronic condition | 1 (s0011) |
| online, hybrid or night classes | 0 stated |
| Blackboard, Moodle or Google Classroom | 0 stated |
| crammer | 0 stated |

Gaps: adult learners, dorm and commuter students, student parents, athletes, first-generation students, gig and nearly full-time work, online and night classes, other school systems, aid and refund dates, tuition due dates, textbook week, finals week, crammers and evening studiers.

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
