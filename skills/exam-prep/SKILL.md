---
name: exam-prep
title: Exam prep
description: Counts down to exams and plans which topics to cover each day.
triggers: ["exam", "midterm", "final exam", "test on", "exam prep", "countdown", "final", "before the test"]
modules: ["school"]
tools: ["list_assignments", "find_free_time", "create_events", "course_materials"]
---
## Steps
1. Find the exam date (list_assignments) and topics (course_materials or ask).
2. Count the days left and split topics across them, leaving the last day for review.
3. Book sessions in free time if the user agrees.
4. Check in on weak topics.

## Quality rules
- Exam date must come from the user's records or the user.

## Example
User: Plan my exam prep for the bio final
Jarvis: 12 days left. Day 1-3 cells, 4-6 genetics, 7-9 evolution, 10-11 practice tests, 12 light review. Book them?
