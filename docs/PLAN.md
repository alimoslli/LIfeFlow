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
| **LF Main** | Product, design and engineering: the app on main | `session_01Mhcz6Ao4XdmNh3eAPYd3QN` | `main` | 2, 3, 4, 9 |
| **LF Managing Agents** | Managing agents, beside the COO (the owner kept it, 2026-11-09) | `session_01Mhcz6BYyF8TLLXwBiWcWyk` | `claude/nightly-audits` | none |
| **LF Marketing** | Marketing & Growth | `session_01Mhcz6CyarVMRum5SxqLMqM` | `claude/lifeflow-ad-reel-higgsfield-s3r3v1` | 8 |
| **LF HQ** | HQ: the admin area and the company's tools | `session_01Mhcz6BtYDPTHBytp9oyjLZ` | `claude/sharp-lovelace-8fr6z5` (kept equal to main) | 5 |
| HQ sync | A helper: copies every chat's status into HQ hourly. Never needs opening. | `session_01Mhcz6C2smYHWY1gvs4Jt75` | none | none |

Quality & Security, Research & Insights and Customer Success have no chat of their own. They are lead agents (`.claude/agents/*.md`) that the COO runs in the night and Monday rounds.

**Chats merged on 2026-11-09** (owner):
- **The old "LF Main"** (`session_014H9m2SQ58sgx7ZG8Ntv7Zx`, archived) and **"LF V3"** are now one chat, LF Main (the former LF V3 session). The owner merged V3 into main (PR #3, e524c53) and said to keep working on main, so one chat pushes to main. The old LF Main had nothing in flight; its last work (the deploy-step fix) is live. `v3-day-clock` and `v3-day-clock-north-star` are no longer used.
- **"LF Managing Agents"** stays open: the owner wants it, so it is no longer folded into LF COO.

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

## 2. Product: the vision and the new surface. Owner: LF Main
**Where the details live:**
- `docs/vision.md`, the vision; its section 15 holds the decisions and open questions;
- `docs/design/clock/spec.md`, the clock spec; section 7 is what's built;
- `docs/adr/0032-north-star-life-connected.md`, which is still "proposed";
- `docs/plan-v2.md`;
- `docs/research/`;
- `docs/hq/handover-from-product-chat.md`.

**Status:** the new surface is on main and live (the owner merged V3, PR #3, 2026-11-09; he has no users yet, so it went straight to main). It is the live app with:
- four tabs: Today, Assistant, Money, School;
- Today as "the mechanism" (spec 7b, 7d): a wheel of time in the real sky (full screen by default, a widget card in Settings), the companion running on top while the day's things roll back under it; drag, flick, trackpad, mouse wheel or keys to turn through the week, "Back to now", and a tap pours it into Day Sky's timeline (a hill a day, a valley a night, the sky of every hour);
- a sky with moods (clouds, rain, a December snow with lights) and rare visitors (shooting stars, birds, a little craft), and a burst of sparks when something gets done;
- the morning logo (the sun rising on the horizon) on the icons, the top bar and the opening;
- the real-sky colours everywhere, no purple (owner);
- a timeline that holds the whole life: to-dos, goals, milestones, Someday and Done, with piles that name themselves ("9 assignments");
- everything with a time flowing onto both (calendars, shifts, deadlines, reminders, and money behind the lock);
- "Pin something".

Pictures: `docs/design/tonight/` and `docs/design/brand/morning-mark.png`. What changed overnight, for the owner: `docs/hq/tonight-2026-11-09.md`.

**Done:**
- 11-07: the V3 home spec and prototype, from the owner's storyboard.
- 11-08: the owner moved the clock to the next 24 hours from the hand, on two rings: the inner ring is the next 12 hours, the outer ring the 12 after.
- 11-08: the clock, the timeline and all time-bound data were built on `v3-day-clock`.
- 11-08: the timeline cards became editable and the clock is never empty (46842e8), after the owner's 6:04 AM report:
  - events, shifts and assignments open Plan's editor in place, with delete inside it;
  - to-dos, goals and milestones open their own page;
  - overdue items show as one marker at the hand;
  - all-day plans read "today" or "all day";
  - a quiet face counts what the timeline holds.
- 11-08: main merged into `v3-day-clock` (ca873df). It brought promises, this plan and the HQ test fix. The promise check now runs on open, before the clock. The check is green (1158 tests), and so are the clock, core and promises e2e.
- 11-09 night (owner's go to work on main while he sleeps): the mechanism, step 1 (c4a4032: Day Sky's timeline back, the pour, full sky, bigger companion) and step 2 (b5b54eb: one input layer, momentum that lands, laptop size, no boxes on a laptop); the morning logo (2fb42a6); moods, visitors, the done burst, the tour, the welcome on the sky. Details and pictures: `docs/hq/tonight-2026-11-09.md`.
- 11-10 (owner, decided with LF Marketing): "Changes with the sky", a seventh skyling choice: whoever's moment it is shows (Dawn first light, Ray morning, Noon midday, Goldie golden hour, Dusk after sunset, Star night) from the day's real sunrise and sunset (`skylingAt`, `resolveSkyling`); one name and one talking style all day. In the welcome and Settings; the wheel follows the time on show and hops the next one in. Picture: `docs/design/tonight/changes-with-the-sky.webp`.
- 11-10 (owner's yes on both birthday items): the birthday is required to finish or skip setup (checked on the server); an under-13 answer locks the welcome for that account with one calm line, keeping only the flag; accounts from before are asked once on Today; the Privacy Policy says what birthday, school and work are for and that they never go to the AI.
- 11-09 (owner: "catered to the new app"; classes come from syncing their school calendar, not typing): the welcome is meet the skylings, about you (name, birthday 13+, what fills your week, school or work), connect your sky (Canvas feed right there, Google and Microsoft come back to the step, what they bring lands on the opened wheel), read your sky (learn by doing). The made-up demo day and the typing forms are gone.
- 11-09 (owner's top priority): the first run remade on the skylings' night: landing page, sign-up and sign-in, welcome and tour, with all six skylings together in one living pixel sky (components/skylings) and new buttons tried on these four places only. Pictures: `docs/design/tonight/first-run-*.webp`. Next: the done star as a pixel character (#28).
- 11-09 (owner): "assistant", "AI assistant" and "personal assistant" are gone from every screen, notification, email, the landing page and the legal pages; the character is a **skyling** (owner picked it from LF Main's honest take: companion, partner, sidekick and buddy are all taken in AI), "your skyling" until it's named; the pitch doesn't lead with AI, and two e2e tests fail on "assistant".
- 11-09: the owner's names: V2 was the clock with self-naming piles (518d37a), V3 was V2 plus Morrow. Today became the sky card (owner picked B), then a wheel of time (5e11dbb, 5224c57, d988772) in the real-sky colours (2b002c8). A Fable review found 6 bugs, all fixed. Phone e2e 7/7 with a new wheel test; 1162/1162 unit and integration tests. The owner merged it all into main (PR #3).

**The owner's reset (2026-11-10 evening, his words: "we went off track with the layout"; he answered four questions). In order:**
1. Done 11-10 (see change log). Today, one screen, no blank scroll: the sky on top, the idea clouds filling the middle, the chat bar at the bottom. The answer shows in the middle, in place of the clouds (owner picked). No Health/Work buttons on Today. The chat bar stays when the day opens into a timeline, and the space under the line gets room. LF Main.
2. Done 11-10 (Word and PowerPoint attach too, eeedc6d). The skyling's tab is back in the bottom bar on every page; the skyling bar on other pages goes. The tab opens the skyling's page with its design and catchphrase, clouds instead of suggestion boxes, and attaching files with our own icon. LF Main, with the COO (shell).
3. Done 11-10. One chat that keeps going, from Today or the skyling's page; no "new chat" every time (owner picked). LF Main.
4. Sign-in: a phone is remembered for 30 days after one code, and Google sign-in skips our code (owner picked both). LF Main, reviewed by QA & Security.
5. Done 11-11: Today and the line (6a7e37f, LF Main); Money, School, Calendar, To-dos and Settings ([f67b456](https://github.com/alimoslli/LIfeFlow/commit/f67b456), reviewed in [66a892f](https://github.com/alimoslli/LIfeFlow/commit/66a892f), report `docs/audits/2026-11-10-plain-words.md`). Plain words everywhere: short, no big text boxes, and nothing behind-the-scenes on screen (hints, internal labels). Today and the line first, then every page. LF Main and the COO.
6. Fewer pages: nothing opens another page for no reason; merge where it helps; easy navigation. Picture first. The COO. **Owner: yes (2026-11-10)** to the page map (40 pages to 26, 13 merges; HQ card "Work, Health, Goals redone like Money, and 40 pages down to 26"). Simplified, never removed: every feature stays, moved into a section, a switch or a pop-up, and every old address redirects. Settings merges (10 to 12) last.
7. Done 11-10 (Work a2ef3b2, Goals 55e9834, Health adb807f). People with no classes get a Work tab instead of School; Work, Health, Goals and Milestones redone to look as good as Money and School. Pictures first. The COO, then LF Main builds. **Owner: yes (2026-11-10)** to the four pictures (same card). Forms stay one tap deeper behind "+": Record a paycheck (kept, owner 2026-11-08), Log for Health (people without Apple Health), Goal and Milestone.

**Next:**
- From the owner's retouch list (relayed 2026-11-09) and the A-to-Z audit (`docs/audits/2026-11-09-a-to-z.md`): the welcome's "Your day, connected" on the wheel; the landing hero as the real sky and wheel; a time-true line and the uncurl morph (research P3/P4); the laptop two-column Today; the character cast (names from times of day, personalities); a setting for sky moods.
- The welcome's Canvas card connects through the Pro-only Canvas action: once paid plans are on, a free user would hit "part of LifeFlow Pro" mid-welcome. Decide before billing goes live: let Canvas connect free in the welcome, or show the plan there (pricing is the owner's call). (QA review of b9f7a21.)
- Rebuild the Day Clock artifact after clock changes.
- The ADR 0032 proposals ("Tonight", "What this costs", timeline connection lines, a widget or watch) are not built and need the owner's yes.

**Waiting on the owner:**
- confirm ADR 0032 (the North Star);
- pick a timeline concept;
- the Goals redesign A and Connected accounts cards (HQ lists them under "needs rewrite");
- the 36-to-20 pages map (which pages merge or go): https://claude.ai/artifact/W4AKTMLrTML3tnqLBsTm4b, section 2.

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
- 11-10, owner via the COO: the skyling answers on Today. The bar under the sky sends through the same chat (limits, AI permission, saved conversation) and the answer streams into a card under it: what was saved, Undo, Do it / Not now, Confirm, "Open the chat"; what it saves is on the sky at once (`_today/today-chat.tsx`, `tests/e2e/today-chat-phone.spec.ts`).
- 11-10, overnight (owner approved): every page, sheet and first-run step checked on phones, laptops, dark mode, an empty account, sideways and with an accessibility scan; what broke is fixed and tested (change log, and `docs/hq/tonight-2026-11-09.md` §28). Full e2e on main at each step.

**Next:**
- **The audit and waitlist backlog** (owner, 2026-11-11): `docs/backlog/2026-11-11-audit-and-waitlist.md`. The waitlist first (close public access before the January 2027 App Store launch, let people in in batches from HQ), then money totals and exports, authorization and retries, offline, AI costs, scale, tests and the UX proposals. One small step per session on its own branch (`claude/waitlist`), never merged, deployed or switched on without the owner. LF COO.
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
- **The noticing grader** (`docs/situations/eval/notice/`, no AI, 10 very different people x 5 lives; [results](situations/eval/notice/RESULTS.md)): after the 11-10 fixes, bills short 44/44 caught, deadline after a long shift 128/128 with no false alarms, clashes 49/55, price rises 18/18, unusual charges 23/26. Since the owner's yes (2026-11-11), also said out loud: two subscriptions doing the same job (20/23) and a big first charge somewhere new (25/28), with no new false alarms.

**Next:**
- Student-heavy situation batches in the night rounds.
- The learned models in ADR 0023, each only once it meets its targets.

## 5. HQ: the admin area and the company's tools. Owner: LF HQ
**Where the details live:**
- `docs/hq/plan.md`, `company.md`, `workflow.md`, `round-prompts.md` and `desk.md`;
- ADR 0022 and 0024 to 0030;
- `CLAUDE.md`, "LifeFlow HQ".

**Status:** live at `/admin`, in the app's Day Sky look since 11-09, with five places (Office, Work, Marketing, People, App) and the settings gear. It includes the desk, live HQ (what each chat is doing right now), the hourly sync, decision cards and the building pictures. The night round on 11-07 audited it: the founder-only locks, the API key checks and the card rules all hold.

**Paused for new work** (owner, 11-10, through the COO) until the relaunch work is done. Nothing is removed or switched off: the Office, Work, People, App, the hourly sync, decision cards and rounds keep running. Only bugs that break something that exists get fixed, plus anything the owner asks LF HQ for directly (and LF HQ tells the COO).
- **The one exception the owner asked for today:** a line on Admin › People for accounts "Locked under 13, has a paid plan: review". LF Main may build it, coordinated through the COO; LF HQ builds it only if the COO asks.

**Checked 11-08:**
- The hourly sync runs: its last three runs were all accepted, 9 chats each.
- The desk task starter exists but has no API token yet, so the desk opens a link.

**Done:**
- 11-06: the HQ build.
- 11-07, all on main:
  - the CEO in the penthouse redrawn from the owner's photos ([e4fa73c](https://github.com/alimoslli/LIfeFlow/commit/e4fa73c));
  - live HQ and starting a desk task from HQ ([4919160](https://github.com/alimoslli/LIfeFlow/commit/4919160));
  - the HQ sync ([c7f4b4e](https://github.com/alimoslli/LIfeFlow/commit/c7f4b4e));
  - the simpler Office: "Needs you" and "Working now" first, logs moved to the department pages, the COO in plain words ([e8ad461](https://github.com/alimoslli/LIfeFlow/commit/e8ad461)).
- 11-09: the admin area and HQ wear the app's new sky look, and fit a MacBook (ADR 0029, addendum 4; [d447953](https://github.com/alimoslli/LIfeFlow/commit/d447953)). The owner had said "nothing changed" there after V3.
  - **The look:**
    - the menu as frosted glass on the sky;
    - the COO's brief as a clear sky;
    - the sun's amber in place of gold;
    - frosted glass over the hour's sky, with no hard borders;
    - the building standing in the sky (day or night).
  - **On a MacBook:** a wider page, two columns on the Office and bigger titles.
  - **Unchanged:** the pictures, and the phone layout.
  - **Audit fixes F2 to F4:** People no longer shows its title twice; the "how the app is running" line is short; every field and button is a full 44 px.
- 11-09: who was active today (owner). Tapping "Active today" on the Office or on App → Growth opens People with only the accounts seen in the last 24 hours, newest first, with a "Seen today" menu and "Show everyone" ([da01e2f](https://github.com/alimoslli/LIfeFlow/commit/da01e2f)). "Last seen" is now stamped every 10 minutes of use instead of once a day, so the list and "Seen 2 h ago" are right.

**Next:**
- Keep the HQ sync chat light (upkeep that protects the owner's Claude allowance, so it goes on during the pause):
  - **Why:** it rereads its whole history every hour, and that history grows each run, which uses the owner's Claude allowance.
  - **What:** when it gets long, start a fresh sync chat and point the hourly scheduled task at it.
  - **Then update:** the chat's id in `CLAUDE.md` and in section 1's table.

**On hold until the pause ends:**
- The open ADR 0030 questions: per-chat keys and live-line wording.
- **Idea, waiting for the owner's go (not being built): the Planning Room** (owner, 2026-11-09).
  - **What it is:** HQ's group chat, a meeting room where everything said is heard by everyone in HQ. It lives on the Office, as a room in the building you tap, not a new menu item. The point is that the whole team stays connected and on the same page.
  - **Who talks to whom:**
    - Departments post only the major things they did, and their questions, to the COO. They don't talk to the owner directly.
    - The COO answers what it can and brings the owner only the big asks.
    - **It replaces the COO's brief** (owner: the brief isn't that good). The Office's brief card goes away, and the COO says its round summary in the room in a few short lines, like everyone else.
    - The owner can talk to anyone; everyone sees everything.
  - **How it sounds:** short human words, like a friends' or team group chat ("Fixed the calendar thing, Outlook events show up on time now"). No AI-chatbot tone, no flooding, and no "starting" or "still working" messages. Every line comes from a real record, with a tap to the proof.
  - **Rules:**
    - Only the owner's words are orders. Agents' posts are updates, never instructions to each other.
    - When the owner names a department, only that one acts; otherwise the COO decides who.
    - Each agent reads only what's new since its last round.
    - Big yeses (going live, spending, publishing) still use the decision card.
    - The COO copies decisions into the plan and rulebooks, so nothing lives only in the chat.
    - Replies are picked up at each agent's next round, and the room says when.
  - **Open:** whether questions buzz the owner's phone (updates stay silent). A picture comes first, before any building.

**Waiting on the owner:**
- **The desk task starter:**
  1. In Claude's scheduled tasks, set "LifeFlow desk task starter" to the LIfeFlow repo only.
  2. Add an API trigger and generate its token.
  3. In Vercel, add `HQ_DESK_FIRE_URL` (the trigger's fire address) and `HQ_DESK_FIRE_TOKEN`, then redeploy.

  The token goes only into Vercel, never into a chat. Until then the desk opens a link, which already starts the right chat with the right first prompt.
- **A look at the building as it is live now**, with the CEO redrawn from the owner's photos on 11-07. If anything looks off, send LF HQ a photo of it. This item moved here from the merged building-pictures chat.

## 6. Quality & Security. Owner: the COO (agent `qa-security`)
**Where the details live:** `docs/audits/`, `docs/playbook.md` (red lines, definition of done) and `tests/e2e/`.

**Status:**
- Newest audit: `docs/audits/2026-11-08-night-audit.md` (Promises and the /welcome flow). No high-severity findings. 4 small Promises bugs became Engineering missions (2 high: "Tomorrow instead" re-asks at once after a late answer; a mis-sorted promise can't be removed). 2 items for the owner (section 11).
- Shipped on 2026-11-08 night: "7-Eleven" kept as a name (19523d3) and the "Same bill?" Undo window (85fdbb7), each with tests; full check, build and the inbox phone e2e passed.
- App Store readiness: `docs/audits/2026-11-08-app-store-readiness.md` (biggest risks: Apple's "just a website" rule and missing in-app purchase; 13 owner steps, 14 engineering steps).

**Next:** fix the 2 high Promises bugs; audit V3 on its branch before it's proposed for main; a rendered phone pass of /welcome.

### The product excellence program (owner-approved 2026-11-10; run by the COO on Fable, screens by LF Main)
The owner approved 12 improvements after a fresh walk through the app ([baseline](audits/2026-11-10-product-baseline.md)). Order: reliability, notifications, onboarding and the AI first; design after. Small fixes ship after tests and an independent review. Major changes (4, 6, 7, 8, 9, 10) are built and held, with pictures, until the owner approves each. Admin and HQ development is paused (12); nothing there is removed.

| # | What | Who | Status |
|---|---|---|---|
| 1 | Under-13 erase safety | COO, then LF Main | Server fix live (`4fbe0689`); LF Main has the rest |
| 2 | Reminders on time (the notify job every 10 minutes) | COO | Live |
| 3 | Ask for notifications at the right moment | LF Main | Queued |
| 4 | AI cost and speed, measured, no loss of quality | COO | Live 2026-11-10 (`e732dc78`, `b570c1c8`). Same eleven questions, real model: all eleven 66 s → 44 s; setting up a week from one message 21 s → 5 s and 8 tool calls → 1 (`set_up_schedule`); "can I afford" is one call and the same verdict every time, decided by our code from Available now ("this weekend" is always through Sunday); "find me 2 hours" now checks free time. Output tokens −57%, input +13%, cost about the same. Reviewed twice independently, findings fixed with tests |
| 5 | Rough edges from the walk | LF Main | Live: the floating button is gone (COO), Today's card and voice bar show the person's own skyling, /welcome keeps its place, the heads-up shows on phones, the top-left logo is the pixel sun (`a1c23d81`, `518f1485`) |
| 6 | One sky, fewer doors | Live on phones (COO) | The owner picked A, three places, then put the COO in charge of the look and said to get it done now (2026-11-10). Built, tested and live: three tabs and More, the skyling as a bar, Everything else as doors with live lines. Picture sent to the owner; reverting is one commit. Money's three plain rows are live too. Updates stay their own page, one tap from the skyling's face on the dock (a dot when something is new): putting them on Today would crowd it ("show only what helps"); the owner can say otherwise |
| 7 | The first minute ends on a full sky | LF Main | Live 2026-11-10 (owner approved the changes we can make; COO's go). Done means: (1) sign-up to a usable Today in the welcome's steps only, no tour after it (was 4 steps + an 8-step tour, now 4 + 0); (2) the welcome ends on their own Today with something real on the sky: a connection, or a week told in one message right on "Connect your sky" (`TellWeek` → the chat's own route and limits, AI permission asked in the box, `set_up_schedule`), nothing invented; (3) what the tour taught that still matters is in place: the welcome's "Read your sky" (turn, open, fold) and one hint on Today, the bar's first-visit placeholder, shown once, never over content, not under automation unless asked; (4) "Replay the tour" stays in Settings (it now really replays: a full load of Today); (5) `tests/e2e/first-minute-phone.spec.ts` walks the real welcome to Today with the told week on the sky, no tour, the hint once; (6) before/after picture for the owner |
| 8 | One-tap fixes ("Do it" with Undo) | COO (chat side), LF Main | Live in the chat: an answer that offers to do something gets "Do it" and "Not now"; an answer that created to-dos or calendar events gets Undo, which takes back exactly those (anything changed since is kept and named), once, within a day (`do-it-phone.spec`, `chat-undo.test`, reviewed twice). Update cards already had Do it and Undo |
| 9 | Daily rhythm (morning, evening, weekly) | COO | Live: already built (morning brief with "Plan my day", evening wrap-up with one-tap "Move to tomorrow", Sunday review), and since item 2 they arrive at each person's own time without opening the app. With the Money lock on, pushes and cards no longer show amounts (`e05251d0`, `1b968e49`, reviewed) |
| 10 | Settings in our own form | COO | Live: Settings comes up from below as doors with pixel pictures, pages named as their doors, sky switches |
| 11 | Laptop Today uses the screen | LF Main, checked by the COO | Live: at 1280 and 1440 wide the sky fills the width with the skyling's card and bar beside the wheel (was about half the screen in the baseline). The idea cloud and name tag no longer sit on the bar (`idea-clouds-phone.spec` checks it) |
| 12 | Pause Admin and HQ development | LF HQ | Paused 2026-11-10 |

Last: done 2026-11-10 evening ([the walk and the numbers](audits/2026-11-10-product-after.md)). Next: a new marketing and relaunch plan for the owner's approval, and the 10-student test.

## 7. Research & Insights, and Customer Success. Owner: the COO (agents `market-researcher`, `situation-writer`, `customer-success`)
**Where the details live:** `docs/research/`; things to avoid become rules at once (CLAUDE.md).

**Status:**
- Research runs weekly on Monday.
- The newest report is about notifications that bring people back. Its 15 things to avoid are rules for every push.
- Customer Success turns new error groups into Engineering missions every night round. On 2026-11-08 the only group was one old hydration mismatch (Nov 4), not growing.
- Situations: 35 cases. Batch 5 (s0031 to s0035) adds non-hourly earners (photographer, tutor, reseller, delivery driver) and Promise cases. Students are 66% of the library against the 70% target, so the next batches lean student.

## 8. Marketing & Growth. Owners: the CMO and the CEO, with the LF Marketing chat
**Where the details live:**
- `docs/marketing/PLAYBOOK.md`, the source of truth. The fuller copy is on the marketing branch and needs landing on main.
- `docs/marketing/skills/README.md`, the content skills and LifeFlow's rules over them.
- The film plan doc, https://claude.ai/artifact/J4Qmes1s6mVYjLgxy3xBiY.

**Status:**
- **Instagram @lifeflowweb:** it is the only account. The owner has posted several of the videos himself, and their numbers will show once Instagram is properly connected in Metricool.
- **Main project:** "The School Project" relaunch film. The teaser is Sun Nov 29 and the premiere is Mon Nov 30 at 10 AM PT. Test shoots are underway.
- **Waiting list:** the rank rises with friends who join. The referral boosts are built on `claude/waitlist-referrals-v2` and wait for two owner yeses (keep a friend's email fingerprint after their account is deleted, with one privacy-page line; friends who joined through a link before this count when they confirm). Nicknames are in progress on `claude/waitlist-nicknames`. The read-only preview picture (`docs/design/2026-11-11-preview/`) waits for the owner's yes. Nothing from these is on main yet (owner, 2026-11-11; `docs/backlog/2026-11-11-audit-and-waitlist.md`).
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
1. Join the Apple Developer Program (blocks the App Store). Tried 2026-11-08: the website says "unable to process your request" and the Mac Developer app says enrollment "is not available for this Apple Account". Next: try the iPhone Developer app; check the Apple Account (two-factor, legal name, 18+, country, phone); look for a pending enrollment; else call Apple Developer Support (Membership and Account, Program Enrollment).
2. Register in Microsoft Entra (blocks Teams).
3. Request Plaid Production access (blocks real banks).
4. Connect the Twilio number (blocks texting the assistant, phone sign-in and the after-shift message).
5. Set up the desk task starter: a scheduled task API trigger and token, plus two Vercel variables (section 5).
6. Connect Instagram in Metricool as a professional account with all permissions (section 8).
8. Pro payments: Stripe keys for the web (go-live 9c); on iPhone, Apple in-app purchase comes with the App Store.
9. Google verification of the app, so people outside the test list can connect Gmail.
10. ~~Vercel environment variables~~ **Done 2026-11-10:** the six prices are in, and Admin › App › Health shows AI, banks, Google, the price cap, email, scheduled jobs and alert email all set up. Microsoft, Stripe and Twilio wait on items 2, 4 and 8. The old preview-branch database links were cleaned up. Optional, not added: the HQ desk "Start it" (item 5).
11. **Cloud environment for the chats:** remove the `api.openai.com` and `api.groq.com` network secrets from the "LifeFlow" cloud environment (environment menu → Edit → Network secrets), so no chat can spend on the AI key.

## 11. Waiting for the owner's yes (one list; details in HQ › Work)
- **The character cast (LF Main, 2026-11-09; docs/design/companions/cast.png):** (a) six companions named for the sky (Dawn, Ray, Noon, Goldie, Dusk, Star): right names and looks? (b) keep 3 tones, or add a 4th "Calm"? (c) before someone picks, the wheel shows Ray (the sun you know); the designer proposed Dawn. (d) retire the old avatar setting (spark, orb, initial)? Kept until you say yes.
- **The new buttons (LF Main, 2026-11-09):** tried on the landing page, sign-up, welcome and tour (a sunrise button with a chip where a skyling hops in, pixel sparks on press). Move them into the whole app? Kept to those four until you say.
- **Apple sign-in on deleted accounts:** people who signed in with Apple before 2026-11-09 have no stored token, so deleting their account can't cancel Apple's access until they sign in with Apple once more. Recommended: one line on the delete screen ("also remove LifeFlow in your Apple ID settings").
- **North Star:** confirm ADR 0032 (V3 itself is merged).
- **LF Main's held branches:** phone sign-in, the "Still in the testing phase" note, and the tonight tool.
- **HQ cards:** H4 approved and shipped (7647a69). H3 was declined on 2026-11-08: the "Record a paycheck" form on Work stays.
- **Older cards being rewritten** (Goals redesign A, Connected accounts, the timeline concepts, Gmail abilities, search bolding, the agent workload, "Same bill?" outside the inbox).
- **Marketing:** voice samples and credit spending.
- **Onboarding and Today (phone check 2026-11-08):** 'Skip setup' and 'Skip' sit close together while the day connects.
- **First run and price (research 2026-11-09, docs/research/2026-11-09-first-run-that-converts.md):** (a) where the paywall goes; recommended: only after "Your day, connected", showing the person's own saved item and their skyling's name; (b) the landing still can't show the price ($5.99 students) while the welcome says "free while we're testing": which one is true now? (c) add five first-minute counts (welcome step, first item saved, paywall seen, paid) to Admin › App?
- **Apple Health vs typed values (COO, 2026-11-09):** a value the person types now always wins over Apple Health for that day (it used to be silently overwritten). Side effect: 20 exercise minutes typed in the morning keep Apple's full-day 60 out. Keep it, or let Apple fill in a typed day once the day is over?
- **Promises (night audit 2026-11-08):** read the six firmer check-in lines once (some lean on pressure); decide whether a promise's text may show in a notification on the lock screen.

## 12. Change log
Newest first. One line per real change, by the chat that made it.
- 2026-11-11, LF Main (review of the chat change; the new test failed before the fix and passes after): going back to the skyling page (the browser's back, or a swipe) could show the copy the browser kept, from before a chat started on Today, so the chat looked empty, and a message then started a second chat. The page is now rendered again when it's behind the chat this visit is in (`pageIsStale`, lib/chat-session.ts, used by JarvisChat), and every send goes to the chat this app is in (`currentChat`, which also checks the day, so a chat from an earlier day is never carried on, also past midnight in an open tab). Today's bar sends into the same chat. Tests: `chat-sessions-phone.spec.ts` (going back to the skyling page), `chat-session.test.ts` (the day check). Still open, for the owner: a second window of the app starts a fresh chat for the browser (the cookie belongs to the last chat used), so the first window's chat only comes back from Conversations; say whether a second window should join the open chat.
- 2026-11-11, LF Main (review and e2e of the chat change): the skyling tab could open an older copy of the chat page from the router's prefetch (kept five minutes; `unstable_dynamicStaleTime` does not reach prefetched copies), so a chat started on Today didn't show when the tab was tapped. The chat page is never prefetched now, by a link or by the router (`isChatPage`, lib/app-routes.ts: the tabs, the section pills, the warm-ups and every link to it). New chat no longer re-opens the chat it replaced: the new chat read `?c=` from the address and saved the old chat back into the cookie, so `ChatHost` now ignores the page's stale chat props once a new chat starts. Still open, next push: going back to the skyling page (the browser's back, or a swipe) can reuse the page's copy, so a chat started on Today can be missing, and a message then starts a second chat. Also open for the owner: a second window of the app starts a fresh chat for the browser (the cookie belongs to the last chat used), so the first window's chat only comes back from Conversations. Tests: `chat-sessions-phone.spec.ts` (New chat after a reload; the skyling page after a chat on Today), `today-chat-phone.spec.ts`, `chat-page-prefetch.test.ts`; the navigation, layout, clock, mobile and chat e2e specs are green.
- 2026-11-11, LF Main (owner): chats are no longer one long chat. A chat lasts while the app is open and for the day; closing the app, signing out, a new day or the new "New chat" button starts another, and every earlier chat stays in Conversations. Today and the skyling's page carry on the visit's chat (cookie `lf_chat`, read on the server, never another person's). Found in review and fixed: the skyling page is never reused from the router's cache; a deleted chat no longer leaves a stale pointer (Today retries as a new chat, once); a new tab no longer resets the chat of tabs already open; a link opens any chat of yours, however old; a database fault no longer looks like "no chat"; a chat left behind by New chat can't write its id back. Shared devices: every session end clears the chat cookie, and Today's answer is tied to the person who asked, so a sign-out and a sign-in on the same device never show the last person's words (found in review). Tests: `chat-session.test.ts` (unit and integration), `chat-sessions-phone.spec.ts`.
- 2026-11-11, LF Main (owner, yes on the picture): the skyling's cloud. On the skyling's page its own skyling stands on a cloud that grows with what you finish: stars (every class, shift and plan claimed, every to-do and assignment ticked) unlock star lights at 5, a kite at 25, Puff at 60, a swing at 120, a hammock at 250 and a rainbow slide at 400; suns (a goal reached or a milestone that just happened, two a day at most) unlock a hot-air balloon at 1, a cloud house at 3, a telescope at 6, a tiny planet at 10 and a floating garden at 15. The counts open "<name>'s cloud" with what comes next. The sun celebration now plays only when a sun is earned; claiming stars, connecting Canvas and a money goal's percent are stars. Migration `0063_sky_rewards`. Tests: `sky-home.test.ts`, `sky-home-phone.spec.ts`, `stars-phone.spec.ts`.
- 2026-11-11, LF Main (COO, from LF Marketing's refilm and the owner): Today's answer no longer has Undo lying over its lines (the words and buttons scroll together); a long message grows the chat bar (three lines on Today, six in the chat) and then scrolls inside, without covering the answer or moving the sky; events and to-dos take their course by name or code, and an unknown one comes back with the real list instead of a made-up id. Tests: `today-chat-phone.spec.ts` (432x768), `course-by-name.test.ts`.
- 2026-11-11, LF Main (owner: the logo above Today "looks like it's clickable"): on a laptop the sun at the top of the rail is now the Today tab, with its name; a phone's top bar has no logo (Today is in the dock). Checked in `clock-laptop.spec.ts` and `layout-phone.spec.ts`.
- 2026-11-11, LF Main (owner, live testing a new account): Twinkle and Dreamy are the night skylings' names (Star and Moon before). Dreamy is the moon in the scene where they're all together, with Twinkle swinging over it; the opening screen is never empty (a tiny Dreamy or Twinkle, a ship, a shooting star, birds) and says a short hello by the sky with their name. The welcome: "Changes with the sky" sits in the grid with all five on it; the birthday is month, day and year picks (the calendar was "so old and annoying"); no school or workplace boxes; "Connect your sky" offers every connection (Canvas, Google with Gmail, Outlook and Teams, work shifts from a photo, the bank). Waiting on the COO: the waitlist before setup (the owner: "I still don't see the waitlist").
- 2026-11-11, LF COO: the owner's audit and waitlist backlog saved whole in `docs/backlog/2026-11-11-audit-and-waitlist.md` with his answers: the waitlist first; today's accounts queue in sign-up order and he accepts people in HQ before switching it on; a free trial and student offer are planned (replaces "no free term"); a referral counts only after the friend's email code.
- 2026-11-11, LF Main (owner asked directly, picture approved): the skylings are five and follow the real sky: Dawn, Ray (the day), Goldie, Star (sunset into the evening, wearing the last glow at first) and Moon (new, 9 PM to first light, then it turns into Dawn), so the night gets the morning's attention. Noon and Dusk are retired (saved picks move to Ray and Moon). The suns drawn around Dawn, Noon and Goldie were dropped ("i dont like what appears").
- 2026-11-11, LF Main (owner asked directly): the skylings get a little life. New looks drawn in code (wave, stretch, reading a book, a mug of coffee, thinking, surprised), picked by the real day (a wave when Today opens, reading through a class, coffee on a shift, a morning stretch, thinking while answering, surprised at a clash). Star is brighter, and dark mode and the night sky are a softer blue ("lighter still"). Today's note only says news, never money warnings or late to-dos ("we shouldnt think our users are dumb"). Next: the skyling's home that grows, with things you unlock, picture first.
- 2026-11-11, LF COO (owner's reset, item 5): plain words on Money, School, Calendar, To-dos and Settings: shorter lines (about 4,700 words on screen down to 4,300; the longest block 34 words down to 22), nothing behind-the-scenes ("Bank not listed?", "Updated" instead of "Synced"), cash warnings say "You could run out of money around …" like Today. Kept: "assignment" (the owner's and Canvas's word), next steps, safety facts, consent, legal and delete warnings word for word. Tests: core, mobile (Extra large text), no-overlap, school-due, coach, crawl, a11y, touch targets; 644 unit tests.
- 2026-11-11, LF Main: plain words on Today and the line (the boxes under the line say what and when: "Due: Ethics Quiz 2 / today", "In class: Ethics / till 12:45 PM"; "You could run out of money around Sunday…"; "You have 1 to-do"), pixel thumbs instead of line icons, and Word and PowerPoint files attach in the chat, kept as their words (no new package; bounded reader; unit and screen tests).
- 2026-11-11, LF COO (owner: yes): two new kinds of message are live. "2 video services at once: you pay for Netflix and Hulu, about $306 a year together" (once per set, from the midday look) and "New charge: $367 at Delta, the first charge from them in 4 months. Was that you?" ($250 or more somewhere new). Both mutable; with the Money lock on they say only "Money heads-up". Also live tonight: page map merges 5, 6, 7, 11 and 12 (Investments in Accounts, Rules over Activity, Due on School, Recently deleted in Privacy and your data, Invite and feedback), each with a screen test.
- 2026-11-10, LF Main (owner's reset, item 7 and page map merges 2, 3, 4, 9, 13): Work, Health and Goals are rebuilt like Money from the pictures he said yes to. Work has the next shift on the sky, hours, last paycheck (never predicted), the week and pay that came in, and people with a job and no classes get it as a tab instead of School. Health shows last night's sleep, steps, active days, the week's sleep and resting heart, with the log behind "+". Goals is one page with Aiming for and Done (milestones), and /milestones redirects. The page merges: one chat (old chats open inside it), one Updates (Filed is a section), one skyling page (memory is a section), and no Ideas page (the clouds do it); old addresses redirect from next.config. Tests: work-tab-phone, goals-phone, health-phone, no-overlap, touch targets, a11y, crawl; 1,408 unit and integration tests.
- 2026-11-10, LF Main (owner's reset, items 1 to 3): a phone's Today is one screen: the sky, then the skyling's note and the idea clouds in the middle (its answer takes their place), then the chat bar at the bottom, which now stays when the day opens as a line; Health and Work moved off Today into More. The skyling has its own tab again (Today, Ray, Money, School, More); the skyling bar on other pages is gone; a laptop's rail has More too. One chat keeps going: Today and the skyling's page carry on the latest one, no New chat, its window and "Let's clear your sky." always on top, clouds instead of suggestion boxes, our own attach icon; each turn sends only the last 12 hours (at most 40 messages), so cost stays where it was. Tests: today-chat-phone (layout, line keeps the bar, Undo, Do it, the tab opens the same chat), layout-phone, idea clouds, sideways, no-overlap and a11y.
- 2026-11-10, LF COO: the owner said yes to reset items 6 and 7 (pictures of Work, Health and Goals with its Done side in Money's look, and the page map from 40 pages to 26). Merges are simplifying, not removing: forms behind "+", sections, switches and pop-ups, old addresses redirect.
- 2026-11-10, LF Main (owner's screenshot: "how close they are"): on the open line, "Pin something" sat 2 px under the day's tiles; now 12 px, the same as above them (a stop's card too). A stop's words, a day's name and the time under the skyling fade out at the window's left and right sides instead of being cut off (a "B" peeked in at the right). `timeline-labels.spec.ts` now also fails on words cut by the window's sides and on the tiles' gap.
- 2026-11-10, LF COO: go-live checklist section 1 is now the complete list of every Vercel variable the app reads (grouped, with formats, defaults and the mistakes that break things quietly); the variable review is on the owner's list (items 10 and 11).
- 2026-11-10, LF Main (owner via the COO): chat on Today. Sending from Today's bar keeps you on Today; the answer streams into a card under the bar (same `/api/jarvis/chat`, limits, AI permission and storage), says what was added ("To-do added: …", the chat's summaries now name it), and the sky refreshes at once; Undo, Do it / Not now and Confirm work in the card; "Open the chat" opens the conversation. Phones: the sky gets shorter by the card but never under its horizon (260 px); 740 px and taller keep the bar fixed and scroll a long answer inside the card, shorter windows put the bar and the card in the page and scroll to it; the keyboard goes down after sending. e2e with the test model: to-do saved and on the timeline, Undo, Do it, Open the chat, and a long answer at two phone sizes with nothing over the sky.
- 2026-11-10, LF COO: what the noticing grader found, fixed (no AI used). Available now takes off charges still pending at the bank (bills short 33/44 caught, now 44/44; a pending bill charge is taken off once, account rows match the total; independent review, findings fixed with tests); no "bill short" for bills on a credit card; Today's clash line names the next clash too (42/55, now 49/55); deadline warnings only for shifts of 7+ hours or ending 9 PM or later, still sent when no free time is left, and no longer held back by ones already sent (49 false alarms, now 0; 128/128 caught). Also: money answers give "as of" in the person's own time, not UTC.
- 2026-11-10, LF Main (owner asked directly): a star note when something ends. A shift ending at 6 gets "Ray has a star for you · Your Target shift is over. Tap to claim your star on your sky." by about 6:05 (`/api/cron/stars`, every 5 minutes); the tap opens Today and the star comes out. Merged when things end together, once per thing, at most 4 a day outside the skyling's own limit, never at night, a switch in Settings › Notifications.
- 2026-11-10, LF Main (owner asked directly): claim your stars. Coming back to Today, every class, shift and plan the skyling passed while you were away is a star, one by one out of the skyling, each saying what it was for ("Bio 101 · class done"), and the sun finishes three or more ("4 done while you were away"). Claimed once for every device; never a deadline passing or an unticked to-do. Tests: integration (what counts, once, cancelled shifts, 48 hours), unit (the words), e2e (`stars-phone.spec.ts`: in order, the sun, nothing on reload).
- 2026-11-10, LF COO: the final walk and the before-and-after ([after](audits/2026-11-10-product-after.md), picture page for the owner). Sign-up to a usable Today is 4 steps with no tour, a week told in one message is 5.4 s, Today loads in 228 ms (was 439). Pixel pictures are now one path per colour (identical, 86 of 86 checked): later pages back to baseline weight or lighter (Money 400 KB to 191, Updates 373 to 234).
- 2026-11-10, LF COO: item 11 checked live on laptops; the idea cloud and the skyling's name tag above Today's bar no longer overlap it on any width (their row now ends at the bar's top edge).
- 2026-11-10, LF COO: item 8 live in the chat. "Do it" and "Not now" under an answer that offers to act, and Undo under an answer that created to-dos or events (removes exactly those, keeps anything changed since, once, within a day; independent review, findings fixed with tests).
- 2026-11-10, LF COO: pixel glyphs replace the last generic line icons on app pages (delete, copy, download, check, arrows, undo, sync, edit, open link, search, mail, clock, link, repeat, alert, flame, flag, pause/play, upload, hide, archive, more, sign out, video); `look.test.ts` keeps them out (the skyling's pages and the inbox follow, LF Main). With the Money lock on, pushes show "Money heads-up" for money messages and drop amounts from the morning brief and weekly review, and the cards in the app drop them too (rule: nothing private on the lock screen; reviewed independently). Item 9 recorded as live. The sideways Today test waits for the sky to stream in.
- 2026-11-10, LF COO: item 4 live. A whole week told in one message is saved in one step (`set_up_schedule`), and "can I afford" gets one verdict decided by our code from Available now, the same when asked twice (it used to say wait once and yes once). Measured: the eleven questions 66 s → 44 s. Also fixed tonight: a file picked as the inbox loads was filed twice.
- 2026-11-10, LF COO (owner through LF Main: keep going through the night, fix all we can, verify at the end): pixel plus/close glyphs everywhere, pixel caret on show-more rows, Money rows in whole dollars, Activity's time range as horizon tabs, the empty tick box readable at night, the skyling's row is Chat, Updates, Profile (idea clouds replace Ideas). Bug: a file picked as the inbox page loaded was filed twice; it's sent once now (`45d7cb7b`). Verification: phone screen tests 25/25, unit 582/582; the full screen-test suite and the full check are running on main.
- 2026-11-10, LF COO: navigation A on phones. The dock is Today, Money, School and More; the skyling is a bar on the dock on every page (not a tab); More brings up "Everything else" as doors (calendar, to-dos, goals, health, work, updates, the skyling, Settings) with live lines from real records. Also: earned stars at night never sit on words (with a screen test), Today's talk button is 44 px, dropdowns carry a pixel chevron, Settings pages are called what their doors say.
- 2026-11-10, LF COO: the look, third step. Lists are no longer phone settings tables: every to-do, transaction, bill, account and milestone is its own soft tile, rows inside cards are quiet inset rows, and the arrows and hairlines are gone. The sliding segmented control is replaced by horizon tabs (plain words on a horizon line, a little pixel sun rises under the one you're on). The tick box is our pixel one, and the last two phone-style toggles are sky switches.
- 2026-11-10, LF COO: the owner put the COO chat in charge of the app's look (off the Apple iOS patterns). Live: Settings comes up from below as a sheet of doors with pixel pictures, the Settings page is the same doors, the blue "< Back" on phones is a round pixel-arrow button, on/off is a sky switch (moon and sun), and the floating skyling button that sat on top of content is gone (the skyling has its tab; the tour's "ask anything" step went with it). Next for the look: the rows with arrows on the deep pages, then navigation A's "everything else" sheet.
- 2026-11-10, LF COO: live after the owner's yes on the picture (https://claude.ai/artifact/6fmjLePgDyjRGefoieV8Xh) and his notes on single icons: the idea clouds are pixel clouds drawn in code, and our own pixel icons are on the four tabs, every pill, the top bars and the chat bar (`components/pixel`). The timeline (his screenshot: words across the horizon, cut off at the bottom): a stop's words go above it when the horizon or the window's edge is in the way, day names and month marks only go where nothing else is, and `tests/e2e/timeline-labels.spec.ts` fails on any word across the horizon, cut off or touching another, by day and at night, on a phone and in a narrow laptop window. Celebrations (his ask): a cast of five coloured stars with six faces and five ways of arriving, never the same twice running, and for a goal reached or a milestone added the logo's sun jumps out, sticks its tongue out, squiggles and waves, with a pop and a chime (`motion/burst.ts`, `celebration-art.ts`, `sound.ts`; forms ask for it with `cheer`). Preview: https://claude.ai/artifact/KmKd2sfp7EKpaPzSKsiekb. The Calendar page's add button now has a name for screen readers. Next from this chat: navigation A, after LF Main removes the side chat panel (owner's yes to LF Main).
- 2026-11-10, LF COO: the owner's answers and new asks. Navigation: A, three places (section 6). Under 13 in Settings: leave it as it is. Live: an open app reloads itself onto the new version when it comes back to the front, never over a call, an upload, a reply or unsent typing (`c798fb8e`). AI cost measured on eleven questions: no saving from re-ordering the prompt; the faster week setup and the single "can I afford" verdict are held on `claude/chief-of-staff` (`d5446cd3`). New from the owner, not started: (1) the done star in several versions so it is not the same every time, and for a milestone or a bigger goal a bigger sun that pops up, sticks its tongue out and wiggles, with a pop sound; (2) the new logo (the pixel sun rising over the water; files in `docs/design/logo` on `claude/chief-of-staff`, black edges cut off) replaces the old sun on the opening screen and the app icon, and sets the quality bar for our animation.
- 2026-11-10, LF COO: the owner approved the 12-item product excellence program (section 6, with the baseline). Live: a slip can no longer erase an account (`4fbe0689`: impossible ages refused, a finished account confirms the date first, Stripe flagged not cancelled). Reminders: the notify job runs every 10 minutes and each daily look starts at its own hour. Admin and HQ development paused. Two navigation concepts are with the owner (section 11).
- 2026-11-10, LF HQ: Admin and HQ paused for new work until the relaunch (owner, through the COO). Everything keeps running; bugs only; the under-13 People line is the one exception, with LF Main (section 5).
- 2026-11-09 early morning, LF COO: on main, Opus-reviewed: Stripe plans follow Stripe's live subscriptions (0b994ba); one card and one filing per email, typed health values win, one Canvas sync at a time (7379002); timeline Done removes the item at once (d15a9bb). Research on the first run (42387c1). Two owner questions added to section 11.
- 2026-11-09, LF HQ: "Active today" opens the list of who was active (People, seen in the last 24 hours); "last seen" stamped every 10 minutes (section 5).
- 2026-11-09 morning, LF COO: on main (da1e843, 3 Opus reviews), overlapping cron, webhook and Sync now runs no longer double-run: a lease per job (migration 0057_job_locks). A bank update that arrives during a sync gets one more round instead of waiting 30 minutes. Microsoft failures are recorded and say "Reconnect it in Settings". Plaid calls time out after 20 s. "Your companion" wording passed to LF Marketing.
- 2026-11-10, LF Main: Money cleaned up (owner): no Budget or Subscriptions page (old links redirect; budget heads-ups open the skyling); Bills is the one calm list with a sheet per item and the form one tap deeper; Accounts rebuilt the same way; quiet buttons readable on cards.
- 2026-11-10, LF Main: our own pixel icons on the wheel, timeline, cards and pin picker, floating with no boxes (owner); night labels no longer overlap.
- 2026-11-10, LF Main: under-13 leftovers (COO item A): bank and Google links close after the lock commits (retried by the sync cron, shown on Admin › People), the lock removes feedback copies in the owner inbox, crons skip locked accounts, the demo account can't be locked, and the lock screen can delete the account.
- 2026-11-10, LF Main: no side chat panel (owner): every ask opens the chat page (a question from inside the app is sent, a link only fills the box); Today's bar is a real text box the idea clouds fill, and sending it goes on in the chat page.
- 2026-11-10, LF Main: the new logo (owner yes): the opening screen follows the time of day (that moment's skyling rises out of the water under its own sky; glass horizon, swells and light on the water), and the app icon is the owner's pixel sun. Also: the sign-in page never shows a browser's passkey error text.
- 2026-11-10, LF Main (overnight, owner approved): the top-left logo is the pixel sun; Today's heads-up shows again on phones with the person's own skyling; the welcome keeps its place; no cloud over the laptop chat bar; a kinder evening wrap-up; and the calm notifications ask (the welcome's last beat, and once in the chat after a first promise or reminder; at most twice per device, Not now remembered, the iPhone Home Screen step first).
- 2026-11-10, LF Main (overnight, second half): tapped through every sheet, door, welcome step and tour on a small and a regular phone and a laptop, every page as a brand-new empty account, an accessibility scan with data in light and dark, laptops at 1024 to 1280 px, a phone turned sideways. Fixed: "Changes with the sky" no longer makes Today load twice when the phone's clock and the server's disagree (the one error the full suite left); Ideas and the welcome use our pixel pictures; celebrations no longer try to buzz the phone before it's touched; no cloud between the tour's card and the bar; small-phone connection cards give their words room; rows read properly to screen readers and voice control, and the small print is readable (a new data-and-dark accessibility test); the sign-in sheet always rises over the sky; offline is in our look; sideways, Today's bar sits under the sky. Sent to the COO and fixed by them: laptop search finds every place, an 8 px sideways scroll on 1024 to 1150 px laptops, a faint hint in the skyling's settings.
- 2026-11-10, LF Main: the timeline names every stop; done to-dos and assignments, promises (kept ones too, never broken) and a recap of each past day (sleep, steps, habits, money with the lock open) join the line; the wheel names its next things (owner: "show your life on it simply").
- 2026-11-10, LF Main: idea clouds beside Today's chat bar and in the empty chat (owner, through the COO): short, from real data only, unused features first, no money with the lock on, a tap fills the box and sends nothing; every cloud maps to a real tool.
- 2026-11-10, LF Main: "Let's clear your sky." in the empty chat; the skyling goes by its own name (Ray, Star, whoever is up) until named, "Dev" never shown; sparkle, "Home context" and the avatar setting removed; on Today the skyling stands on the chat bar with its name (owner, through the COO).
- 2026-11-10, LF Main: under 13 after setup is locked and emptied like during setup (owner's call), a paid plan cancelled at Stripe, Privacy section 9 updated; sent to the COO for review.
- 2026-11-10, LF Main: the sky buttons everywhere (owner's yes): the shared button and 65 hand-made ones; sunrise for the main action, glass for the quiet one, ember for destructive.
- 2026-11-10, LF Main: under-13 lock, the COO's three follow-ups: Plaid links closed at Plaid, only real tables wiped (views skipped, new tables tested), time zone, forwarding address and texting number cleared; Privacy section 9 names the security log.
- 2026-11-10, LF Main: the skyling chat, Money and School in the new look (owner): the skyling in a window of the real sky (on a cloud, on coins, on books), replies with its face, walks while it works and hops when something gets done; sunrise bubbles and send, sky buttons on these pages.
- 2026-11-10, LF Main: the under-13 lock hardened after review (nothing kept during setup, enforced in the session, Settings and races closed, privacy wording corrected).
- 2026-11-10, LF Main: "Changes with the sky" shipped, the seventh skyling choice (owner, with LF Marketing: "or let the sky choose").
- 2026-11-10, LF Main: birthday required and checked on the server, under 13 locks the welcome for the account (only a flag is kept), older accounts asked once on Today; the Privacy Policy names birthday, school and work (owner's yes, through the COO).
- 2026-11-10, LF Main: the welcome connects instead of typing (owner): about you with the birthday, connect your sky with Canvas, Google and Outlook; the demo day removed.
- 2026-11-09 morning, LF Main: the first run remade on the skylings' night (landing, sign-up, welcome, tour) with the new buttons (owner's top priority).
- 2026-11-09 night, LF Main: "assistant" is gone from everything users see; the character is a skyling (owner).
- 2026-11-09, LF HQ: the Planning Room idea will replace the COO's brief card (owner); still waiting for his go.
- 2026-11-09, LF HQ: the owner's Planning Room idea written into section 5 (an idea waiting for his go, not being built).
- 2026-11-09 night, LF COO: on main: short assistant answers (fc7a45c: chips stop pasting lists, a 60-word reply shape, low verbosity; the owner's catch-up question went from 1,123 words to 52 on the real model), Apple token revoke on unlink and deletion (175bde4, migration 0056, Opus-reviewed), the A-to-Z audit (a0a3718), the promise test fixed for real dates (6ebc5c7). Phone sign-in must renumber its migration to 0058 before it merges; 0057 goes to the job lease (in review).
- 2026-11-09, LF HQ: the admin area and HQ in the V3 sky look and comfortable on a MacBook, at the owner's word through the COO (section 5).
- 2026-11-09 night, LF Main: the mechanism steps 1 and 2 (Day Sky's timeline, the pour, input layer, laptop size, no boxes), the morning logo, sky moods and visitors, the done burst, the tour and welcome on the sky (c4a4032, b5b54eb, 2fb42a6 and the next commits). List for the owner: docs/hq/tonight-2026-11-09.md.
- 2026-11-09, LF Main (was LF V3): the owner merged V3 into main (PR #3): Today is a wheel of time in a sky card, the real-sky colours, no purple. Chats simplified on his word: the old LF Main joined this chat (archived), LF Managing Agents stays open, V2 and V3 branches retired.
- 2026-11-09, LF COO: the owner is already on Vercel Pro (decision removed). New deploys had stopped reaching lifeflowweb.com because the Neon integration hit its preview branch limit (Deployment Checks: "Neon branching: Branch limit exceeded", custom domain skipped); after the owner cleared it, the evening fixes, the Today chips and the H4 404 are live. Rule: builders work on claude/chief-of-staff or a worktree branch that is NOT pushed; only main and the department branches are pushed, so each push doesn't cost a Neon branch.
- 2026-11-09, LF COO: the owner approved H4; signed-out visitors to /admin get the same 404 as everyone else (7647a69).
- 2026-11-08, LF COO: the owner said yes; Today quick chips wrap instead of running off the edge (817e57f).
- 2026-11-08 evening, LF COO: on main (ac6212a) after Opus reviews: Plaid follow-ups (hand-archived accounts stay archived, broken connections skipped until reconnect, LOGIN_REPAIRED and NEW_ACCOUNTS_AVAILABLE, holdings safety, pending expiration keeps syncing); account deletion cancels the plan (or refuses), removes bank links and revokes Google, for users and admins; onboarding phone fixes (44 px fields, names wrap, example tags on every card, no guessed Jdoe1234). Report: docs/audits/2026-11-08-welcome-phone.md.
- 2026-11-08 afternoon, LF COO: on main, the 4 Promises fixes (Tomorrow instead, cancel a mis-sorted promise, to-dos done before, cron errors) and 3 Plaid/Microsoft fixes (Opus-reviewed); the Vercel setup sheet (docs/audits/2026-11-08-vercel-setup.md) and the Plaid/Microsoft check (docs/audits/2026-11-08-plaid-microsoft-check.md).
- 2026-11-08, LF COO: the owner declined H3; the paycheck form stays.
- 2026-11-08 night, LF COO: 2 fixes on main (7-Eleven name, Same bill? Undo window), the night audit, the App Store readiness report, situations batch 5.
- 2026-11-08, LF HQ: checked section 5. Added commit links; confirmed the hourly sync and the desk starter's state; made the building item specific; added upkeep for the sync chat to Next.
- 2026-11-08, LF COO: section 10 is the one owner list (docs/hq/owner-list.md now points here); added the Vercel plan, payments and Gmail verification. The COO ends every report with the top 3.
- 2026-11-08, LF Managing Agents: wrote this plan; merged 4 chats (section 1); renamed the remaining chats to one-per-department names.
- 2026-11-07, LF Managing Agents: round on "go". 3 fixes shipped to main (plain form errors, failed saves keep input, onboarding name hint), 5 situations, an HQ audit, 2 cards for the owner. The content skills were added for Marketing (`docs/marketing/skills/`).
- 2026-11-07 and 11-08, LF Main: Promises on main; phone sign-in, the testing-phase note and the tonight tool built and held.
- 2026-11-07 and 11-08, LF V3: the V3 spec, prototype and day clock built on `v3-day-clock`.
- 2026-11-07, LF HQ: the desk, live HQ, HQ sync, the simplified Office and the building, on main.
- 2026-11-08, LF COO: the owner's list created; marketing decisions recorded and handed to Marketing.
- 2026-11-08, LF Marketing: the School Project dates, voice rules, the Arabic dub and the cost cuts.
- 2026-11-11, LF COO: waitlist step 5 (referral boosts and the email code) built on `claude/waitlist-referrals-v2` and held for two owner yeses; step 6 (nicknames) in progress on `claude/waitlist-nicknames`; step 7's picture is in `docs/design/2026-11-11-preview/` for the owner's yes, nothing built. The backlog's progress table is updated.
