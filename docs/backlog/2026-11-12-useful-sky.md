# The sky does more with what it knows (owner, 2026-11-12)

Owner: "That's just showing the information, but what are we doing with it? It's not doing as much with it without us asking."
He said yes to four groups ("build those 4 ... high standards") and answered the questions:

| Question | Owner's answer |
| --- | --- |
| Spending on the timeline | "each purchase on its own but also clearly shows days total" |
| Hours of work for a purchase | No |
| Sunday | A push and a card on Today, around 6 PM, never in quiet hours, the card stays through Monday, skipped when there's nothing to say |
| Patterns | Gentle, only when it helps: never names the habit, suggests the earlier start when it matters |
| Tonight | A cloud from 4 PM, no push |
| Free gaps | Gaps of 45 minutes or more, at most 2 a day, only on class or work days, only with something that fits |
| Exams | Study blocks offered: free time before each exam, blocked with one tap |

Built on `claude/pensive-mendel-r1yy4a`, held until the owner has seen pictures (a change to how Today looks).

## One brain, one read

`skyInsights()` (services/sky-insights.ts, type in lib/sky-insights.ts) is the one list the Today note and the clouds read.

Each insight has:
- `kind`
- `weather`, one of three:
  - `clear`: an idea or a good moment
  - `grey`: a heads-up
  - `storm`: a real problem, the dark rain cloud
- `headline`
- `why`
- `action`, one of:
  - a stored message's Do it, with Undo
  - a one-tap block of free time, with Undo
  - a question for the skyling
  - a link
- `money`
- `score`

It is ranked: storms first, then grey, then clear.

Rules for every insight:
- Facts only, from the person's own records. No AI call, no guessed number.
- Money insights are left out while the Money lock is on.

Storm is only for real trouble:
- a possible double charge
- no free time at all before something is due
- no free time before an exam
- two things booked at the same time

## 1. Exam study blocks (detector `examStudy`, kind `exam_study`)

Done means:
- For an exam or quiz 2 to 7 days away with no study block already booked for it, the skyling offers one block.
- The block is real free time before the exam, never during a class, a shift or an event:
  - 90 minutes for an exam, 60 for a quiz
  - inside the person's study time when they've set one (morning, afternoon, evening or night), otherwise 9 AM to 9 PM
  - on the latest day before the exam that has room, never the exam day itself
- "Block it" adds a study event and returns Undo. It is the same `block_time` action as the shift-conflict study block.
- No free time before the exam: it says so, as a storm, and links to the week.
- It is offered once per exam, even if not answered. It is pushed, because it matters (priority 76).
- Edge cases:
  - An exam whose time has passed is skipped.
  - An already-booked study event whose title names the course or the exam counts as booked.
  - A done or excused exam is skipped.

## 2. Small decisions before you ask (briefing rules, live)

### Tonight (from 4 PM until 11 PM; no push)
- It shows the free hours left before 11 PM after shifts, classes and events.
- It names what's due before tomorrow noon, or "nothing due".
- With Money open and connected, the second line is what's left after the next 7 days of bills.
- When what's due is more than the free time, it is grey; otherwise it is clear.

### Free gaps (class or work days only)
- A gap is free time of 45 minutes or more between two booked things today, still ahead.
- At most 2 a day: the next two.
- It is shown only with something that fits: the soonest open assignment due within 7 days, else the soonest open to-do with a due date.
- "Block it" books that gap for it, with Undo.

### Due-date maths
- It covers the nearest open assignment (not an exam) due within 3 days.
- It shows the free hours from now until it's due, counting 8 AM to 11 PM, after booked time.
- The weather:
  - under 1 hour is a storm ("no free time before it's due"), with a question for the skyling to find time
  - under 3 hours is grey
  - otherwise it is clear, and "Block it" books the first free hour

### Start earlier (detector `startEarlier`, kind `start_earlier`)
- It applies only when the person really does usually finish close to the deadline (`lastMinutePattern`, from their own completed work).
- It covers a project, paper or essay due 3 to 6 days out.
- It offers a 90-minute block at least 2 days before the due date, in free time.
- The words never name the habit. They say what the earlier start buys ("leaves you two days of room").
- It is offered once per assignment and never pushed (priority 60).

## 3. Money that means something (all behind the Money lock)

### Purchases on the timeline
- Plaid's own time of the purchase is saved as `transactions.authorized_at` (migration `0068_purchase_time`), when the bank gives one.
- A purchase with a real time is its own mark at that time: the name and the amount.
- A purchase without a time is never given a made-up one.
- Every day with spending has one day-total mark at the end of the day: "Spent $42 · 5 purchases". Its card lists every purchase of the day, each with its amount.
- Today's total mark sits at the latest purchase with a time, or just before now, and says "so far".
- Refunds lower the total, as on Money. Transfers and excluded rows are left out.
- Purchases never count as stars and never go on the closed wheel's rim.

### Subscriptions that add up
- It shows the monthly total and the yearly total of the subscriptions we've found, with how many there are.
- The weather is clear and the score is low, so it shows only when nothing more important is waiting.

### Trials and double charges
- The existing `trial_ending` and `double_charge` messages join the list:
  - a trial is grey
  - a double charge is a storm
- Each keeps its Do it, Not now and Undo.

## 4. Sunday look-back and look-ahead

- A run of its own on Sundays from 6 PM (`sunday`, once per Sunday, never in quiet hours). It runs the weekly review and the week ahead.
- The review adds a "Next week" section:
  - the heaviest day
  - exams
  - how many assignments are due
- It is skipped when there's nothing to say: nothing done, nothing open, no spending and nothing next week.
- Push: it is the review push. Quiet hours, push limits and the Money lock rules all hold.
- Today card:
  - From Sunday 6 PM through Monday, the review is Today's note.
  - It has one line (done, open, next week's heaviest day).
  - Tapping it opens the full review in a sheet with "Plan next week".

## Out of scope
- Hours of work for a purchase (owner: No).
- Guessing a purchase time, a payday or hourly pay.
- New pushes for Tonight and free gaps.
- Changing the idea-cloud files while the insight-clouds builder works. The builder reads `skyInsights()`.

## Tests
- Unit tests:
  - the rules: tonight, gaps, due maths, weather and ranking
  - the purchase marks from rows
  - the voice for the new kinds: no guilt words, no em dash
- Integration tests:
  - `examStudy` and `startEarlier` on a seeded week
  - the Sunday run's timing and its skip
  - `skyInsights` with the Money lock
  - the day-total mark and its hiding under the lock
  - the Plaid time saved
- e2e: the Sunday card opens its sheet, and the timeline labels stay clear with purchase marks on a busy day (`timeline-labels.spec.ts`).
