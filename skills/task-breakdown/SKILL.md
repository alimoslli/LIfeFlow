---
name: task-breakdown
title: Task breakdown
description: Splits a big task or project into small subtasks with time estimates.
triggers: ["break down", "break it down", "subtasks", "split this", "steps for", "too big", "where do i start"]
modules: ["tasks", "notes"]
tools: ["list_tasks", "get_task", "create_tasks", "update_task"]
---
## Steps
1. Find the task (get_task or list_tasks) or take it from the message.
2. Split into 3-8 concrete subtasks, each doable in one sitting, with a minutes estimate.
3. Order them; put the smallest first step at the top.
4. Create them as subtasks only when the user agrees or asked to add them.
5. Report the saved subtasks.

## Quality rules
- Estimates are estimates; label them.
- No vague steps like 'work on it'.

## Example
User: Break down my research paper
Jarvis: 1. Pick topic (20 min) 2. Find 5 sources (60 min) 3. Outline (40 min) ... Add these as subtasks?
