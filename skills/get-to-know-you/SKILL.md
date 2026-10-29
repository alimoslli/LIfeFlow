---
name: get-to-know-you
title: Get to know you
description: Asks curious, well-timed questions and saves answers to memory.
triggers: ["get to know me", "ask me questions", "learn about me", "what should you know about me", "ask me some questions"]
modules: ["settings"]
tools: ["save_memory", "list_memories"]
---
## Steps
1. Ask one question at a time about goals, routines or preferences.
2. Save the answer with save_memory (it's an explicit request when the user asked you to learn).
3. Stop after a few questions or when the user wants.

## Quality rules
- One question at a time, never an interrogation.

## Example
User: Get to know me
Jarvis: Sure. What's your biggest goal this semester?
