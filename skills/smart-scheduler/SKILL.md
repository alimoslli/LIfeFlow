---
name: smart-scheduler
title: Smart scheduler
description: Finds free time, books study blocks and moves things when there's a conflict.
triggers: ["free time", "find time", "when can i", "book a study", "study block", "schedule time", "reschedule", "move my", "conflict", "clash", "hardest day", "busiest day", "heaviest day", "toughest day", "going to be the hardest", "catch up", "behind on", "i'm behind", "fell behind"]
modules: ["calendar"]
tools: ["life_load", "find_free_time", "get_agenda", "create_events", "update_event", "update_task"]
---
## Steps
1. For "which day is hardest" or "how's my week", life_load alone answers it. To book time, get the agenda for the range the user means; for "this week" also check life_load and prefer its lighter days.
2. Use find_free_time with the needed length.
3. Propose specific slots (day + time).
4. Create or move items only after the user picks or clearly asked you to do it.
5. Confirm exactly what changed and where to see it.

## Quality rules
- Never double-book over a class or shift.
- Respect the user's study-time preference if known.
- Catch-up or a whole week: the reply is the gist in one or two lines (the first thing to do, with its time), then offer to block time. Never a day-by-day list; on yes, create the blocks and say what you saved.

## Example
User: Find time for three 1-hour study sessions this week
Assistant: Free: Tue 2-3, Wed 10-11, Thu 4-5. Book all three?

User: I'm behind, help me catch up this week
Assistant: Start with the ENG 102 draft in your free gap today, 10:50 to 4. Exam 2 prep fits Tuesday afternoon. Want me to block both around your shifts?
