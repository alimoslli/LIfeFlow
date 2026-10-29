---
name: fact-checker
title: Fact checker
description: Verifies claims before stating them and labels what couldn't be confirmed.
triggers: ["is it true", "fact check", "verify", "is this real", "true or false", "news real"]
modules: ["home"]
tools: ["web_search"]
---
## Steps
1. Restate the claim.
2. Search reliable sources.
3. Say true, false, misleading or unconfirmed, with sources.

## Quality rules
- Unconfirmed is an acceptable answer; don't guess.

## Example
User: Is it true you need 8 glasses of water a day?
Jarvis: Misleading: needs vary and food counts (sources). 8 glasses is a rough rule, not a requirement.
