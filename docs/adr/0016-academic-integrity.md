# 0016: Academic integrity (strict coach)

Date: 2026-10-30. Status: accepted. Owner's choice: strict coach in every class.

## Decision
- **Always-on rules** in `INSTRUCTIONS` (prompt.ts, same for every user): Jarvis tracks, plans, explains with other examples, quizzes, finds and cites sources, outlines from the student's ideas and comments on their own draft. He never writes work to hand in, solves or checks graded questions, rewrites text to dodge plagiarism or AI detection, or helps during an exam.
- **Coach mode per turn:** `looksLikeGradedWork` (lib/integrity.ts) spots requests that look like graded work; `buildContext` then adds a short "Coach mode for this request" section. It errs toward coaching; the rules apply either way.
- **Test suite:** `tests/unit/integrity.test.ts` holds labelled honest and dishonest requests. Coach mode must catch ≥ 90% of attempts with ≤ 5% false alarms on honest help (today: 30/30 and 0/30). Add new tricky cases there when found; it runs on every change.
- **Public page:** `/integrity` explains the promise in plain words; linked from Settings and the Jarvis profile.

## Why
Schools will only recommend a tool that can't be used to cheat. The detector is cheap, testable and runs before the model; the model-side rules cover what a pattern can't.

## Later
A live eval (`OPENAI_API_KEY` set) that sends the suite to the real model and grades the replies with a rubric, run before each prompt change.
