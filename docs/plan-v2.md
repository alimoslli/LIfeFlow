# LifeFlow v2 plan: student first, simple, Jarvis everywhere

Drafted 2026-10-29 from the owner's decisions. Nothing in this plan is built yet. Build one phase at a time, and only after the owner says go.

**Still pending from the owner:** the MetaMuse link, for an honest comparison before Phase 3.

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

## 3. App structure

### Tabs
| Tab | Pills | Notes |
|---|---|---|
| **Today** | none | The main screen (section 4) |
| **Plan** | Calendar · To-dos · Goals · Health (+ **Work** if they have a job) | **Calendar:** Week/Month; trips are just events. **Goals:** all goals together (savings, GPA, fitness); money goals track progress from accounts. **Work:** shifts, hours, pay |
| **Jarvis** | Chat · Updates · Memory | **Updates** merges Noticed and Inbox (things he noticed and things he filed) |
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
| 0 | **Fix Plaid and Gmail live** (HANDOFF E1/E2) | A real sandbox bank and the owner's Gmail work in production |
| 1 | **Simplify:** the cuts and merges in section 3, the new pills, removing dead code | Fewer pages, all tests green, nothing more than 2 taps away |
| 2 | **Onboarding school/job + adaptive tabs**, with Settings toggles | Each of the 4 combinations shows the right tabs and pills (e2e) |
| 3 | **Today redesign** (section 4) | 5-second test on a phone at 393 px; every item has an action |
| 4 | **School tab:** Classes (grades, final calculator), Due, Notes and projects, syllabus PDF import (HANDOFF E3) | A syllabus PDF fills a class's due dates |
| 5 | **Health page**, Apple Health plus habits | Data appears after the Shortcut runs; habits can be checked off on Today |
| 6 | **Integrity rules + test suite + Integrity page** | The suite passes, and Jarvis refuses in a helpful way |
| 7 | **SMS Jarvis** | Texting adds a task that shows on Today; confirmations work |
| 8 | **iPhone app (Capacitor) + paid plan** (in-app purchase and Stripe) | On TestFlight for friends; paid features unlock |
| 9 | **Canvas, WhatsApp, calls, ready for schools** (privacy pages, accessibility WCAG 2.1 AA, Canvas LTI) | Per item |

Each phase: plan, build, `npm run check`, `npm run build && npm run test:e2e`, phone screenshots to the owner, push.
