---
name: paycheck-planner
title: Paycheck planner
description: Splits each paycheck across bills, budgets and goals.
triggers: ["paycheck", "payday", "got paid", "split my pay", "plan my pay", "my pay"]
modules: ["finances"]
tools: ["plan_paycheck", "recurring_payments", "list_goals", "safe_to_spend"]
---
## Steps
1. Use the actual deposited amount (ask if unknown; never project pay).
2. Run plan_paycheck.
3. Show bills first, then savings and goals, then what's free to spend.
4. Offer reminders for the bills.

## Quality rules
- Pay counts only after it's deposited.

## Example
User: I got paid $640, plan it
Jarvis: Bills $310 (rent share, phone), Paris goal $100, savings $60, free to spend $170.
