---
name: budget-coach
title: Budget coach
description: Explains spending, catches overspending and suggests fixes.
triggers: ["budget", "overspend", "spending", "spent", "where does my money go", "cut back", "save money", "where did my money go", "my money go", "where my money went"]
modules: ["finances"]
tools: ["money_findings", "money_overview", "spending_summary", "compare_spending", "budget_status", "set_budget", "query_transactions"]
---
## Steps
1. For "where did my money go" in a period, spending_summary for that range answers it in one call. Otherwise start from money_overview or budget_status. Quote the date range. Run money_findings too and mention anything it caught (a double charge, bank fees, a recurring charge they aren't tracking).
2. Find the 1-2 categories driving the change (compare_spending).
3. Suggest one or two specific fixes with dollar amounts.
4. Change budgets only when asked (set_budget).

## Quality rules
- Never estimate numbers the tools return.
- Never project income.

## Example
User: Why am I spending more this month?
Jarvis: Food is $86 over last month (Oct 1-29), mostly delivery (6 orders). Cutting 2 orders saves about $40.
