# The situation library

Started 2026-11-05. The cases that teach and test Dev (the assistant): realistic made-up lives on one timeline, where the parts of life clash, what Dev must notice, the best fix, what it must never do, and when it must stay quiet.

- **Written by** the situation writer (`.claude/agents/situation-writer.md`), the owner, research seeds (`docs/research/`), survey stories, and every real miss.
- **Used as** the exam every version of Dev must pass (see `docs/vision.md`, section 7), and the made-up data the learned models start from (ADR 0023). Later, with the consent rules in the vision, also as training material. These cases are made up, so they never carry anyone's real data.
- **Checked by** `python3 docs/situations/validate.py` (format, references, dates, money in cents, no em dashes; for full cases also balances, pay, the timeline, volume, routines and routine fit).

## Two layers: a persona and a scenario (full cases)

The owner's requirement: the data must look like a real user's, with every connection a real user would connect, over a real time window, so Dev learns to look across all of them and find the signal buried in normal life. Writing hundreds of transactions by hand is slow and error-prone, so a deterministic simulator writes them.

1. **Persona** (`personas/<id>.json`, format in `simulator/persona.schema.md`): how one kind of life normally runs. Accounts, income, bills, spending habits with real merchant strings, school, work, health, real life, email volume, memories, and **routines**. Written once and reused by many cases. `simulator/personas.py` generates varied ones, deterministically by seed.
2. **Scenario** (`cases/<id>/scenario.json`, format in `simulator/scenario.schema.md`): one case. `now`, the window, a seed, the signal as `changes` with stable ids, the balances at `now`, and the expected output in the focused fields below (`dev_must_notice`, `best_fix`, `must_not`, `stay_quiet`, `assumptions`, `tags`) plus `routine_fit`.
3. **Simulate:** `python3 docs/situations/simulator/simulate.py docs/situations/cases/<id>/scenario.json` writes `persona.json` (a frozen copy), `connections/` (bank, calendar, school, work, health, email, memories, in the app's field names and sign rules), `timeline.json` (real life derived from them, no gaps or overlaps) and `truth.json` (what was planted; Dev never sees it). It prints the ids and numbers to quote. In `cases/`, only `scenario.json` and the frozen `persona.json` are committed (the generated data is about 1 MB per case); `validate.py` rebuilds the rest exactly, and `.gitignore` keeps it out of git. Worked examples keep every file.
4. **Validate:** `python3 docs/situations/validate.py`. Never edit generated files; change the persona or scenario and simulate again.

Typical volume over 90 days for a student who works: about 170 transactions, a night of sleep for every day, about 145 class meetings, every assignment and exam of the term, and 5 to 6 emails a day. A parent's family budget: 250 or more transactions. Worked examples: `examples/e0001-student-aunt-away-short-before-payday/` and `examples/e0002-night-nurse-school-closure/`.

### Owner's rules for the data

- **70% students (owner, 2026-11-05).** At least 70% of the people in the library, and of every batch, are students, varied: community college, university, grad and part-time adult learners; 2 to 7 classes; in person, online, hybrid and night classes, MWF and TTh; Canvas, Blackboard, Moodle and Google Classroom; labs, clinicals, group projects, online and moved exams, midterm and finals weeks; no job, campus jobs, part-time, nearly full-time, gig and two jobs; aid refunds, scholarships, loans, family support, tuition plans, textbooks and meal plans; dorms, family, roommates, commuters, far from home and international students; student parents, athletes and first-generation students; morning and evening studiers, steady and crammers. `personas.py` makes 70% students by default. The other 30% are other lives.
- **Fit the routine (owner, 2026-11-05).** People go back to their routine, not to what an app tells them. Every persona has routines (preferred days and windows and how firm they are, how often, where, "not after", exceptions), and the history follows them with real slippage (about 70 to 90% kept) so a learner can find them. When a fix places something at a time, `routine_fit` names the routine window it uses or gives a one-line reason for leaving it, and the tempting routine-breaking suggestion is in `must_not`. At least one case in five tests routine fit, including cases where the right move is to respect the routine and stay quiet.

### What validate.py checks for a full case

Files and fields match the schemas; the generated files are exactly what `simulate.py` makes; balances reconcile (opening plus posted transactions equals every running balance); pay equals hours times rate less the tax share, with overtime, on the right payday; the timeline has no gaps or overlaps and its dates, weekdays and expected flags are right; nothing is posted after `now` and pending charges are only near `now`; every id the scenario names exists; volume targets (transactions, a sleep record every night, every class meeting, every assignment, 3 to 15 emails a day); each routine kept at a plausible rate with its records in place; every timed placement fits its routine window or says why, collides with nothing, and the tempting suggestion is in `must_not`; no em dashes; only `@example.com` addresses and `555-01xx` phone numbers, and no long numbers that look like cards or accounts.

## The scenario core: the focused format

A focused case is still valid on its own (one JSON file in `cases/`), and its fields are the expected-output core of every scenario. `simulator/scenario.schema.md` shows how a focused case maps onto a persona plus a scenario.

### A focused case = one JSON file in `cases/`

```json
{
  "id": "s0001-night-nurse-school-closure",
  "title": "School closes on a day after a night shift",
  "life": {
    "summary": "Night-shift ER nurse, one kid in first grade, partner travels for work",
    "kinds": ["parent", "shift worker"],
    "time_zone": "America/Chicago",
    "pay": { "type": "hourly", "period": "biweekly" }
  },
  "now": "2026-01-14T15:00",
  "known": [
    { "id": "k1", "fact": "Partner is away until Friday", "source": "told Dev" }
  ],
  "timeline": [
    { "id": "t1", "start": "2026-01-14T19:00", "end": "2026-01-15T07:30", "state": "work", "label": "Night shift, ER", "source": "schedule photo", "expected": false }
  ],
  "attached": [
    { "id": "a1", "at": "2026-01-15T06:00", "part": "life", "kind": "message", "label": "School closed tomorrow (weather)", "amount_cents": null, "expected": false, "source": "email" }
  ],
  "money": { "available_now_cents": 41250, "savings_cents": 90000 },
  "dev_must_notice": [
    { "check": "collision", "what": "No one is home for the kid after the night shift ends", "by_when": "2026-01-14T18:00", "facts": ["t1", "a1", "k1"] }
  ],
  "best_fix": {
    "what": "Ask before the shift: swap, find care, or call in. Draft the swap message for her to send.",
    "why": "She finds out at 6 AM otherwise, mid-shift, with no options",
    "action": "ask",
    "needs_user": true
  },
  "must_not": ["contact anyone for her", "assume the partner can come back"],
  "stay_quiet": false,
  "assumptions": ["Schools announce weather closures by 6 AM"],
  "tags": ["late fact", "childcare", "night shift"]
}
```

#### Fields

| Field | What it holds |
|---|---|
| `id` | `s` + 4 digits + short slug. Unique. |
| `life` | Who this is, in one line, plus `kinds` (from the list below), time zone, and pay type and period. |
| `now` | The moment Dev is looking from. Local time, ISO without zone. |
| `known` | What Dev already knows (memories), each with its source. |
| `timeline` | **Real life, the backbone.** Each stretch: `start`, `end`, `state`, a plain `label`, `source`, `expected`. |
| `attached` | **Digital life**, attached to moments: `at`, `part`, `kind`, `label`, `amount_cents` (integer, negative = out, null if none), `expected`, `source`. |
| `money` | Balances at `now`, in cents. |
| `dev_must_notice` | Each clash or pattern: which `check`, `what` in plain words, `by_when` Dev must say it, and the ids of the `facts` that collide. Empty when `stay_quiet` is true. |
| `best_fix` | What Dev does or offers, why, the `action` type, and whether the person must decide. |
| `must_not` | What Dev must never do in this case. The red lines always apply on top. |
| `stay_quiet` | `true` when the right answer is to say nothing, or only "just so you know". |
| `assumptions` | Anything assumed for realism. |
| `tags` | Free words for searching. |

#### Allowed values

- **kinds:** `student`, `student who works`, `shift worker`, `night shift`, `parent`, `single parent`, `freelancer`, `gig worker`, `two jobs`, `salaried`, `caregiver`, `lives with family`, `roommates`, `far from home`, `new to the country`, `chronic condition`, `retired`, `between jobs`
- **state** (timeline): `asleep`, `class`, `study`, `work`, `commute`, `home`, `with people`, `away`, `day off`, `care`, `appointment`, `other`
- **part** (attached): `money`, `school`, `work`, `health`, `life`
- **check:** `afford`, `time`, `rest`, `pattern`, `drift`, `heavy stretch`, `real life squeezed`, `collision`, `late fact`
- **action:** `none`, `just so you know`, `reminder`, `move block`, `plan`, `ask`, `draft for them`

## Coverage

`COVERAGE.md` counts cases by kind of life, by kind of student, by check, and the stay-quiet, student and routine-fit shares; `validate.py` prints the live counts. Targets: at least 30 cases before Dev's brain is built; 300 across all kinds and checks before the 10-student test; about a quarter stay-quiet; **at least 70% students**; at least one in five testing routine fit.
