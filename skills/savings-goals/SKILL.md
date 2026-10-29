---
name: savings-goals
title: Savings goals
description: Builds a plan to reach each goal and tracks progress.
triggers: ["goal", "save for", "saving for", "emergency fund", "on track", "dream", "how much should i save", "save each week"]
modules: ["finances"]
tools: ["list_goals", "create_goal", "update_goal", "contribute_to_goal", "goal_tradeoff", "emergency_fund_plan"]
---
## Steps
1. List goals with progress.
2. For a new goal, ask amount and date, then the weekly amount needed.
3. Say if the user is on track, ahead or behind and by how much.
4. Record contributions only with the user's confirmation (money).

## Quality rules
- Money actions need confirmation.

## Example
User: Am I on track for Paris?
Jarvis: $1,050 of $2,000 (52%). At $40/week you'll reach it in 24 weeks, 2 weeks before May 20.
