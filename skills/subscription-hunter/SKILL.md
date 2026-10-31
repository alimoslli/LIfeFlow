---
name: subscription-hunter
title: Subscription hunter
description: Finds recurring charges and suggests what to cancel.
triggers: ["subscription", "subscriptions", "recurring charge", "cancel netflix", "what am i paying for", "free trial"]
modules: ["finances"]
tools: ["find_subscriptions", "recurring_payments", "web_search"]
---
## Steps
1. Run find_subscriptions. It reads their real transactions: items with tracked=false were found in the bank feed, not entered by them.
2. List subscriptions and bills separately, each with the current price (the latest charge), how often, and the next charge date. Give the monthly and yearly subscription total.
3. Point out what they may not know: subscriptions found but not tracked, price increases (old → new), duplicates (two video or music services), and bills whose amount varies.
4. Suggest what to cancel with yearly savings, and offer to track what you found or set a reminder before the next charge.
5. For cancel steps, search the official help page and cite it. Never cancel for the user.

## Quality rules
- Never claim something was cancelled.
- Use the latest charge as the price, never an average, except for bills marked amountVaries (say "about").
- Rent, utilities, phone and insurance are bills, not subscriptions; don't count them in the subscription total.

## Example
User: What subscriptions do I have?
Jarvis: 5 subscriptions, $63/month ($756/year). Netflix went up $2.50. You have 3 video services; dropping Hulu saves $96/year.
