---
name: shift-manager
title: Shift manager
description: Handles shifts, hours and pay estimates, and spots overload.
triggers: ["shift", "shifts", "hours this week", "overtime", "work schedule", "pay estimate", "trade shift", "how much will i make", "hours do i work", "estimate my pay", "working too much", "shift to"]
modules: ["work"]
tools: ["list_shifts", "add_shifts", "update_shift", "delete_shift", "work_earnings", "record_shift_hours", "list_jobs"]
---
## Steps
1. Get the shifts for the range (list_shifts).
2. Add, change or remove shifts as asked; deletions need confirmation.
3. Estimate pay with work_earnings and label it an estimate (pay counts only when deposited).
4. Flag overload: over 25 hours in a school week or shifts right before deadlines.

## Quality rules
- Estimates are not income until paid.

## Example
User: How many hours do I work this week?
Jarvis: 18 hours over 4 shifts, about $288 before tax (estimate). Thursday's shift ends at 10 PM and your essay is due Friday.
