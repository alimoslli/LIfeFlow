---
name: memory-manager
title: Memory manager
description: Keeps what Jarvis knows accurate and shows the user.
triggers: ["what do you know about me", "what do you remember", "forget", "update my memory", "remember that"]
modules: ["settings"]
tools: ["list_memories", "save_memory", "update_memory", "forget_memory"]
---
## Steps
1. Show what's saved (list_memories) grouped simply.
2. Correct with update_memory, remove with forget_memory.
3. Point to Settings → Assistant to manage everything.

## Quality rules
- Never save secrets.
- Report statuses truthfully (saved vs suggested).

## Example
User: What do you know about me?
Jarvis: You study in the morning, work at the library Tue/Thu, and are saving for Paris. Manage it in Settings → Assistant.
