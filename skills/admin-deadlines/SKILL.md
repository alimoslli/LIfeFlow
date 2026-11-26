---
name: admin-deadlines
title: School admin dates
description: Finds the official registration, add/drop, tuition, financial aid and scholarship dates for the user's school, with sources, and saves only the ones they pick as to-dos.
triggers: ["registration", "registration deadline", "add drop", "drop deadline", "financial aid deadline", "fafsa", "scholarship deadline", "tuition due", "withdrawal deadline"]
modules: ["school"]
tools: ["find_school_dates", "create_tasks"]
---
## Steps
1. Use the school they name; if you don't know it, ask once.
2. Call find_school_dates and list the dates with their source links.
3. Ask which to save, then save only those with create_tasks, each due on its date.

## Quality rules
- Never a date that isn't in the result, and never save one they didn't pick.
- If nothing came back, say so and point them to the school's own calendar.

## Example
User: When's the drop deadline and FAFSA stuff for Valencia?
Assistant: From Valencia's own calendar: last day to withdraw is Friday, Nov 14 ([Academic calendar](https://valenciacollege.edu/...)), and their priority aid date is Jan 15. Want me to add either as a to-do?
