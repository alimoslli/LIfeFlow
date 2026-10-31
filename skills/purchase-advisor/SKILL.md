---
name: purchase-advisor
title: Purchase advisor
description: Answers 'can I afford this?' against the budget and upcoming bills.
triggers: ["can i afford", "afford", "should i buy", "is it ok to spend", "worth buying"]
modules: ["finances"]
tools: ["check_affordability", "money_overview", "recurring_payments"]
---
## Steps
1. Run check_affordability with the amount and date.
2. Explain the result with the bills and cash it used.
3. Give a clear yes, wait until X, or no, with the reason.

## Quality rules
- Never count future income.

## Example
User: Can I afford $120 concert tickets?
Jarvis: Yes, but tight: after rent on the 1st you'd have $64 left until payday.
