# Persona format

A persona is how one kind of life normally runs. It is written once and reused by many scenarios. `simulate.py` turns a persona plus a scenario into every connection a real user would have synced. Personas live in `docs/situations/personas/<id>.json`; a case folder keeps a frozen copy as `persona.json`.

Two ways to get one:

- **Generate it:** `python3 docs/situations/simulator/personas.py --count 10 --start 1 --out docs/situations/personas` makes a seeded batch, 70% students (the owner's rule) and 30% other lives. Read it, then edit what matters for your case.
- **Write it by hand**, following this page. The two worked personas are `p0001-student-who-works.json` and `p0002-night-nurse-parent.json`.

Conventions: times are local `HH:MM` in the persona's time zone, dates `YYYY-MM-DD`, days `Mon`..`Sun`. **Amounts in a persona are prices: positive integer cents** (a $30 phone bill is `3000`). The simulator writes them into transactions with the app's signs (money out negative). Only `@example.com` addresses and `555-01xx` phone numbers. No em dashes. Never a real person.

## Top level

| Field | What it holds |
|---|---|
| `id` | `p` + 4 digits + slug. Hand-written personas use `p0001` to `p0999`; generated ones `p1000` and up. |
| `summary`, `kinds`, `time_zone`, `pay` | Who this is. `kinds` come from the README list. `pay` is the focused format's `{ "type", "period" }`. |
| `student` | Students only (generated personas always have it): `level` (community college, university, grad, adult learner), `classes`, `credits`, `lms`, `formats`, `work`, `living`, `flags` (student parent, student athlete, first-generation), `study_style` (morning, afternoon, evening, late night), `pace` (steady, crammer), `aid`, `loans`, `scholarship`, `family_support`. The validator's "By kind of student" counts read it. |
| `places` | Place keys and their words: `{"home": "home", "campus": "campus", "work": "the grocery store", "out": "town"}`. Labels read as "Drive to the grocery store". |
| `commute_minutes` | `{"home-campus": 10, "campus-work": 15}`; either order works; unknown pairs take `default_commute_minutes` (20). `commute_mode`: car, transit, walk or bike. |
| `ready_minutes`, `wind_down_minutes` | Time from waking to leaving, and from getting home to sleep. Sleep is fitted around both. |
| `accounts` | See Money. |
| `income`, `bills`, `savings_plan`, `bank`, `spending` | See Money. |
| `school` | See School. |
| `work` | See Work. |
| `dependents` | Children and their school calendars (see Real life). |
| `health` | See Health. |
| `routines` | See Routines. Every persona has them, and a `sleep` routine is required. |
| `real_life` | `events`, `nights_out`, `trips`. |
| `email` | Everyday mail volume. |
| `memories` | What the person told Dev. |

## Money

**accounts**: `{ id, name, official_name, type: depository | credit, subtype: checking | savings | credit card, institution_name, mask (4 digits), opening_balance_cents }`. The opening balance is at the window's first day; `scenario.money` can pin the balance at `now` instead, and the simulator then solves the opening. Savings: `apy_bps` and `interest_description` for monthly interest. Credit cards: `credit_limit_cents`, `opening_balance_cents` is what's owed, `last_statement_cents`, `statement_day`, `due_days` (25), `apr_bps`, `autopay` (statement, minimum or fixed), `autopay_from`, `payment_description`, `payment_received`.

**income** (each has `id`, `type`, `account`, `description` as the bank shows it, optional `merchant_name` and Plaid `pfc`):

| type | Fields |
|---|---|
| `hourly` | `job` (a `work.jobs` id), `rate_cents`, `pay_period` (weekly, biweekly, semimonthly), `period_anchor` (a period's first day), `days_after_period_end` (payday is then moved back to a business day), `tax_share` (0.095 = 9.5%). Pay is computed from the punched hours: net = gross times (1 minus tax_share), overtime past 40 hours a workweek at 1.5. |
| `salary` | `annual_cents`, `pay_period` (biweekly, semimonthly, monthly), `tax_share`, optional `pay_day` (day of month, for monthly pay, pensions, Social Security). |
| `freelance` | `clients`: `{ name, first_invoice, every_days, amount_cents: [min, max], terms_days, late_chance, late_days: [min, max] }`. Invoices go to `work.json`; payments to the bank. |
| `student_aid` | `disbursements`: `{ date, amount_cents, description }` for aid refunds, loan refunds and scholarships. |
| `family` | `day_of_month`, `jitter_days`, `amount_cents: [min, max]`, `skip_chance`. Money from parents or family. |

**bills**: `{ id, name, description, merchant_name, pfc, amount_cents, day, via: ach | card, account, kind: bill | subscription | other }`. ACH bills post on the next business day; card bills authorize at night and post the next business day (pending in between). Options: `frequency` (monthly by default; weekly with `weekday`, biweekly with `anchor`, yearly with `month`, `dates` with a list of dates for tuition plans and one-off fees), `recurring: false` (textbooks: never in the recurring list), `known: true` (show it as recurring even with one charge), `varies_pct` (utilities), `month_scale` (`{"1": 2.8}` for winter heating), `email` (`{ name, address, subject, days_before }` for "your bill is ready").

**savings_plan**: `{ from, to, amount_cents, on: payday | monthly, day, skip_if_below_cents }`.

**bank**: `overdraft_fee_cents`, `low_balance_alert_cents` (emails a low-balance alert), `switch_to_card_below_cents` (everyday purchases move to the card when checking is that low; with no card, discretionary ones are skipped).

**spending** (habits): `{ id, label, pfc, per_week, amount_cents: [min, max], merchants: [{ description, merchant_name, weight, amount_cents? }] }`, optional `days`, `when` (any, class_days, work_days, free_days), `time` (window for the swipe), `account`, `card_share`, `tip_pct` (pending shows the pre-tip amount, posted adds the tip), `refund_chance`, `receipt_email`, `nutrition_kcal`, `month_scale`, `discretionary: false` (still bought when money is low).
- `routine: "<routine id>"` makes the purchases follow that routine (the weekly shop), plus `extra_per_week` small trips.
- `on_routine_miss: { routine, chance }` buys when a routine doesn't happen (no lunch at home means the cafeteria).
- Merchant strings keep provider quirks: `{n4}` becomes 4 random digits and `{A6}` 6 random capitals and digits per transaction (`"AMZN Mktp US*{A6}"`, `"UBER *TRIP {A4}"`).
- `pfc` is Plaid's detailed category (`FOOD_AND_DRINK_RESTAURANT`). The simulator maps it to the app's category and kind exactly as `integrations/plaid.ts` and `categorize.ts` do, so Zelle and Remitly are transfers with no category, as the app would store them.

## School

`{ institution, lms: canvas | blackboard | moodle | google_classroom, lms_url?, term: { name, start, end, breaks: [{start, end, label}], no_class_days: [{date, label}] }, courses: [...] }`. Put finals week in `breaks` so regular classes stop while the finals still happen.

A course: `{ code, name, instructor, instructor_email, format, credits, grade_weights, grade_pct: [low, high], announcements_per_month, meetings, assignments, items, exams }`.
- `meetings`: `{ days, start, end, location }`, plus `online: true` (live online, at home), `place` (`clinical` for clinicals), `label` (lab, clinical, live session). Every meeting in the window becomes a calendar event.
- `assignments` (cadence): `{ title: "Problem Set {n}", kind, weekday, due, points, start, end, every_weeks }`. Weeks inside a break are skipped.
- `items`: one-offs `{ title, kind, due, points }` (essays, lab reports, group project milestones).
- `exams`: in person `{ title, mode: "in_person", date, start, end }` (replaces that day's class), or online `{ title, mode: "online", opens, closes, minutes }` (a flexible window).
- Past work is submitted (sometimes late or missing) and graded a few days later; grades so far are in `school.json`.

## Work

`work.jobs`: `{ id, employer, position, place, timeline_label, source, pattern, posting, closed_on, overtime_threshold_hours, overtime_multiplier, workweek_starts, ready_minutes, cancel_rate, cancel_note, sick_rate, sent_home_rate, stay_late_rate }`.
- `pattern` weekly: `{ "type": "weekly", "slots": [{ days, start, end, break_minutes, chance, split: [["10:00","14:00"],["17:00","21:00"]] }] }`. An end before the start runs past midnight.
- `pattern` rotation: `{ "type": "rotation", anchor, cycle_days, on: [day numbers in the cycle], start, end, break_minutes, extra_chance }` (12-hour nights, 4 on 4 off).
- `posting`: `{ block_days, anchor, posted_days_ahead, time, jitter_days }`. A shift shows in `work.json` only once its schedule is posted; unposted ones are in `truth.json`.
- Worked shifts get punches that drift a few minutes, stay late or leave early; some are cancelled or called out.

## Health

`{ goals: { workouts_per_week, sleep_hours, calories_per_day }, steps: { work, class, free }, resting_heart_rate, nutrition: { enabled, log_rate, base_kcal, sd_kcal, goal_kcal } }`. Never weight: Dev never comments on a body.

## Routines

The owner's rule: people go back to their routine, so Dev's suggestions fit it. Every persona has routines, and the history follows them with real slippage (about 70 to 90% kept) so a learner can find them.

```json
{ "id": "study", "activity": "study", "label": "Study at the library", "where": "campus", "records_as": "calendar",
  "per_week": 5, "keep_rate": 0.8, "duration_minutes": [60, 100], "not_after": "13:00", "ready_minutes": 30,
  "windows": [ { "id": "before-class", "days": ["Mon","Tue","Wed","Thu","Fri"], "start": "08:05", "end": "09:50", "firmness": "firm" },
               { "id": "sat-morning", "days": ["Sat"], "start": "09:30", "end": "12:00", "firmness": "usual", "where": "home", "label": "Study at home" } ],
  "exceptions": [ { "type": "after_closing_shift", "label": "No study the morning after a closing shift" } ],
  "source_memory": "m-study" }
```

| Field | What it holds |
|---|---|
| `activity` | study, workout, call, family, care, meal, keep free, deep work, chores, groceries, sleep, appointment. |
| `windows` | Preferred days and times, each with an `id` (scenarios name it in `routine_fit`) and `firmness`: fixed, firm, usual, loose. A window can override `where` and `label`. |
| `per_week` | How often it happens; leave it out for every window-day. |
| `keep_rate` | Share kept as planned. The rest is moved (to another free time that day or the next, never into another routine's window or after `not_after`) or skipped. |
| `where` | A place key. |
| `not_after` | Never later than this. |
| `exceptions` | `after_closing_shift` (`ends_after`, default 22:00), `after_night_shift`, `on_work_days`, `school_days_only` (with `dependent`), `not_on` (`days` or `dates`). |
| `records_as` | Where the history shows it: `calendar` (one event per session), `calendar_recurring` (one recurring event, like "Call Mom"), `health_workout`, `health_sleep`, `bank` (the weekly shop), `none` (it only shows in its effects, like fewer takeout dinners). |
| `timeline` | `records` (default: past from records, future at the usual time), `routine` (known from what they told Dev, past and future, like school runs), `none` (errands never go on the timeline). |
| `cram_days` | Crammers: every window-day in the N days before an exam is planned too. |
| `source_memory` | The memory where they said it. |

**Sleep** is a routine with `activity: "sleep"`, `records_as: "health_sleep"` and windows by `day_type`: `early_next_day` (something starts before `early_before`, default 11:00), `free_next_day`, and `after_night_shift` (day sleep). `start` is bedtime, `end` is wake time; `variance_minutes` and `late_night_rate` add realistic noise. Bed is never before the last commitment plus commute and wind-down, and wake is never after the first commitment minus commute and getting ready. A night set by a commitment counts as excepted, not kept.

## Real life

- `events`: one-offs `{ id, title, start, end, state, place, source, created_days_before, timeline }` (an all-day event uses dates; `end` is the day after), or weekly with `repeat: { days, every_weeks, from, until }`. `state` is a timeline state. `timeline: false` keeps someone else's plan (a partner's trip) off this person's timeline.
- `nights_out`: `{ per_month, days, start, end, on_calendar, titles, place, spend: { habit, amount_cents } }`. Only some are on the calendar; the rest show up as a dinner on the card.
- `trips`: the scenario's `trip` change format (below).
- `dependents`: `{ id, name, school: { days, start, end, no_school: [{date | from, to, label}], calendar_source, calendar_name, calendar_added } }`. No-school days go on the calendar; care routines use `school_days_only`.

## Email and memories

- `email`: `{ address, per_day: { promotions, newsletters, social, personal, security, school_other, work_other, kid_school }, weekend_scale, senders?, subjects? }`. Everyday mail is added to the mail the other connections cause (LMS announcements, grades posted, schedules posted, pay statements, card statements, autopay notices, low-balance alerts, bill notices, receipts, booking confirmations). Metadata only: sender, subject, time, labels.
- `memories`: `{ id, content, category: preference | goal | routine | project | fact | temporary | instruction, via, told_at, expires_at?, source?: user | jarvis, status?: active | proposed, basis?: stated | inferred }`. Proposed, inferred memories are realistic; Dev must not rely on them.
