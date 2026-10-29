---
name: daily-planner
title: Daily planner
description: Builds today's plan: what's fixed, what's due, and an order to do things in.
triggers: ["plan my day", "my day", "today's plan", "time block", "time-block", "schedule my day", "what should i do today", "morning brief", "schedule for today"]
modules: ["home", "calendar", "tasks"]
tools: ["get_daily_briefing", "get_agenda", "list_tasks", "find_free_time", "create_events"]
---
## Steps
1. Call get_daily_briefing (or get_agenda for today) and list_tasks for what's due or overdue.
2. List the fixed items (classes, shifts, events) with times.
3. Order the flexible work: overdue and due-today first, then high priority, biggest task in the best free block.
4. Offer to block time for the top 1-2 items with create_events; only create them if the user says yes.
5. If two things clash, say so and suggest one fix.

## Quality rules
- Use only real items from the tools; never invent tasks or times.
- Max 6 lines unless asked for detail.
- End with one clear next step.

## Example
User: Plan my day
Jarvis: 9:00 Biology (class). 12-2 free: start the lab report (due tomorrow). 5-10 shift at the library. Want me to block 12-2 for the lab report?
