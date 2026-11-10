# Situation library coverage

Updated by the situation writer after every batch. Run `python3 docs/situations/validate.py` for live counts.

**Cases:** 40 (s0001 to s0015 batch 1, s0016 to s0020 batch 2, s0021 to s0025 batch 3, s0026 to s0030 batch 4, s0031 to s0035 batch 5, s0036 to s0040 batch 6, 2026-11-10) · **Stay-quiet share:** 10 of 40 (25%) · **Student share:** 28 of 40 (70%; batch 6 is 5 of 5) · **Routine-fit share:** 30 of 40 (75%) · **Targets:** 30 before Dev's brain is built (reached), 300 before the 10-student test, about a quarter stay-quiet, **at least 70% students** (owner, 2026-11-05), at least one in five testing routine fit.

Worked examples (full cases with generated connections, not counted above): `examples/e0001-student-aunt-away-short-before-payday` (community college student who works) and `examples/e0002-night-nurse-school-closure`.

Stay-quiet cases: s0039 (the week told again, all already saved), s0010 (pay $18.40 lower after daylight saving), s0012 (cancelled tutorial, essay already handled by her morning routine), s0013 (sick day covered by paid sick leave), s0014 (food spending spike from hosting Thanksgiving), s0023 (full week already handled), s0020, s0030 (retired, covered, index fund up but not needed).

## Batch 6 (s0036 to s0040, 2026-11-10): the new one-step week setup, "can I afford", and a receipt filed once

Built on what changed in the product on 2026-11-10. All five are students.

| Case | Person | Covers |
|---|---|---|
| s0036 | first-gen university, dorm, 6 classes (19 credits), campus tutor, Canvas, morning crammer (new persona p0008: two classes with "stats" in the name) | one message with the whole week: classes and Mon/Thu shifts already saved are reported, not re-added; "stats exam" fits two classes and "Friday" is not a date, so Dev asks; "might get a raise" never changes the $15.00 rate; heavy Monday and Friday named; study in her morning window |
| s0037 | community college nursing, roommates, part-time grocery, Moodle (p4012) | "Can I afford the $85 concert Saturday?": Available now $815.00, rent $775.10 due Sunday, $45.10 short; "only if you move $50 from savings" (floor $300 kept), same answer every time, Friday's paycheck and the card not counted |
| s0038 | university, dorm, no job, 6 classes, Moodle (p2047) | a receipt photo picked as the page loads arrives twice; filed once, matched to the $47.83 bookstore charge, no second expense, one line back |
| s0039 | community college, with family, overnight warehouse, Canvas (p1027) | stay quiet: she tells her whole week again the day before a Bio midterm; every item is already saved, so one line, nothing added, no Sunday-morning study (she sleeps after nights) |
| s0040 | university, roommates, campus tutor, evening studier, Canvas (p2040) | supervisor adds a Tue 6 to 9 PM shift after a 2 to 5 PM one, on the night Calculus homework is due; Dev moves the homework to Monday evening inside her firm window, never the 5 to 6 PM break |

Routine-fit cases: s0036, s0039, s0040. Simulator notes: the persona's classes and shifts already exist in the generated data, so "tells her whole week" is planted as a `memory` change with the message text and "already saved" is checked against the generated ids; a receipt photo is planted as a `memory` (via photo) plus the matching bank `purchase`, and the double arrival is only described in the case (the simulator has no duplicate-input change); p0008 needed smaller aid and family amounts to pin checking; personas without a savings account cannot use `money.savings_cents`. Gaps still open: a real duplicate-input change type, Google Classroom, a commuter, a student with two jobs, a first-hand follow-up a week later.

## Batch 5 (s0031 to s0035, 2026-11-08): income that isn't hourly shifts, and promises

Owner, 2026-11-08: "a flow for all", every way of earning. Four new student personas earn per project, per session, per sale or per gig (freelance income in the simulator: invoices and payouts, with calendar events for shoots, sessions and deliveries). Promises (ADR 0031): kept or broken only by the person's own answer or a finished linked to-do; charges, calendars, mail and silence never decide.

| Case | Person | Covers |
|---|---|---|
| s0031 | university, dorm, 6 classes, Moodle, afternoon steady, freelance photographer (weddings and real estate, paid per project) | promise "gallery to the client by Sunday night"; nothing in her data shows the outcome; Dev asks once at 9 PM with three answers; open invoice $572.94 not counted; editing not offered in her study window |
| s0032 | community college, with family, 5 classes, Canvas, afternoon steady, private tutor (3 families, paid per session) | stay quiet: one family skips Thursday ($42 not earned); bills covered; no income prediction, no refilling the hour |
| s0033 | part-time community college nursing, roommates, Moodle, resells thrifted clothes (eBay and Poshmark payouts) | promise "no takeout this week"; two fast-food charges in the bank do not break it; check-in never cites them; payouts never predicted |
| s0034 | university, dorm, 5 classes, Canvas, evening crammer, delivery driver (weekly QuickDrop payouts that vary) | $412.60 brake repair, $310.00 left against $1,003.18 of bills before Dec 8; tuition date moved first (draft), savings lines ($1,000 and $1,500) respected, no payout counted or predicted |
| s0035 | retired, lives alone, pension (not a student) | stay quiet: she told Dev herself the flu shot is done, so the 9 PM promise check-in is cancelled |

New personas: p0004 (photographer), p0005 (tutor), p0006 (marketplace seller), p0007 (delivery driver). Promise cases: s0031, s0033, s0035 (three of five); stay-quiet: s0032, s0035. Kinds added: freelancer students (3), student gig worker, per-session and per-sale income. Simulator notes: `freelance` payments take one description for all clients (Poshmark shows "EBAY COMM PAYOUT"); an invoice appears on its issue date even if the work isn't done; no to-do records exist, so "a linked to-do finished" can only be described, not planted; pinning checking needed smaller aid and family amounts in p0004.

Gaps still open: a paid content creator, a first-hand follow-up a week later, a promise kept by a finished linked to-do (needs a to-do connection in the simulator), "Tomorrow instead" used twice.

## Batch 4 (s0026 to s0030, 2026-11-07): the owner's short-on-money rule (vision section 15, item 14)

The order Dev follows when someone is short: move a bill a few days (no fee), savings, uninvested brokerage cash, a small sale of an investment that is up. Facts only, goals and the emergency fund respected, Dev never moves money or trades.

| Case | Person | Covers |
|---|---|---|
| s0026 | community college, with family, part-time grocery, car, afternoon steady, Canvas | $31 in checking, $48 insurance before payday: bill move has a $10 fee, savings is her emergency fund, brokerage cash is $0, so Dev lays out selling $50 of VTI (up $212, held over a year, long-term) |
| s0027 | part-time community college nursing, roommates, part-time job, Moodle, hybrid | $85 clinical fee due Tue, $25 late fee: uses the $180 of savings above her $300 emergency fund; selling VOO would be wrong (a short-term gain, held 5 months) |
| s0028 | university, dorm, care home job, evening crammer, Canvas, night class | $857.19 tuition installment $247.19 over checking: the school lets her move the date free through Dec 14, so Dev starts there; savings are $1,000 emergency fund and a $1,500 housing deposit goal; VTI untouched |
| s0029 | adult learner and single parent, nearly full-time barista, Blackboard, night owl | midterm moved to Thursday 6 PM, the night her mother works and Jonah's pickup is 5:30: drafts for her sister and the instructor's make-up, study in her late window |
| s0030 | retired, lives alone, pension, savings, VTI up $1,852 | stay quiet: a $210 dental copay is covered to the Dec 3 pension, and Dev must not pitch selling a gain she doesn't need |

**Holdings in the simulator (new):** personas can carry an `investment` account (balance is its uninvested cash) and `holdings` with `value_cents`, `cost_basis_cents`, `acquired_on` (see `persona.schema.md`); they appear in `bank.json` as `holdings`. Values are frozen at `now` (no price history, no lots, no tax calculation). Gaps: no brokerage transactions (a sale or deposit leaves no row), no short-term versus long-term flag beyond `acquired_on`, and no cash holding.

New kinds: student parent and Blackboard (s0029), first retired case (s0030), first money cases with savings, a brokerage and goals (s0026 to s0028). Gaps still open: athlete (s0018 only), gig work, a student with a brokerage cash balance (option 3 of the rule has no case), a bill that can't move and no savings (so a sale is the only way), a refund, a first-hand follow-up a week later.

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
