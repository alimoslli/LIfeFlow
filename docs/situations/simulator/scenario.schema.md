# Scenario format

A scenario is one case: the moment Dev looks from, the signal planted into a persona's normal life, and what Dev must do. It lives at `docs/situations/cases/<id>/scenario.json` (worked examples: `docs/situations/examples/<id>/`). `simulate.py` writes the rest of the folder:

```
cases/s0042-some-case/
  scenario.json      you write this
  persona.json       frozen copy of the persona used (written by simulate.py; never edit)
  connections/       bank, calendar, school, work, health, email, memories (written; never edit)
  timeline.json      real life derived from the connections (written)
  truth.json         what was planted: routine log, unposted shifts, change effects (written; Dev never sees it)
```

Run `python3 docs/situations/simulator/simulate.py docs/situations/cases/<id>/scenario.json`, read its summary (it prints the ids and numbers you will quote), write the expected output, then `python3 docs/situations/validate.py`. The validator re-runs the simulator, so a hand edit to a generated file fails.

## Fields

| Field | What it holds |
|---|---|
| `id`, `title` | `s` + 4 digits + slug (worked examples use `e`). The folder has the same name. |
| `persona` | A persona id in `docs/situations/personas/`. |
| `persona_overrides` | Optional small changes for this case, merged into the persona (objects merge; lists of objects merge by `id`; `"remove": true` drops one). |
| `now` | Local time Dev looks from, `YYYY-MM-DDTHH:MM`. |
| `history_days`, `future_days` | Window around `now` (defaults 90 and 60). Transactions, sleep, workouts and email stop at `now`; calendar, classes, posted shifts and the timeline run to the end. |
| `seed` | Same seed, same files. Change it to get a different but equally normal life. |
| `money` | Balances at `now`, as in the focused format: `available_now_cents` (checking available, pending charges included) and `savings_cents`. The simulator solves the opening balances so these come out exactly. |
| `known` | Optional, focused style: `{ id, fact, source, at? }`, added to memories. |
| `changes` | The signal, each with a stable `id` (see below). |
| `dev_must_notice`, `best_fix`, `must_not`, `stay_quiet`, `assumptions`, `tags` | The focused format's expected output, unchanged. A notice may have an `id`. `best_fix` may be one fix or a list (each with `for`, the notice id). A fix may have `send_at` and `placements`. |
| `routine_fit` | Required when a fix places anything at a time; see below. |

## Changes (the signal)

Amounts here are transactions, so they use the app's signs: money out is negative. Each change's records carry its id (or `<id>.<part>`), so `dev_must_notice.facts` can name them. Changes timed after `now` stay invisible (they are in `truth.json` only).

| type | Fields | What appears |
|---|---|---|
| `purchase` | `at`, `account`, `description`, `merchant_name`, `amount_cents` (negative), `pfc`, `pending`, `post_lag_days` | One transaction `<id>`. |
| `refund` | `of` (a transaction id) or `description`, `at`, `amount_cents` (positive) | Transaction `<id>`. |
| `duplicate_charge` | `at`, `account`, `description`, `merchant_name`, `amount_cents`, `pfc`, `minutes_apart`, `refund_at` | `<id>.first`, `<id>` and maybe `<id>.refund`. |
| `price_change` | `bill`, `from`, `amount_cents`, `notice_at`, `notice_subject` | First charge at the new price is `<id>`; the notice email is `<id>.email`. |
| `bill_add` | A persona bill plus `from` | First charge is `<id>`. |
| `late_paycheck` | `income`, `pay_date` (the scheduled one), `delay_days` | The paycheck lands late (`work.json` keeps `scheduled_pay_date`). |
| `shift_add` | `job`, `start`, `end`, `break_minutes`, `posted_at`, `notes` | Shift `<id>`. |
| `shift_cancel` | `job`, `date`, `reason`, `at` | That day's shift is cancelled. |
| `schedule_posted_late` | `job`, `covers_from`, `posted_at` | That block posts late; its post is `<id>`. |
| `sick_day` | `date` | Shifts that day are called out; routines skip. |
| `exam_move` | `course`, `exam`, `date`, `start`, `end` (or `opens`, `closes`), `announced_at`, `title`, `announcement` | The exam moves once announced; announcement `<id>.announcement` and its email. |
| `class_cancel` | `course`, `date`, `announced_at`, `title` | That meeting disappears; announcement `<id>`. |
| `assignment_add` | `course`, `title`, `kind`, `due`, `points`, `added_at` | Assignment `<id>`. |
| `routine_suspend` | `routines`, `from`, `until`, `label` | Those routines stop (an aunt away means no lunch at home). Behaviour only: name the memory or transactions that show it, never this id. |
| `habit_change` | `habit`, `from`, `until`, `per_week`, `add_per_week`, `amount_scale` | Spending changes. Behaviour only, as above. |
| `memory` | `content`, `category`, `via`, `told_at`, `expires_at` | Memory `<id>`. |
| `calendar_event` | `title`, `start`, `end` (dates for all day), `state`, `place`, `source`, `timeline`, `created_at` | Event `<id>`. |
| `trip` | `destination`, `title`, `booked_at`, `depart`, `arrive_local`, `destination_time_zone`, `return_depart_local`, `return`, `from`, `purchase: { account, fund_from, description, merchant_name, amount_cents, pfc }`, `email_sender` | Flights `<id>` and `<id>.return` (each end in its own time zone), purchase `<id>.purchase`, email `<id>.email`, and an away stretch. |
| `email` | `at`, `sender_type`, `sender_name`, `from_address`, `subject` | Email `<id>`. |

`simulate.py` prints each change's records and, for behaviour changes, the measured effect ("cafeteria: $5.44 a week before, $20.46 during") so the notice quotes real numbers.

## Generated ids you can name in facts

| Record | Id |
|---|---|
| Accounts, recurring bills | `acc-checking`, `rec-<bill id>` |
| Transactions | `tx-<authorized date>-<habit or bill id>` (`-2` for a second one), paychecks `tx-<pay date>-pay-<job>` |
| Paychecks, shifts, schedule posts | `pay-<job>-<scheduled payday>`, `shift-<job>-<date>`, `post-<job>-<block start>` |
| Classes, exams, assignments, announcements | `class-<course>-<date>`, `exam-<course>-<title>`, `asg-<course>-<title>`, `ann-<course>-<nn>` |
| Calendar | persona and change ids; a recurring event's day is `<id>@<date>`; study sessions `study-<date>` |
| Health | `sleep-<wake date>`, `wk-<date>`, daily values `hs-<metric>-<day>`, nutrition `nu-<day>` |
| Email, memories, timeline | `em-<date>-<nn>`, the memory ids, `tl-<YYYYMMDDTHHMM>` |

## routine_fit

People go back to their routine. When `best_fix` places or moves something at a time, say which routine window it uses; if it breaks one on purpose, give the reason in one line the person would accept. List the tempting suggestion that would break a routine, and put it in `must_not` too.

```json
"routine_fit": {
  "placements": [
    { "placement": "pl-bio-2", "routine": "study", "window": "before-class", "fits": true },
    { "placement": "pl-prep", "routine": null, "fits": true, "note": "No routine for cooking; after her Sunday shop" },
    { "placement": "pl-review", "routine": "study", "window": null, "fits": false, "reason": "Only free morning before the exam" }
  ],
  "tempting": [
    { "suggestion": "put study blocks in her free weekday evenings", "routine": "study", "why_wrong": "she studies mornings before class", "facts": ["m-study"] }
  ]
}
```

A placement is `{ id, activity, label, start, end }` inside a fix. The validator checks that each timed placement has a `routine_fit` entry; that a fitting one sits inside the named window on a day it covers and before `not_after`; that one with `routine: null` really has no routine for its activity; that it collides with no class, work, care, appointment, sleep, trip or time with people on the timeline and no kept-free window unless it gives a reason; that it never adds a workout on a day one is already done; and that every tempting suggestion is also in `must_not`. Stay-quiet routine cases are valid too: no placements, a tempting suggestion, `stay_quiet: true`.

## From a focused case

A focused case (one JSON file) maps onto a persona plus a scenario without changing its expected-output fields:

| Focused field | Becomes |
|---|---|
| `life` | The persona's `summary`, `kinds`, `time_zone`, `pay` (pick a library persona or write one) |
| `now`, `money` | The same fields in the scenario |
| `known` | Persona memories (lasting facts) or `memory` changes / `known` (case facts) |
| `timeline` items with `expected: false` | `shift_add`, `calendar_event`, `trip`, `sick_day` changes; the normal stretches come from the persona |
| `attached` items with `expected: false` | `purchase`, `price_change`, `email`, `exam_move`, `assignment_add` changes; the rest is the persona's normal life |
| `dev_must_notice`, `best_fix`, `must_not`, `stay_quiet`, `assumptions`, `tags` | Unchanged; facts now name change ids and generated ids |
