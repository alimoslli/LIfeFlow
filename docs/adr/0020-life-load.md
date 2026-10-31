# 0020: Life load for the week ahead

## Status
Accepted (2026-10-31)

## Context
Students who work and study don't experience their week as a list of due dates. A night with nothing due can still need hours of prep, and a shift plus two classes leaves little room for anything else. The owner asked for a "life load meter" that helps plan the coming week, placed in Plan, without overwhelming people.

## Decision
- `computeLifeLoad` (src/lib/life-load.ts) is a pure function over facts already in the user's records:
  - **Committed time:** classes, events and shifts that block time, at their real length.
  - **Schoolwork:** each deadline in the next 14 days gets a rough effort (exam 4h, project 3h, assignment or lab 1.5h, quiz or reading 1h, discussion 30 min). That effort is spread over the days *before* it is due; exams spread over four days, projects over three, the rest over two. Shares that would fall in the past roll onto today. Overdue work lands on today.
  - **To-dos:** 1h when urgent or high priority, otherwise 30 min.
  - **Bills (only when Money is unlocked):** shown on their day, flagged when the week's bills so far exceed checking plus cash. They never count as hours.
- A day has 10 hours of realistic capacity. Under 4h is light, 4h or more is steady, 7h or more is full, and over 10h is too much.
- **Plan (current week only):** one card with a single sentence and seven soft bars. Reasons and bills appear only for the day the user taps. Full days offer "Lighten this day with Jarvis".
- **Jarvis:** a read-only `life_load` tool returns the same week. smart-scheduler, daily-planner and weekly-review use it to place work on lighter days.

## Consequences
- The effort numbers are estimates, and the UI says "about". They are constants in one place, so they can be tuned or later learned per user (with the learning consent rule).
- No new tables or migrations. Everything comes from existing services inside `withUser`.
- Money stays out of the load when locked, and is never turned into a score.
