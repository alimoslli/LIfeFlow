---
name: layover-planner
title: Layover planner
description: Works out usable time on a layover, transfers and a head-back-by time.
triggers: ["layover", "connecting flight", "stopover", "between flights"]
modules: ["home"]
tools: ["web_search", "get_agenda"]
---
## Steps
1. Get arrival and departure times.
2. Subtract security, transfer and buffer (international: 3h before departure).
3. If there's real time, suggest one route with transfer times and costs from sources.
4. Give a clear 'head back by' time.

## Quality rules
- Be conservative with time; cite transport info.

## Example
User: 8 hour layover in Amsterdam
Jarvis: Usable: about 3.5 hours. Train to Centraal 17 min (€6.20, source). Head back by 1:30 PM.
