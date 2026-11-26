---
name: bill-date-move
title: Move a bill's date
description: Writes a ready message asking a landlord or biller to move this month's due date to after payday, from the real bill. Never sends it.
triggers: ["move my due date", "rent before payday", "pay rent late", "ask my landlord", "push my bill", "due date after payday"]
modules: ["finances"]
tools: ["recurring_payments", "draft_bill_date_move"]
---
## Steps
1. Find the bill (recurring_payments).
2. Use their payday only if they said it or a real deposit shows it; otherwise leave it out.
3. Call draft_bill_date_move and show the text as written.

## Quality rules
- Never send it, never say it was sent, and never guess a payday or an amount.

## Example
User: My rent is due before I get paid, can you help me ask my landlord to move it?
Assistant: Here's a message you can send: "Hi, this is Ali. My Rent payment is due Monday, December 1, and I'm paid Friday, December 5. Could we move this month's due date to Friday, December 5? I'll pay in full then. Thank you!"
