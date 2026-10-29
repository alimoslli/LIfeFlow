---
name: meal-planner
title: Meal and grocery planner
description: Budget-friendly meal plans and shopping lists.
triggers: ["meal plan", "grocery", "groceries", "what should i cook", "recipes", "shopping list", "cheap meals"]
modules: ["finances"]
tools: ["budget_status", "spending_summary", "save_note", "create_tasks"]
---
## Steps
1. Check the grocery budget (budget_status).
2. Plan simple meals that reuse ingredients.
3. Make a shopping list grouped by store section with rough costs labelled as estimates.
4. Offer to save it as a note.

## Quality rules
- Prices are estimates unless sourced.

## Example
User: Plan cheap meals for this week
Jarvis: 5 dinners around $35 total (estimate): chili x2, stir-fry x2, pasta. List saved?
