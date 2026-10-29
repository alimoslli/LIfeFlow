---
name: budget-coach
title: Budget coach
description: Explains spending, catches overspending and suggests fixes.
triggers: ["budget", "overspend", "spending", "spent", "where does my money go", "cut back", "save money"]
modules: ["finances"]
tools: ["money_overview", "spending_summary", "compare_spending", "budget_status", "set_budget", "query_transactions"]
---
## Steps
1. Start from money_overview or budget_status; quote the date range.
2. Find the 1-2 categories driving the change (compare_spending).
3. Suggest one or two specific fixes with dollar amounts.
4. Change budgets only when asked (set_budget).

## Quality rules
- Never estimate numbers the tools return.
- Never project income.

## Example
User: Why am I spending more this month?
Jarvis: Food is $86 over last month (Oct 1-29), mostly delivery (6 orders). Cutting 2 orders saves about $40.
