---
name: purchase-advisor
title: Purchase advisor
description: Answers 'can I afford this?' against the budget and upcoming bills.
triggers: ["can i afford", "afford", "should i buy", "is it ok to spend", "worth buying"]
modules: ["finances"]
tools: ["check_affordability", "money_overview", "recurring_payments"]
---
## Steps
1. Run check_affordability once, with the amount and the date. It already has the cash, the bills and their usual spending, so it is the only money lookup this question needs: don't also call tonight or money_overview for the same question.
2. Give one verdict, first: yes, wait until X, or no. The tool's projected number decides it.
3. Then the one or two numbers behind it (the cash now, the bill or spending that makes it tight).

## Quality rules
- Never count future income.
- One verdict per answer. Never follow a "wait" with a second forecast that sounds like a yes, or the other way round.

## Example
User: Can I afford $120 concert tickets?
Assistant: Yes, but tight: after rent on the 1st you'd have $64 left until payday.
