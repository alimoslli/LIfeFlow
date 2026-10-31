# LifeFlow v2 plan: student first, simple, Jarvis everywhere

Drafted 2026-10-29 from the owner's decisions. Nothing in this plan is built yet. Build one phase at a time, and only after the owner says go.

## 0. Versus Muse from Meta

This section is based on the App Store page, Meta's announcements, and the owner's screenshots and screen recording of the app (Ideas, agent profile, Import memory, Connectors, Appearance).

**What Muse is:** a general personal agent. You give it a goal, it keeps working after you close the app, and it comes back only when it needs a decision or your approval. Connected to your accounts, it can do much of what LifeFlow does, but everything lives inside a chat. You can't see your life laid out anywhere.

**Our position:** "Talk to Jarvis like Muse. See your whole student life like nothing else."
- **Jarvis can do everything the app can,** and everything he does shows up right away on Today and in the tabs.
- **We are the student specialist:** classes, every due date, grades, the syllabus, Canvas, real bank money, planning around classes and shifts, and academic integrity.

### What we take from Muse (made for students)
| Muse | LifeFlow version | Builds on | Phase |
|---|---|---|---|
| Agent profile (avatar, status, Soul and Memory cards) | **Jarvis profile:** opens from his avatar anywhere. Live status ("Needs approval" · "Working on 2 things" · "All caught up"), **Personality** and **Memory** cards, and rows for Connections · Permissions · History | Assistant settings, memory page | 1 |
| Ideas catalog by category | **Ideas:** our skills written as offers (icon, a promise as the title, one sentence saying what he does and when he asks first). One tap starts it. Categories: School, Money, Work, Health, Life. **Personal ideas from your data** sit on top ("3 exams Nov 18–22, want a study plan?") | Skills (36), proactive detectors | 4 |
| Goals it keeps working on | **Goal coach:** "Get a 3.5" or "Save $800 by May." Jarvis plans the to-dos and study blocks, then checks in weekly | Goals, tasks, calendar, reviews | 4 |
| Feed | **Updates:** what he did, what needs a decision (approval cards with Approve, Change, Skip), and Undo | Proactive engine, Inbox, confirm tools, push | 1, 4 |
| "Found X in your email, did Y" | **Gmail to Updates:** syllabus changes, tuition and bills, shift emails, filed with Undo | Inbox filing, Gmail tools | 4 |
| "Work overnight, report at breakfast" | **Morning report:** one card with what's done, what needs you and what's due today | Daily review | 3 |
| Import memory from another AI | **Copy a prompt, paste the answer:** facts become **proposed** memories that you approve one by one | Memory proposals | 4 |
| Connectors by category | **Connections:** grouped School / Money / Email & Calendar / Health, with only working ones listed | Integrations page | 1 |
| Appearance | **Live preview, accent color (whole app), Jarvis avatar choice, System/Light/Dark** | Themes | 1 |
| Side chats | **A chat per class or goal** | Conversations | 5 |
| WhatsApp | SMS first, then WhatsApp | Same agent | 8, 10 |
| Feed widget | Today widget | Native app | 9 |

### The Ideas list for launch (every idea must actually work)
- **School:**
  - "Send me your syllabus. I'll set up your whole semester."
  - "Share your project or paper. I'll break it into steps with dates."
  - "Exam coming? I'll build a study plan around your free time."
  - "Give me your notes. I'll turn them into a 10-minute audio review."
  - "Need an extension? I'll draft an email to your professor for you to send."
  - "Tell me your aid and scholarship deadlines. I'll make sure you never miss one."
  - "Quiz me on this chapter."
  - "What do I need on the final?"
- **Money:**
  - "Set a savings goal. I'll tell you what to cut if you drift."
  - "I'll find subscriptions you forgot about and show you how to cancel."
  - "I'll check which of your subscriptions have a student price."
  - "Tell me the textbook. I'll find the cheapest copy or rental, with links."
  - "Snap a bill or document. I'll file it and remind you before it's due."
  - "Where did my money go this month?"
- **Work:**
  - "Screenshot your schedule. I'll add every shift."
  - "I'll check your paycheck matches your hours."
  - "Your shift clashes with a class or exam? I'll flag it."
- **Health:**
  - "Connect Apple Health. I'll give you a baseline."
  - "Name a habit to build or break. I'll nudge you at the right moment."
  - "Snap your meal. I'll log it." (later)
- **Life:**
  - "Give me the job before bed. I'll report at breakfast."
  - "I'll turn your inbox and calendar into today's plan."
  - "Losing touch with someone? I'll find a free time."
  - "Paste what your other AI knows about you. I'll pick up where it left off."

New skills these need: audio review, professor email draft, student discounts, textbook finder, paycheck check, shift clash, memory import.

### Muse features we skip
- Buying, checkout, Marketplace haggling, booking travel or appointments, and cancelling for you: we never move money and never act without asking.
- A cloud browser that fills out websites: heavy, fragile and risky.
- Instagram look-backs, trivia, pets, moving, electricity and insurance shopping, price-drop refunds, unclaimed money: off-mission or too heavy for now.

---

## 1. What LifeFlow is

> **Never miss anything again.** Classes, assignments, work and money in one place, with an AI that keeps you on track and never does your work for you.

- **Audience:** college students first. Anyone with a busy life can use it, including people with only a job.
- **Promise:** no missed assignments, shifts or bills, and always knowing where your money is.
- **Where time is spent:** on **Today** and **Jarvis**. The other tabs are for looking things up, not for doing work.
- **A tool, not a dashboard.** Everything you see can be acted on in one tap or one sentence to Jarvis.
- **Launch:** the owner uses it daily, then friends and classmates test it, then it goes on the App Store.
- **Name:** stays LifeFlow.

## 2. Product rules (they apply to every phase)

1. **Simple.**
   - The 5-second test: a new user knows what's next and how they're doing within 5 seconds.
   - Plain words and titles of two words at most.
2. **Cut before you add.**
   - Reuse what exists.
   - No new system when an existing one can do the job: texting Jarvis is the same Jarvis, and the adaptive tabs are the same screens with parts hidden.
3. **One flow.**
   - The same top bar, back button and bottom sheets everywhere.
   - Each item has one main action; swiping on it gives the rest.
   - Lists show 5 items, then "See all."
4. **Safe and trustworthy.**
   - Encrypted, never sold, never used to train AI, and export or delete everything in one tap.
   - Jarvis asks before anything important and only reports what actually happened.
   - Money is read-only.
5. **Academic integrity is always on** (section 5).
6. **Jarvis does it perfectly or doesn't offer it.**
   - Every idea and skill has an eval set: realistic prompts plus the exact records it must create. These run against real services and must pass before an idea is shown.
   - Every action is checked against what was saved, with no claims. If something fails, he says what failed and what to do.
   - Before he acts: he asks one short question when something is unclear, rather than guessing.
   - After he acts: a confirmation card with the real result and Undo.
7. **Easy to discover, never overwhelming.** Users won't guess what Jarvis can do, so we teach it gradually:
   - **Onboarding:** after the school/job questions, show **3 ideas** that fit their answers, and try one together.
   - **Today:** at most **one "Try this"** suggestion a day, picked from what they haven't used and what fits their week. It can be dismissed, and it stops once they've used Jarvis for a while.
   - **In the moment:** a short hint where it matters. After adding an exam: "Want a study plan for this?" When a syllabus is uploaded: "I can add every due date."
   - **Empty states teach:** an empty screen shows the one sentence to say to Jarvis ("Send me your syllabus").
   - **The Ideas page** is the full catalog, always one tap away, for people who want to explore.
   - **Never:** walls of text, more than one suggestion at a time, badges everywhere, or repeated nagging.
8. **Jarvis connects the dots.** With classes, calendar, email, money, work and health connected, he uses them together to make the user's life easier, without waiting to be asked. For example:
   - **Exam and work:** "Your shift Thursday is the night before your Bio exam. Want me to block study time Wednesday instead?"
   - **Money and calendar:** "Rent comes out Friday and payday is Monday. You'll be $60 short for 3 days. Move the concert tickets to next week?"
   - **Sleep and school:** "You slept 5 hours and have back-to-back classes. I moved your deep work to after 3."
   - **Email and school:** "Your professor moved the essay to Nov 20. I updated it and shifted your writing blocks."
   - **Money and goals:** "You spent $40 less on food this week. Put it toward Japan?"

   His limits:
   - He uses only real facts from connected data, never guesses.
   - He makes one useful suggestion at a time, within the quiet hours and daily limit.
   - Anything that changes something goes through approval with Undo.
   - Each new kind of connection is a detector (facts) with wording in `jarvis-voice` and a test, so it stays correct.

## 3. App structure

### Tabs
| Tab | Pills | Notes |
|---|---|---|
| **Today** | none | The main screen (section 4) |
| **Plan** | Calendar · To-dos · Goals · Health (+ **Work** if they have a job) | **Calendar:** Week/Month; trips are just events. **Goals:** all goals together (savings, GPA, fitness); money goals track progress from accounts. **Work:** shifts, hours, pay. Jobs with regular hours (full-time like Mon–Fri 8 to 5) fill their shifts 3 weeks ahead automatically; a deleted day off stays off |
| **Jarvis** | Chat · Updates · Ideas | **Updates** merges Noticed and Inbox (what he did, what needs you). **Ideas** is the catalog. Memory and Personality move into the **Jarvis profile** (tap his avatar) |
| **Money** | Overview · Activity · Accounts | **Overview:** available now, spent and came in, bills and subscriptions, budget. **Activity:** transactions and rules. **Accounts:** includes investments. Insights come from Jarvis |
| **School** (only if they're in school) | Classes · Due · Notes | **Classes:** schedule, grades, "what I need on the final." **Due:** assignments and exams by date. **Notes:** notes and projects, tied to a class |

- **Settings** stays the gear icon.
- **Not in school:** 4 tabs.
- **Decision I made (owner can change it):** Work is a pill in Plan, not its own tab, so there are never more than 5 tabs.

### Onboarding
Two questions: "Are you in school?" and "Do you have a job?"
- These decide which tabs and pills show and what Today shows.
- They can be changed in Settings. Switching something off hides it; it never deletes data.

### Health (one page in Plan)
- **Filled automatically by Apple Health:** sleep, steps, workouts.
- **Added by Jarvis or by hand:** habits with check-offs and forgiving streaks, plus anything else the user wants to track.
- **Kept simple:** one page, no medical advice.

### Cut or merged
| Remove or merge | Where it goes |
|---|---|
| Trips page | Events in Calendar |
| Financial health score and money check-ins | Removed |
| "Safe to spend" (per-day math) | Replaced by **Available now** |
| Insights page and Monthly report | Jarvis answers and reviews |
| Save money page | Jarvis tips in Updates |
| Separate Budget, Bills & subs and Goals pills in Money | Overview and Plan → Goals |
| Investments page | Accounts |
| Second Brain | School → Notes |
| Noticed and Inbox pills | Jarvis → Updates |
| Memory pill | Jarvis profile |

Remove the code too: services, tools, skills, tests and migrations for removed features. Keep users' data where it moves into another feature.

## 4. Today, the main screen

Top to bottom:
1. **Greeting and a one-line summary from Jarvis:** "2 classes, essay due tomorrow, rent Friday."
2. **Money, 3 numbers:**
   - **Available now** (checking and cash);
   - **Spent this month**;
   - **Came in this month** (only what was actually deposited).
3. **Now and next:** the current or next class, shift or event, with time and place.
4. **Due soon:** assignments and exams in the next 7 days, overdue first.
5. **Today's schedule:** a short timeline.
6. **Heads-up:** at most 3, such as a bill due, a low balance, an exam this week, or a renewal.
7. **This week:** a 7-day strip with dots for exams, deadlines and bills.
8. **Ask Jarvis bar,** always visible, with quick chips.

Every item opens a bottom sheet or goes to Jarvis. Nothing needs another page.

## 5. Jarvis academic integrity (strict coach)

**Jarvis will:**
- track and remind;
- break assignments into steps and schedule study time;
- explain concepts using *different* examples;
- quiz the student for study;
- find sources with links and show how to cite them;
- outline from the student's own ideas;
- give hints and guiding questions;
- comment on the student's own draft (comments, never rewrites).

**Jarvis won't:**
- write or solve anything that gets handed in (essays, answers, code, discussion posts);
- check an answer to a graded question;
- paraphrase to avoid plagiarism checks;
- help during an open quiz or exam.

**How it's enforced (no model training):**
- **Rules in `INSTRUCTIONS`** (always the same for every user), plus a `study-coach` skill.
- **Assignment detection:** a pasted or photographed assignment switches Jarvis to coach mode, and he says so.
- **Each class's AI policy from the syllabus:** the stricter rule wins.
- **An integrity test suite:** prompts that try to get answers, including tricky ones like "example essay" or "is it B?". It must pass on every change.
- **A public "Integrity" page** in plain words, and a badge on Jarvis.

## 6. Jarvis everywhere

1. **SMS first, through Twilio:**
   - link and verify a phone number in Settings;
   - the same agent, tools, memory and rules as in the app;
   - "Reply YES" to confirm important actions;
   - money details off by text until the user turns them on;
   - optional reminders, with quiet hours and a daily limit.
2. **Later:** WhatsApp (Meta Business, approved templates), phone calls (the voice engine on a phone number), and iMessage (Apple Messages for Business, needs approval).

## 7. Plans and pricing

**Free:** everything manual, plus Jarvis with a daily limit.

**Paid** ($9.99/month, with a student discount):
- connections: bank sync, Canvas, Gmail;
- texting Jarvis;
- unlimited Jarvis and voice.

**Payments:**
- Apple's in-app purchase in the iPhone app (Apple requires it for digital subscriptions).
- Stripe on the web.
- One shared "plan" field on the user decides what's unlocked.

## 8. Order of work

| Phase | What | Done means |
|---|---|---|
| 0 🟡 | **Fix Plaid and Gmail live** (code ready, waiting on the owner's keys) (HANDOFF E1/E2) | A real sandbox bank and the owner's Gmail work in production |
| 1 ✅ | **Simplify:** the cuts and merges in section 3, the new pills, removing dead code, Jarvis profile, grouped Connections, Appearance (accent and avatar) | Fewer pages, all tests green, nothing more than 2 taps away |
| 2 ✅ | **Onboarding school/job + adaptive tabs**, with Settings toggles and 3 starter ideas | Each of the 4 combinations shows the right tabs, pills and ideas (e2e) |
| 3 ✅ | **Today redesign** (section 4), with the morning report, one "Try this" a day, and Jarvis status | 5-second test on a phone at 393 px; every item has an action |
| 4 ✅ | **Jarvis can do everything:** close every gap between buttons and Jarvis tools, the Ideas page (personal ideas on top), the new skills, goal coach, memory import, Gmail to Updates, approval cards, and hints at the right moment | Every idea passes its eval against real services, and every tool returns real saved data |
| 5 ✅ | **School tab:** Classes (grades, final calculator), Due, Notes and projects, syllabus PDF import (HANDOFF E3), a chat per class | A syllabus PDF fills a class's due dates |
| 6 ✅ | **Health page**, Apple Health plus habits | Data appears after the Shortcut runs; habits can be checked off on Today |
| 7 ✅ | **Integrity rules + test suite + Integrity page** | The suite passes, and Jarvis refuses in a helpful way |
| 8 ✅ | **SMS Jarvis** (ready; turns on with a Twilio number) | Texting adds a task that shows on Today; confirmations work |
| 9 🟡 | **iPhone app (Capacitor) + Today widget + paid plan** (plan and Capacitor ready; App Store build, widget and in-app purchase need a Mac and Apple account) (in-app purchase and Stripe) | On TestFlight for friends; paid features unlock |
| 10 🟡 | **Canvas, WhatsApp, calls, ready for schools** (Canvas, accessibility checks and school privacy text done; WhatsApp, calls and Canvas LTI need Meta, Twilio voice and a school partner) (privacy pages, accessibility WCAG 2.1 AA, Canvas LTI) | Per item |

Each phase: plan, build, `npm run check`, `npm run build && npm run test:e2e`, phone screenshots to the owner, push.

---

## 9. How each phase is built (the skills and plugins)

The project enables two plugins in `.claude/settings.json`: **agent-skills** (addyosmani/agent-skills) and **everything-claude-code** (alimoslli/everything-claude-code). If a session doesn't load them, read the skill files from those repos and follow them directly. CLAUDE.md rules win where they disagree.

**Every phase follows these steps:**
1. **spec-driven-development:** write what "done" means, the edge cases and what's out of scope, and show the owner.
2. **planning-and-task-breakdown** (planner agent): small steps that each end in a working, tested state.
3. **incremental-implementation** + **test-driven-development** / **tdd-workflow:** tests first or alongside.
4. **verification-loop:** `npm run check`, then `npm run build && npm run test:e2e`, plus phone screenshots.
5. **code-review-and-quality** (code-reviewer agent) and **/simplify:** remove anything extra.
6. **doubt-driven-development:** before saying "done," try to prove it wrong. Run the real flow, not just the tests.
7. **git-workflow-and-versioning:** small commits, push to main, check the deploy status.

**Extra skills by phase:**
| Phase | Extra skills and agents |
|---|---|
| 0 Plaid and Gmail | **debugging-and-error-recovery**, **security-and-hardening** |
| 1 Simplify | **code-simplification**, **deprecation-and-migration** (move data before deleting features), the **refactor-cleaner** agent (dead code), **frontend-ui-engineering** |
| 2 Onboarding | **frontend-ui-engineering**, **browser-testing-with-devtools**, the **e2e-runner** agent |
| 3 Today | **frontend-ui-engineering**, **performance-optimization** (Today must load fast), **browser-testing-with-devtools** |
| 4 Jarvis can do everything | **eval-harness** (evals for every idea), **context-engineering** (prompts and skills), **api-and-interface-design** (tool shapes), **security-and-hardening** (confirm gates), **constraint-driven-development** |
| 5 School | **frontend-ui-engineering**, **security-and-hardening** (PDF uploads are untrusted), **eval-harness** (syllabus extraction accuracy) |
| 6 Health | **frontend-ui-engineering** |
| 7 Integrity | **eval-harness** (the integrity suite), **context-engineering**, **documentation-and-adrs** (the Integrity ADR and public page) |
| 8 SMS | **security-and-hardening** (verify Twilio signatures, phone verification), the **security-reviewer** agent, **/security-review** |
| 9 iPhone app and paid plan | **shipping-and-launch**, **ci-cd-and-automation**, **security-and-hardening** (purchase receipts) |
| 10 Canvas, WhatsApp, schools | **observability-and-instrumentation**, **shipping-and-launch**, **documentation-and-adrs** |

Every decision gets an ADR in `docs/adr/` (**documentation-and-adrs**), and docs are updated at the end of each phase (doc-updater agent).
