# Notifications that bring people back: what works, 15 ideas for LifeFlow, and an audit of round 2

Report 2026-11-06, round 3. Written by the market researcher, ordered by the owner: "We have to think very creatively with the notifications to bring back those customers and users every day to our app and not forget it like those other planners. I think the target is with the notifications." Everything below was read on 2026-11-06. Finished and re-checked on 2026-11-07 (see the notes marked 11-07).

**How this was done, and the same limit as rounds 1 and 2.** I tried each review and research site once. Blocked (connection refused at the proxy, or "host not allowed" in the page reader): apps.apple.com, play.google.com, reddit.com, trustpilot.com, blog.duolingo.com, research.duolingo.com, airship.com, onesignal.com, businessofapps.com, 9to5google.com, techcrunch.com, webkit.org, consumerfinance.gov, support.google.com, community.canvaslms.com, copilot.money, monarchmoney.com, rocketmoney.com, dl.acm.org, arxiv.org, nber.org, bc.edu, fincap.org.uk and advanced-hindsight.com. Two sources I could read myself: **Apple's design guidelines** (developer.apple.com: notifications, managing notifications, Live Activities) and **the browser support tables MDN publishes** (raw.githubusercontent.com). Everything else comes from a search engine's summary of a page. Counts are **sources raising a theme**, not store reviews.

**Evidence strength:** **[S]** strong (a primary source, a peer-reviewed or randomized study, or several independent sources agree), **[M]** medium (one reputable source, or a vendor reporting its own data), **[W]** weak (a vendor blog with no method, an old survey, a single anecdote, a Reddit mirror).

## 1. Question

Which notifications bring people back every day without feeling like spam, what does that mean for 10 to 15 concrete LifeFlow pushes, what changed among competitors, and which round 2 claims hold up?

## 2. Short answer

People don't turn off notifications because there are many; they turn them off because the ones they get don't concern them. The evidence is consistent: generic reminders sent at scale did nothing for 800,000 students, while timely, personal ones that came with a next step cut summer melt by 21% at Georgia State and cut unplanned overdraft charges by 17 to 19% at UK banks. The apps that win daily opens learn per person what each person acts on, rotate so the message doesn't go stale, and back off when it's ignored (Duolingo, LinkedIn, Pinterest, Meta). The ones that annoy young people use guilt and streak pressure (42% of teens would remove Snapchat streaks), or send a daily summary even on days with nothing to say (ChatGPT retired its daily Pulse feed in June 2026). For LifeFlow this means: no fixed daily number, but every push carries a reason from the person's own data and a button that does the fix. One practical catch: on iPhone, pushes from a web app can't show buttons, so the best ideas below need the native app there.

## 3. Findings

### 3.1 The real-world examples at a glance

"Lesson" is my conclusion from the evidence, not something users said.

| Example | What it does | What works | What backfires | Lesson for LifeFlow |
|---|---|---|---|---|
| **Duolingo** | A daily practice reminder picked per person by a learning system | It learns which message works for each person and rotates so the message stays fresh: +0.5% daily users, +2% new-user retention [M, from a scraped copy of the KDD 2020 paper]. Learners on a 7-day streak are 2.4 times as likely to come back the next day (Duolingo's blog) [M] | Guilt: "You made Duo sad" style pushes; a student writer (student paper, exact page unclear in the search summary): "if they're busy and miss their usual study time, the app starts guilt-tripping them. It's annoying" [W]. When its reminders are ignored for a while (reports say about a week) it sends "These reminders don't seem to be working. We'll stop sending them for now" and stops [M]. 11-07: Duolingo has published no result for this message; one newsletter saw reminders return after about 3 days [W] | Learn per person, rotate wording, stop when ignored, and say so. Copy the back-off, never the guilt. |
| **Snapchat streaks** | A count of days in a row two friends have snapped | Gets daily opens | Of 300 teens aged 13 to 21: 25% paid to restore a broken streak, 51% would feel bad if the other person broke it, and **42% would choose to get rid of streaks** (Bits of Freedom, March 2026, via EDRi) [M] | Daily opens bought with pressure. No streak counters. |
| **BeReal** | One push a day at a random time | A shared moment at first | Daily users reportedly fell about 52%, from about 14.7 to 7.7 million (Digiday, year unclear) [W]; earlier falls in 2023 [M] | A daily push without a personal reason wears off. |
| **Apple Screen Time weekly report** | Every Sunday, a chart of your phone use | Some people set goals from it [W] | Arrives on Sunday "just as people are trying to unwind"; a listener learned to treat it "as meaningless and ignore it" (Marketplace) [W] | A weekly scorecard that judges you gets ignored. |
| **Apple Health highlights and trends** | Notices a change in your data and tells you | Only when something changed [M] | No usage data found | "A pattern changed" is a good trigger; a weekly score isn't. |
| **Copilot Money** | A Monday spending update (last week against the week before); alerts for fees, unusual spending, payday | Weekly, not per purchase; it says it does not push every new transaction (help centre) [M] | No complaints found | Few, specific money pushes. |
| **Monarch** | Weekly recap, large-transaction and budget alerts | | A user asks for "a mix of warnings AND encouragement/progress messages"; a partner got pushes for every paycheck and transfer (Reddit mirror) [W] | Good news counts too; shared money gets noisy. |
| **Rocket Money** | A low-balance alert set at $200 by default; Alerts, Tips and Updates switched on or off separately (help centre) [M]. Since August 2026, Rowan texts you when it finds a saving and acts after you reply [M] | A clear, single threshold | A flat threshold is weak (next row) | Tie money alerts to a named bill and date. Keep tips separate from alerts. |
| **Google Daily Brief** | A morning push every day, built from Gmail and Calendar; no way to pick the time | "Creepily useful" some days; caught a double-booked weekend and a possible double charge (PCMag) [M] | "Oddly empty" on later days, stale to-dos, resurfaced emails the reviewer had ignored on purpose [M] | A daily summary has to earn each day. Stay silent on empty days. |
| **Google Calendar "time to leave"** | Uses live traffic and the event's place | People "swear by" it [W] | Google confirmed departure and commute alerts were broken for many people [M] | Great when right; it depends on a maps connection. |
| **Uber, DoorDash Live Activities** | Live order or ride status on the lock screen | Pitched as fewer pushes: progress "without sending multiple notifications about each step" (9to5Mac) [M] | No usage numbers found | For something unfolding over hours, show it live instead of sending more pushes. |
| **Bank alerts** | Texts when the balance is low or an overdraft happens | Automatic enrolment in alerts cut unarranged overdraft and unpaid-item charges by **17 to 19%** across the six largest UK banks (Grubb and others, Journal of Finance, 2025) [S] | The UK regulator's own field test found low-balance alerts alone gave "weak" evidence of help [M] | Warn about a specific charge before it happens, not a number crossing a line. |
| **Canvas** (the cautionary tale) | Pushes for grades, due dates, announcements, comments | Grade pushes are loved (round 1) | Duplicates, missing alerts, settings that override each other (round 1, 6 of 9 sources) [M]; turning off due-date texts turns them off for every class [M]; grades posted late at night "keep students glued to their phones" (Canvas idea board) [W]; a student paper: a notification "that can make or break their day" [W] | Never repeat what Canvas already sends. Only push when the due date collides with something. |

### 3.2 What the research says, topic by topic

Sources for this section: 42 pages (section 7, under "Read directly", "Live Activities, widgets, platforms", "Volume, timing, personalisation, opt-in, fatigue", "Students and nudges", and the three bank-alert studies). Many numbers come from vendors measuring their own customers, so read those as direction, not fact.

**Opt-outs and how many is too many (6 sources).**
- Old consumer surveys say one push a week makes about 10% disable notifications and 6% uninstall; 2 to 5 a week makes far more disable them (Business of Apps and others) [W, old, method unknown]. Younger people tolerate more: at one push a week, 7% of 18 to 29 year olds disable notifications against 20% of 45 to 60 year olds [W].
- Meta kept a group of Facebook users on fewer notifications for many months (one summary says a year). Visits dropped at first, then that group came back more and liked the app more ("Notifications: why less is more", Analytics at Meta) [M].
- Pinterest cut pushes to people who weren't engaging "without affecting the overall push open rates or any other key metrics", and treats a push that gets a click today but an unsubscribe tomorrow as a loss (Pinterest Engineering) [M].
- LinkedIn learns a daily cap for each member instead of one cap for everyone, and reported gains across several engagement measures in live tests (arXiv 1901.10550) [M].
- **My conclusion:** there is no right number per day. The right number is per person and per kind, and the measure that matters is weeks later, not the next click. This supports "Decided from research" 5 (send more of what each person acts on, less of what they ignore).

**Opt-in (3 sources).** Median opt-in in 2025 was about 49% on iOS and 53% on Android, where Android has fallen since Android 13 started asking permission like iPhone (Airship's 2026 benchmark, as reported by Admiral) [M]. Vendors say asking right after the app has shown its value beats asking on first launch, but their figures (2 to 3 times, 36%) have no published method [W]. **For LifeFlow:** about half of students will say no if asked cold. Ask at the first moment Dev has found something real.

**Timing (4 sources).** Notifications held until a natural break (finishing a task, putting the phone down) caused 46% less mental load in a lab and 33% less in the wild for people sensitive to interruptions, and were answered 13% faster (Okoshi and others, Attelia) [M]. Choosing each person's best send time lifts email opens by a few percent to about 10% in controlled tests [W, email, vendors]. Google's Daily Brief has no time setting at all [M]. **For LifeFlow:** send each kind at the moment it can be acted on (Sunday evening for the week, after class for a due tomorrow), learned from the person's routine.

**Personal versus generic (4 sources, 2 strong).**
- **Nudging at scale:** national and state campaigns that texted and emailed over 800,000 students about financial aid had **no effect** on aid or enrolment, whatever the framing, timing or channel (Bird and others, 2021) [S]. A separate text campaign to about 70,000 students across fifteen states had no effect on aid applications (J-PAL) [S].
- **Personal and timely:** Georgia State's chatbot sent admitted students reminders tied to their own missing steps and answered their questions. Summer melt fell 21.4% and enrolment rose 3.3 to 3.9% in a randomized trial of 7,489 students [M, vendor-linked reports of the trial]. Course-specific chatbot messages raised the share of B grades or better by 4 points [W].
- Duolingo's system must rotate messages, because one message per person "will get repetitive, desensitize users, and fail to improve engagement in the long run" [M].
- **My conclusion:** the difference is not the channel. It is whether the message is about this person's own next step, right now. That is exactly what LifeFlow's connected data allows and what a generic planner can't do.

**Actionable versus informational (2 sources, 1 primary).** Apple: "Avoid sending a notification that tells people to perform specific tasks within your app" unless you add notification actions; up to four buttons; "Avoid providing an action that merely opens your app"; "Prefer nondestructive actions" (Apple design guidelines, read directly) [S]. I found no clean study isolating the effect of buttons [W]. **For LifeFlow:** every "want me to fix it?" push needs the fix as a button, and Undo should always be one tap away.

**Rich and interactive (3 sources).** Pushes with a picture had a 56% higher direct open rate in Airship's 2016 study of about 5 million messages [W, old, vendor]. **On iPhone, a web app's notifications show no buttons and no picture:** MDN's support table lists Safari, including iPhone, as not supporting notification `actions` or `image`, while Chrome on Android supports both (read directly) [S]. An Apple forum user on iOS 16.4 saw only "View" [W]. Web push on iPhone also only works after the person adds LifeFlow to the home screen [S].

**Live Activities and widgets (5 sources).** Apple: Live Activities are for activities that "don't exceed eight hours", must not show ads, should update "only when new content is available", and apps should not "use push notifications alongside Live Activities for the same updates" (read directly) [S]. Apps using Live Activities have 23.7% higher 30-day retention (OneSignal's own report, a comparison, not a test) [W]. Android 16 added a matching "Live Updates" style for rides, deliveries and navigation [M]. For widgets I found no study of retention at all [W]. **For LifeFlow:** a shift day or exam day is an eight-hour activity. That is a Live Activity, not five pushes.

**Fatigue (5 sources).**
- Half of 11 to 17 year olds get **237 or more notifications a day**, about a quarter during school hours (Common Sense Media, "Constant Companion") [M].
- Adults in a small 2014 study handled 63.5 a day [M, 15 people]. A day with no notifications made people more productive but more worried about missing something important (Pielot and Rello) [M].
- A notification breaks concentration for about seven seconds, and the number received predicts distraction better than total screen time (Fournier and others, Computers in Human Behavior, 2026, via PsyPost) [M].
- In a 14-week study of 81 first-year students, ignoring incoming messages on purpose went with better academic performance (Kim and others, 2021) [M].
- On ADHD forums, the same reminder sound gets tuned out: "I either snooze them or ignore them… and then forget anyway" (Reddit mirror) [W].
- **My conclusion:** students already filter hundreds of pushes a day. LifeFlow is not competing with silence. It is competing with Snapchat and Discord for the one glance, so each push has to be worth more than the seven seconds it costs.

**Apple's rules that affect every LifeFlow push (read directly) [S].**
- "Time Sensitive" (breaks through Focus and the scheduled summary) only for something "happening now or will happen within an hour". The phone asks the person whether they agree, the first time and then periodically.
- "Avoid sending multiple notifications for the same thing, even if someone hasn't responded."
- "Avoid including sensitive, personal, or confidential information in a notification."
- No marketing pushes without a separate opt-in, and never as Time Sensitive.
- iPhone users can have non-urgent pushes held for a summary at times they choose, and Apple Intelligence can move pushes it judges important to the top (iOS 18.4 and later, opt-in) [M]. LifeFlow's line has to make sense when read hours later.

### 3.3 What students say (12 sources)

The 12: two student papers on Duolingo, two on Canvas grades, a Canvas idea post, a student's Canvas forum question, a Reddit reminder thread, the VCU survey, the Bits of Freedom survey, an Egyptian teen study, Common Sense Media and the Kim study. Each counts once.

| Theme | Sources (of 12) |
|---|---|
| Too many, or the same thing again | 3 |
| Guilt-trip reminders are annoying (Duolingo) | 2 |
| Streaks feel like pressure | 2 |
| Reminders get tuned out, or the app goes unused | 2 |
| Stressful news at night (grades) | 2 |
| Ignoring messages goes with better grades | 1 |

- "allowing notifications" is "signing their life away to the owl" (a student paper satire) [W].
- A student who turned off due-date texts for one class kept getting them; Canvas staff explained the switch covers every class (Canvas forum) [M].
- In a peer-reviewed study of Egyptian teens, 35.4% called streaks very important, and some put streaks before sleep or study [M].
- What worked for one person on a reminder forum: a whiteboard plus phone alarms, "visible without opening anything" (Reddit mirror) [W].
- Canvas sends alerts that keep students "constantly checking the app and awaiting a notification that can make or break their day" (Wootton student paper) [W].
- "having to anticipate the grades coming out on phones just adds to the anxiety" (Cypress Online, student opinion) [W].
- On reminder apps: "phone reminders only work when there is a second step that does not rely on me opening the app again" (Reddit mirror) [W]. This is the strongest argument for buttons that act without opening the app.
- Most campus apps aren't used: 66% of 1,667 VCU students either don't have the university app or rarely use it (VCU 2024) [M].
- **My conclusion:** students want fewer things to check, not more. A push that does something for them (moved, held, covered) is different from one that asks them to do something.

### 3.4 Our own app against this (read in the code, 2026-11-06)

Facts about the repository, not about users.

1. **Pushes have no buttons.** The push message is a title, a body, a link and a tag (`PushMessage` in `src/server/services/push.ts`); the service worker shows only those (`public/sw.js`). And on iPhone a web app couldn't show buttons anyway (3.2).
2. **I found no record of a push being tapped or swiped away.** The service worker opens the link and stops; it has no `notificationclose` handler. "Decided from research" 5 asks for "opened, acted on, ignored or dismissed, per kind".
3. **The cap is still 3 pushes in 24 hours**, for messages of priority 75 or more; the reviews (morning brief, evening wrap-up, weekly, monthly) are outside it (`pushLimit: j.pushLimit ?? 3`, `REVIEW_KINDS` in `engine.ts`). The owner reversed "one a day"; nothing yet replaces the flat cap with "more of what this person acts on".
4. **A daily ask to log.** The goal check-in says "How did today go for your goals? … Tell me what you did and I'll save it." (`goal_checkin` in `src/lib/jarvis-voice.ts` and `detectors.ts`, priority 55, so it shows in Updates but isn't pushed). This breaks the owner's "they're not telling us to log stuff". The "Sort them out" message for uncategorised transactions ("Want to go through them together? It takes a minute.") is also upkeep.
5. **Already right:** quiet hours default to 22:00 to 07:00; push text is "what was noticed and why plus the next step" (`pushText`); streak messages only celebrate; the shift clash and the bill-short messages already offer the fix.

### 3.5 Competitor moves since this morning's report

I found **nothing dated November 5 or 6**. Searches for ChatGPT, Gemini, Meta Muse, Monarch, Copilot, Rocket Money and student planners returned older items. These are new to our reports and matter for notifications:

- **Rocket Money's Rowan** (August 25, 2026): an assistant that texts you when it finds a saving and acts after you reply, built with Anthropic, in a new Premium+ tier reported at $15 a month [M]. It is the "fix waiting for your yes" pattern, over plain text messages. It also cancels and moves money, which LifeFlow never does.
- **ChatGPT retired Pulse**, its proactive daily feed, after June 17, 2026, and replaced it with Scheduled Tasks the person sets up (one report: up to three for free accounts) [M]. A daily "here's what I think you'd like" feed from the biggest assistant didn't last.
- **GPT-6 with "Intelligent UI"** (answers with buttons, charts and small tools) reached every ChatGPT tier on October 7 and 8, 2026 [M].
- **ChatGPT Finances** added accounts typed in by hand on October 2, 2026 [M]. Like LifeFlow's decision 8.
- **Meta Muse** reached 2.5 million US daily users on October 16 (Sensor Tower) [M].
- **Canvas** (deploy of April 22, 2026): school admins can now suppress whole notification categories [W].
- **IntelliPlan**, a free AI study planner that imports Canvas, StudentVue and Schoology assignments, is on Product Hunt (launch date unclear) [W].

### 3.6 Audit of round 2

A sample of 14 claims from `2026-11-05-students-and-competitors.md`, re-checked today: **11 confirmed** (4 of them with a detail I couldn't re-confirm), **2 corrected**, **1 unverifiable**.

| # | Round 2 said | Verdict | What I found |
|---|---|---|---|
| 1 | ChatGPT Finances reached Free and Go in the US in early October 2026 | **Confirmed** | OpenAI's page: "October 2, 2026: Finances in ChatGPT is now rolling out to Free and Go users in the U.S.", the same day as accounts added by hand [M] |
| 2 | Gemini Daily Brief free in the US since September; not for school accounts | **Confirmed** | Google's help page: "not available with a work, school or supervised Google Account"; also 18 or over and in the US [S] |
| 3 | Todoist Pro rose Dec 10, 2025: monthly $5 to $7, yearly $48 to $60 | **Confirmed**, plus | App Store subscribers keep their old price on a "Pro Legacy plan" (Todoist help) [S]. "First rise since 2017" appears only on a tracker: unverifiable |
| 4 | Monarch Plus announced at $299 a year, cut to $199 within days | **Confirmed** (launched April 21, cut April 24, refunds for those charged more) [M] | The first-year price for existing members conflicts ($149 or $199), so "$100 off the first year" is unverifiable |
| 5 | Cleo: $17M FTC settlement; $15.8M to 2,124,796 customers, PayPal from Oct 27 | **Confirmed** | Announced October 8, 2026; settled without a court finding of wrongdoing [S] |
| 6 | "58% of students would have trouble finding $500" (Trellis 2025, over 65,000 students) | **Corrected** | 58% appears in one college's 2025 Trellis results (Lee College). The national figure I found is "more than half": 56% in fall 2024, 57% in fall 2022 [M]. Say "more than half". |
| 7 | Lumina-Gallup 2026: 33% considered stopping out; top reasons stress 46%, mental health 38%, cost 28% | **Confirmed in part** | 33% and "emotional stress and mental health are still the leading reasons" are in the 2026 report [S]. The 46/38/28 split was not re-found: unverifiable |
| 8 | Child Trends 2024: 58% of parenting students work 30+ hours; 40% have full childcare | **Unverifiable** | Not found this round |
| 9 | Shift Project: about two-thirds get schedules less than two weeks ahead, one in three less than a week | **Corrected** (source) | The Shift Project figure found is 64% with under two weeks' notice (fall 2021, via the Aspen Institute). "About two-thirds… about one third less than one week" is the National Women's Law Center's wording [M]. Same direction; credit it correctly |
| 10 | Meta Muse: 10 million US downloads in 40 days (Sensor Tower) | **Confirmed** | 10.2 million US, 10.9 million worldwide, September 8 to October 17; published October 20 [M] |
| 11 | 56.1% of Philippine working students sleep five hours or less; 58.1% feel overwhelmed | **Confirmed** | MMDC's State of the Working Student 2026, 155 respondents, February 18 to March 17, 2026 [M] |
| 12 | Tiimo was Apple's iPhone App of the Year 2025 | **Confirmed** | Announced December 2025; Apple called it an "impressive visual planner" [S] |
| 13 | Shovel: $9.79 a month or $35 a year; 4.0 stars from 181 reviews | **Confirmed**, with caveats | The price comes only from a competitor's blog (DormWay). US rating 4.0 from 182; another tracker shows 3.81 from 222 [W] |
| 14 | Our code allows 3 pushes a day (`pushLimit ?? 3`) | **Confirmed**, still in the code | Now that the owner has reversed "one a day", this is the live cap (3.4, item 3) |

**What this changes in round 2:** nothing in its proposals. Section 3.4's money line should read "more than half of students would struggle with a $500 emergency", and section 3.4's deadlines line should credit 64% to the Shift Project and the two-thirds and one-third split to the National Women's Law Center.

## 4. Proposals, ranked

Tags: `fix now`, `build now`, `needs the new surface`, `owner decision`. Notification ideas are real changes, so each one is `build now` (it follows something the owner already decided) or `owner decision`.

**How to read the wording.** The title is the name the person gave their assistant, or "Your assistant". The line is the body. "Dev" below stands for that name. **Data:** **have** = we already connect it (bank through Plaid, Canvas, Google and Outlook calendars, Gmail and Outlook email, Apple Health daily totals including sleep, shifts from a photo, an email or a sentence, and facts told once). **new** = needs a new connection or the native app.

**Buttons on iPhone** need the native app (3.2). Until then the iPhone shows the line, and tapping opens the card with the same buttons. Android and desktop Chrome can show them now.

### 4.0 The proposals at a glance (problem, source, value, effort, risk)

"Source" points to the finding that backs it. Effort is small, medium or large. Risk is what could go wrong for the person or for us.

| # | Problem it solves | Source | Value | Effort | Risk | Tag |
|---|---|---|---|---|---|---|
| 1 | A change happened and the student must find it | 3.2 actionable; 3.3 "second step" quote | Something done for them | small | Acting outside allowed autonomy | `build now` |
| 2 | A named bill would overdraw | Journal of Finance 2025 [S]; UK regulator [M] | Avoids a fee, protects trust | medium | Money worry; wrong forecast | `build now` |
| 3 | A real clash today | 3.1 Daily Brief and Pulse | Morning push that means something | medium | Becoming a daily summary | `build now` |
| 4 | Good news has no moment | 3.1 Monarch; vision "Decided" 1 | Pay day opens | small | Amount on lock screen | `build now` |
| 5 | A new schedule changes the week | Round 2 (schedules arrive late) | Schedule day becomes our day | small | Three pushes for one change | `build now` |
| 6 | A week that cannot fit | Round 2; vision decision 6 | Early warning with a plan | large | Weekly alarm | `build now` |
| 7 | Closing shift then early class | Round 2 (sleep) | Sleep protected by a move | small | Sounding like a parent | `build now` |
| 8 | Due date Canvas can't judge | 3.1 Canvas | The one due-date push Canvas can't send | small | Becoming Canvas | `build now` |
| 9 | Aid or stipend is late | Round 2 | Real options days early | medium | Anxiety | `build now` |
| 10 | No proof the app helps | Vision "Decided" 2 | Reason to stay in week five | medium | A guessed number | `build now` |
| 11 | Off track for a goal | Owner rule 2026-11-05 | Plain truth with a way back | small | Guilt wording | `build now` |
| 12 | Trial or price rise unnoticed | Rocket Money model | Money saved in one tap | small | Low | `build now` |
| 13 | A kind of push is ignored | Duolingo, Pinterest, LinkedIn | Fewer opt-outs | small | Sounding hurt | `build now` |
| 14 | Leaving late | Google Calendar | Most loved assistant push | medium | Tracking feel; Google's version broke | `owner decision` |
| 15 | The day is a tight sequence | Apple Live Activities guide [S] | Day visible without opening | large | Native app needed | `needs the new surface` |
| R1 | Pushes sent without a reason | Apple guide [S]; 3.2 | One check for every push | small | Low | `build now` |
| R2 | Daily ask to log in the code | 3.4 item 4; owner rule | Matches owner's rule | small | Low | `fix now` |
| R3 | No record of taps | 3.4 item 2 | Base for every number | small | Privacy: keep per person | `build now` |
| R4 | Flat cap of 3 a day | LinkedIn, Pinterest, Meta | Right amount per person | medium | A bug floods someone | `owner decision` |
| R5 | Cold permission ask | Airship via Admiral [M] | More students allow pushes | small | Low | `build now` |
| R6 | Money on the lock screen | Apple guide [S] | Privacy | small | Low | `owner decision` |
| R7 | No buttons on iPhone web push | MDN table [S] | Buttons work | medium to large | Cost | `owner decision` |

### 4.1 Fifteen notification ideas

| # | Idea | Fires when | Data | Size | Tag |
|---|---|---|---|---|---|
| 1 | I fixed this, Undo | Dev moved something inside the allowed autonomy | have | small | `build now` |
| 2 | Short before a bill | 2 to 3 days before a bill or renewal would overdraw | have | medium | `build now` |
| 3 | Today has a clash | On mornings with a real collision only | have | medium | `build now` |
| 4 | Pay landed, here's what it covers | Minutes after a paycheck lands | have | small | `build now` |
| 5 | Your schedule is in | New shifts arrive and differ from usual days or hit exams | have (usual days: asked once) | small | `build now` |
| 6 | The week that won't fit | 5+ days before a week goes into the red | have | large | `build now` |
| 7 | Rest heads-up | A closing shift is followed by an early class or exam | have | small | `build now` |
| 8 | Due tomorrow, no time planned | Day before a due date with no free stretch held | have | small | `build now` |
| 9 | Money on its way is late | Expected refund or stipend hasn't landed and a bill is due first | have (expected date: told once) | medium | `build now` |
| 10 | It worked (check back) | 7 days after a fix, with a real number | have | medium | `build now` |
| 11 | Off track for a goal, with the way back | A goal's path crosses off track | have | small | `build now` |
| 12 | Trial ending or price up | 2 days before a trial bills; the first charge at a new price | have | small | `build now` |
| 13 | I'll send fewer of these | A kind is ignored several times in a row | have | small | `build now` |
| 14 | Time to leave | Traffic moves the leave time for a shift or exam | **new**: maps and traffic, plus a start place told once | medium | `owner decision` |
| 15 | Today on the lock screen | A shift or exam day with a tight sequence | **new**: the native app (Live Activity) | large | `needs the new surface` + `owner decision` |

**Why these 15 (the findings behind them):** each one is about the person's own next step, from their own data (3.2, personal versus generic), carries the fix as a button (3.2, actionable), and stays silent when there's nothing to say (3.1, Daily Brief and Pulse). Sizes assume the checks in "Decided from research" and section 15 get built anyway; ideas 6, 7 and 9 are the push side of the student week check and money on its way.

**What they would prove, measured the same way for every kind:** the act-on rate (a button pressed or the fix kept), the opt-out rate after that kind starts, and whether students who get it open the app on more days in week four than students who don't. A kind that people act on less than, say, one time in five gets slowed by idea 13 and reviewed.

**1. I fixed this, Undo** · `build now` · data: have
- **When and trigger:** right after Dev changes a study block or to-do because something moved: a shift landed (photo or email), Canvas changed a due date, or a calendar event moved over a block.
- **Wording:** "Your schedule's in. Thursday's shift is the night before Bio, so I moved your Bio review to Wednesday 10 to 12."
- **Buttons:** Keep · Undo · Other time
- **Why a student comes back:** something was done for them. This is the owner's own example in vision section 4, and it answers the student who said reminders only work with "a second step that does not rely on me opening the app".
- **Spam risk and guard:** low, if it's real help. One push per trigger, with several changes merged into one line. Never outside the autonomy the person allowed (calendar and to-dos only).

**2. Short before a bill** · `build now` · data: have
- **When and trigger:** 2 to 3 days before a bill or subscription renewal would push checking below zero, counting usual spending until then and leaving out expected pay. Sent at the person's usual quiet time of day, never at night.
- **Wording:** "Your Claude renewal is Thursday ($20). With gas and lunches, checking will be about $12 by then. Want two ways to cover it?"
- **Wording note (11-07):** mention a payday only when it is a salaried paycheck of a known amount or a date the person told us. Hourly pay is never predicted, so for hourly students the line stops at the shortfall.
- **Buttons:** Show 2 ways · Remind me Thursday · I've got it
- **Why a student comes back:** this is the owner's own notification (vision, "Notifications that understand the situation"). Automatic bank alerts cut unplanned overdraft charges by 17 to 19% [S], and this one names the bill and the day, where a flat low-balance alert gave weak evidence [M].
- **Spam risk and guard:** money worry. Only when a named charge is really at risk, once per bill. Never suggest a cash advance. With the Money lock on, the lock screen shows "Money heads-up for this week" with no amounts (4.2, rule 6). Time Sensitive only on the due day itself.

**3. Today has a clash** · `build now` · data: have
- **When and trigger:** at the person's usual start of day (learned from the first event or sleep end in Apple Health), **only on days with a real collision**: a shift that starts before a class ends, two fixed things at once, an online quiz window closing during a shift.
- **Wording:** "Today has one clash: Chem lab ends at 4:15 and your shift starts at 4. Want a short note to ask your manager for 4:30?"
- **Buttons:** Copy note · It's fine · Why this?
- **Why a student comes back:** it is the morning push with a reason, and the person learns that a morning push from Dev means something is really off.
- **Spam risk and guard:** the Gemini "oddly empty" trap. **No push on days without a clash**, and no "all clear" message. "It's fine" teaches Dev that this pairing isn't a clash for this person (seed 3). Dev never sends the note; the person does.

**4. Pay landed, here's what it covers** · `build now` · data: have
- **When and trigger:** when a paycheck shows up in the bank, held until quiet hours end.
- **Wording:** "Your paycheck landed: $432, inside the range I expected. Rent and your phone bill are covered until the 15th."
- **Buttons:** Plan $50 for Cairo · Thanks
- **Why a student comes back:** good news with a meaning, on the day they'd check anyway. It is the measure of "Decided from research" 1 (opening the app within a day of a paycheck), and Monarch users ask for "encouragement" as well as warnings.
- **Spam risk and guard:** amounts on the lock screen. With the Money lock on: "Your paycheck landed. Tap to see what it covers." "Plan $50" only marks it in the plan; it never moves money.

**5. Your schedule is in** · `build now` · data: have, plus usual work days asked once (owner's decision 7)
- **When and trigger:** new shifts land and either differ from the person's usual work days or touch an exam, a class or the sleep window. Silent when the schedule matches the usual pattern and nothing collides.
- **Wording:** "Your new schedule has a Wednesday shift, your usual day off, and Bio midterm is Thursday at 9. I kept Wednesday morning for review."
- **Buttons:** Looks good · Undo · Swap note
- **Why a student comes back:** schedule day is when working students already check their phones. LifeFlow becomes where they see what it means.
- **Spam risk and guard:** low. Merged with idea 1 when Dev also moved something: one push, never three (seed 1).

**6. The week that won't fit** · `build now` · data: have (the student week check, decision 6)
- **When and trigger:** Sunday evening, or five or more days ahead, when the hidden work (study per exam at this person's pace, assignments) is more than the free time left after classes, shifts, sleep and family.
- **Wording:** "Next week needs about 14 hours of study and you have 9 free outside work and sleep. I have a plan that starts Saturday morning and keeps Friday night free."
- **Buttons:** Use the plan · Show me · Not this week
- **Why a student comes back:** an early warning with the plan already made. Shovel shows students pay for "is this week possible"; no one includes shifts and sleep.
- **Spam risk and guard:** a weekly alarm. Only when a week is really in the red, once per stretch, never a score. This replaces today's Sunday "week ahead" on weeks without a problem: silent, or one line if the person chose it.

**7. Rest heads-up** · `build now` · data: have
- **When and trigger:** when a closing shift lands less than about nine hours before an early class or exam. Sent once, when the shift appears.
- **Wording:** "You close Thursday at 11 PM and Bio is at 8 AM. Want me to move your review to Wednesday so Thursday night is just sleep?"
- **Buttons:** Move review · Swap note · I'm fine
- **Why a student comes back:** sleep is what students cut first (round 2, 7 sources), and nobody else notices this collision.
- **Spam risk and guard:** sounding like a parent. One push per shift, said as a fact, never "sleep more", never "sleep less", never about health.

**8. Due tomorrow, no time planned** · `build now` · data: have
- **When and trigger:** the afternoon before a Canvas due date, if no block is held for it and the only free stretch is short or before a shift. **Never** for an assignment that has time planned, is marked done, or has no collision. That is Canvas's job, and Canvas already sends it.
- **Wording:** "Econ problem set is due tomorrow at 11:59 PM, and your only free stretch is 6 to 8 tonight before your shift. Want me to hold it?"
- **Buttons:** Hold 6 to 8 · Already done · Later
- **Why a student comes back:** it is the one due-date push that Canvas can't send, because Canvas doesn't know about the shift.
- **Spam risk and guard:** becoming Canvas. At most once per assignment, and only with a collision. "Already done" teaches Dev.

**9. Money on its way is late** · `build now` · data: have (Plaid), plus the expected date told once (decision 6)
- **When and trigger:** the expected date for an aid refund, a stipend or an allowance passes without the deposit, and a bill is due before it's likely to land.
- **Wording:** "Your aid refund hasn't landed yet and rent is due Monday. Your aid office has a short-term loan. Want the link and a note for your landlord?"
- **Buttons:** Show options · Tell me when it lands
- **Why a student comes back:** this is the gap that hurts most, and it is said a few days early, with real options.
- **Spam risk and guard:** anxiety. Once, only when a bill is really at risk. Real options only (the aid office, the landlord); never a cash advance. When the money lands: one line, "Your refund landed. Rent is covered", then stop.

**10. It worked (check back)** · `build now` · data: have (decision 2)
- **When and trigger:** seven days after a fix the person accepted, only if the data shows a real number.
- **Wording:** "Sunday meal prep worked: $38 less on food this week than your usual, from your bank."
- **Buttons:** Again this Sunday · Stop these
- **Why a student comes back:** proof the app helps. The vision calls this the moment someone decides the app is worth paying for.
- **Spam risk and guard:** low. Silent when the number isn't there, never a guess.

**11. Off track for a goal, with the way back** · `build now` · data: have (decision 9)
- **When and trigger:** when the path to a goal the person set (a trip fund, a savings amount, study blocks before an exam) crosses from on track to off track. Silent while on track, apart from a rare "on track, nothing to change".
- **Wording:** "Cairo trip fund is $60 behind where it needs to be for March. Setting aside $15 a week from Friday's pay gets you back on track."
- **Buttons:** Plan $15 a week · Change the goal · Not now
- **Why a student comes back:** the owner asked for plain words when someone is off track, and the way back makes it useful, not a scolding.
- **Spam risk and guard:** guilt. No "slipping", "missed" or "failed". Once per crossing, not weekly while it stays behind. It replaces the daily "Tell me what you did" check-in (4.2, rule 2).

**12. Trial ending or price up** · `build now` · data: have (the detectors already exist)
- **When and trigger:** two days before a free trial turns into a charge; the first charge at a new price.
- **Wording:** "Your Paramount+ trial becomes $7.99 on Friday. Want the steps to cancel?" or "Spotify went up $2, to $12.99, from this month's charge."
- **Buttons:** Cancel steps · Keep it
- **Why a student comes back:** money saved in one tap. Rocket Money built a business on finding these.
- **Spam risk and guard:** low. Once per trial or price change. Dev never cancels; it shows the steps.

**13. I'll send fewer of these** · `build now` · data: have (decision 5: less of what's ignored)
- **When and trigger:** after a kind of push has been ignored or dismissed several times in a row (start with 3 and tune it in the test).
- **Wording:** "My morning clash notes haven't been useful lately, so I'll only send one when something needs to change. You can turn them back up anytime."
- **Buttons:** That's right · Keep sending them
- **Why a student comes back:** it shows Dev listens. Duolingo's "These reminders don't seem to be working" is called its most effective push by a design blog, but that is opinion, not published data (11-07 re-check) [W]; Pinterest found that unsubscribes cost more than clicks gain [M].
- **Spam risk and guard:** sounding hurt. Plain and neutral, no "you ignored". Never for Time Sensitive kinds (bills today, a shift within the hour).

**14. Time to leave** · `owner decision` · data: **new** (a maps and traffic service, plus a start place told once: "home" or "campus", never tracked location)
- **When and trigger:** before a shift or an in-person exam, only when traffic moves the leave time by 10 minutes or more against the usual.
- **Wording:** "Leave by 3:35 for your 4:00 shift. Traffic adds 10 minutes today."
- **Buttons:** Got it · Running late note
- **Why a student comes back:** it is the most loved assistant push there is, and it is rarely wrong in a way that hurts.
- **Spam risk and guard:** Google's own version broke for many people [M]. Only for shifts and exams, only when the time changes. Time Sensitive is allowed here (within the hour). **The decision:** whether a maps connection fits "real life enters lightly, never by surveillance". My recommendation: yes, with a start place told once and no tracking.

**15. Today on the lock screen** · `needs the new surface`, `owner decision` · data: **new** (the native app; Live Activities on iPhone, Live Updates on Android)
- **When and trigger:** on a day with a tight sequence, such as class, then a shift, then an online quiz window closing at midnight. It starts when the first item starts and ends within eight hours (Apple's limit).
- **What it shows:** "Shift until 10 · Quiz closes 11:59 · 1 hour 45 free after work", updated only when something changes.
- **Buttons:** Undo the last change (if Dev moved something)
- **Why a student comes back:** the day is "visible without opening anything", which is what worked for the person on the reminder forum (3.3). Uber and DoorDash use it to replace step-by-step pushes.
- **Spam risk and guard:** Apple forbids sending the same updates as pushes as well; when it is running, ideas 3 and 7 for that day go silent. No ads, nothing private. **The decision:** when to build the native app (`docs/native-app-plan.md`); it also unlocks buttons on iPhone and the planned widgets.

### 4.2 Rules that make the ideas work

**1. One "every push" check before anything is sent** · `build now` · small
- **Why:** 3.2 (personal and actionable works; generic does nothing) and Apple's rules.
- **Done means:** a push goes out only if it names what Dev noticed in this person's data, says why it matters now, and offers a next step or says what Dev already did. One push per trigger; several triggers at the same moment merge into one line. No guilt words, no asking to log. Each kind has an Apple urgency level: Time Sensitive only for within the hour (a bill today that would overdraw, a shift or exam within the hour, time to leave); the rest are ordinary, and "just so you know" kinds are passive (no sound, the screen stays dark).
- **Test:** a test per kind for wording (no em dashes, no banned words, a reason present), and a stay-quiet case per kind.
- **Measure:** act-on rate per kind.

**2. Retire the daily goal check-in and the "sort them out" ask** · `fix now` · small
- **Why:** 3.4, item 4. "Tell me what you did and I'll save it" is a daily ask to log; the owner said pushes never ask that.
- **Done means:** the goal check-in is replaced by idea 11 (off track with the way back, from data). Uncategorised transactions get Dev's best guess with Undo in the app, never a push and never "go through them together".
- **Test:** the detector tests, and a test that no push or Updates message asks the person to report, log or categorise.

**3. Record what people do with each push** · `build now` · small
- **Why:** 3.4, item 2. "Decided from research" 5 needs it, and so do ideas 13 and 4.2, rule 4.
- **Done means:** for each push: delivered, tapped, button pressed (which one), swiped away, or no response within a day. Kept per kind, per person. Shown nowhere except "why did I get this".
- **Measure:** the base for every number in this report's tests.

**4. Replace the flat cap with a learned budget per kind** · `owner decision` · medium
- **Why:** 3.2. Per-person budgets beat global caps (LinkedIn), cutting pushes for people who don't act on them lost nothing (Pinterest), and fewer pushes won over a year (Meta). The owner reversed "one a day", but the code still caps at 3 (3.4, item 3).
- **Options:**
  - (a) No fixed number; each kind earns its rate from this person's act-on rate, with idea 13 as the brake.
  - (b) The same, plus a high safety ceiling (for example 6 a day, not counting Time Sensitive ones) so a bug can never flood someone.
- **My recommendation:** (b). The ceiling should almost never be reached; if it is, that's a bug to fix.
- **Measure:** opt-out rate and daily opens over four weeks, not the next day (Meta's lesson).

**5. Ask for notifications at the first real find** · `build now` · small
- **Why:** 3.2, opt-in. About half of iPhone users say no when asked cold.
- **Done means:** onboarding doesn't ask on the first screen. It asks the first time Dev finds something real (the first clash, the first bill at risk, the first schedule read), showing that exact push as the example: "This is the kind of thing I'd tell you." On iPhone it also explains adding LifeFlow to the home screen, which web push needs.
- **Measure:** the share of students who allow notifications.

**6. Money on the lock screen** · `owner decision` · small
- **Why:** Apple says to keep sensitive information out of notifications; vision section 15, question 4 (the Money lock) is still open.
- **My recommendation:** when the Money lock is on, money pushes show no amounts or merchants on the lock screen ("Money heads-up for this week"); when it's off, amounts show. Every money idea above has its locked version.

**7. Buttons on iPhone mean the native app** · `owner decision` · medium to large
- **Why:** 3.2. iPhone web push has no buttons and no pictures. Ideas 1 to 12 work without them (tapping opens the card), but they work best with them.
- **The choice:** build the push part of `docs/native-app-plan.md` (step 3) before the 10-student test, or test with web push first and measure how many students are on iPhone.

## 5. Things to avoid

Each is written as a rule a test can check. The lead applies them (docs/team.md); I only list them.

1. **Guilt and pressure.** No mascot that's sad, no streak counters, no "you haven't". Duolingo's guilt pushes are mocked by students, and 42% of teens would remove Snapchat streaks if they could.
2. **A daily summary on days with nothing to say.** ChatGPT retired Pulse; Gemini's brief is "oddly empty" some days; BeReal's daily push wore off. Silence on empty days is part of the product.
3. **Flat low-balance alerts.** The UK regulator found weak evidence for them. Warn about a named charge on a named day.
4. **Repeating what another app already sends.** Canvas sends due dates; LifeFlow only pushes when a due date collides with something. Never two pushes for the same thing (Apple's rule, Canvas's duplicates).
5. **Calling something urgent when it isn't.** Time Sensitive only for within the hour. People are asked whether they agree, and can switch it off.
6. **A push that tells people to go do something in the app** without a button that does it (Apple's rule; the student who needs "a second step").
7. **Stressful news at night.** Money worries, grades and off-track notes wait for quiet hours to end. Canvas's late-night grade posts are a known stressor.
8. **Private details on the lock screen.** Amounts, merchants and health facts stay off it when the Money lock is on.
9. **A weekly scorecard.** Screen Time's Sunday chart gets ignored or resented. Report a change with a fix, never a score.
10. **Judging a kind by the next day's taps.** A push that gets a tap today and an opt-out tomorrow is a loss (Pinterest, Meta).
11. **Asking the person to log, check in or sort things.** The app runs on its connections (owner, 2026-11-05). Today's `goal_checkin` ("Tell me what you did and I'll save it") breaks this.
12. **A flat number of pushes per day for everyone.** Judge each kind by this person's act-on rate over weeks, not a global cap (LinkedIn, Pinterest, Meta). Keep only a high safety ceiling.
13. **Quoting a payday that isn't known.** A push never mentions pay that is hourly or unconfirmed (owner money rules).
14. **Asking for permission on the first screen.** About half say no when asked cold (Airship via Admiral). Ask at the first real find.
15. **Wording that blames.** A test bans "you ignored", "you missed", "slipping", "you haven't", "failed", plus em dashes, in every push line.

### Rules as a checklist (for the lead)

- No push without: what was noticed, why it matters now, and a fix or what was already done.
- No push on a day with nothing to say, and no "all clear".
- One push per trigger; same-moment triggers merge.
- Hold stressful kinds (money, off track) until quiet hours end.
- Money lock on: no amounts or merchants on the lock screen.
- Every kind has a stay-quiet test and a wording test.

## 6. Situation seeds

Paraphrased, one line each. 4 of 5 (80%) are students.

1. **Student who works Friday to Monday** (classes Tuesday and Thursday, Wednesday off): the new schedule adds a Wednesday shift the day before a Thursday 9 AM midterm. Dev sends one push: the shift, the clash, the review moved, Undo. Must not: send three separate pushes for the schedule, the clash and the fix.
2. **Community college student with the Money lock on:** the phone bill autopays in two days and checking will be $12 short; pay lands Friday. Dev sends "Money heads-up for this week" with no amount, and two ways to cover it inside the app. Must not: show the amount on the lock screen, push after 10 PM, or suggest a cash advance.
3. **Student whose campus help-desk job lets her study during quiet shifts:** she dismisses three morning clash notes in a row. Dev stops sending that kind for that pairing and says so once, plainly. Must not: keep sending, or say "you ignored".
4. **Stay quiet:** a student with an ordinary week (classes, the usual shifts, bills covered, nothing due without time planned). Dev sends nothing all day, and nothing on Sunday either. Must not: send an "all clear" or a filler summary.
5. **Hourly worker and parent, not a student:** the paycheck lands at 6 AM on Saturday, during quiet hours. Dev waits until quiet hours end, then sends one line with what it covers. Must not: wake them, or count next week's expected pay as available.

## 7. Sources

All 103 links read on 2026-11-06. Read directly: the Apple and MDN pages and our repository. Everything else through search result summaries (pages were blocked). **(C)** the publisher sells a competing product, **(V)** a vendor's own data, **(M)** a Reddit mirror.

**Read directly**
- https://developer.apple.com/design/human-interface-guidelines/notifications
- https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- https://developer.apple.com/design/human-interface-guidelines/live-activities
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Notification.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ServiceWorkerRegistration.json

**Duolingo**
- https://paperswithcode.com/paper/a-sleeping-recovering-bandit-algorithm-for
- https://research.duolingo.com/papers/yancey.kdd20.pdf (blocked; via search summary)
- https://blog.duolingo.com/improving-the-streak
- https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals
- https://gigazine.net/gsc_news/en/20240618-duolingo-app-streaks
- https://growth-dives.kit.com/posts/growth-dives-duolingo-s-6-step-reactivation-experience
- https://taplytics.com/blog/duolingo-sends-push-notifications-to-let-users-know-they-know-theyre-not-engaging-with-their-reminders
- https://debugger.medium.com/duolingo-needs-to-chill-8f1832745ca0
- https://cursor.tue.nl/en/opinion/alain-starke/guilt-tripped-by-an-owl
- https://thewolfpacket.org/8181/opinions/satire-duo-the-owl-wreaking-havoc-on-chs-one-reminder-at-a-time/

**Snapchat, BeReal, Screen Time, Apple Health**
- https://edri.org/our-work/new-study-reveals-how-young-people-are-influenced-by-gamification-features-on-snapchat/
- https://mjsm.journals.ekb.eg/article_422365.html
- https://www.pulse.bot/consumer-tech/blogs/new-study-reveals-how-young-people-are-influenced-by-gamification-features-on-snapchat-386b9eae-9eb9-4fb1-8d38-08092e9e2791
- https://digiday.com/marketing/bereal-still-has-potential-for-advertisers-but-its-hype-period-is-well-and-truly-over/
- https://petapixel.com/2023/02/22/bereal-may-be-on-the-out-users-have-nearly-halved-since-peak
- https://marketplace.org/shows/marketplace-tech/not-all-screen-time-is-created-equal-rerun
- https://www.myhealthyapple.com/how-to-use-health-trends-in-ios15
- https://health.apple.com/ios/health/pdf/Health_Privacy_White_Paper_May_2023.pdf

**Money apps and bank alerts**
- https://help.copilot.money/en/articles/10671399-notifications
- https://reddit.sentinel-team.org/subreddits/MonarchMoney/snapshots/2025-12-19T07%3A11%3A21.8753Z (M)
- https://help.rocketmoney.com/en/articles/8418019-how-to-customize-a-low-balance-alert
- https://help.rocketmoney.com/en/articles/934668-updating-your-notification-settings
- https://thepaypers.com/fintech/news/rocket-money-launches-rowan-ai-agent-for-personal-finance
- https://fintech.global/2026/09/03/rocket-money-launches-ai-agent-to-manage-finances/
- https://www.rocketmoney.com/learn/personal-finance/what-is-rowan
- https://ideas.repec.org/a/bla/jfinan/v80y2025i1p467-514.html
- https://researchonline.lse.ac.uk/id/eprint/126884
- https://www.fincap.org.uk/en/insights/time-to-act--a-field-experiment-on-overdraft-alerts (blocked; via search summary)

**Google, ChatGPT, Meta, Canvas and student planners**
- https://www.androidcentral.com/apps-software/geimin-daily-brief-how-to
- https://www.pcworld.com/article/3150841/googles-best-new-ai-feature-is-just-a-really-good-to-do-list.html
- https://support.google.com/gemini/answer/17077455?hl=en-IN
- https://9to5google.com/2026/09/08/gemini-daily-brief-free/
- https://piunikaweb.com/blog/google-confirms-departure-time-and-commute-notifications-broken
- https://www.getclockwise.com/blog/add-travel-time-google-calendar (C)
- https://www.digit.in/news/general/openai-is-retiring-chatgpt-pulse-and-replacing-it-with-scheduled-tasks-here-is-why.html
- https://alternativeto.net/news/2026/6/chatgpt-launches-new-scheduled-tasks-and-prepares-to-sunset-pulse/
- https://openai.com/index/personal-finance-chatgPT/
- https://help.openai.com/en/articles/20001222-finances-in-chatgpt
- https://www.androidheadlines.com/2026/10/openai-bringing-gpt-6-ai-models-chatgpt-everyone.html
- https://letsdatascience.com/news/openai-brings-gpt-6-and-intelligent-ui-to-chatgpt-4f0d797c
- https://9to5mac.com/2026/10/20/sensor-tower-metas-muse-app-tops-10-million-us-downloads-in-40-days/
- https://community.instructure.com/en/discussion/665785/canvas-deploy-notes-2026-04-22
- https://community.canvaslms.com/t5/Archived-Questions/ARCHIVED-turning-off-text-notifications/td-p/200237
- https://community.canvaslms.com/t5/Canvas-Ideas/Account-Settings-Delay-posting-of-grades-quot-after-hours-quot/idi-p/616674
- https://woottoncommonsense.com/11061/opinion/expanded-use-of-canvas-negatively-affecting-students-mental-health
- https://thecypressonline.com/61406/opinions/digital-grade-releases-escalate-academic-anxiety/
- https://www.producthunt.com/products/intelliplan
- https://dormway.app/blog/best-ai-study-planner-apps-2026 (C)

**Live Activities, widgets, platforms**
- https://9to5mac.com/2023/12/04/doordash-live-activities-and-dynamic-island-order-tracking/
- https://www.imore.com/ios/uber-and-uber-eats-finally-rolling-out-support-for-live-activities-on-iphone
- https://onesignal.com/live-activities (V)
- https://www.androidauthority.com/android-16-qpr1-live-updates-3573399
- https://www.imore.com/15-us-iphone-users-using-widgets-customize-ios-14
- https://developer.apple.com/forums/thread/726793
- https://documentation.onesignal.com/docs/web-push-for-ios (V)
- https://www.courier.com/blog/developer-guide-to-ios-26-priority-notifications
- https://support.apple.com/en-za/guide/iphone/iph1fbe7d2b9/ios

**Volume, timing, personalisation, opt-in, fatigue**
- https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/ (V)
- https://grabon.com/blog/push-notification-statistics/
- https://www.braze.com/resources/articles/opt-out-of-push-notifications-why-users-do-it (V)
- https://grow.urbanairship.com/rs/313-QPJ-195/images/WP_App_Retention_Rates_Benchmarks.pdf (V)
- https://medium.com/@AnalyticsAtMeta/notifications-why-less-is-more-how-facebook-has-been-increasing-both-user-satisfaction-and-app-9463f7325e7d
- https://medium.com/pinterest-engineering/user-state-based-notification-volume-optimization-7764118f73ff
- https://arxiv.org/pdf/1901.10550
- https://admiral.media/push-notification-strategy-mobile-apps/ (V, citing Airship 2026)
- https://batch.com/blog/case-studies/benchmark-notifications-push-crm-mobile (V)
- https://www.plotline.so/blog/how-to-improve-push-notification-opt-in-rates (V)
- https://julian-ramos.github.io/papers/Okoshi2015a.pdf
- https://help.klaviyo.com/hc/en-us/articles/45231714007323 (V)
- https://www.airship.com/newsroom/data-finds-pictures-boost-direct-response-rates-for-push-notifications-56-p/ (V)
- https://www.audacy.com/931jackfm/news/half-of-teens-get-237-prompts-a-day-on-their-phones
- https://ic.unicamp.br/~oliveira/doc/MHCI2014_An-in-situ-study-of-mobile-phone-notifications.pdf
- https://www.sciencealert.com/blocking-phone-alerts-for-just-one-day-can-change-your-habits-for-years
- https://www.psypost.org/new-psychology-research-reveals-the-cognitive-cost-of-smartphone-notifications/
- https://ic.kaist.ac.kr/files/papers/kim2021beneficial.pdf
- https://affine.pro/blog/setting-effective-reminders-adhd (C)
- https://reddit.sentinel-team.org/posts/1s6y5ek/snapshots/2026-04-03T16%3A51%3A00.928384Z (M)

**Students and nudges**
- https://econpapers.repec.org/RePEc:eee:jeborg:v:183:y:2021:i:c:p:105-128
- https://www.povertyactionlab.org/policy-insight/effect-nudges-federal-student-aid-take-united-states
- https://campustechnology.com/articles/2017/03/07/using-ai-chatbots-to-freeze-summer-melt-in-higher-ed.aspx
- https://mainstay.com/case_study/how-georgia-state-university-supports-every-student-with-personalized-text-messaging/ (V)
- https://ts.vcu.edu/media/technology-services/assets/content-assets/documents/2024StudentTechSurveyResults.pdf

**Audit of round 2**
- https://www.todoist.com/help/articles/todoist-pro-plan-pricing-update-bxBvHZuJZ
- https://reddit.sentinel-team.org/posts/1stvnik/snapshots/2026-04-24T03%3A54%3A51.145223Z (M)
- https://personal-finance-tools.pages.dev/reviews/monarch-plus-review-299-per-year-worth-it-2026/
- https://www.moneytalksnews.com/ftc-to-send-out-m-for-cleo-ai-refund-are-you-eligible/
- https://ginsburglawgroup.com/2026/10/ftc-cleo-ai-cash-advance-app-refunds-paypal/
- https://www.pcc.edu/institutional-effectiveness/survey/student-financial-wellness-survey-2025/
- https://www.nasfaa.org/student_wellbeing_bizaffapr26?viewfullsite=1
- https://www.gallup.com/file/analytics/709325/Lumina_Foundation-Gallup-State_of_Higher_of_Higher_Education_2026_Report.pdf
- https://aspeninstitute.org/?p=216291
- https://nwlc.org/wp-content/uploads/2023/10/STWA-Section-by-Section-Summary-2025.pdf
- https://ppc.land/metas-muse-gains-10-million-us-downloads-in-40-days-sensor-tower-finds/
- https://newsbytes.ph/2026/03/24/mapua-study-more-than-half-of-pinoy-working-students-sleep-5-hours-or-less/
- https://www.mmdc.mcl.edu.ph/news-and-events/lifestyle-career-tips/beyond-the-hustle-recapping-national-working-students-day-2026/
- https://www.iphoneincanada.ca/2025/12/04/apple-reveals-2025-app-store-awards-winners-including-iphone-app-of-the-year/
- https://apps.appfollow.io/ios/shovel-study-planner/1467742357?country=us
- https://appgoblin.info/apps/1467742357

**Re-checked 2026-11-07 (search summaries)**
- https://growth-dives.kit.com/posts/20-days-of-blackmail
- https://www.lazyweb.com/research/duolingo-retention-experiments.md
- https://help.rocketmoney.com/en/articles/2217739-how-much-does-rocket-money-cost
- https://www.wallstreetsurvivor.com/rocket-money-premium-vs-premium-plus/
- https://www.emarketer.com/content/rocket-money-launches-anthropic-powered-virtual-assistant
- https://arhsharbinger.com/25142/letters-to-the-editor/adjusting-canvas-notifications-can-reduce-stress/ (not opened)

**Our own repository (read, not changed)**
- `src/server/services/push.ts`, `public/sw.js`, `src/server/services/proactive/engine.ts`, `src/server/services/proactive/detectors.ts`, `src/lib/jarvis-voice.ts`, `src/server/services/health.ts`, `docs/integrations.md`, `docs/native-app-plan.md`, `docs/vision.md`, `docs/playbook.md`.

## 8. Gaps

0. **11-07 re-check limits:** the Canvas forum and a student letter on adjusting Canvas notifications (arhsharbinger.com) could not be opened from this session. Those hosts would need to be allowed in the network settings. Searching for 2026 student reddit complaints about planner notifications returned only school help pages, so the student voice stays weak (item 9).

1. **No independent numbers on how many pushes are too many.** The per-week opt-out figures are old vendor surveys. Fix: the 10-student test with 4.2, rule 3 in place: opt-out rate, act-on rate per kind and daily opens over four weeks.
2. **Duolingo's results (+0.5% daily users, +2% retention)** come from a scraped copy of the paper; the official PDF was blocked. Fix: allow research.duolingo.com for one session.
3. **iPhone web push buttons:** MDN's table says no, and one forum test agrees, but I couldn't test a current iPhone (iOS 26 or 27). Fix: one test push with buttons to the owner's iPhone with LifeFlow on the home screen.
4. **Student-specific notification research is thin:** teens (Common Sense) and first-year students (Kim and others) are the best I found; nothing on working students. Fix: three survey questions: "Which app's notifications do you keep on, and why?", "Which did you turn off, and what made you?", "When in your day would a heads-up about your week help most?"
5. **No causal data on Live Activities or widgets**, only vendor comparisons. Fix: if the native app comes first, compare students who add the widget with those who don't, controlling for how active they were before.
6. **Competitor news for November 5 and 6:** none found, but search can lag a few days. Fix: re-check at the start of the next round.
7. **US evidence on low-balance alerts:** the strongest study is from the UK. A US credit union trial (Freedom First, 5,200 members) exists, but its result wasn't in what I could read.
8. **Round 2 items still unverifiable:** Child Trends' parenting-student figures, the Lumina-Gallup reason split, and Monarch's first-year price for existing members.
9. **Review sites are still blocked** (App Store, Google Play, Reddit, Trustpilot), so the student quotes in 3.3 are weak. Fix: the allowlist from round 2's gaps, or ten 15-minute interviews.

## 9. Yes or no for the owner

1. **Yes or no:** Dev pushes "I fixed this, Undo" when a new shift or a moved due date made it rearrange your study time (ideas 1 and 5, one push, never three).
2. **Yes or no:** Dev warns 2 to 3 days before a named bill or renewal would overdraw checking, never at night, never with a cash advance (idea 2).
3. **Yes or no:** a morning push only on days with a real clash, and total silence on ordinary days (idea 3, with the "I'll send fewer of these" brake, idea 13).
4. **Yes or no:** when you are off track for a goal, one plain line with a way back, and the daily "tell me what you did" check-in is removed (idea 11 and rule R2).
5. **Yes or no:** replace the flat limit of 3 pushes a day with a learned amount per kind and per person, plus a high safety ceiling (rule R4, option b).

## 10. What changed because of this report

2026-11-07, by the HQ build chat:
- **Things to avoid 1 to 15 are rules now.** CLAUDE.md's Notifications rule points here, so every new push follows them. The ones that need code (the banned-words test in rule 15, the "no daily check-in that asks the user to log what they did" in rule 11, and the flat cap of 3 pushes a day in rule 12) go to the owner first, because they change how something works.
- **The owner's yes or no list** (section 9, top 5) was sent to the owner in the chat on 2026-11-07, waiting for their answers.
- **Round 2 corrections** (Trellis 58% is one college; the shift-notice figure belongs to the Shift Project) are recorded in section 7 above.
