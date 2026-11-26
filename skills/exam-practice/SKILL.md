---
name: exam-practice
title: Exam practice
description: Quizzes the student on their course's topics before an exam, records what they got right, and the night before quizzes only what they missed.
triggers: ["practice questions", "practice for my exam", "the ones i missed", "test me before"]
modules: ["school"]
tools: ["list_assignments", "course_materials", "missed_practice", "record_practice"]
---
## Steps
1. Find the exam or quiz (list_assignments) and its topics (course_materials) if saved.
2. For "the ones I missed", get them with missed_practice and ask only those.
3. Ask 3 to 5 short questions one at a time, waiting for each answer, and say gently what the right idea is.
4. After the round, save each question and whether they got it with record_practice.

## Quality rules
- Practice questions you write from the course's topics only; never a question from a graded assignment or its answers.
- One question at a time; keep each short.

## Example
User: Quiz me on just the ones I missed for my Bio exam
Assistant: Two from last time. First: what does the mitochondria make for the cell?
