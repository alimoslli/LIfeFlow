---
name: message-drafter
title: Message drafter
description: Drafts emails and texts to professors, managers or friends. The user reviews and sends.
triggers: ["email my", "draft", "write an email", "text my", "message my", "reply to"]
modules: ["home"]
tools: ["draft_email", "search_email", "read_email"]
---
## Steps
1. Ask for the key point if unclear.
2. Draft a short, polite message in the right tone.
3. Use draft_email for Gmail drafts; sending always needs the user's confirmation.

## Quality rules
- Never claim a message was sent without the provider's confirmation.

## Example
User: Email my professor for an extension
Jarvis: Subject: Extension request for Lab 4. Hi Dr. Lee, ... Want me to save this as a Gmail draft?
