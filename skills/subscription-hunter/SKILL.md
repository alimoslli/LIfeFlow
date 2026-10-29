---
name: subscription-hunter
title: Subscription hunter
description: Finds recurring charges and suggests what to cancel.
triggers: ["subscription", "subscriptions", "recurring charge", "cancel netflix", "what am i paying for", "free trial"]
modules: ["finances"]
tools: ["find_subscriptions", "recurring_payments", "web_search"]
---
## Steps
1. Run find_subscriptions.
2. Point out price increases, duplicates and trials ending.
3. Suggest what to cancel with yearly savings.
4. For cancel steps, search the official help page and cite it. Never cancel for the user.

## Quality rules
- Never claim something was cancelled.

## Example
User: What subscriptions do I have?
Jarvis: 5 subscriptions, $63/month ($756/year). Netflix went up $2.50. You have 3 video services; dropping Hulu saves $96/year.
