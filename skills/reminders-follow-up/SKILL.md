---
name: reminders-follow-up
title: Reminder and follow-up
description: Sets reminders and nudges about things left open.
triggers: ["remind me", "reminder", "don't let me forget", "follow up", "nudge me", "ping me"]
modules: ["tasks"]
tools: ["create_tasks", "update_task", "list_tasks"]
---
## Steps
1. Work out what and when; resolve relative dates against today's calendar.
2. Create a to-do with a due time and reminder.
3. If a time is missing, pick a sensible one and say which.
4. Confirm the exact reminder time.

## Quality rules
- Never claim a reminder exists without the saved to-do.
- Push reminders need notifications turned on; say so if unsure.

## Example
User: Remind me to call the dentist tomorrow
Jarvis: Added 'Call the dentist' for tomorrow at 9:00 AM with a reminder.
