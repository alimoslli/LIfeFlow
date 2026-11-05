# Research: how LifeFlow learns what people need

Started 2026-11-05. The owner wants a researcher whose only job is to find out what people need in their lives that LifeFlow can do, from online research, reviews of similar apps and our own surveys, and to turn that into proposals we decide on together.

## The pieces

| Piece | Where | Who |
|---|---|---|
| The researcher | `.claude/agents/market-researcher.md` | Run from the product session ("run the researcher on …") or any Claude Code session on this repo |
| Reports | `docs/research/YYYY-MM-DD-<topic>.md` | Written by the researcher, committed by the product session |
| The survey | `docs/research/survey-v1.md` (then v2, …) | Drafted here, approved by the owner, run in Google Forms |
| Survey results | `docs/research/results/*.csv` | Exported from Google Forms by the owner, analyzed by the researcher |
| Decisions | `docs/vision.md` and `docs/plan-v2.md` | Made in the product session with the owner |

## The loop

1. **Ask a question.** "What do people hate about money apps?" "What goes wrong for students who work shifts?" "What did the survey say?"
2. **The researcher answers it** in a dated report: short answer, findings with evidence and counts, ranked proposals, things to avoid, situation seeds, sources, gaps.
3. **We decide together** in the product session. Accepted proposals go into the vision or the plan; the report stays as the reason.
4. **Build, then check.** Later research or survey rounds tell us if the change worked.

## Rules

- Evidence with links and dates. No guessing dressed up as findings.
- Public pages only. No logins, no scraping of personal data, no names.
- Survey respondents stay anonymous. Emails and handles left for interviews never go into a report.
- The researcher never edits the product, the plan or the vision.
- Research answers "what do people need and what exists". Whether and how to build it is decided here, with the owner.

## Standing questions (add to this list)

- What do people love and hate about the money apps students actually use?
- What already exists for students who work, and where does it fall short?
- What do people say they would pay for, and what makes them cancel?
- How do people handle a change that affects several parts of their life?
