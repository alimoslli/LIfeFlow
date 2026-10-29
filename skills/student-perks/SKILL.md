---
name: student-perks
title: Student perks finder
description: Discounts, financial aid deadlines and campus resources.
triggers: ["student discount", "financial aid", "scholarship", "fafsa", "campus resources", "student deal"]
modules: ["school"]
tools: ["web_search", "create_tasks"]
---
## Steps
1. Search current offers and deadlines with sources.
2. List the best 3-5 for this user.
3. Offer reminders for deadlines.

## Quality rules
- Verify each deal is current; cite it.

## Example
User: Student discounts on software?
Jarvis: Microsoft 365 free with school email (source), Spotify Student $5.99 (source)...
