# The LifeFlow plan

The one plan for the whole company. Every chat and agent works from it and writes its work back into its own section. The details live in the documents each section links to. This page says what exists, who owns it, where it stands and what's next.

Started 2026-11-08 at the owner's request: "make sure all is in writing and they all follow the one big plan for LifeFlow… make sure everything they worked on is added to that big plan for that specific section… like a big headquarters… very systematic and organized, so the business can grow and scale."

## How this plan works (rules for every chat and agent)
1. **One plan.** This page is the index of everything LifeFlow is doing. If work isn't in a section here, it isn't planned.
2. **Each section has one owner chat.** Only that chat (or the COO) edits the section. Others send it a mission in HQ.
3. **After any real work**, the owner chat updates its section and pushes the edit to main with the work:
   - **Status:** what's live, what's built and held, what's in progress.
   - **Done:** a dated line with a link (commit, page or doc).
   - **Next:** the next step.
   - **Waiting on the owner:** if anything is.
4. **Report up, never around.** Results go to the COO first (an HQ record titled "For the COO: …", `docs/hq/company.md` "The chain of command"). The COO brings the owner only what needs him. Only the COO sends the owner briefs, decision cards and pushes.
5. **Decisions are written down where they're made:** product in `docs/vision.md` section 15, marketing in `docs/marketing/PLAYBOOK.md` section 6, company and agents in `docs/hq/company.md` and `docs/team.md`, technical in `docs/adr/`. This plan links to them; it doesn't copy them.
6. **Start fresh without losing anything.** When a chat gets long, it updates its section here and its handover doc. A new chat can then pick up from the plan alone. (Each chat also compacts itself at 75%, CLAUDE.md "Context".)

## 1. The company

```
                         CEO (the owner)
             ┌───────────────┴───────────────┐
   CMO (your partner, not on Claude Code)     COO  ·  "LF COO" chat (the only chat the CEO needs)
             │ leads                           │ runs, coordinates, reports
   Marketing & Growth ◄──── works with ────────┤
                                               │
   ┌──────────────┬──────────────┬─────────────┼──────────────┬──────────────┬──────────────┐
   Engineering    Product &      Quality &     Research &     Customer       HQ (internal
   "LF Main"      Design         Security      Insights       Success        tools)
                  "LF V3"        (COO rounds)  (COO rounds)   (COO rounds)   "LF HQ"
```

- **CEO, the owner:** sets direction and answers decision cards. Talks to the COO; can open any department chat to dig in.
- **CMO, the owner's partner:** a real person, not on Claude Code. Leads Marketing & Growth with the CEO. The Marketing chat and the COO take the CMO's direction the same way they take the CEO's (written into the playbook). HQ shows the CMO seat as "Coming soon" until they get their own sign-in, which needs its own security review.
- **COO:** `.claude/agents/coo.md`, on Opus. Runs every round, keeps this plan current, and brings the CEO one brief per round plus decision cards. Details: `docs/hq/company.md`.

**The chats: one per department, and the only ones to use**

| Chat | Department | Session | Branch | Owns these sections |
|---|---|---|---|---|
| **LF COO** | COO: rounds, briefs, this plan | `session_01Mhcz6DL7P1jhw4V8cnh4pE` | `claude/chief-of-staff` | 1, 6, 7, 10, 11 |
| **LF Main** | Engineering: the app as it is today | `session_014H9m2SQ58sgx7ZG8Ntv7Zx` | `main`, plus held branches | 3, 4, 9 |
| **LF V3** | Product & Design: the vision and the new surface | `session_01Mhcz6Ao4XdmNh3eAPYd3QN` | `v3-day-clock`, `claude/pensive-mendel-r1yy4a` | 2 |
| **LF Marketing** | Marketing & Growth | `session_01Mhcz6CyarVMRum5SxqLMqM` | `claude/lifeflow-ad-reel-higgsfield-s3r3v1` | 8 |
| **LF HQ** | HQ: the admin area and the company's tools | `session_01Mhcz6BtYDPTHBytp9oyjLZ` | `claude/sharp-lovelace-8fr6z5` (kept equal to main) | 5 |
| HQ sync | A helper: copies every chat's status into HQ hourly. Never needs opening. | `session_01Mhcz6C2smYHWY1gvs4Jt75` | none | none |

Quality & Security, Research & Insights and Customer Success have no chat of their own. They are lead agents (`.claude/agents/*.md`) that the COO runs in the night and Monday rounds.

**Chats merged on 2026-11-08** (their open work moved into the sections below; archived chats can be reopened):
- **"LF COO (old, Sonnet)"** went into LF COO. It was dormant and fully replaced, and its scheduled tasks were already off.
- **"Harden Apple Health ingest rate limit"** went into LF HQ. Its title was out of date; it had become the HQ building-pictures chat and was idle, waiting on the owner's feedback, which now goes to LF HQ.
- **"LifeFlow v3 · Day clock (build here)"** went into LF V3. It worked on the same branch and the same artifacts, and two chats on one branch risk clashing pushes. The empty-clock fix is now LF V3's.
- **"LF Managing Agents"** (the nightly audits chat, `claude/nightly-audits`) goes into LF COO. The COO's scheduled rounds now do its job, and its own scheduled tasks are off. Its last round is in `docs/audits/2026-11-07-hq-audit.md`.

**Scheduled tasks (all on the COO unless noted)**
- Night round: Sun, Tue and Thu at 3:07 AM.
- Research and weekly plan: Mon at 3:23 AM.
- Marketing round: Wed at 3:41 AM.
- COO pass: every 2 hours, 8 AM to 10 PM.
- HQ sync: hourly, 7 AM to 11 PM (HQ sync chat).
- Desk task starter: on demand (HQ).
- School Project film research: every other day (LF Marketing, ends Nov 30).

All times are Pacific. The wording is in `docs/hq/round-prompts.md`.

## 2. Product: the vision and the new surface (V3). Owner: LF V3
**Where the details live:**
- `docs/vision.md`, the vision; its section 15 holds the decisions and open questions;
- `docs/design/clock/spec.md`, the clock spec; section 7 is what's built;
- `docs/adr/0032-north-star-life-connected.md`, which is still "proposed";
- `docs/plan-v2.md`;
- `docs/research/`;
- `docs/hq/handover-from-product-chat.md`.

**Status:** the new surface is being built on `v3-day-clock` (29 commits ahead of main, not merged). It is a copy of the live app with:
- four tabs: Today, Assistant, Money, School;
- a day clock showing the next 24 hours on two rings;
- a timeline that holds the whole life: to-dos, goals, milestones, Someday and Done;
- everything with a time flowing onto both (calendars, shifts, deadlines, reminders, and money behind the lock);
- "Pin something".

Full check and phone e2e passed on 2026-11-08. The artifact "LifeFlow Day Clock" shows it on a made-up student week. Nothing reaches main without the owner's yes on a picture.

**Done:**
- 11-07: the V3 home spec and prototype, from the owner's storyboard.
- 11-07 and 11-08: the clock rim shows the 12 hours around now.
- 11-08: the clock, the timeline and all time-bound data were built on `v3-day-clock`.

**Next:**
- Fix the clock looking empty and the timeline not being editable. The owner reported both on 11-08 at 6:04 AM and approved anything needed to fix them. This was moved here from the Day clock chat.
- Rebuild the Day Clock artifact after clock changes.
- The ADR 0032 proposals ("Tonight", "What this costs", timeline connection lines, a widget or watch) are not built and need the owner's yes.

**Waiting on the owner:**
- confirm ADR 0032 (the North Star);
- pick a timeline concept;
- the Goals redesign A and Connected accounts cards (HQ lists them under "needs rewrite");
- the go to merge V3 into main.

## 3. The app today (Engineering). Owner: LF Main
**Where the details live:** `CLAUDE.md` (all product and technical rules), `docs/architecture.md`, `docs/schema.md`, `docs/integrations.md` and `docs/adr/`.

**Status:** main is live at lifeflowweb.com. These are built and held on branches, waiting for the owner's go:

| Branch | What it is | Ahead of main |
|---|---|---|
| `phone-sign-in` | A code by text once the Twilio number is connected; email until then. Tests pass. | 1 commit |
| `still-building` | "Still in the testing phase" note on unbuilt screens | 2 commits |
| `north-star` | The assistant's read-only "tonight" tool: the next 24 hours of due items, shifts, free hours, and cash minus bills | 1 commit |
| `v3-day-clock-north-star` | north-star on top of V3, so both can be seen together. The Vercel preview hadn't been checked. | 29 commits |

**Done:**
- 11-07: name asked on /welcome; new landing page.
- 11-07 and 11-08: Promises: the assistant remembers what you said you'd do and checks back once. It's on main.
- 11-07, by the night round: plain form errors, failed saves keep what was typed, and the onboarding name hint (audit H1 and H2).

**Next:**
- Run the full test suite on the combined branch and check its preview.
- A "Tonight" card on Today or the clock, picture first.
- Coordinate migration numbers with HQ before merging phone sign-in (CLAUDE.md lists the order).

**Open fixes** (the COO's night rounds pick these up):
- money totals vs forgiving name matching, which needs a decision;
- the "Same bill?" card's Undo window;
- "7-Eleven" tidying to "Eleven";
- audit H3 and H4 (cards in HQ).

**Waiting on the owner:** the go on each held branch above.

## 4. The assistant's brain (Dev) and the situation library. Owner: LF Main (engineering) with Research
**Where the details live:**
- `docs/jarvis-intelligence.md` and `docs/jarvis-eval.md`, where "Jarvis" is only the internal code name, never shown to users;
- ADR 0005, 0006, 0021 and 0023;
- `docs/situations/` (the library, `COVERAGE.md` and the simulator).

**Status:**
- **Situations:** 30 cases, all valid. Students are 63%, under the 70% target, so the next batches lean toward students.
- **The simulator:** it now holds investments with cost basis.
- **The owner's latest money rule** (vision section 15, item 14, "look across every account, gentlest first"): s0026 to s0028 test it.

**Next:**
- Student-heavy situation batches in the night rounds.
- The learned models in ADR 0023, each only once it meets its targets.

## 5. HQ: the admin area and the company's tools. Owner: LF HQ
**Where the details live:**
- `docs/hq/plan.md`, `company.md`, `workflow.md`, `round-prompts.md` and `desk.md`;
- ADR 0022 and 0024 to 0030;
- `CLAUDE.md`, "LifeFlow HQ".

**Status:** live at `/admin`, with five places (Office, Work, Marketing, People, App) and the settings gear. It includes the desk, live HQ (what each chat is doing right now), the hourly sync, decision cards and the building pictures. The night round on 11-07 audited it: the founder-only locks, the API key checks and the card rules all hold.

**Done:**
- 11-06: the HQ build.
- 11-07: the desk start fix, live HQ, HQ sync, the simplified Office and the building pictures, all on main.

**Next:** the open ADR 0030 questions (per-chat keys, live-line wording).

**Waiting on the owner:**
- **The desk task starter:** in Claude's scheduled tasks, set "LifeFlow desk task starter" to the LIfeFlow repo only and add an API trigger and token. Then add `HQ_DESK_FIRE_URL` and `HQ_DESK_FIRE_TOKEN` in Vercel and redeploy. Until then the desk opens a link instead.
- **Feedback on the building screenshots** (moved here from the merged chat).

## 6. Quality & Security. Owner: the COO (agent `qa-security`)
**Where the details live:** `docs/audits/`, `docs/playbook.md` (red lines, definition of done) and `tests/e2e/`.

**Status:** the newest audit is `docs/audits/2026-11-07-hq-audit.md`. It found 2 fixes, both shipped, and 2 items for the owner (H3, H4). Every night round audits what changed plus one area not yet covered.

**Next:** in the next night round, audit V3 on its branch before it's proposed for main.

## 7. Research & Insights, and Customer Success. Owner: the COO (agents `market-researcher`, `situation-writer`, `customer-success`)
**Where the details live:** `docs/research/`; things to avoid become rules at once (CLAUDE.md).

**Status:**
- Research runs weekly on Monday.
- The newest report is about notifications that bring people back. Its 15 things to avoid are rules for every push.
- Customer Success turns new error groups into Engineering missions every night round.

## 8. Marketing & Growth. Owners: the CMO and the CEO, with the LF Marketing chat
**Where the details live:**
- `docs/marketing/PLAYBOOK.md`, the source of truth. The fuller copy is on the marketing branch and needs landing on main.
- `docs/marketing/skills/README.md`, the content skills and LifeFlow's rules over them.
- The film plan doc, https://claude.ai/artifact/J4Qmes1s6mVYjLgxy3xBiY.

**Status:**
- **Instagram @lifeflowweb:** it is the only account. The owner has posted several of the videos himself, and their numbers will show once Instagram is properly connected in Metricool.
- **Main project:** "The School Project" relaunch film. The teaser is Sun Nov 29 and the premiere is Mon Nov 30 at 10 AM PT. Test shoots are underway.
- **Waiting list:** the rank rises with friends who join. It's planned for the website, later.
- **Posting:** one tap per post by the owner. Nothing is published by an agent.

**Owner decisions (11-07 and 11-08):**
- The audience is everyone with a full life, not only students.
- Cost cuts: raw footage only, no generated music, stills before motion, edit locally.
- Sterling is the standard male voice, but only for the student spot. Sample any other voice for 5 seconds first.
- The film gets an Arabic dub. The AI cinema scene comes later, with no credits until the owner says.
- Videos to keep arrive as zip files.

**Next:**
- Tonight's test shoot.
- Land the fuller playbook on main.
- Connect Instagram in Metricool properly, then add each posted video's real numbers to playbook section 5b.

**Waiting on the owner:** filming; any voice sample; spending credits.

## 9. Launch: App Store, deploys and connections. Owner: LF Main (the owner does the account steps)
**Where the details live:** `docs/go-live-checklist.md` and `docs/native-app-plan.md`.

**Status:** the web app is live. HQ has open desk tasks for:
- Ship to the App Store;
- Finish Twilio (text your assistant, phone codes);
- Microsoft Teams and other email providers;
- Plaid end to end;
- the Vercel setup.

**Price** (owner, 11-05): $9.99 a month, or $5.99 for students. Free while testing.

## 10. The owner's list (only the owner can do these)
1. Join the Apple Developer Program (blocks the App Store).
2. Register in Microsoft Entra (blocks Teams).
3. Request Plaid Production access (blocks real banks).
4. Connect the Twilio number (blocks texting the assistant, phone sign-in and the after-shift message).
5. Set up the desk task starter: a scheduled task API trigger and token, plus two Vercel variables (section 5).
6. Connect Instagram in Metricool as a professional account with all permissions (section 8).

## 11. Waiting for the owner's yes (one list; details in HQ › Work)
- **V3:** confirm the North Star (ADR 0032), pick a timeline concept, and give the go to merge V3.
- **LF Main's held branches:** phone sign-in, the "Still in the testing phase" note, and the tonight tool.
- **HQ cards:** H3 (remove the typed-paycheck form) and H4 (a 404 for signed-out visitors to /admin).
- **Older cards being rewritten** (Goals redesign A, Connected accounts, the timeline concepts, Gmail abilities, search bolding, the agent workload, "Same bill?" outside the inbox).
- **Marketing:** voice samples and credit spending.

## 12. Change log
Newest first. One line per real change, by the chat that made it.
- 2026-11-08, LF Managing Agents: wrote this plan; merged 4 chats (section 1); renamed the remaining chats to one-per-department names.
- 2026-11-07, LF Managing Agents: round on "go". 3 fixes shipped to main (plain form errors, failed saves keep input, onboarding name hint), 5 situations, an HQ audit, 2 cards for the owner. The content skills were added for Marketing (`docs/marketing/skills/`).
- 2026-11-07 and 11-08, LF Main: Promises on main; phone sign-in, the testing-phase note and the tonight tool built and held.
- 2026-11-07 and 11-08, LF V3: the V3 spec, prototype and day clock built on `v3-day-clock`.
- 2026-11-07, LF HQ: the desk, live HQ, HQ sync, the simplified Office and the building, on main.
- 2026-11-08, LF COO: the owner's list created; marketing decisions recorded and handed to Marketing.
- 2026-11-08, LF Marketing: the School Project dates, voice rules, the Arabic dub and the cost cuts.
