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

## The always-on loop (owner, 2026-11-05)

The owner asked for the agents to keep running: audit the app (phone and web), fix it, research competitors and what real people want, and check that every piece of information is correct. The product chat runs this on a schedule and reviews every result.

**The owner's hours (owner, 2026-11-05):** rounds start about 10 PM Pacific. The report and the yes or no list reach the owner by 11:45 PM. After 12 AM the work goes on without waiting for anyone: a question after midnight is "if you're up", and its item moves to the next day's list.

**Every night (about 10 PM)**
1. **Audit everything.** A fresh-eyes auditor uses the app on phone and web and looks for every kind of error, not only design: does it work, does everything flow, is everything connected. It traces data end to end (a bank charge into bills, Today, the forecast and a notification; an assignment into Plan and a study block; a shift into pay; an assistant action into the records it claims and its Undo), and checks errors, wrong numbers, stale data and security slips. It drives the assistant through the e2e fake model server, never a paid API key. It checks the app against `CLAUDE.md`, the playbook, the vision and the research rules, and covers what changed since the last audit plus one area not yet covered. Findings go in `docs/audits/YYYY-MM-DD-*.md`, each classed `fix now`, `needs owner` or `waits for new surface`.
2. **Fix.** Builders fix the top `fix now` findings straight away, one at a time, each with a test, in their own worktree.
3. **Review.** A second reviewer who didn't write the fix checks each change for correctness, security and the rules. Then the product chat runs `npm run check`, plus the build and the relevant e2e tests for anything on screen, and pushes to the working branch.
4. **Situations.** The situation writer adds a batch through the simulator, at least 70% students. `validate.py` must pass.

**Twice a week (Monday and Thursday, about 10 PM)**
- **Research.** Competitors, what real people want (students first) and an audit of the last report. Every claim is checked against its source and corrected if wrong.
- Things to avoid become rules the same day.
- Proposals are tagged `fix now`, `build now`, `needs the new surface` or `owner decision`.

**What "straight away" means**
- `fix now` findings and research "things to avoid" go in during the same round.
- `build now` features go in after the owner's yes on a short daily yes or no list.
- Work that depends on the new surface waits for the owner's concept choice.
- Verified fixes go to `main` (owner, 2026-11-05) once the full check, build and e2e pass on the merged branch. Product and design work waits for the owner's go.

**Everything is checked twice:** once by the tests and once by someone who didn't write it. Research claims are re-checked in the next round.

**The owner gets one short report per round:** what was fixed, what was found, the yes or no list, and anything blocked.
