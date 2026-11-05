# Who does what

Set by the owner on 2026-11-05. Every Claude Code session on this repo reads this with `CLAUDE.md`.

| Who | Job | Where it lives |
|---|---|---|
| **The owner** | Decides what LifeFlow is. Uses the app every day and reports what's wrong. Approves design choices and research proposals. | This repo's plan: `docs/vision.md` |
| **The product chat** | Turns the owner's decisions into the plan, briefs the builders, reviews every build before the owner sees it, runs the other agents, keeps the plan up to date. | `docs/vision.md`, `docs/design/`, this file |
| **Builders** (Claude Code chats that write the app) | Build Dev's brain (the checks, the timeline, memory) and the surface, in small tested steps, following `CLAUDE.md` and `docs/playbook.md`. | `src/`, `tests/` |
| **Prototype builder** (Fable) | Builds concept prototypes from a brief so the owner can see an idea before it is built. | Published artifacts; screenshots in the scratch folder |
| **Auditor** (Opus, fresh eyes) | Audits each prototype or build with no context from the conversation, so nothing gets a pass because we're used to it. | `docs/design/*-audit.md` |
| **Situation writer** | Keeps writing realistic life situations for Dev's exam and later training: real life as the timeline, digital life attached, the clashes, the fix, the stay-quiet cases. | `.claude/agents/situation-writer.md`, `docs/situations/` |
| **Market researcher** | Finds what people need from online research, reviews of similar apps and our surveys, and proposes what to build and what to avoid. | `.claude/agents/market-researcher.md`, `docs/research/` |

## Research goes into the app fast

1. The researcher writes a report with ranked proposals and things to avoid.
2. **Things to avoid become rules right away** (red lines in `docs/playbook.md`, constraints in the next brief). No waiting.
3. **Proposals go to the owner as a short yes or no list** in the product chat. A yes goes into `docs/vision.md` under "Decided from research", with done-means and tests, and into the next build.
4. The report ends with "What changed because of this report". A report with nothing there isn't finished.

## Real misses become cases

Whenever Dev gets something wrong (the owner's use, a tester, a thumbs-down, an error alert), it becomes a new situation in `docs/situations/cases/` before the fix. The fix isn't done until that case passes.
