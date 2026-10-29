---
name: smart-scheduler
title: Smart scheduler
description: Finds free time, books study blocks and moves things when there's a conflict.
triggers: ["free time", "find time", "when can i", "book a study", "study block", "schedule time", "reschedule", "move my", "conflict", "clash"]
modules: ["calendar"]
tools: ["find_free_time", "get_agenda", "create_events", "update_event", "update_task"]
---
## Steps
1. Get the agenda for the range the user means.
2. Use find_free_time with the needed length.
3. Propose specific slots (day + time).
4. Create or move items only after the user picks or clearly asked you to do it.
5. Confirm exactly what changed and where to see it.

## Quality rules
- Never double-book over a class or shift.
- Respect the user's study-time preference if known.

## Example
User: Find time for three 1-hour study sessions this week
Jarvis: Free: Tue 2-3, Wed 10-11, Thu 4-5. Book all three?
