# The noticing grader

Measures how well LifeFlow's own noticing code (the proactive detectors, Today's lines, the subscription report) catches what matters in a person's life, over broad made-up lives. Written 2026-11-10 after the owner's direction: few people, very different from each other, each re-rolled over several seeds, and grade general rules, not scripted answers.

**No AI is called.** A guard in `replay.ts` replaces `fetch` so any outside call is refused and counted (the count is printed in `RESULTS.md` and must be 0). Every person has AI off (so the web-search and model paths stay off), tidy runs with `llm: null`, and the run is done with `OPENAI_API_KEY=sk-none OPENAI_BASE_URL=http://127.0.0.1:9/v1` so a stray model call fails instead of billing. The grader changes no product code.

## How to run

```bash
unset OPENAI_API_KEY NODE_USE_ENV_PROXY
export OPENAI_API_KEY=sk-none OPENAI_BASE_URL=http://127.0.0.1:9/v1
export DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_test_b   # a test database, migrated: npx drizzle-kit migrate
export NODE_OPTIONS=--conditions=react-server                                                 # some services import server-only
service postgresql start                                                                      # if it is down

python3 docs/situations/eval/notice/gen.py /tmp/grader-people                 # 10 people x 5 lives; deterministic; not committed
npx tsx docs/situations/eval/notice/score.ts /tmp/grader-people               # replay + grade; saved replays in /tmp/grader-out; writes docs/situations/eval/notice/RESULTS.md
npx tsx docs/situations/eval/notice/score.ts /tmp/grader-people --grade-only  # re-grade saved replays, no database
npx tsx docs/situations/eval/notice/score.ts /tmp/grader-people --only p18w1  # one life
npx tsx docs/situations/eval/notice/rules.selftest.ts                         # the rules on a tiny hand-made life
```

Full run: about 7 minutes for 50 lives (about 9 s a life). `RESULTS.md` in this folder is the last run.

## The people

`gen.py` takes `personas.mix(10, 18)`: ten personas, exactly 7 students and 3 other lives, all different (adult learner with a nearly full-time job, grad TA, two-job community-college student, no-job dorm student, hybrid office worker, pharmacy tech who cares for a parent, gig worker, retired teacher, and more; four time zones). Each person is run as 5 lives (world seeds). A life is the same person with a different normal life (simulator seed) and a different random mix of planted events. **Life 0 of every person is quiet: nothing is planted.** The other four get 3 to 5 plants from the menu below, each with random parameters.

Planting is two-pass: the person's normal life is simulated first, then events are planted on top of what really exists in it (a shift on top of a real class; an assignment due the morning after a real late shift; a big charge just before a real bill), with random hours, minutes, lead times and amounts. Things the app could not know in time (a shift posted the same morning) are marked "not gradable" and not counted either way.

Planted: shift on a class, event on a shift, event on a class, exam moved onto a shift, assignment after a late shift, late shift before a deadline, a big charge that leaves less than the next bill, a subscription price rise, a second streaming service, an unusual charge at a usual merchant, a big one-off at a new merchant.

## The replay

For each life, the last 21 days (Oct 16 to Nov 5, 2026; "now" is Nov 5 at 6 PM) are replayed. Data arrives when the app would have learned it: a shift when it was posted, a calendar event when it was created, a bank line when it was authorized (pending until its posting date), an assignment when it was added, an exam's new time when the move was announced, work as done when the simulator says it was handed in. The bank connection is a synced Plaid item (the app treats a feed as current to its last sync). Five looks a day: the three scheduled slots (morning 7:00, midday 12:00, evening 8:00 PM, through `runProactive`, the same code the scheduler runs) and two times a person might open Today (8:00 AM and 8:30 PM, through `getBriefing`). The event triggers (`transaction`, `shift`) are not replayed: they run only after a manual add, not after a bank or schedule sync. Each saved message is back-dated to its look so the daily cap counts as it would. The subscription report is read each evening (it is a page you open, not something said).

## The rules

Defined from the data (shifts, classes, events, assignments, bank lines, what the simulator planted), not from what a detector does. "By day D" means a look dated D or earlier. Caught / late / missed are per event.

1. **Two things at the same time.** A shift overlaps a class, exam or other calendar event (not a study block, not all-day) by 15 or more minutes on day X, and both were known by 8:30 PM the evening before. Caught: Today names that pair on a look dated before X. Late: only on X itself.
2. **A deadline right after a long or late shift.** An assignment, project, exam or quiz (not a reading) is due on day X and a shift that starts on X minus 1 is 7 or more hours long, or ends at 9 PM or later (or after midnight). Both known by 8:30 PM two days before X. Caught: a deadline message names that assignment on a look dated before the shift day. Late: on the shift day or after.
3. **A bill larger than the money before payday.** A bill the person has paid at least twice before, $20 or more, from checking, comes due on day X; checking when day X minus 1 starts holds less than the bill; no paycheck lands on X minus 1 or X (ambiguous cases are skipped). Pay is never counted before it lands. The amount is matched loosely (35%) for bills that move, such as power. Caught: a "short" message for that bill amount on a look 1 to 3 days before X, or Today's "checking could go below $0" line in that window (counted, flagged in the results as not naming the bill).
4. **Subscription changes.** (a) Price rise: a subscription's charge is $1 and 5% more than the one before (planted rises are up to 60% more, as real ones are); caught within 7 days of the first new charge (the next charge is a month away), late up to 14 days; the stricter ADR 0023 target (on the first changed charge, within 3 days) is also printed. A rise with fewer than 7 replay days left is not gradable. (b) Duplicate: two paid subscriptions that do the same job (video, music, cloud); caught if the app says it on its own (a message or Today line) within 3 days of becoming knowable; "late" if only the subscription report (a page you open) shows it. **Free trials about to charge** cannot be graded: see below.
5. **Unusual charge.** (a) A charge of $50 or more at a merchant the person has paid 3 or more times in the last 120 days (not a recurring bill) that is at least 3 times their usual (median) there; caught within 2 days. (b) Informational: $250 or more at a merchant never seen before.
6. **Quiet stretches.** A quiet day has no real event for any rule from 8 days before to 3 days after (21 before for a bill, 14 after for a price rise), checked from the data, planted or natural. On a quiet day, any message that is urgent or a warning kind (bill short, deadline, trial, unusual, price rise), or a Today conflict or overdraft line, counts as noise. "Urgent" is the app's own flag on a message (it marks a bill reminder urgent when the bill is due within a day).

**False alarms** are lines the app said that the data does not back: a conflict between two things that do not overlap; a deadline warning when the shift is short and early; a "bill short" when checking had enough or pay landed first; a price-rise line when no charge rose by $1 and 5%; an unusual-charge line for a charge under 3x the usual or under $50; a "bill short" line for a bill that is charged to the credit card.

## Out of scope (things the app cannot see yet)

- Free trials: the app learns a trial only when a person enters its end date (`trialEndsOn`); no bank or email path creates one and the simulator has no trial. Not graded.
- Real banks (Plaid itself), Outlook, Teams, Gmail content, Apple Health: the lives are loaded straight into the tables the syncs would fill. Email, health and memories are not loaded.
- Sleep, workouts and spending-habit coaching (the rest of the detectors) are not graded here.
- Pushes and quiet hours: the grader reads saved messages and Today lines, not what was delivered.
- The assistant's own conversation (it is a language model; this grader is only the code that notices).
- Overdue assignments: the simulator records when work was handed in, so an "overdue" line is only counted as noise by none of the rules.

Files: `gen.py` (people and plants), `replay.ts` (loads a life day by day and runs the app), `rules.ts` (the rules, pure), `score.ts` (runs all and writes `RESULTS.md`), `rules.selftest.ts` (the rules on a hand-made life), `RESULTS.md` (last run).
