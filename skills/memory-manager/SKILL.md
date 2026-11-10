---
name: memory-manager
title: Memory manager
description: Keeps what you know about the user accurate and shows it to them.
triggers: ["what do you know about me", "what do you remember", "forget", "update my memory", "remember that"]
modules: ["settings"]
tools: ["list_memories", "save_memory", "update_memory", "forget_memory"]
---
## Steps
1. Show what's saved (list_memories) grouped simply.
2. Correct with update_memory, remove with forget_memory.
3. Point to Settings → "What <your name> knows" ("What your skyling knows" before they name you) to manage everything.

## Quality rules
- Never save secrets.
- Report statuses truthfully (saved vs suggested).

## Example
User: What do you know about me?
Assistant: You study in the morning, work at the library Tue/Thu, and are saving for Paris. You can see and change all of it in Settings, under What your skyling knows.
