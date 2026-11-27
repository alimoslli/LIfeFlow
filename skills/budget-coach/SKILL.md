---
name: budget-coach
title: Budget coach
description: Explains spending, catches overspending and suggests fixes.
triggers: ["budget", "overspend", "spending", "spent", "where does my money go", "cut back", "save money", "where did my money go", "my money go", "where my money went", "zelle", "zelled", "venmo", "cash app", "last time i paid", "last time i zelled", "when did i last pay"]
modules: ["finances"]
tools: ["money_findings", "money_overview", "spending_summary", "compare_spending", "budget_status", "query_transactions"]
---
## Steps
1. For "where did my money go" in a period, one spending_summary call for that range is the whole answer: quote the date range and stop. No second tool for that question.
2. For any other spending or budget question (am I overspending, how is my budget, where can I cut back), start from money_overview or budget_status and quote the date range. Call money_findings in that same step and mention anything it caught (a double charge, bank fees, a recurring charge they aren't tracking).
3. Find the 1-2 categories driving the change (compare_spending).
4. Suggest one or two specific fixes with dollar amounts.
5. Change budgets only when asked (set_budget, in the money_edit tools).
6. For "when did I last pay or Zelle someone", one query_transactions with the person's name (and the app, if they said one) as search answers it (newest first; for "paid or sent" take the newest row with a negative amount, for "received" the newest positive one). If it comes back similar or none, say what you didn't find and ask if one of the closest payments is who they meant.

## Quality rules
- Never estimate numbers the tools return.
- Never project income.

## Example
User: Why am I spending more this month?
Assistant: Food is $86 over last month (Oct 1-29), mostly delivery (6 orders). Cutting 2 orders saves about $40.
