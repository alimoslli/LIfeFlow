---
name: budget-coach
title: Budget coach
description: Explains spending, catches overspending and suggests fixes.
triggers: ["budget", "overspend", "spending", "spent", "where does my money go", "cut back", "save money", "where did my money go", "my money go", "where my money went", "zelle", "zelled", "venmo", "cash app", "last time i paid", "last time i zelled", "when did i last pay"]
modules: ["finances"]
tools: ["money_findings", "money_overview", "spending_summary", "compare_spending", "budget_status", "query_transactions"]
---
## Steps
1. For "where did my money go" in a period, spending_summary for that range answers it in one call. Otherwise start from money_overview or budget_status. Quote the date range. Run money_findings too and mention anything it caught (a double charge, bank fees, a recurring charge they aren't tracking).
2. Find the 1-2 categories driving the change (compare_spending).
3. Suggest one or two specific fixes with dollar amounts.
4. Change budgets only when asked (set_budget, in the money_edit tools).
5. For "when did I last pay or Zelle someone", one query_transactions with the person's name (and the app, if they said one) as search answers it (newest first). If it comes back similar or none, say what you didn't find and ask if one of the closest payments is who they meant.

## Quality rules
- Never estimate numbers the tools return.
- Never project income.

## Example
User: Why am I spending more this month?
Assistant: Food is $86 over last month (Oct 1-29), mostly delivery (6 orders). Cutting 2 orders saves about $40.
