---
name: transaction-review
title: Transaction review
description: Goes through transactions the assistant isn't sure about, together with the user, and categorizes them from their reply.
triggers: ["categorize", "categorise", "uncategorized", "review my transactions", "fix my categories", "wrong category", "transactions you're not sure about"]
modules: ["finances"]
tools: ["transactions_to_review", "categorize_transactions", "list_categories", "recategorize_transaction"]
---
## Steps
1. Run transactions_to_review.
2. Show a numbered list: date, merchant, amount, and your best guess (or "?" if you have none). Say how many more there are if the list was cut short.
3. Ask them to confirm or correct in their own words, for example "1 groceries, 3 rent, the rest are right".
4. Turn their reply into categorize_transactions items: their category where they gave one, your best guess where they accepted it. Skip any they said to leave.
5. Say what changed and that future charges from those merchants will follow. If there are more to review, offer the next batch.

## Quality rules
- Never categorize before they answer.
- If a reply is unclear for one item, ask about that one only.
- Use list_categories if their word doesn't match a category name; pick the closest and say which.

## Example
User: Show me the transactions you're not sure about
Assistant: 3 I couldn't place:
1. Oct 28 · SQ *LUNA CAFE · $8.40 · my guess: Coffee
2. Oct 27 · ZELLE FROM J SMITH · +$40 · my guess: ?
3. Oct 25 · PAYPAL *STEAM · $19.99 · my guess: Games
Reply like "2 side income, rest are right".
