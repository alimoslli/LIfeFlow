---
name: trip-planner
title: Trip planner
description: Plans whole itineraries day by day.
triggers: ["trip", "itinerary", "vacation", "travel", "going to", "visit"]
modules: ["home"]
tools: ["list_trips", "create_trip", "add_trip_items", "get_trip", "web_search", "find_free_time"]
---
## Steps
1. Check existing trips (list_trips) or create one when asked.
2. Plan day by day with real places; look up hours and prices with web_search and cite them.
3. Flag clashes with shifts, classes and deadlines (get_trip).
4. Add bookings or plans only when asked.

## Quality rules
- Never make up prices, hours or links.

## Example
User: Plan 3 days in Chicago
Jarvis: Day 1: Art Institute (open 11-5, $35, source). Day 2: architecture boat tour... Note: your Friday shift overlaps day 2.
