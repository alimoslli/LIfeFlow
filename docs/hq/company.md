# LifeFlow, the company

The owner, 2026-11-06: "I want my agents to be smart, not just doing work… work together as a team to help grow and improve LifeFlow. I will communicate with only one agent reporting back to me, like a head manager… he takes care of the operations… tells me what I have to do and requests when changes aren't fixes or bugs… gives me suggestions and what's next… soon he will be able to take some of the decisions… a real company: me the CEO, with management levels and associates… at least 5–6 agents, each responsible for a department."

This is how the company runs. It sits on top of `docs/team.md` (cost rules, the owner's hours, approvals) and `docs/hq/workflow.md` (the round steps). Where they disagree, the owner's newest words win.

## The org chart
```
          CEO (the owner)  ·  CMO (partner, coming soon)
                            │  talks only to
                    COO  ── the "LF COO" chat
                            │  runs, coordinates, reports
 ┌──────────────┬───────────┼───────────┬───────────────┬───────────────┐
 Engineering   Quality &   Product &   Research &     Marketing &     Customer
               Security    Design      Insights       Growth          Success
```

- **CEO (the owner):** decides direction, answers the yes/no list and okays pictures. Talks only to the COO. The other chats stay open for when the owner wants to dig in.
- **COO (head manager):** `.claude/agents/coo.md`, on Opus in the "LF COO" chat (owner, 2026-11-07: "always there, like a real COO"). A light pass every 2 hours from 8 AM to 10 PM, plus the night rounds. Runs every scheduled round, decides the order of work, hands work between departments, makes the decisions it's allowed to make, and brings the CEO one short brief per round.
- **CMO (coming soon, owner 2026-11-07):** a real person, the owner's partner, over Marketing & Growth. HQ shows the seat as "Coming soon"; their own sign-in is a separate step with its own security review.
- **Departments.** Each department is a lead agent: a role file the COO starts inside a round, at most two at a time, Sonnet by default. Each has a room in HQ.

| Department | HQ room | Lead agent | When | Owns | Hands off to |
|---|---|---|---|---|---|
| Engineering | Developer | `engineer.md` | Night rounds (Sun, Tue, Thu) | Fixes, tests, speed, reliability, integrations | QA (review), COO |
| Quality & Security | QA | `qa-security.md` | Every night round (audit), every money, security or data change (review) | Audits on phone and web, e2e, security reviews | Engineering (fix now), COO (needs the CEO) |
| Product & Design | Designer / V3 | `product-designer.md`, plus the LF V3 chat (the owner's) | Monday plan; when research or the CEO asks | Prototypes as pictures, UX proposals, V3 | CEO (design yes/no), Engineering (an approved build) |
| Research & Insights | Researcher | `market-researcher.md`, `situation-writer.md` | Monday, plus situations in every night round | Competitors, real needs, complaints, situations | Product (proposals), Engineering (fix now), Marketing (honest messages) |
| Marketing & Growth | Marketing | `marketer.md` | Wednesday | Concepts and drafts, scheduling approved posts, real metrics | CEO (publish yes/no), Research (what resonated) |
| Customer Success | Support | `customer-success.md` | Every night round | Error reports, turned into fixes; patterns in what breaks for people | Engineering, COO |

**Who is awake (owner, 2026-11-07, ADR 0029).** Nobody shows Working unless real work is running. From 8 AM to 11 PM in the CEO's time zone everyone who can be reached is **Ready** (awake at their desk, on call: their own chat is connected, or the COO's for QA, Customer Success and Research), and at night they are **Asleep**. A room shows Working only while a round it works in runs (from the COO's round_start and round_end check-ins), or while its own chat checks in on a mission in progress. QA, Customer Success and Research have no chat of their own: they work in the COO's rounds. Anything waiting on the CEO (a yes, a blocked mission, a chat's question) is a note on the door, never the room's state. Each sleeping room says when it next wakes.

## How the departments work together
Work moves between departments only as **HQ records**, never as chat. Every handoff can be seen, has an owner, and a later round picks it up.
- **A finding for another department:** a mission for it, with `mission add --role <department> --title … --detail "<why, the evidence, the link>"`.
- **A real change:** a decision card for the CEO (below), with the department's recommendation on it.
- **Research:** a research item in Marketing (`content add --kind research`) or a report in `docs/research/`.

Examples:
- QA finds a broken flow, so Engineering gets a high-priority mission. After the fix, QA reviews it.
- Customer Success sees an error group grow, so Engineering gets a mission, with the error's route and count.
- Research finds people quitting apps over surprise charges. Product gets a proposal, and Marketing gets an honest message angle.
- Marketing sees which hooks did well, so Research gets "dig into why" for next Monday.

## The COO's job
1. **At the start of every round:**
   - `inbox`, for the CEO's decisions, open missions, approved posts and the controls.
   - Apply the CEO's decisions.
   - If Autonomous mode or this round is switched off, stop.
   - Check the usage gate.
2. **Plan the round:**
   - Pick the order of work (a delegated decision, so log it).
   - Assign each piece of work to its department.
   - Keep to the budget.
3. **Run it.** Start each department's lead agent with a short brief: the mission, the evidence, done-means, and what not to touch. Check its result before calling it done. Every money, security or data change gets QA's review.
4. **Report** at the end of every round: one brief (format below). It goes to HQ with `brief`, and HQ pushes it to the CEO's phone.
5. **On Mondays:** the weekly plan. After research it sets next week's missions per department, turns real changes into approvals with a recommendation, and puts up to 3 suggestions for what's next in the brief.
6. **Never** pretend work happened. Never word a guess as a fact. Say plainly when something is blocked, and what unblocks it.

## The brief (what the CEO reads)
Short, plain words, no jargon, no em dashes, at most about 1,200 characters:
1. **How things are**, in one line, e.g. "Good round: 2 fixes shipped, nothing blocked."
2. **Done:** up to 3 lines, each with a link (a commit or a page).
3. **Needs you:** the count, plus the most important one in a sentence. "Open Approvals in HQ."
4. **Decided for you:** each delegated decision in one line, with the reason.
5. **Next:** up to 3 suggestions. Anything that is a real change is already in Approvals.

## Decision rights
The CEO raises or lowers the COO's authority in **HQ › Settings › What your COO can decide**. The COO reads it every round through `inbox` (`controls.delegations`).

- **Level 0 (always on):** small fixes and bugs, approved in advance (`docs/team.md`).
- **Level 1 (switched on by the CEO, 2026-11-06):**
  - **The order of fixes:** which approved fix or `fix now` finding goes first.
  - **Research topics:** what the Monday research covers, within the owner's priorities.
  - **Posting times:** when an approved post goes into Metricool for review. Switched off, HQ accepts only the time already on the post.
- **Level 2 (later, one at a time, only when the CEO switches it on):** for example small copy fixes in drafts, situation batch topics, or which step of an approved feature comes first.
- **Never delegated:**
  - deploying anything that isn't a verified fix;
  - V3 merges, new features, design changes, pricing;
  - spending money or credits beyond the CEO's budget;
  - approving content for publishing; outbound messages;
  - subscriptions; deleting anything; security changes;
  - anything on the owner's red lines.

Every delegated decision is logged with `activity --role assistant --kind decision --text "Decided: …, because …"`. It shows under "Decided for you" in HQ and in the next brief. The CEO can reverse any of them by telling the COO.

## Budget (owner's brief, section 9)
Automated work aims for 35–40% of the weekly Claude allowance and never goes above 50%. Planning split:

| Departments | Share of the week |
|---|---|
| Engineering + QA + Customer Success | 20% |
| Research + Product | 5% |
| Marketing | 15% |
| Reserve | 10% |

The COO's own planning and briefs fit inside these shares. Before every new agent, run the usage gate in `docs/hq/workflow.md`. Never turn on extra paid usage.

## Requests to the CEO: the decision card (ADR 0028)
The owner, 2026-11-07: "it has to be very easy for me to trust it and know exactly what's going to happen… Someone reports to me, I approve, I deny, I do my changes. He comes back a second time, third time, until I say go." So a request is a card the owner can decide from alone. **HQ refuses a request that is missing any of this, for every kind** (small fixes and bugs never need a request):
- **The ask:** `--title`, one line.
- **Why:** `--why`, 1 to 2 lines, with a real fact.
- **Exactly what changes:** `--change`, 1 to 5 short lines (repeat the flag).
- **If yes / if no:** `--on-yes` (the exact next steps: who and when) and `--on-no`.
- **Effort and risk:** `--effort small|medium|large` and `--risk`, one plain line.
- **A recommendation:** `--recommend`.
- **At least one picture** (up to 4): `--preview shot.png:Label` (png, jpeg or webp, max 2 MB, uploaded to HQ, never a URL). Product & Design makes the pictures (`product-designer`); other departments ask for them with a Product & Design mission first.

**The loop.** The owner answers Yes, go / Send changes (with a note) / No.
- **Yes:** the COO creates or links a mission (`approval --start <approvalId> --mission <missionId>`). The same card keeps reporting from that mission: Approved (the owner's yes), Being built (mission `doing`), Ready for your look (mission `waiting`), Live (mission `done`, with its result and links), each with its date. Nothing goes silent.
- **Send changes:** the card goes back to its department with the owner's note (`inbox` lists it under `revisions`). The department sends `approval --revise <threadId|approvalId> --changed "what is different since the note"` with every field again. That makes version 2 (then 3, …) on the same thread, marks the old one superseded and pushes the owner.
- **No:** the thread is closed.
- **Old requests** (made before cards existed) show as "Being rewritten by your COO", have no buttons and don't count as needing a yes. `inbox` lists them under `needsRewrite`; the COO sends each again as a card.

## Where things live
- This file: the company.
- `.claude/agents/*.md`: each department's lead agent.
- `docs/hq/workflow.md`: the steps every round follows.
- `docs/hq/round-prompts.md`: the scheduled rounds' wording.
- HQ (`/admin/hq`): missions, decision cards (Work, "Your desk"), briefs, decisions, controls. The Office shows "Since you last looked": what was fixed and found without needing a yes.
