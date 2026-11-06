# Page inventory against the simple concept

Date: 2026-11-06. Read-only audit, no product code changed. Written for the owner and the builders.

## How this was done

- I read every `page.tsx` under `src/app/` (app, auth, onboarding, legal, admin, landing, offline) and the components each one renders (forms, cards, lists).
- Counts come from the code, not from screenshots. The older screenshots in the audit folder were not used, because they predate today's fixes. Counts may be off by one or two where a form is built from a shared component.
- **Effort** = what sits on the main view: F = fields, toggles or sliders you can type into or flip; L = lists, tables or grids the person has to scan. Forms that open behind a tap are written as "+N deeper", and are not counted in F.
- **Scores** run 1 (fails) to 5 (passes). The five checks are the owner's list from `docs/vision.md` section 15, item 12:
  - **5s** = understood in 5 seconds
  - **Knows** = the app knows, the person approves (connections, one sentence or one tap, forms only for corrections)
  - **Helps** = shows only what helps (one next step, no dense lists, sliders, percentages, jargon)
  - **Voice** = same calm look and voice
  - **Line** = fits into the timeline surface (v3)
- **Avg** is the plain average. **Pain** = (5 minus Avg) times a use weight (daily 3, weekly 2, rarely 1). The higher the pain, the sooner the page should be redesigned.
- Goals and Connected accounts are already decided and being prototyped. They are scored as they stand today so the table is honest, and marked "in progress".

## Headline

- The shell pages (Today, Plan, Money, the assistant) are in decent shape (Avg 3.6 to 4.0). The pain is in the pages one tap below them.
- **Worst by pain:** To-dos, Goals (in progress), Work, Transactions, Plan, School, Budgets, Task detail.
- The same four problems repeat everywhere: (1) an add form where one sentence would do, (2) a list or table where one status line would do, (3) numbers and percentages the app could simply say in words, (4) the same fact asked from the person that a connection already holds (class, job, pay, bills, accounts, health).
- Two pages break the design rules outright: **Settings home** is an iOS-style grouped list with icon tiles (CLAUDE.md design rule, 2026-11-05), and **Work** shows "Est. gross" pay totals that need a check against the hourly-pay rule.

## The table

Use: D = daily, W = weekly, R = rarely. Scores in order 5s / Knows / Helps / Voice / Line.

### Daily pages

| Route | Job | Use | Effort on main view | 5s | Knows | Helps | Voice | Line | Avg | Pain | Biggest fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` Today | What is happening now and what needs me | D | 1F (add a to-do), 4L (to-do list with up to 8 rows plus done rows, later-today timeline, 4 habit chips, money row), 3 chips | 4 | 3 | 3 | 4 | 4 | 3.6 | 4.2 | Cut to the assistant's one sentence, the up-next card and the top 3 things; fold the to-do list, habit chips and later-today into the timeline |
| `/tasks` To-dos | List and tick off to-dos | D | 1F, 3 view tabs, up to 4 grouped lists (overdue, today, 7 days, later) plus a swipe hint | 3 | 2 | 2 | 3 | 3 | 2.6 | 7.2 | Stop being a page: show only today and late items on Today and the timeline, add by sentence, keep "all to-dos" one tap deeper |
| `/plan` Plan | The next 7 days | D | 4 filter chips, 7 day lists, a "life load" card, 2 add buttons, week paging | 3 | 4 | 2 | 3 | 4 | 3.2 | 5.4 | Replace the seven stacked lists with the timeline: one line per day, tap a day for its blocks |
| `/school` School | Classes and what is next in each | D (students) | 0F visible, 1 course grid (3 columns on wide), up to 3 banners (duplicates, syllabus, connect Canvas); +8F "Add course" and +7F "Add assignment" behind buttons | 3 | 4 | 3 | 3 | 3 | 3.2 | 5.4 | Lead with one sentence about what is due this week; courses come from Canvas or one sentence, not an Add course form |
| `/school/due` Due | Everything due, grouped by class | D (students) | 0F, grouped list of every open item, view tabs | 4 | 5 | 3 | 3 | 4 | 3.8 | 3.6 | Show the next 3 due with a tick; the full grouped list moves one tap deeper (or into the timeline) |
| `/jarvis` and `/jarvis/[id]` Assistant | Talk to the assistant, voice, history | D | 1F plus voice and capture; a conversation-history list in the side panel | 4 | 5 | 3 | 3 | 3 | 3.6 | 4.2 | Make this the "one sentence" that sits on top of every page; hide the history list one tap deeper |
| `/jarvis/says` Updates | What the assistant noticed and did | D | 0F, one feed grouped by day | 4 | 5 | 4 | 4 | 4 | 4.2 | 2.4 | Keep as is; merge with Filed so there is only one "Updates" |
| `/money` Money | Where I stand: available, spent, came in, next 30 days | D (W for many) | 0F, 4L (heads up list, 30-day bar, where it went list, 4 link pills), 3 headline numbers | 4 | 5 | 3 | 4 | 4 | 4.0 | 3.0 | One sentence of status plus Available now; drop the "where it went" list and link pills to one tap deeper |

### Weekly pages

| Route | Job | Use | Effort on main view | 5s | Knows | Helps | Voice | Line | Avg | Pain | Biggest fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/work` Work | Shifts, hours and pay | W | 0F visible, 4 stat tiles, 3 lists (shifts, jobs, paychecks), week paging; +5F "Add another job", +5F "Record a paycheck" | 2 | 2 | 1 | 3 | 3 | 2.2 | 5.6 | One sentence about this week's work; shifts into the timeline; paychecks come from bank deposits, so delete "Record a paycheck"; hide the four tiles |
| `/goals` Goals (in progress) | Personal and money goals, habits | W | About 9F always visible (3 personal, 6 money), 1 slider (what-if), per-goal contribution form (2F plus a checkbox), per-goal edit +5F, progress bars with percentages | 2 | 2 | 1 | 3 | 2 | 2.0 | 6.0 | Already decided: one calm list, one line per goal, add by sentence |
| `/finances/transactions` Transactions | Look through and fix spending | W | 6 filter controls (search, 2 dates, 2 selects, button), 1 long dated list, 3 menu actions (CSV, tidy, rules); +5F per row | 2 | 3 | 1 | 3 | 2 | 2.2 | 5.6 | Lead with "3 charges need a look" with a one-tap category each; filters and CSV one tap deeper |
| `/finances/bills` Bills | Recurring bills and income | W | 3 lists (recurring, detected, next 30 days), 1 summary line; "Add recurring item" form with about 5F visible | 2 | 3 | 2 | 3 | 3 | 2.6 | 4.8 | "Dev found these, are they right?" one-tap yes or no; delete the add form from the main view |
| `/finances/budgets` Budgets | Monthly limit per category | W | Per-category bars with percentages, a "Build my budget" form with one amount field per category (about 8), "Set a budget" 2F, month paging, a reconciliation paragraph | 2 | 3 | 1 | 3 | 3 | 2.4 | 5.2 | Say "On track for groceries, over on eating out" in words; one tap to accept the suggested budget; no per-category fields |
| `/habits` Health | Sleep, steps, workouts this week | W | 4 stat cards plus a bar chart; "Log health" form (3F: metric, value, date) | 4 | 2 | 3 | 4 | 3 | 3.2 | 3.6 | Remove the manual log form; Apple Health fills it. Show one sentence ("Slept 6h 40m, steps up"). |
| `/jarvis/memory` What Dev knows | See, keep, fix what the assistant remembers | W | Pending list, full list by category, "Add a memory" 3F, a suggestions toggle | 3 | 3 | 2 | 3 | 3 | 2.8 | 4.4 | One line ("Dev knows 14 things, 2 need your OK"); the long list is one tap deeper; adding a memory is a sentence to Dev |
| `/notes` Notes | Notes, projects, search | W (students) | 1 search, project sidebar, "New project" +2F, note list with 220-character previews | 3 | 2 | 3 | 3 | 2 | 2.6 | 4.8 | "Note that..." by sentence; project sidebar disappears (classes already group notes) |
| `/notes/[id]` Note editor | Write a note | W | The editor, title, a delete | 4 | 2 | 4 | 3 | 2 | 3.0 | 4.0 | Keep the editor; remove the project and class pickers from the main view (Dev files by class) |
| `/tasks/[id]` To-do detail | Fix one to-do | W | 9F (title, due, time, priority, repeat, reminder, class, project, notes), subtask list plus 1F | 3 | 2 | 2 | 3 | 2 | 2.4 | 5.2 | It is already a correction page: show title and due, put the other seven behind "More" |
| `/school/courses/[id]` Course | One class: open work, materials, notes | W | 4 lists, "add material" 2F, delete | 3 | 3 | 2 | 3 | 2 | 2.6 | 5.2 | One sentence for the class; open items on top; materials and notes one tap deeper |
| `/milestones` Milestones (in progress) | What I have done | R | "Add a milestone" 3F always shown, list by year, each with a hidden edit | 3 | 2 | 2 | 3 | 3 | 2.6 | 2.6 | Already decided: short "Your story" inside Goals |
| `/calendar` Calendar (month) | Month grid and one day | W | Month grid plus a day list | 3 | 3 | 3 | 3 | 2 | 2.8 | 5.6 | Merge into the timeline as its zoomed-out view; no separate page |

### Rare pages (money, assistant and settings)

| Route | Job | Use | Effort on main view | 5s | Knows | Helps | Voice | Line | Avg | Pain | Biggest fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/finances/subscriptions` Subscriptions | Find and trim subscriptions | R (W near renewals) | 2 total tiles, 3 lists with badges (Price up, Trial, Not using, Kept), a hidden trial date | 3 | 3 | 2 | 3 | 3 | 2.8 | 2.2 | Merge with Bills: one "Bills and subscriptions" page of one-tap "yes, that is mine" items |
| `/finances/accounts` Accounts | Balances, manual accounts, bank links | R | Grouped lists, "Bank connections" card, "Add an account manually" 5F visible, +5F edit per account (credit limit, APR, minimum, due date) | 2 | 3 | 1 | 3 | 2 | 2.2 | 2.8 | Bank links go to What Dev can see; Money shows balances in one line; the manual-add form moves one tap deeper |
| `/finances/rules` Category rules | List of merchant to category rules | R | 1 list | 2 | 2 | 2 | 3 | 1 | 2.0 | 3.0 | Disappear: one-tap "Always file Starbucks as Coffee?" lives inside Transactions |
| `/wealth` Investments | Net worth, holdings, allocation | R | 4 stat tiles, holdings table (5 columns), allocation, "What if I invest every month" calculator, "Add a holding" 6F | 2 | 3 | 1 | 3 | 2 | 2.2 | 2.8 | One sentence ("Net worth about $X, up since last month"); table, calculator and add form leave the main view |
| `/jarvis/profile` Assistant profile | Hub with three tiles and links | R | 0F, 6 links | 3 | 3 | 3 | 2 | 2 | 2.6 | 2.6 | Disappear: it only points to other pages |
| `/jarvis/ideas` Ideas | Things the assistant can do | R | Grouped list of ideas | 4 | 4 | 3 | 3 | 2 | 3.2 | 1.8 | Disappear: become the suggestion chips in a new chat |
| `/jarvis/memory/import` Import from another AI | Paste another assistant's memory | R | Copy step, paste box, tick list | 4 | 3 | 4 | 3 | 2 | 3.2 | 1.8 | Merge with the Your story import so there is one "bring what you have" |
| `/inbox` Updates, Filed | Forward address, allowed senders, filed items | R | 1F (add sender) plus a verify code field, a sender list, a filed list | 2 | 3 | 2 | 3 | 2 | 2.4 | 2.6 | Forwarding address and senders go to What Dev can see; filed items join the one Updates feed |
| `/settings` Settings home | Doorway to everything | R | 12 rows in 5 groups with icon tiles, a profile card | 4 | 4 | 3 | 1 | 2 | 2.8 | 2.2 | Replace the iOS-style list with a short page in our own voice: three sentences ("You", "Dev", "Privacy"), each one tap deeper |
| `/settings/profile` Profile and appearance | Name, time zone, theme, text size, week start, what fills the week, study time | R | About 7F plus theme and text size pickers | 3 | 2 | 2 | 3 | 2 | 2.4 | 2.6 | Time zone and week start come from the device; "what fills your week" from connections; leave theme, text size and name |
| `/settings/notifications` Notifications | Push on or off, reminders | R | 1 toggle, 1 save, a device list | 3 | 3 | 2 | 3 | 2 | 2.6 | 2.4 | Merge with the assistant's "when it speaks up" settings into one page |
| `/settings/jarvis` Assistant settings | Name, personality, length, quiet hours, topics, automation | R | About 16 controls (name, style, answer length, frequency, quiet from and until, daily cap, topic toggles, automation toggles) | 2 | 2 | 1 | 3 | 2 | 2.0 | 3.0 | Name plus one sentence ("Quiet at night, short answers"); the 14 other controls are one tap deeper, or the assistant sets them when asked |
| `/settings/security` Face ID and passwords | Money lock, passkeys, password, devices | R | Lock toggle plus an idle-time select, passkey list, 3 password fields, device list, linked sign-ins | 3 | 3 | 2 | 3 | 2 | 2.6 | 2.4 | "Money is locked with Face ID" as one line with one toggle; password and devices one tap deeper |
| `/settings/integrations` Connected accounts (in progress) | Connect school, mail, calendar, banks, work, health | R, but first-week critical | 5 groups, 7 cards, an Apple Health key block | 2 | 3 | 1 | 2 | 3 | 2.2 | 2.8 | Already decided: "What Dev can see" |
| `/settings/data` Privacy and data | Export, privacy, delete account | R | Export button, privacy text, delete form (2F: password and typed DELETE) | 3 | 4 | 4 | 3 | 3 | 3.4 | 1.6 | Keep; delete form one tap deeper |
| `/settings/trash` Recently deleted | Restore deleted items | R | 1 list | 4 | 4 | 4 | 4 | 3 | 3.8 | 1.2 | Keep as is (undo already exists on each action) |
| `/settings/text` Text the assistant | Verify a phone number | R | 2F (number, code) | 3 | 2 | 3 | 3 | 3 | 2.8 | 1.8 | Fine; make it a single "Text Dev" tap that uses the number already on the account |
| `/settings/plan` Plan | Upgrade or see the plan | R | 1 button | 4 | 4 | 4 | 4 | 3 | 3.8 | 1.2 | Keep |
| `/settings/invite` Invite friends | Share a link | R | 1 link, 1 count | 5 | 5 | 5 | 4 | 3 | 4.4 | 0.6 | Keep |
| `/settings/feedback` Send feedback | Tell us something | R | 1 text box, 3 kind radios | 4 | 4 | 4 | 4 | 3 | 3.8 | 1.2 | Drop the kind radios (the assistant can tell) |

### Sign-in, first run, public

| Route | Job | Use | Effort | 5s | Knows | Helps | Voice | Line | Avg | Pain | Biggest fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/welcome` Onboarding | Five steps to a first day | Once | 2 text inputs (a class, a job), 1 name, 2 choice steps | 4 | 2 | 4 | 4 | 3 | 3.4 | 2.0 | The "details" step asks the person to type a class and job; offer "Connect Canvas or Google" first, type only as a fallback |
| `/login`, `/login/verify` | Sign in (password, Apple, Google, passkey, 2-step code) | R | 2F (email, password) or 1 tap; verify: 1F | 4 | 4 | 4 | 3 | 3 | 3.6 | 1.4 | Passkey first when one exists |
| `/signup` | Create an account | Once | 3F (name, email, password) or 1 tap | 4 | 3 | 4 | 3 | 3 | 3.4 | 1.6 | Lead with Apple and Google; ask the name last in welcome |
| `/forgot-password`, `/reset-password` | Reset | R | 1F, 2F | 4 | 4 | 4 | 3 | 3 | 3.6 | 1.4 | Fine |
| `/privacy`, `/terms`, `/integrity` | Legal and academic integrity | R | Long text (privacy 263 lines) | 3 | 5 | 3 | 3 | 3 | 3.4 | 1.6 | Add a 5-line plain summary on top of privacy; the rest one tap deeper |
| `/landing` | Public marketing page | R | Reading only | 4 | 5 | 4 | 3 | 3 | 3.8 | n/a | Outside the app; not part of this redesign |
| `/offline` | Shown with no connection | R | 4 link buttons | 5 | 5 | 5 | 4 | 3 | 4.4 | 0.6 | Fine |
| `/plaid-oauth`, `/finances`, `/settings/memory` | A bank-return page and two redirects | n/a | none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Technical; keep `/plaid-oauth`; remove the two redirects once old links are gone |
| `/admin` (9 pages) | Owner only: overview, users, feedback, errors, growth, health, activity, announcements | owner | Dashboards, tables, forms | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Out of scope. They are not the person's life. Judge by a separate owner-tool bar. |

## What the app could know instead (by connection)

| Page | Asks the person for | Could come from |
|---|---|---|
| Today, To-dos | Typing each to-do | Canvas due dates, Gmail and Outlook mail, a photo or sentence to the assistant (already there, only the form is louder) |
| School (add course, add assignment, course details) | Course name, code, instructor, meeting times, term, link (8F), assignment fields (7F) | Canvas or Teams; a syllabus photo; "I'm taking BIO 110 and MATH 152" |
| Work (jobs, paychecks, shifts) | Employer, rate, pay date, hours, net and gross | Schedule emails (Gmail, Outlook), the bank deposit for each paycheck (Plaid), the learned pay model; the job from the first deposit |
| Bills, Subscriptions, Budgets | Name, amount, repeat, next due; budget amounts | Plaid transactions (already detected); suggested budgets (already exist) |
| Accounts, Wealth | Manual account (5F), holdings (6F), APR, credit limit, minimum, due date | Plaid (balances, investments, liabilities all supported) |
| Health | Metric, value, date | Apple Health (already connected through the key) |
| Goals, Milestones | Name, target, saved so far, monthly, date, linked account | The linked account balance, the assistant's plan card |
| Profile | Time zone, week start, what fills the week, study time | Device settings, calendar, Canvas and shifts, past study blocks |
| Memory | Adding a memory by form | One sentence to Dev, or the AI import |
| Inbox | Allowed senders, verification code | Accounts already connected (Gmail and school address are the senders) |
| Onboarding | A class and a job by typing | Canvas, Google, Outlook |

## Jargon and settings words on main views today

- **Money, bills and wealth:** "Net worth", "Assets minus debts", "IRA / 401(k) subtypes", "Allocation", "Holdings", "Quantity", "Gain", "APR %", "Minimum payment", "Credit limit", "Amount owed", "Gross", "Net", "Est. gross", "Reconciliation" paragraph on Budgets ("In budgets plus no budget equals all spending"), "Don't use in LifeFlow".
- **Connections:** "Bank not on Plaid?", "Plaid is faster when your bank supports it", "UKG Pro", "UKG API access is normally issued to employers", "Read-only", "Choose accounts", "Apple Health key" and the ingest address.
- **Settings:** "Answer length", "Quiet from / Until", "Notifications a day (at most)", per-topic toggles, "Time zone", "Week starts on", "Face ID / Touch ID for Money", "Lock after".
- **Words that are fine:** Available now, spent, came in, Up next, Heads up.
- **Percentages and sliders on a main view:** Goals (progress bars, slider on "What if I added"), Budgets (bars and percent), Wealth (percent of holdings, "What if I invest every month"), Today (progress ring "3 of 5 done"; fine, it is words).
- **Internal name:** the user-visible text I read has no "Jarvis". The only hit is a code comment in `src/app/(app)/_today/insights.tsx`. The AI model name on the memory page is behind `?debug=1`, so it follows the rule.

## The redesign order

Order = highest pain first, batched so each batch fixes one pattern and can reuse one set of parts. Goals and Connected accounts are first because the owner already chose them.

**Batch 0 (in progress): the two the owner picked.**
Goals + Milestones ("Your story") and Connected accounts ("What Dev can see"). These set the patterns every later batch copies. Land them first, and then take the other batches against their finished picture.

**Batch 1: the daily core, "one list on top, add by sentence".** Pain 7.2, 5.6, 4.2.
To-dos (7.2), Plan with Calendar merged in (5.6 and 5.4), Today (4.2). Pattern: the assistant's one sentence, one list of "now and next", add by sentence or one tap, to-do detail as a small sheet. These three are the same data on three screens today. Build them together so there is one list, not three, and so the timeline (v3) has a body to grow into.

**Batch 2: school and work, "the week comes from connections".** Pain 5.6, 5.4, 5.2, 3.6.
Work (5.6), School (5.4), Course page (5.2), Due (3.6). Pattern: connect first, the page is one sentence about this week plus the next 3 things, "Add course", "Record a paycheck" and "Add another job" disappear into the assistant or into What Dev can see. Do the onboarding "details" step here too, since it asks for the same class and job.

**Batch 3: money in words, "Dev found these, is that right?".** Pain 5.6, 5.2, 4.8, 2.2.
Transactions (5.6), Budgets (5.2), Bills plus Subscriptions merged (4.8 and 2.2), Rules removed. Pattern: a short list of things that need one tap, status lines in plain words, filters and exports one tap deeper. Then do Money itself (3.0), since its "where it went" list and pills depend on these pages being simple.

**Batch 4: the assistant's own pages, "what Dev knows and what it says".** Pain 4.4, 4.2, 2.6.
What Dev knows (4.4), Assistant chat (4.2), Updates plus Filed merged (2.6 and 2.4), Profile and Ideas removed, the two imports merged. Pattern: a count and one sentence on top, long lists one tap deeper.

**Batch 5: notes, tasks and health detail, "correction pages".** Pain 4.8, 4.0, 5.2, 3.6.
Notes list and editor, To-do detail, Health. Pattern: the main view is read-only plus one sentence, all fields behind "Fix something". Health loses its log form.

**Batch 6: money you have, "what I have in one line".** Pain 2.8, 2.8.
Accounts and Wealth. Pattern: one sentence of net worth on Money; manual add forms are a tap deeper; investments table and the calculator go behind "Details".

**Batch 7: settings, "three sentences".** Pain about 2.2 to 3.0 each.
Settings home (also fixes the iOS-style rule), Assistant settings plus Notifications merged, Profile, Security. Pattern: current state in a sentence, one toggle, rest one tap deeper. Leave Data, Trash, Plan, Invite and Feedback nearly as they are.

**Leave alone:** Updates feed, Trash, Plan, Invite, Offline, Login and its relatives, the legal pages (add a 5-line summary only), Landing, Admin.

## Shared patterns to reuse everywhere

1. **The assistant's one sentence on top.** Every page opens with one plain sentence about the person's real data ("Two things are due this week, and your shift on Friday is moved"). Today's headline and Money's "Heads up" already do this, so lift them into one component. The sentence comes from the brain's facts, never from a language model's guess.
2. **Plain status lines.** One line per thing, in words: "On track", "Over by $40", "Needs your OK", "Last checked this morning". No bars with percentages, no stat tiles, no badges stacked on a card. Percentage numbers move into a details view.
3. **One-sentence add.** Every "Add ..." button and form on the main view becomes "Tell Dev" (type or speak), with one tap for the few things that are faster to tap (tick a to-do, confirm a found bill). The quick-add sheet today has three tabs and about ten fields (to-do, shift, spending); it becomes the same sentence box.
4. **One-tap fix.** Anything Dev found or is unsure about is a card with Yes and Not this ("Netflix $15.49 monthly, is that yours?"). It replaces detected-bills lists, uncategorized transaction rows, duplicate classes, memory approvals and pending suggestions. Always with Undo, as the rules already require.
5. **Details one tap deeper.** Every existing form stays, but as "Fix something" or "More", for corrections only. Current forms (edit shift, edit account, edit goal, to-do detail) already live in sheets or details tags, so the cost is moving them, not rewriting them.
6. **Connect first, type last.** Any empty state that today shows a form says "Connect X" first (Canvas, Google, bank, Apple Health) and "or tell Dev" second. The form is the third choice.
7. **Items, not pages.** A to-do, class, shift, bill, goal and milestone are all "items on the timeline" with a date, a colour and one action. If a page's list is made of items, it should be a filtered timeline view, not its own layout. This is how every page above fits the v3 surface.
8. **One words list.** Names such as Available now, Up next, Heads up and "What Dev can see" are fixed. Jargon (APR, Plaid, UKG, net worth, allocation, gross) is shown only after a tap on "Details" and gets a plain-words line the first time.
9. **Per-page budget:** at most 1 text box, at most 3 things to read, at most 1 next step on the main view. Anything else is a tap away. This is checkable in review and in a screenshot test.

## Pages that should disappear or merge

| Page | What happens | Why the app can know it |
|---|---|---|
| `/calendar` (month) | Becomes the zoomed-out view of the timeline; the page goes | Plan and Calendar show the same agenda; Plan already links between them |
| `/tasks` (list page) | Merges into Today and the timeline; "all to-dos" is one tap deeper. `/tasks/[id]` stays as the correction sheet | To-dos come from Canvas and the assistant already |
| `/school/due` | Merges into School (the main view is "what is due") | Same data as School's next-by-course |
| `/finances/subscriptions` + `/finances/bills` | One "Bills and subscriptions" page | Both come from the same detected recurring charges; a segmented tab already joins them |
| `/finances/rules` | Disappears; rules are made by a one-tap "always file X as Y?" in Transactions | Rules are a result of corrections, not a thing to manage |
| `/finances/accounts` + `/wealth` | Shrink to a "What you have" section inside Money; bank links move to What Dev can see; the manual-add forms are one tap deeper | Plaid gives balances, investments and liabilities |
| Work: "Record a paycheck", "Add another job" | Forms go; Work becomes a short page, shifts live on the timeline | Paychecks arrive as deposits; the job shows in the first deposit or schedule email |
| `/inbox` (Filed) + `/jarvis/says` | One Updates feed; forwarding address and senders move to What Dev can see | Filed items are updates; senders are connected accounts |
| `/jarvis/profile` | Disappears; the name and personality go to the assistant settings | It is only a hub of links |
| `/jarvis/ideas` | Disappears; becomes the suggestion chips in a new chat | They are prompts, not a place |
| `/jarvis/memory/import` + the milestones import | One import ("Bring what another AI knows about you") | Both call the same import parser |
| `/settings/jarvis` + `/settings/notifications` | One "How Dev talks to you" | The notification cap and topics already appear in both |
| `/settings/invite` + `/settings/feedback` + `/settings/plan` | Could share one "LifeFlow" page (optional) | Three small one-button pages |
| `/habits` Health: the "Log health" form | The form goes | Apple Health supplies it; Health stays as a short read-only page |
| `/milestones` | Becomes "Your story" inside Goals (already decided) | Reached goals join the timeline at read time |
| `/finances` and `/settings/memory` redirects | Remove once old links stop arriving | Technical clean-up |

## Notes and flags for the owner

- **Work totals vs the pay rule.** The Work page shows "Est. gross this week" and "Est. gross this month" from hours times the rate. The rule in `CLAUDE.md` says hourly pay is never predicted until the learned pay prediction passes its tests. If these tiles count future shifts, they break it; if they only count shifts already worked, they are an hours total. Decide before the redesign.
- **Settings home** copies the phone's own Settings list. That is against the design rule of 2026-11-05 and should be fixed in Batch 7 at the latest.
- **Two pages called "Updates"** (assistant feed and Filed) share a tab strip. Two names for one idea; merge as above.
- **Counting method.** Field counts include shared components (for example the school forms are used by two dialogs). If the owner wants a hard number per page, a screenshot pass on a running build would double-check them. I did not run the app.
