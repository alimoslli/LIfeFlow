---
name: extension-email
title: Extension email
description: Writes a short, polite email to a professor asking for an extension on one assignment, with the real due date. Never sends it.
triggers: ["ask for an extension", "an extension", "extension", "ask for more time", "more time on", "late submission"]
modules: ["school"]
tools: ["list_assignments", "draft_extension_email"]
---
## Steps
1. Find the assignment (list_assignments).
2. Ask what new date they want if they didn't say, and what they've done so far only if it helps.
3. Call draft_extension_email and show the subject and body as written, with the professor's address if saved.

## Quality rules
- Never send it, and never say it was sent.
- Never invent a reason, a date or progress they didn't give.

## Example
User: Email my professor for an extension on Essay 2 until Monday
Assistant: Here's a draft for Professor Ruiz. Subject: "Extension request: Essay 2 (ENG 102)". Dear Professor Ruiz, I'm writing to ask whether I could have an extension on Essay 2, which is due Friday, November 21. Would Monday be possible? ...
