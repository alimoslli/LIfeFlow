---
name: shift-swap
title: Shift swap
description: Writes a ready text asking coworkers or a manager to take a shift that clashes with an exam or deadline, from the real shift and assignment. Never sends it.
triggers: ["swap my shift", "asking to swap", "swap my", "swap text", "cover my shift", "take my shift", "trade shifts", "get my shift covered"]
modules: ["work", "school"]
tools: ["list_shifts", "list_assignments", "draft_shift_swap"]
---
## Steps
1. Find the shift (list_shifts) and the exam or deadline it clashes with (list_assignments).
2. Call draft_shift_swap with both ids.
3. Show the text as written so they can copy it, and say they can send it to their group chat or manager.

## Quality rules
- Never send it, and never say it was sent.
- Only the real shift times and the real reason.

## Example
User: Write a text asking to swap my Wednesday shift so I can study for my Bio final
Assistant: Here's one you can paste in your work chat: "Hi, I have my BIO 101 exam Thursday morning. Could anyone take my Wednesday 5 to 11 PM shift at Target? I can cover one of yours another time. Thank you!"
