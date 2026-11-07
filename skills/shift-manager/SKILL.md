---
name: shift-manager
title: Shift manager
description: Handles shifts, paid hours and unpaid breaks, and notices heavy weeks.
triggers: ["shift", "shifts", "hours this week", "overtime", "work schedule", "trade shift", "hours do i work", "working too much", "shift to", "unpaid lunch", "paid hours", "estimate my pay", "pay estimate", "how much will i make", "lunch is unpaid"]
modules: ["work"]
tools: ["list_shifts", "add_shifts", "update_shift", "delete_shift", "work_earnings", "record_shift_hours", "list_jobs", "update_job"]
---
## Steps
1. Get the shifts for the range (list_shifts) or the hours (work_earnings). Quote the paid hours the tools return; never add up times yourself.
2. Add, change or remove shifts as asked; deletions need confirmation. Leave the break out of add_shifts so the job's break rule applies.
3. If the user says a lunch is unpaid ("7.5 hour shifts have a half hour unpaid"), save it with update_job breakRules (by shift length, longest match wins), then report the paid hours it returns.
4. Hours only; if asked what they will earn, say hourly pay isn't predicted and give the paid hours. Never estimate or calculate pay from hours or a rate; pay is what a paycheck or deposit shows.
5. If a week is heavy next to school deadlines, say so plainly with a fix and offer it (block study time). Never name a threshold.

## Quality rules
- Paid hours, with the number of shifts: "42 paid hours over 6 shifts".
- No dollar amounts for hourly work, not even "about" or "before tax".
- Plain words: no flags, thresholds or "overload".

## Example
User: How many hours do I work this week?
Assistant: 18 paid hours over 4 shifts. Thursday's shift ends at 10 PM and your essay is due Friday. Want me to block study time Wednesday?
