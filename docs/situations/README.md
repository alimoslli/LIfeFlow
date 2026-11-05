# The situation library

Started 2026-11-05. The cases that teach and test Dev (the assistant): realistic made-up lives on one timeline, where the parts of life clash, what Dev must notice, the best fix, what it must never do, and when it must stay quiet.

- **Written by** the situation writer (`.claude/agents/situation-writer.md`), the owner, research seeds (`docs/research/`), survey stories, and every real miss.
- **Used as** the exam every version of Dev must pass (see `docs/vision.md`, section 7). Later, with the consent rules in the vision, also as training material. These cases are made up, so they never carry anyone's real data.
- **Checked by** `python3 docs/situations/validate.py` (format, references, dates, money in cents, no em dashes).

## One case = one JSON file in `cases/`

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

### Fields

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

### Allowed values

- **kinds:** `student`, `student who works`, `shift worker`, `night shift`, `parent`, `single parent`, `freelancer`, `gig worker`, `two jobs`, `salaried`, `caregiver`, `lives with family`, `roommates`, `far from home`, `new to the country`, `chronic condition`, `retired`, `between jobs`
- **state** (timeline): `asleep`, `class`, `study`, `work`, `commute`, `home`, `with people`, `away`, `day off`, `care`, `appointment`, `other`
- **part** (attached): `money`, `school`, `work`, `health`, `life`
- **check:** `afford`, `time`, `rest`, `pattern`, `drift`, `heavy stretch`, `real life squeezed`, `collision`, `late fact`
- **action:** `none`, `just so you know`, `reminder`, `move block`, `plan`, `ask`, `draft for them`

## Coverage

`COVERAGE.md` counts cases by kind of life, check and stay-quiet share. Targets: at least 30 cases before Dev's brain is built; 300 across all kinds and checks before the 10-student test; about a quarter stay-quiet.
