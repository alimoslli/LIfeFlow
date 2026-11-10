# Noticing grader: results

Run: 2026-11-10. 10 made-up people (7 students), 50 lives (each person re-rolled over several seeds; the first of each is quiet, nothing planted), 21 replayed days each = 1050 days, 5 looks a day.
Run time: replaying the 50 lives took 378 s (about 8 s a life); grading took 382 s. Outside network calls attempted (all refused by a guard in replay.ts): 0. The run also used OPENAI_API_KEY=sk-none and an unreachable OPENAI_BASE_URL.

## Score per rule

Caught = noticed in time. Late = noticed, but too late to plan (or only on the Money page when asked). Planted = events the grader planted; All = planted plus ones that happened naturally in the made-up life (same rule, from the data).

| Rule | Planted: caught / planted | All: caught / events | Late | Missed | False alarms | Not gradable |
|---|---|---|---|---|---|---|
| 1. Two things at the same time | 42 / 44 (95%) | 49 / 55 (89%) | 0 | 6 | 0 | 0 |
| 2. A deadline right after a long or late shift | 38 / 38 (100%) | 128 / 128 (100%) | 0 | 0 | 0 | 0 |
| 3. A bill bigger than the money before payday | 17 / 17 (100%) | 44 / 44 (100%) | 0 | 0 | 2 | 0 |
| 4a. Subscription price rise | 18 / 18 (100%) | 18 / 18 (100%) | 0 | 0 | 0 | 1 |
| 4b. Duplicate subscription | 13 / 16 (81%) | 20 / 23 (87%) | 2 | 1 | 0 | 0 |
| 5a. Unusual charge at a known merchant | 21 / 24 (88%) | 23 / 26 (88%) | 0 | 3 | 0 | 1 |
| 5b. Big one-off at a new merchant (informational) | 25 / 28 (89%) | 25 / 28 (89%) | 0 | 3 | 0 | 1 |

Price rises noticed within 3 days of the first changed charge (the ADR 0023 target): 0 of 18. Days from the first changed charge to the line: median 6, range 5 to 6.

## Quiet stretches

A quiet day has nothing real for any rule from 8 days before to 3 days after (21 before for a bill, 14 after for a price rise) (checked from the data, planted or not). Days like that: 201. Days with an urgent or warning-type line anyway: 13 (6%).
In the 10 lives where nothing was planted: 9 noisy days of 141 quiet days.

What was said on those days: 10 x Today overdraft; 3 x bill_due (marked urgent).

Examples:
- p20w0: 2026-10-22 2026-10-22 08:00 Today: Checking could go below $0 around Nov 5 if your next paycheck is late.
- p20w1: 2026-10-22 2026-10-22 08:00 Today: Checking could go below $0 around Nov 5 if your next paycheck is late.
- p22w0: 2026-10-16 2026-10-16 07:00 Hulu is due tomorrow Hey! Hulu ($9.99) is due tomorrow. You have $5,120 in check
- p22w2: 2026-10-16 2026-10-16 07:00 Hulu is due tomorrow Hey! Hulu ($9.99) is due tomorrow. You have $5,210 in check
- p23w0: 2026-11-02 2026-11-02 08:00 Today: Checking could go below $0 around Nov 16 at your usual pace.
- p23w0: 2026-11-03 2026-11-03 08:00 Today: Checking could go below $0 around Nov 13 at your usual pace.
- p23w0: 2026-11-04 2026-11-04 08:00 Today: Checking could go below $0 around Nov 18 at your usual pace.
- p23w0: 2026-11-05 2026-11-05 08:00 Today: Checking could go below $0 around Nov 19 at your usual pace.

## False alarms, by reason

- 1 x bill: pay landed before the due day and covered it
- 1 x bill: no such bill came due

Examples:
- p22w4 2026-10-31: Mint Mobile may not be covered Just so you know: Mint Mobile ($65) is due in 2 days and yo (pay landed before the due day and covered it)
- p23w4 2026-10-30: Netflix may not be covered Just so you know: Netflix ($7.99) is due today and your checkin (no such bill came due)

## Top misses

Misses and late catches, planted ones first, one per rule at a time so every rule shows. Seed = life name (person p, world w).

- **overlap** p27w1, 2026-10-21 (planted): Event "Dentist appointment" overlaps a shift on 2026-10-21 (75 min). Not noticed (Today named two other clashes first (it names two, then counts the rest)). The app said instead: 2026-10-19 08:00 Today: COMM 147 Public Speaking overlaps Work · Student Union Info Desk Wednesday at 1: / 2026-10-19 08:00 Today: Tomorrow is packed: 9 hours already booked. / 2026-10-19 08:00 Today: BUS 201 quiz is Oct 30: Quiz 5.
- **duplicate** p19w2, 2026-10-16 (planted): Two music subscriptions at once: Spotify + Tidal. Late: only on the Money page when asked, never said on its own. The app said instead: 
- **unusual** p18w3, 2026-10-31 (planted): $75.00 at "ARAMARK UNIV DINING 8269", usually about $4.01 (18.7x). Not noticed. The app said instead: 2026-10-31 08:00 Today: Quiz 4 and 1 other item are past due. / 2026-10-31 08:00 Today: PSY 117 quiz is tomorrow: Quiz 9. / 2026-10-31 08:00 Today: Tomorrow is packed: 8 hours already booked.
- **oneoff** p19w4, 2026-10-31 (planted): $7258.44 at "APARTMENT DAMAGE DEPOSIT", a merchant never used before. Not noticed. The app said instead: 2026-10-31 07:00 Parkside Apartments may not be covered Just so you know: Parkside Apartments ($1 / 2026-10-31 08:00 Today: Checking could go below $0 around tomorrow at your usual pace. / 2026-10-31 08:00 Today: You've spent 35% less than this time last month. Nice.
- **overlap** p27w2, 2026-10-29 (planted): Class "BUS 201 Introduction to Business" overlaps a shift on 2026-10-29 (30 min). Not noticed (Today named two other clashes first (it names two, then counts the rest)). The app said instead: 2026-10-27 07:00 Quiz 5 vs. your shift Just so you know: Quiz 5 is due Friday and you work Thursd / 2026-10-27 08:00 Today: Homework 8 was due 11 days ago. / 2026-10-27 08:00 Today: Work · Student Union Info Desk overlaps PHIL 141 Ethics Thursday at 12:30 PM.
- **duplicate** p19w3, 2026-10-21 (planted): Two music subscriptions at once: Spotify + Apple Music. Late: only on the Money page when asked, never said on its own. The app said instead: 
- **unusual** p22w2, 2026-10-30 (planted): $75.00 at "SQ *CORNER CAFE", usually about $1.82 (41.2x). Not noticed. The app said instead: 2026-10-30 07:00 Mint Mobile is due in 3 days Quick one: Mint Mobile ($65) is due in 3 days. You  / 2026-10-30 08:00 Today: You're spending 15% more than this time last month. / 2026-10-31 08:00 Today: You've spent 31% less than this time last month. Nice.
- **oneoff** p20w2, 2026-10-30 (planted): $2145.83 at "APARTMENT DAMAGE DEPOSIT", a merchant never used before. Not noticed. The app said instead: 2026-10-30 07:00 Zelle to Mom may not be covered Just so you know: Zelle to Mom ($107) is due in  / 2026-10-30 08:00 Today: Work · Graduate school overlaps Advising meeting today at 2:45 PM. / 2026-10-30 08:00 Today: Checking could go below $0 around today at your usual pace.
- **overlap** p27w0, 2026-10-22 (natural): Event "Group project meeting, CS 149" overlaps a shift on 2026-10-22 (75 min). Not noticed (Today named two other clashes first (it names two, then counts the rest)). The app said instead: 2026-10-20 08:00 Today: Quiz 3 was due yesterday. / 2026-10-20 08:00 Today: Work · Pinecrest Mall Outfitters overlaps Group project meeting, COMM 147 tomorr / 2026-10-20 08:00 Today: Tomorrow is packed: 8 hours already booked.
- **duplicate** p25w4, 2026-10-16 (planted): Two video subscriptions at once: Netflix + Hulu + Max. Not noticed. The app said instead: 
- **unusual** p24w3, 2026-10-23 (planted): $75.00 at "APPLE.COM/BILL", usually about $5.53 (13.6x). Not noticed. The app said instead: 2026-10-23 08:00 Today: SOC 356 quiz is today: Quiz 8. / 2026-10-23 20:30 Today: ECON 283 quiz is Sunday: Quiz 8. / 2026-10-24 07:00 AMC Theatres is due in 3 days Hey! AMC Theatres ($41.06) is due in 3 days. You h
- **oneoff** p23w3, 2026-10-30 (planted): $1091.16 at "APARTMENT DAMAGE DEPOSIT", a merchant never used before. Not noticed. The app said instead: 2026-10-30 07:00 Zelle to Roommate may not be covered Heads up: Zelle to Roommate ($784) is due i / 2026-10-30 08:00 Today: Discussion post 2 was due 51 days ago. / 2026-10-30 08:00 Today: Checking could go below $0 around Sunday at your usual pace.

Why overlaps were missed (6): 6 x Today named two other clashes first (it names two, then counts the rest).

## Per person

| Person | Kind | Lives | Events graded | Caught | Missed | False alarms |
|---|---|---|---|---|---|---|
| 18: Part-time adult learner, 3 classes (9 credits), works nearly full time | student | 5 | 45 | 44 | 1 | 0 |
| 19: Salaried office worker, hybrid schedule | other | 5 | 22 | 19 | 1 | 0 |
| 20: Part-time grad student, 2 classes (6 credits), teaching assistantship, | student | 5 | 15 | 14 | 1 | 0 |
| 21: Full-time community college student, 4 classes (12 credits), part-time | student | 5 | 33 | 33 | 0 | 0 |
| 22: Part-time pharmacy technician who cares for her mom | other | 5 | 20 | 19 | 1 | 1 |
| 23: Full-time university student, 6 classes (19 credits), no job, lives wi | student | 5 | 21 | 20 | 1 | 1 |
| 24: Full-time university student, 6 classes (19 credits), no job, lives in | student | 5 | 12 | 11 | 1 | 0 |
| 25: Full-time grad student, 4 classes (12 credits), teaching assistantship | student | 5 | 28 | 27 | 1 | 0 |
| 26: Delivery gig worker with variable weekly pay | other | 5 | 31 | 31 | 0 | 0 |
| 27: Full-time community college student, 5 classes (15 credits), two jobs, | student | 5 | 95 | 89 | 6 | 0 |
