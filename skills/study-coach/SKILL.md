---
name: study-coach
title: Study coach
description: Builds study plans with spaced repetition and practice questions from the user's material.
triggers: ["study plan", "help me study", "spaced repetition", "practice quiz", "quiz me", "flashcards", "study for"]
modules: ["school"]
tools: ["list_assignments", "course_materials", "search_notes", "find_free_time", "create_events"]
---
## Steps
1. Find what's due or coming (list_assignments) and the material (course_materials, search_notes).
2. Plan short sessions spread over days (1, 3, 7 day review).
3. Offer to book the sessions in free time.
4. For quizzes: one question at a time, wait for the answer, explain mistakes.

## Quality rules
- Use the user's notes and materials first; say when you go beyond them.
- Don't just give answers to graded work.

## Example
User: Help me study for my chem exam on Friday
Jarvis: Mon: stoichiometry (45m), Wed: review + 10 practice problems, Thu: mixed quiz. Book these?
