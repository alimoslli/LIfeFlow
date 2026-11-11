# Product and UX proposals (backlog item 7), 2026-11-11

Pictures only. Nothing here is built, and no product code changed. Every picture is a phone mockup (393x852 at 2x) in the app's real look: Fraunces and Geist, the colours from `globals.css`, the night sky, and the real skylings and pixel icons rendered from `CompanionGlyph` and `PixelIcon`. Every invented number is tagged "example". The HTML is next to each picture (`*.html`, sources in `src/`).

Checked against `origin/main` at `3c5df747` (the working branch `claude/chief-of-staff` is 82 commits behind it). File:line references below are for that commit. Research rules applied (`2026-11-09-first-run-that-converts.md`, "Things to avoid"): no bank in the first minute, every welcome step names what it changes, no invented number without "example", lead with the skyling and the connected day, never with "AI".

## The proposals

| | Problem | Picture | What changes for the person | Effort | Risk | Recommendation |
|---|---|---|---|---|---|---|
| (a) Earlier outcome in the welcome | Today's welcome is skyling, about you, connect, "how to read it". The person never sees their own week land before the end, and "I'll connect later" leaves them with nothing saved. | `a-onboarding.png` | A new step after Connect: "Here's your week so far" lists what just landed (class, shift, due date), the skyling offers the first fix ("Want me to put a study block on Wednesday?") with Yes and Not now. If they skipped connecting: four tiles (Class, Shift, Bill, To-do) to save one real thing. Matches research proposals 1, 3 and 4. | M | Low. Adds one step (5 total, each earns its place). The offered fix is a normal suggestion with Undo. | **Yes** |
| (b) Product proof on the landing page | After the headline, the first screen of content is the five-skyling cast. Nothing shows what the app does until the third section. | `b-landing.png` | A "See it on a real week" card goes between the hero and the cast: one example day with a clash and the skyling's fix, plus the sources it reads. Tagged "Example". The cast stays, just lower. Night look, skylings and pixel style unchanged. | S | Low. Copy must stay honest (see claims). Needs the 5-second test with students. | **Yes** |
| (c) Clearer Today | Today is the sky and the day wheel plus one skyling line. The wheel is lovely but you cannot read "what is next, and what do I do" at a glance. | `c-today.png` | A "Next up" card under the sky: up to 3 rows (time, what, one action: Start, See fix). The wheel and the skyling stay. Nothing dense. | M | Medium. Touches the home surface that the owner designed (the clock). Keep it to 3 rows and never a full list. | **Yes, but as a test on one phone first.** Owner should say if the wheel alone is already enough. |
| (d) Manual entry up front | Quick-add exists (`quick-add.tsx`: to-do, shift, spending) but it lives on Plan and the assistant page. A class is only under School ("Add course"), a bill only under Money, Bills. Today has no Add. | `d-add.png` | An Add button on Today opens one sheet: say it in one sentence, or pick Class, Shift, Bill or To-do, or send a photo. Reuses the existing forms one tap deeper. Honours the rule: the app knows, the person approves, forms only one tap deeper. | M | Low. No new data model. Offline queue today handles to-do, shift and spending only; class and bill would need online. | **Yes** |
| (e) Balance freshness and forecast explanation | Money already says "Balances as of Nov 11, 3:42 PM" (`money/page.tsx:140`) but as 12 px muted text with an exact stamp, no warning when old. The "how" of the forecast is the last line of the card (`cash-outlook.tsx:89`). | `e-money.png` | A chip "Bank updated 2 hours ago" (green), turning amber with a Fix button after 24 hours. The one-line "how this is worked out" moves directly under the forecast sentence. Pay still never counted. | S | Low. Needs the oldest of the balance and sync times (already computed: `balances.asOf`). | **Yes** |
| (f) Visible sync and reconnect states | Freshness exists only inside Settings, Connections ("Updated Nov 8, 3:42 PM", badge "Needs attention"). Nothing on Today or Money says a bank or Canvas stopped syncing. | `f-sync.png` | Three states in words (Up to date, Syncing, Needs you), each with when, and a Reconnect button. A one-line strip on Today and Money only when something needs the person. No strip otherwise. | M | Medium. Needs one real "needs you" signal per connection (status `error` exists). Never invent a state. | **Yes**, after (e), same chip |
| (g) Contrast fixes | Small text below 4.5:1 in a few real places. | `g-contrast.png` | Raise opacity or token. No layout change. | S | Very low. | **Yes. It is a bug fix, pre-approved by the small-fix rule.** |

### (g) Real low-contrast text, with numbers

Ratios are computed from `globals.css` values and the opacity in the class. Small text needs 4.5:1, icons and large text 3:1.

| Where | Now | Fix |
|---|---|---|
| `src/app/(app)/money/page.tsx:285` label `opacity-75` on the hero card (12 px) | 4.05:1 | `opacity-90` (about 5.1:1) |
| `money/page.tsx:289` sub line `opacity-70` (12 px) | 3.74:1 | `opacity-88` or more (4.94:1) |
| `src/app/landing/page.tsx:267` "Example" `text-white/45` on the card (12 px). It is the label the research rule requires, so it must be readable. | 4.07:1 | `text-white/65` (6.82:1) |
| `landing/page.tsx:368` FAQ chevron `text-ink-night/45` (icon) | 2.75:1 | `text-ink-night/70` |
| `landing/page.tsx:393` trademark note `text-ink-night/55` (12 px) | 3.65:1 | `text-ink-night/75` (6.86:1) |
| `landing/page.tsx:401` footer `text-ink-night/60` (14 px) | 4.24:1 | `text-ink-night/75` |
| `landing/page.tsx:191, 214` "Tap the sky" `text-white/45` (11 px, decorative, `aria-hidden`) | 4.33 to 4.49:1 | optional: `text-white/60` (6.7:1) |
| `src/components/shell/app-shell.tsx:350` the "Ctrl J" chip: `text-muted` on `bg-surface-3` in dark mode | 3.62:1 | `text-text-2` (6.28:1) |
| Tokens: dark `--muted` (#93a1b7) on `--accent-soft` (#233f68) | 4.05:1 | lighten `--muted` in dark by one step, or never put muted text on accent-soft in dark |

Checked and fine: light `--muted` on `--bg` 5.08, on `--surface-2` 4.81; dark `--muted` on `--bg` 5.77; the status pairs (warning, success, info, danger on their soft backgrounds) 4.98 to 5.87; white/55 on night cards 4.56 to 6.25.

## Claims that do not match behaviour

What the app really does (checked in the code):
- A skyling's chat turn runs most changes straight away and shows what changed (Undo for what the turn just created, 24 hours). It asks first (a confirm card) only for deleting things (tasks, events, bills, notes, courses, projects, jobs, habits, transactions, goals, milestones, shifts, assignments), for sending email, for adding a Google Calendar event, for recording money set aside for a goal, and for changing account details. `src/server/jarvis/tools/*.ts` (`confirm`).
- Its own suggestions (messages) change nothing until the person taps. The "Allowed without asking" switches (`autonomy.tasks`, `autonomy.calendar`, both off by default) let it add to-dos and reminders, move late to-dos and block calendar time by itself, always with Undo. `proactive/engine.ts:149`. Money actions only run on "Do it".
- LifeFlow never spends, pays or moves money (bank connections are read-only), so "asks before spending" describes something that cannot happen.
- Messages are capped: free plan 15 a day (`billing.ts:24`), and every account 400 a day and 20 a minute (`api/jarvis/chat/route.ts:39-40`); during testing 30 a day, 300 a month and a dollar cap.

| # | File:line (origin/main `3c5df747`) | Says now | Problem | Replace with |
|---|---|---|---|---|
| 1 | `src/app/landing/page.tsx:53` | "It asks first" "before sending, spending or deleting anything." | It cannot spend. Asking first covers deleting and sending, not every change. | "It asks first before it deletes or sends anything. It never moves your money." |
| 2 | `landing/page.tsx:87` (FAQ "What is a skyling, exactly?") | "…and it always asks before it changes anything." | False: it adds and edits most things at once and shows Undo; with the autonomy switches on it acts by itself. | "It runs on AI. It shows you what it changed, with Undo, and it always asks before it deletes or sends anything." |
| 3 | `landing/page.tsx:176-177` | "…spots what's about to clash and fixes it before you feel it." | Implies it fixes by itself. | "…spots what's about to clash and has the fix ready before you feel it." |
| 4 | `landing/page.tsx:204` and `:385` | "Set up in two minutes" / "Two minutes to set up." | No measurement of setup time exists (research proposal 6 says to measure the first 60 seconds). | "Set up in minutes" until measured. Then the real median. |
| 5 | `landing/page.tsx:293` | "Outlook and Teams" in the list of things it connects to | The connection is Outlook calendar, which includes Teams meeting links. Teams for Education assignments are not read (needs school admin consent). | "Outlook calendar (with Teams meetings)" |
| 6 | `src/app/(app)/settings/plan/page.tsx:16` | "Unlimited messages with your skyling" | There is a 400 a day hard cap for everyone, and testing limits. Also the chat error at `api/jarvis/chat/route.ts:43` says "has no daily limit". | "Far more messages a day than the free plan" and in the error "LifeFlow Pro has a much higher daily limit." |
| 7 | `src/app/(app)/jarvis/profile/page.tsx:60` | "…asks before anything important…" | Vague, and "important" is not what the code does. | "…asks before it deletes or sends anything…" |
| 8 | `src/app/(app)/settings/memory/assistant-card.tsx:157` | "Money and messages always ask first. Anything else can be undone." | Close. Deleting also always asks, and "messages" is ambiguous. | "It never moves money. Deleting and sending always ask first. Everything else it does shows Undo." |
| 9 | `src/app/(onboarding)/welcome/onboarding.tsx:49` (step note for Connect) | "…You approve what it changes." | Connected data lands by itself (that is the point); approval is for deletes and sends. | "What you connect lands on your sky and stays up to date. Your skyling asks before it deletes or sends anything." |

Checked and accurate, no change: `landing/page.tsx:50-52` (read-only bank, locked to your account, never sold or used to train without permission), the FAQ answers on moving money and homework, `src/components/jarvis/chat.tsx:826` ("Deletions always ask first"), `src/components/motion/tour.tsx:32`, `settings/integrations/google-card.tsx:36` ("Sending always asks you first"), and the terms (`(legal)/terms/page.tsx:47`) and privacy (`(legal)/privacy/page.tsx:127`) wording. Use that wording as the model for the replacements above.

The three landing "moment" cards (`landing/page.tsx:30, 37, 44`) are consistent with behaviour: each ends with a question or leaves the send to the person, and each is tagged "Example".

## Order if the owner says yes

1. (g) and the claims table (small fixes, copy only; claims 1, 2, 6, 7, 9 are wrong statements, so fix first).
2. (e), then (f) (one freshness chip, reused).
3. (b), (d), (a), then (c).
