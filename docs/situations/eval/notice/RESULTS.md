# Noticing grader: results

Run: 2026-11-10. 10 made-up people (7 students), 50 lives (each person re-rolled over several seeds; the first of each is quiet, nothing planted), 21 replayed days each = 1050 days, 5 looks a day.
Run time: replaying the 50 lives took 378 s (about 8 s a life); grading took 4 s. Outside network calls attempted (all refused by a guard in replay.ts): 0. The run also used OPENAI_API_KEY=sk-none and an unreachable OPENAI_BASE_URL.

## Score per rule

Caught = noticed in time. Late = noticed, but too late to plan (or only on the Money page when asked). Planted = events the grader planted; All = planted plus ones that happened naturally in the made-up life (same rule, from the data).

| Rule | Planted: caught / planted | All: caught / events | Late | Missed | False alarms | Not gradable |
|---|---|---|---|---|---|---|
| 1. Two things at the same time | 39 / 44 (89%) | 42 / 55 (76%) | 0 | 13 | 0 | 0 |
| 2. A deadline right after a long or late shift | 37 / 38 (97%) | 126 / 128 (98%) | 0 | 2 | 49 | 0 |
| 3. A bill bigger than the money before payday | 9 / 17 (53%) | 33 / 44 (75%) | 0 | 11 | 7 | 0 |
| 4a. Subscription price rise | 18 / 18 (100%) | 18 / 18 (100%) | 0 | 0 | 0 | 1 |
| 4b. Duplicate subscription | 0 / 16 (0%) | 0 / 23 (0%) | 22 | 1 | 0 | 0 |
| 5a. Unusual charge at a known merchant | 21 / 24 (88%) | 23 / 26 (88%) | 0 | 3 | 0 | 1 |
| 5b. Big one-off at a new merchant (informational) | 0 / 28 (0%) | 0 / 28 (0%) | 0 | 28 | 0 | 1 |

Price rises noticed within 3 days of the first changed charge (the ADR 0023 target): 0 of 18. Days from the first changed charge to the line: median 6, range 5 to 6.

## Quiet stretches

A quiet day has nothing real for any rule from 8 days before to 3 days after (21 before for a bill, 14 after for a price rise) (checked from the data, planted or not). Days like that: 201. Days with an urgent or warning-type line anyway: 12 (6%).
In the 10 lives where nothing was planted: 7 noisy days of 141 quiet days.

What was said on those days: 7 x Today overdraft; 4 x deadline_conflict; 3 x bill_due (marked urgent).

Examples:
- p20w0: 2026-10-22 2026-10-22 08:00 Today: Checking could go below $0 around Nov 5 if your next paycheck is late.
- p20w1: 2026-10-22 2026-10-22 08:00 Today: Checking could go below $0 around Nov 5 if your next paycheck is late.
- p22w0: 2026-10-16 2026-10-16 07:00 Hulu is due tomorrow Hey! Hulu ($9.99) is due tomorrow. You have $5,157 in check
- p22w2: 2026-10-16 2026-10-16 07:00 Hulu is due tomorrow Hey! Hulu ($9.99) is due tomorrow. You have $5,246 in check
- p23w0: 2026-11-05 2026-11-05 08:00 Today: Checking could go below $0 around Nov 19 at your usual pace.
- p24w0: 2026-10-16 2026-10-16 07:00 Spotify is due tomorrow Quick one: Spotify ($5.99) is due tomorrow. You have $4,
- p25w0: 2026-10-20 2026-10-20 08:00 Today: Checking could go below $0 around Nov 1 if your next paycheck is late.
- p25w0: 2026-10-22 2026-10-22 07:00 Discussion post 10 vs. your shift Just so you know: Discussion post 10 is due Th

## False alarms, by reason

- 22 x deadline: a 4-hour shift ending 17:00 (under 7 hours and before 21:00)
- 17 x deadline: a 6-hour shift ending 18:00 (under 7 hours and before 21:00)
- 10 x deadline: a 5-hour shift ending 15:00 (under 7 hours and before 21:00)
- 6 x bill: the bill is charged to the credit card, not taken from checking
- 1 x bill: no such bill came due

Examples:
- p21w0 2026-10-16: Quiz 6 vs. your shift Just so you know: Quiz 6 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w0 2026-10-19: Quiz 7 vs. your shift Just so you know: Quiz 7 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w0 2026-10-26: Quiz 8 vs. your shift Just so you know: Quiz 8 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w0 2026-11-03: Quiz 9 vs. your shift Just so you know: Quiz 9 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w1 2026-10-16: Quiz 6 vs. your shift Just so you know: Quiz 6 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w1 2026-10-19: Quiz 7 vs. your shift Just so you know: Quiz 7 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w1 2026-10-26: Quiz 8 vs. your shift Just so you know: Quiz 8 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))
- p21w1 2026-11-02: Quiz 9 vs. your shift Just so you know: Quiz 9 is due Monday and you work Sunday at 12 PM. (a 6-hour shift ending 18:00 (under 7 hours and before 21:00))

## Top misses

Misses and late catches, planted ones first, one per rule at a time so every rule shows. Seed = life name (person p, world w).

- **overlap** p27w1, 2026-10-21 (planted): Event "Dentist appointment" overlaps a shift on 2026-10-21 (90 min). Not noticed (Today showed a different clash instead (it shows one at a time)). The app said instead: 2026-10-19 08:00 Today: COMM 147 Public Speaking overlaps Work · Student Union Info Desk Wednesday at 1: / 2026-10-19 08:00 Today: Tomorrow is packed: 9 hours already booked. / 2026-10-19 08:00 Today: BUS 201 quiz is Oct 30: Quiz 5.
- **deadline** p20w4, 2026-10-25 (planted): "Homework 8" is due 2026-10-26; a long shift ends 1:00 the day before (2026-10-25). Not noticed. The app said instead: 2026-10-23 08:00 Today: Work · Graduate school overlaps PSY 622 Midterm today at 2:00 PM. / 2026-10-23 08:00 Today: PSY 622 exam is today. / 2026-10-23 20:30 Today: MBA 514 quiz is Oct 30: Quiz 5.
- **bill** p19w4, 2026-11-02 (planted): Rent share $1060.83 due 2026-11-02, only $674.30 in checking the day before, no pay landing first. Not noticed (the shortfall came from charges still pending, which the app's cash figure leaves out). The app said instead: 2026-10-30 07:00 Netflix is due in 3 days Quick one: Netflix ($7.99) is due in 3 days. You have $ / 2026-10-30 20:00 duplicate_subscription / 2026-10-31 08:00 Today: You've spent 35% less than this time last month. Nice.
- **duplicate** p18w3, 2026-10-17 (planted): Two video subscriptions at once: Netflix + Hulu. Late: only on the Money page when asked, never said on its own. The app said instead: 
- **unusual** p18w3, 2026-10-31 (planted): $75.00 at "ARAMARK UNIV DINING 8269", usually about $4.01 (18.7x). Not noticed. The app said instead: 2026-10-31 08:00 Today: Quiz 4 and 1 other item are past due. / 2026-10-31 08:00 Today: PSY 117 quiz is tomorrow: Quiz 9. / 2026-10-31 08:00 Today: Tomorrow is packed: 8 hours already booked.
- **oneoff** p19w2, 2026-11-03 (planted): $366.56 at "DELTA AIR LINES", a merchant never used before. Not noticed. The app said instead: 2026-11-03 08:00 Today: Tomorrow is packed: 9 hours already booked. / 2026-11-03 20:00 duplicate_subscription / 2026-11-04 08:00 Today: You're spending 34% more than this time last month.
- **overlap** p27w1, 2026-10-21 (planted): Event "Dentist appointment" overlaps a shift on 2026-10-21 (75 min). Not noticed (Today showed a different clash instead (it shows one at a time)). The app said instead: 2026-10-19 08:00 Today: COMM 147 Public Speaking overlaps Work · Student Union Info Desk Wednesday at 1: / 2026-10-19 08:00 Today: Tomorrow is packed: 9 hours already booked. / 2026-10-19 08:00 Today: BUS 201 quiz is Oct 30: Quiz 5.
- **deadline** p18w3, 2026-11-01 (natural): "Midterm" is due 2026-11-02; a long shift ends 22:00 the day before (2026-11-01). Not noticed. The app said instead: 2026-10-30 08:00 Today: Quiz 4 and 1 other item are past due. / 2026-10-30 08:00 Today: ECON 127 quiz is today: Quiz 5. / 2026-10-30 12:00 Activities is running high Just so you know: You spent $23.62 on activities this
- **bill** p20w2, 2026-11-02 (planted): Share for the household $106.58 due 2026-11-02, only $0.00 in checking the day before, no pay landing first. Not noticed (the shortfall came from charges still pending, which the app's cash figure leaves out). The app said instead: 2026-10-30 08:00 Today: Work · Graduate school overlaps Advising meeting today at 2:45 PM. / 2026-10-30 08:00 Today: MBA 514 quiz is Nov 13: Quiz 6. / 2026-11-01 07:00 October in review Quick one: You kept -10% of what came in during October. Want 
- **duplicate** p19w1, 2026-10-16 (planted): Two video subscriptions at once: Netflix + Hulu + Max. Late: only on the Money page when asked, never said on its own. The app said instead: 
- **unusual** p22w2, 2026-10-30 (planted): $75.00 at "SQ *CORNER CAFE", usually about $1.82 (41.2x). Not noticed. The app said instead: 2026-10-30 07:00 Mint Mobile is due in 3 days Quick one: Mint Mobile ($65) is due in 3 days. You  / 2026-10-30 08:00 Today: You're spending 15% more than this time last month. / 2026-10-31 08:00 Today: You've spent 31% less than this time last month. Nice.
- **oneoff** p19w4, 2026-10-31 (planted): $7258.44 at "APARTMENT DAMAGE DEPOSIT", a merchant never used before. Not noticed. The app said instead: 2026-10-31 08:00 Today: You've spent 35% less than this time last month. Nice. / 2026-10-31 12:00 Hulu went up Heads up: Hulu went from $9.99 to $10.99, $12 more a year. Keep it, / 2026-10-31 12:00 New recurring charge: Hulu Hey! Hulu charged you about $10.99 4 times, on a regu
- **overlap** p27w2, 2026-10-29 (planted): Class "ART 135 Drawing I" overlaps a shift on 2026-10-29 (75 min). Not noticed (Today showed a different clash instead (it shows one at a time)). The app said instead: 2026-10-27 08:00 Today: Homework 8 was due 11 days ago. / 2026-10-27 08:00 Today: Work · Student Union Info Desk overlaps PHIL 141 Ethics Thursday at 12:30 PM. / 2026-10-27 08:00 Today: You're spending 41% more than this time last month.
- **bill** p21w3, 2026-11-02 (planted): Rent share $789.50 due 2026-11-02, only $380.49 in checking the day before, no pay landing first. Not noticed (the shortfall came from charges still pending, which the app's cash figure leaves out). The app said instead: 2026-10-30 08:00 Today: ENG 217 quiz is today: Quiz 5. / 2026-10-30 08:00 Today: You've spent 15% less than this time last month. Nice. / 2026-10-30 20:30 Today: HIST 126 quiz is Monday: Quiz 8.

Why bills were missed (11): 11 x the shortfall came from charges still pending, which the app's cash figure leaves out.

Why overlaps were missed (13): 13 x Today showed a different clash instead (it shows one at a time).

## Per person

| Person | Kind | Lives | Events graded | Caught | Missed | False alarms |
|---|---|---|---|---|---|---|
| 18: Part-time adult learner, 3 classes (9 credits), works nearly full time | student | 5 | 45 | 42 | 2 | 0 |
| 19: Salaried office worker, hybrid schedule | other | 5 | 22 | 12 | 3 | 0 |
| 20: Part-time grad student, 2 classes (6 credits), teaching assistantship, | student | 5 | 15 | 12 | 3 | 0 |
| 21: Full-time community college student, 4 classes (12 credits), part-time | student | 5 | 33 | 29 | 4 | 17 |
| 22: Part-time pharmacy technician who cares for her mom | other | 5 | 20 | 7 | 10 | 0 |
| 23: Full-time university student, 6 classes (19 credits), no job, lives wi | student | 5 | 21 | 13 | 7 | 0 |
| 24: Full-time university student, 6 classes (19 credits), no job, lives in | student | 5 | 12 | 3 | 6 | 0 |
| 25: Full-time grad student, 4 classes (12 credits), teaching assistantship | student | 5 | 28 | 21 | 3 | 22 |
| 26: Delivery gig worker with variable weekly pay | other | 5 | 31 | 25 | 6 | 7 |
| 27: Full-time community college student, 5 classes (15 credits), two jobs, | student | 5 | 95 | 78 | 14 | 10 |
