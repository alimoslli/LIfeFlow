# Who does what

Set by the owner on 2026-11-05. Every Claude Code session on this repo reads this with `CLAUDE.md`.

| Who | Job | Where it lives |
|---|---|---|
| **The owner** | Decides what LifeFlow is. Uses the app every day and reports what's wrong. Approves design choices and research proposals. | This repo's plan: `docs/vision.md` |
| **The product chat** | Turns the owner's decisions into the plan, briefs the builders, reviews every build before the owner sees it, runs the other agents, keeps the plan up to date. | `docs/vision.md`, `docs/design/`, this file |
| **The nightly audits chat** ("LifeFlow nightly audits", branch `claude/nightly-audits`) | Runs the always-on loop below while the owner sleeps: audit, fixes, reviews, one approved feature for the owner's okay, situations and research. It leaves a morning report. Set up by the owner on 2026-11-06 so the product chat stays on LifeFlow v3. | `docs/audits/`, `docs/research/`, `docs/situations/` |
| **Builders** (Claude Code chats that write the app) | Build Dev's brain (the checks, the timeline, memory) and the surface, in small tested steps, following `CLAUDE.md` and `docs/playbook.md`. | `src/`, `tests/` |
| **Prototype builder** (Fable) | Builds concept prototypes from a brief so the owner can see an idea before it is built. | Published artifacts; screenshots in the scratch folder |
| **Auditor** (Opus, fresh eyes) | Audits each prototype or build with no context from the conversation, so nothing gets a pass because we're used to it. | `docs/design/*-audit.md` |
| **Situation writer** | Keeps writing realistic life situations for Dev's exam and later training: real life as the timeline, digital life attached, the clashes, the fix, the stay-quiet cases. | `.claude/agents/situation-writer.md`, `docs/situations/` |
| **Market researcher** | Finds what people need from online research, reviews of similar apps and our surveys, and proposes what to build and what to avoid. | `.claude/agents/market-researcher.md`, `docs/research/` |
| **LifeFlow HQ** (`/admin/hq`, set up 2026-11-06; the company since ADR 0026) | The owner's office and the company: the owner (CEO), one **COO** (its own chat, "LF COO", the only one that reports to the owner, one brief per round) and six departments: Engineering (LF Main), Product & Design (LF V3), Research & Insights (LF V3 — Agents), Marketing & Growth (LF Marketing), Quality & Security and Customer Success (both work inside the COO's rounds). Missions, the approval inbox, briefs, delegated decisions and the weekly summary live there; chats report in through `scripts/hq.ts`. | `docs/hq/company.md`, ADR 0024 to 0026 |

## Research goes into the app fast

1. The researcher writes a report with ranked proposals and things to avoid.
2. **Things to avoid become rules right away** (red lines in `docs/playbook.md`, constraints in the next brief). No waiting.
3. **Proposals go to the owner as a short yes or no list** in the product chat. A yes goes into `docs/vision.md` under "Decided from research", with done-means and tests, and into the next build.
4. The report ends with "What changed because of this report". A report with nothing there isn't finished.

## Real misses become cases

Whenever Dev gets something wrong (the owner's use, a tester, a thumbs-down, an error alert), it becomes a new situation in `docs/situations/cases/` before the fix. The fix isn't done until that case passes.

## The always-on loop (owner, 2026-11-05)

The owner asked for the agents to keep running: audit the app (phone and web), fix it, research competitors and what real people want, and check that every piece of information is correct. The product chat runs this on a schedule and reviews every result.

**Light in the day, heavy at night (owner, 2026-11-05).** The owner's Claude usage has a 5-hour limit. During the day, agents do only light work: answering the owner, small fixes, short checks. Audits, builders, reviewers, situation batches, research, full test runs and e2e run in the night round, so the limit resets by morning.

**No background agents while the owner is awake (owner, 2026-11-06).** The owner may open Claude Code at any time, so agents never run in the background while the owner is using it. Agents run only after a start phrase from the owner, or during the 3 AM night rounds.
- **The COO's light pass (owner, 2026-11-07, later).** The COO (Opus) does a short pass every 2 hours from 8 AM to 10 PM Pacific: alone, no audits or builders, about 10% of the 5-hour window at most, no agents at all on a usage warning. This is the one exception to "no background agents while the owner is awake"; heavy work stays in the night rounds.
- **Rounds run on their schedule only (owner, 2026-11-07).** "Goodnight" (or "good night", "gn", or the Goodnight button in HQ) no longer starts any work: it only signs the owner off, and HQ dims the office until 5 AM. The COO's rounds start from their scheduled tasks (`docs/hq/round-prompts.md`), one per night at most. Saying goodnight in a chat still lets that chat finish its own carry-over.
- **"I'm at work", "start the agents" or "go"** in the audits chat starts a round while the owner is away for hours.
- **"Good morning", "stop the agents", or the owner simply messaging the chat** means stop. Running agents finish their current step, save the carry-over and stop. No new agents start.
- **In the product chat:** while the owner is talking, only light work that answers them. Builders and reviewers wait for the start phrase.

**Cost rules (owner, 2026-11-06, tightened the same night: "overall it's too much usage for the weekly usage too").**
- **Night rounds run three nights a week** (Sunday, Tuesday and Thursday at 3 AM), each with:
  - one audit;
  - up to 3 fixes;
  - 5 situations.

  Research runs once a week (Monday). Features are built only after the owner has okayed a picture.
- **Models:** Sonnet for everything by default, including auditors and builders. Opus only reviews changes that touch money, security or a data migration.
- **Two agents at a time at most,** in the night rounds and in the product chat alike.
- **Review rounds:** one review per fix. A second round only when the first found a money, security or data-loss defect.
- **Read only what's needed;** few screenshots, at scale 1.
- **Stop at about 40% of the 5-hour limit,** save the carry-over and report.

**The owner's hours (owner, 2026-11-05, changed late that night):** the agents run while the owner sleeps. Rounds start at 3 AM Pacific, or at the first usage-limit reset after 3 AM if the limit is spent. The report and the yes or no list are waiting in the app by morning (a message plus a push). Nobody waits for approval during a round: approved work goes ahead, and real changes go on the list for the owner to answer the next day.

**Night rounds (Sunday, Tuesday, Thursday, 3 AM Pacific)**
1. **Audit everything.** A fresh-eyes auditor uses the app on phone and web and looks for every kind of error, not only design: does it work, does everything flow, is everything connected. It traces data end to end (a bank charge into bills, Today, the forecast and a notification; an assignment into Plan and a study block; a shift into pay; an assistant action into the records it claims and its Undo), and checks errors, wrong numbers, stale data and security slips. It also checks two things the owner caught before we did (2026-11-06): **no control ever overlaps or covers another** (every form and dialog at phone sizes and Extra large text, `tests/e2e/no-overlap-phone.spec.ts`; iPhone WebKit differs from the Chromium we test in, so WebKit-only issues need global CSS rules and the owner's screenshots become cases), and **nothing imported from a connection ever shows up twice** (Google Calendar, Gmail and what's filed from it, Canvas, Outlook, Plaid). It drives the assistant through the e2e fake model server, never a paid API key. It checks the app against `CLAUDE.md`, the playbook, the vision and the research rules, and covers what changed since the last audit plus one area not yet covered. Findings go in `docs/audits/YYYY-MM-DD-*.md`, each classed `fix now`, `needs owner` or `waits for new surface`.
2. **Fix.** Builders fix the top `fix now` findings straight away, one at a time, each with a test, in their own worktree.
3. **Review.** A second reviewer who didn't write the fix checks each change for correctness, security and the rules. Then the product chat runs `npm run check`, plus the build and the relevant e2e tests for anything on screen, and pushes to the working branch.
4. **Situations.** The situation writer adds a batch through the simulator, at least 70% students. `validate.py` must pass.

**Once a week (Monday, 3 AM Pacific)**
- **Research.** Competitors, what real people want (students first) and an audit of the last report. Every claim is checked against its source and corrected if wrong.
- Things to avoid become rules the same day.
- Proposals are tagged `fix now`, `build now`, `needs the new surface` or `owner decision`.

**What needs the owner's approval (owner, 2026-11-05)**
- **Approved in advance:** small fixes and bugs (wrong numbers, broken flows, errors, rule breaks, copy that's wrong, accessibility, security slips). Builders fix them and they ship once verified.
- **Needs the owner's yes first:** every real change (a new feature, a change to how something works or looks, removing a feature, pricing, anything on the new surface). It goes on the yes or no list, with a picture when words aren't enough.

**What "straight away" means**
- `fix now` findings and research "things to avoid" go in during the same round.
- `build now` features go in after the owner's yes on a short daily yes or no list.
- Work that depends on the new surface waits for the owner's concept choice.
- Verified fixes go to `main` (owner, 2026-11-05) once the full check, build and e2e pass on the merged branch. Product and design work waits for the owner's go.

**Everything is checked twice:** once by the tests and once by someone who didn't write it. Research claims are re-checked in the next round.

**Rounds report into HQ (owner, 2026-11-06).** Every scheduled round runs in the LF COO chat and follows `docs/hq/round-prompts.md` and `docs/hq/workflow.md`: it reads the owner's controls, missions and decisions from HQ, makes each piece of work a mission, sends real changes as approvals (with a push), logs delegated decisions, and ends with a check-in and the brief. HQ is a mirror, never a blocker.

**The owner gets one short report per round:** what was fixed, what was found, the yes or no list, and anything blocked.
