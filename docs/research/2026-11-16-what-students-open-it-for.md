# What students open it for: the home screen, side businesses, pushes, and a claim audit

Date: 2026-11-16. Written by the market researcher (read-only on the product). Nothing was changed in the app, the plan or the vision.

## 1. Question

What one question must Today answer for a student, what did competitors do with their home screens lately, what do students with side businesses need, what is new in notifications, and do five claims in `2026-11-09-widgets-and-watch.md` hold?

## 2. Short answer

- **The pattern that wins is boring.** Across the competitor changes I found, the home screen is a short time-ordered list of what is next and what is due, with a one-line size of the day. Todoist added exactly that line on Oct 22 (task count and total time under the Today title). Canvas students keep complaining when the due list is wrong, which tells us the due list is the job.
- **One question for Today (my opinion, built from the evidence below and from your four testers):** "What do I have to do next, and what is due tonight or tomorrow?" Anything due within 24 hours must beat a note about something days away.
- **Side business:** I found no student-specific evidence. The general freelancer evidence says the pain is "who still owes me", and that calendar reminders alone get ignored. LifeFlow can cover this with a small, honest piece (events tagged as business, plus "owed to you" that is never counted as money in hand).
- **Evidence limit.** Reddit, the App Store, Play, Todoist's own site and most vendor pages were blocked in this session. Most findings below come from search-result summaries I could not open. They are leads. Each finding carries a tag.
- **Audit of the last report:** 4 of 5 claims right, 1 wrong (Apple does publish a number for widget refreshes, and the report said it did not).

Tags: **Opened** = I read the page myself. **Summary** = search-result summary only, page not opened. **Opinion** = my conclusion.

## 3. Findings

### Q1. Competitor moves, last 2 months (September to mid November 2026)

I looked for what each one added or cut on its home screen. Where I found nothing dated, I say so.

**F1. Todoist put a size-of-the-day line on Today. How sure: Summary (mirror pages of the changelog; todoist.com was blocked).**
- Oct 22: "A task count and total duration line now appears under the Today title." Same week: reorder inside Today while a filter is on. Oct 8 and 15: sub-tasks can expand on Today.
- Map: supports the vision's "know everything, show only what helps". Cheap to copy: "3 things, 2h 10m left" under our line. The sub-task previews go the other way (more on the screen), which we should not copy.
- Source: [Todoist changelog search result](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd) (read 2026-11-16, summary only).

**F2. Sunsama added "change receipts" with one-click undo, and a deep link to Today. How sure: Summary.**
- Sept 29: "clearer Sunny change receipts and one-click undo". Oct 5: a `sunsama://today` link opens straight to today. Oct 26: smoother onboarding with Autoplan. Nov 2: richer previews of tasks from connected tools. Oct 19: CalDAV calendars out of beta.
- Map: "tell the person what I changed, with Undo" is the same pattern as idea 1 in the notifications report. Sunsama opens on Today by default; we should too.
- Source: [Sunsama changelog search result](https://roadmap.sunsama.com/changelog) (read 2026-11-16, summary only).

**F3. Canvas itself made its home screen more customizable, but opt-in. How sure: Summary (university IT pages).**
- A new student dashboard with widgets, "a single list of all assignments" and grades at a glance, rolling out from May 25, 2026 at one school. Georgetown says the classic course-card view stays the default. Canvas Student also has app widgets (date not found).
- Earlier, in app version 8.1 (Sept 2025), the To-Do list showed outdated or past items and was reverted in 8.1.1.
- Map: Canvas is moving toward "one list of what is due". That is the thing our testers used. We win only by joining it to shifts and money, which Canvas cannot see.
- Sources: [Rutgers](https://canvas.rutgers.edu/2026/05/25/canvas-student-dashboard-changes/), [Harvard](https://teach.dce.harvard.edu/resource/canvas-student-dashboard-update), [Georgetown](https://canvas.georgetown.edu/news/summer-2026-canvas-changes-and-updates/), [Illinois State](https://help.illinoisstate.edu/technology/support-topics/canvas/canvas-to-do-list-showing-past-assignments) (all read 2026-11-16, summaries only).

**F4. Brightspace Pulse: small. How sure: Summary.**
- January 2026: due, start and end dates now show on content topics in the app (before, web only). Later builds are bug fixes and a parent view. No home screen change found.
- Source: [Arizona IT Jan 2026](https://help.intech.arizona.edu/article/949-january-2026-updates), [APKMirror Pulse](https://www.apkmirror.com/apk/d2l-corporation/brightspace-pulse/) (summaries only).

**F5. Motion went wider, and people call it bloated. How sure: Summary, blog sites.**
- Motion now calls itself an "AI-powered SuperApp for work" (docs, wikis, sheets, notetaker). One review says users praise the scheduling engine but raise "pricing increases, feature bloat, and uneven support". Reported: no free plan, 7-day trial, 25% student discount; sources conflict on price, so I give none.
- Map: this is the trap the owner just felt in his own app. Do not widen.
- Source: [Morgen on Motion](https://www.morgen.so/blog-posts/motion-review), [DailyAIFixs](https://dailyaifixs.com/blog/motion-pricing-2026-no-free-plan-ai-credits) (summaries only).

**F6. Structured, Notion Calendar, Any.do, Google and Apple: nothing new on the home screen found.**
- Structured: version 4.3 (Sept 11, 2025) was a Liquid Glass look and a new task editor; its iOS 26 post says the timeline is "also on your home screen" as a widget. The newest notes in the store are bug fixes and Structured Cloud. I found no 2026 Today redesign. Its core is still a timeline with a Today button.
- Notion: 3.8 (Oct 13, 2026) is about agents. A July 16 release lets the agent read your calendar on desktop. No Calendar home screen change confirmed.
- Any.do: store listing says last updated Jul 24, 2026, without notes. Nothing found.
- Apple Reminders (iOS 26): time zone override, a quick-add control, auto-sorting lists. Google Calendar: nothing found.
- Sources: [Structured 4.3](https://feedback.structured.app/changelog/structured-43-new-task-editor-liquid-glass-and-more), [Structured on iOS 26](https://structured.app/blog/ios26), [Notion releases](https://www.notion.com/releases/2026-07-16), [Neowin on Reminders](https://www.neowin.net/news/exploring-ios-26-5-new-features-you-can-find-in-the-reminders-app/) (summaries only).

**The "today / up next" pattern (Opinion, built on F1 to F6):** the winners show (1) what is next, in time order, (2) one line that sizes the day, (3) nothing else until you ask. Nobody I found moved to a note or a dashboard of many cards. The growth moves (Motion, Notion) are agent and doc features, and the reviews call that bloat.

### Q2. What students open a planner for, and why they stop

I could not reach Reddit or store review pages. What follows is from blogs, founder posts and university pages that quote people. I did not find an r/college or r/GetStudying thread I could read. I will not pretend I did, and I have no count of reviews. This question needs the survey.

**F7. Students lean on a short stack: Canvas for due dates, a calendar for the week, a notes app. How sure: Summary, university and blog pages.**
- Pattern across the sources: Canvas holds assignment due dates, Google Calendar holds class and personal times, a notes app holds the rest. Extra planners are "optional". A UW-Madison student blog admits to downloading "30 new apps in the first week" and never opening half.
- Map: matches your four testers. They used due, shift, money now and a line of events.
- Sources: [UW-Madison student blog](https://mediafluency.sjmc.wisc.edu/?p=5466), [Newcastle Canvas calendar](https://www.ncl.ac.uk/learning-and-teaching/digital-technologies/canvas/calendar/) (summaries only).

**F8. Why people stop: the pile, the guilt badges, the upkeep. How sure: Summary, founder posts (not student-only).**
- "They stop because opening the app starts feeling mentally heavy." (a planner maker, Product Hunt thread)
- "Overdue badges, red notifications, a list that only grows... just became daily proof that I was falling behind." (a founder who quit many apps)
- "It was never the features. It was the pile." (a founder, Product Hunt)
- "Instead of these tools serving me, I was serving them." (a Reddit user quoted by a blog)
- Map: supports "show only what helps". An overdue pile on Today would teach people not to open it. Never show a growing backlog.
- Sources: [Why do so many productivity apps become overwhelming](https://www.producthunt.com/p/anchor-14/why-do-so-many-productivity-apps-become-overwhelming-after-a-week), [Every planner I built worked until the backlog hit 200](https://www.producthunt.com/p/lunelo/every-planner-i-built-worked-until-the-backlog-hit-200-items), [Get Alfred blog](https://get-alfred.ai/blog/why-every-productivity-app-failed), [PlanHourly post](https://www.producthunt.com/p/planhourly/planhourly) (summaries only).

**F9. Students judge a due list by whether it is right. How sure: Summary, Canvas forum and IT pages.**
- After the 8.1 update, the Canvas To-Do showed "outdated items" and past assignments; students "are unable to dismiss or move" finished items (Canvas Community thread). Fix shipped in 8.1.1.
- Map: a wrong due list loses trust faster than a missing feature. LifeFlow's due list must hide what is done and never show stale items. This is a test, not a feature.
- Sources: [Canvas Community thread](https://community.canvaslms.com/t5/Canvas-Mobile-Forum/To-Do-List-for-Assignments-Not-Working-For-Students/m-p/544617), [Penn State IT](https://www.it.psu.edu/news/canvas/attention-students-mobile-to-do-list), [Illinois State](https://help.illinoisstate.edu/technology/support-topics/canvas/canvas-to-do-list-showing-past-assignments) (summaries only).

**The one question (Opinion):** "What do I have to do next, and what is due tonight or tomorrow?" Reasoning: your testers got value from due, next shift, money now and events (all "next"), and got nothing from the note, which pointed days ahead. Rule that follows: the first line on Today is the nearest thing that is due or starts, within 24 hours, from any source. A note about a later thing may appear only when nothing is due in 24 hours.

### Q3. Students with side businesses

**How sure: weak.** I found no thread or review from a student with a side business. Everything below is about freelancers in general. Note that the Reddit page I found (a tutor) came through a search summary.

**F10. The pain is "who has paid me", not the calendar. How sure: Summary, founder posts and one forum thread.**
- A tutor on a Reddit thread keeps lessons in Google Calendar and payments in a spreadsheet; a commenter says tracking payments is the hard part.
- A builder of an invoice tool argued tracking is not where freelancers lose, and that a due-date reminder "competes with a calendar entry". A developer wrote that "spreadsheets get messy and calendar reminders get ignored".
- Billing tools asked people to "stop using Google Calendar and log time in their own apps" (a founder write-up). The friction is moving off the calendar they already use.
- Map: confirms your tester. The calendar must take business events (client meetings, shoots, deliveries) from where he already keeps them, and one extra line must show what clients still owe.
- Sources: [r/OnlineESLTeaching thread](https://reddit.birdcat.cafe/r/OnlineESLTeaching/comments/1kpo9s5/is_it_normal_to_feel_this_overwhelmed_by), [Indie Hackers post](https://www.indiehackers.com/post/im-testing-a-simple-tool-for-freelancers-who-struggle-with-unpaid-invoices-0f65288673), [DEV post](https://dev.to/vishal_parmar_661f71820d2/i-built-a-tiny-tool-to-track-unpaid-invoices-because-i-kept-forgetting-4f11), [Moxie calendar page](https://www.withmoxie.com/product-pages/calendar) (summaries only).

**F11. What the business tools do and where they fall short. How sure: Summary, mostly affiliate review blogs.**
- HoneyBook: highest rated on Capterra (4.7 from 683 reviews), strong for photographers and designers; price sources conflict ($16 to $66 a month, or $19 to $79; one says Starter is $36). Dubsado: "most customizable but steepest learning curve"; free tier limited to 3 clients. Bonsai: cheapest and simplest ($9 on Capterra, $25 elsewhere); one source says it lacks a client portal and native invoicing for photographers.
- Photography invoicing sellers (VSCO Workspace, InvoiceBerry) sell automatic overdue reminders and deposits at booking.
- Map: these are tools for running a business (contracts, portals, invoices). A student's side job needs far less: dates and who owes what. Do not build a HoneyBook. Prices conflict, so I give no number to plan against.
- Sources: [Capterra HoneyBook vs Dubsado](https://www.capterra.com/compare/162588-206389/HoneyBook-vs-Dubsado), [Capterra HoneyBook vs Bonsai](https://www.capterra.com/compare/162588-238825/HoneyBook-vs-Bonsai), [Agiled](https://agiled.app/compare/dubsado-vs-honeybook), [Toolradar](https://toolradar.com/compare/honeybook-vs-dubsado), [VSCO Workspace](https://www.vsco.co/workspace/invoicing) (summaries only).

### Q4. Notifications: what is new since 2026-11-06

Nothing in the last ten days changes the earlier report. What I found:
- **Android 17 reached stable on June 16, 2026.** It adds a "Metric Style" Live Updates template. One source says it is not confirmed for the first stable build. A "notification rules" control (silence or highlight by app or person) was seen only in beta code, not confirmed shipped. Source: [Android Authority, Live Updates](https://androidauthority.com/android-17-live-updates-metric-style-template-3669117), [TechCabal](https://techcabal.com/2026/06/16/android-17-features) (summaries only).
- **iOS 26 brought back AI notification summaries**, only for News and Entertainment apps, with a per-app switch and an accuracy warning. An Aug 12, 2026 MacRumors item reports an Apple patent about better summaries; a patent is not a product. Map: our line must still read well when summarised or held (already in the earlier report). Sources: [MacRumors on the patent](https://macrumors.com/2026/08/12/apple-patent-to-improve-summaries), [9to5Mac](https://9to5mac.com/2025/10/27/ios-26-brought-back-a-controversial-ai-feature-heres-whats-new/) (summaries only).
- **Sunsama's change receipts with Undo (F2)** is a live example of the "I fixed this, Undo" push.
- **iPhone web push buttons:** I found no new evidence. The earlier finding (no buttons on iPhone web push) stands, unchecked this round.
- Map: nothing forces a change. The earlier 15 "Things to avoid" still hold.

### Q5. Audit of `2026-11-09-widgets-and-watch.md` (5 claims)

I opened Apple's pages through the documentation's markdown form where the normal page returned only a title.

| # | Claim in the report | Verdict | What I found |
|---|---|---|---|
| 1 | "Apple gives no number [for the daily reload budget]. Third-party reports say roughly 40 to 70 a day ... That figure is an estimate, not an Apple fact." (section 1, Refresh and budgets) | **Wrong** | Apple's own page says: "For a widget the user frequently views, a daily budget typically includes from 40 to 70 refreshes. This rate roughly translates to widget reloads every 15 to 60 minutes." It also says each widget the user adds has its own budget, and entries should be at least about 5 minutes apart. Opened: [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date.md). The report's advice (send a day of entries in one fetch) still stands. "Plan for a few a day" in its gaps section is too low; plan for a typical 40 to 70 and treat it as a typical range, not a promise. |
| 2 | Interactive widgets: "iOS 17 and later: buttons and toggles run an App Intent without opening the app." | **Right** | Apple: widgets "can include buttons and toggles to offer specific app functionality without launching the app"; Apple's sample checks `#available(iOS 17.0, *)`. Buttons and toggles are inactive on a locked device until unlocked, which the report did not say. Opened: [Adding interactivity](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities.md). |
| 3 | "App Groups do not span iPhone and Watch, so the watch fetches itself or gets data through WatchConnectivity." | **Right** | Apple forum thread: "App Group is device level, iPhone and Apple Watch are two devices. You can consider `WCSession`", and an Apple engineer replies "Right." Older (2015 to 2016) answers agree. The thread is a community answer confirmed by Apple staff, not a doc page. Opened: [Apple forums thread](https://developer.apple.com/forums/thread/798969). |
| 4 | Guideline 4.2 "rejects apps that are a repackaged website" and widgets are "exactly the examples reviewers look for." | **Right on the first half, unproven on the second** | Opened text: "Your app should include features, content, and UI that elevate it beyond a repackaged website." The page text I read does not name widgets or watch apps. "Exactly the examples reviewers look for" is the report's opinion. Sub-clauses 4.2.1 to 4.2.7 were not read. Opened: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). |
| 5 | Developer Program costs "$99 a year". | **Right** | Apple: "$99 USD per membership year", with fee waivers for eligible nonprofits and schools. Push notifications and Sign in with Apple are listed. App Groups are not named on that page, so the report's reason "needed for App Groups" is unconfirmed here. Opened: [What's included](https://developer.apple.com/programs/whats-included/). |

Extra check (not counted): "Mac widgets are free with the same extension (same Apple ID, Sonoma and later)." **Right, but incomplete.** Apple's page confirms "People can put iPhone widgets on their Mac desktop and in Notification Center" and that taps are sent to the iPhone, which can be slow ([Apple](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities.md), opened). Secondary sources add iOS 17 and macOS 14 minimums and "iPhone nearby or on the same Wi-Fi" (summaries only; Apple's support page was blocked). The report left "does the iPhone need to be nearby" open; the answer is yes.

Net: 4 right, 1 wrong. Not checked: the Capacitor plugin claims (capgo.app, pkgstats and the Ionic forum were blocked) and the "about 9.5 days" estimate (opinion).

## 4. Proposals, ranked

Everything here is a real change, so each needs the owner's yes through the COO. All are held until then.

1. **Make the first line of Today the nearest thing within 24 hours.** (Findings F7, F9, your testers.) Size: small to medium. Rule: due or starting within 24 hours from Canvas, shifts, events or bills beats any note about a later thing; the note about a later thing shows only when nothing is due in 24 hours. Proves: re-run the four-student test and count "Today answered what I came for". Today it is about 1 in 12. Target is a clear majority (the owner sets the number; I suggest at least 8 of 12).
2. **Put the morning brief on top of Today, once a day, only when there is something to say.** (Testers: "most useful thing, buried one screen deep"; the notifications report on empty days; Sunsama F2.) Size: small to medium. Proves: share of looks that start by reading the brief, and no complaints on quiet days. It stays silent on an empty day, as the earlier report requires.
3. **Add one line that sizes the day under the main list.** (F1, Todoist.) Size: small. Example: "4 things, 3h 10m of class and work left". Real records only. Proves: whether testers stop opening the calendar to check "how full is today".
4. **Cut the first screen to what testers used: due list, next shift, money now, a line of events.** Move to-dos, goals, health, search, pins and stars out of the main view (behind More, or off until asked). (Testers; F5 Motion bloat; F8.) Size: medium. Owner decision: stars and the sky rewards were the owner's own idea, so I suggest hiding rather than deleting, and testing whether anyone misses them. Proves: first-look answer rate, and which hidden things anyone goes looking for.
5. **Business events and "owed to you" for side jobs.** (F10, F11, your photography tester.) Size: small first, then medium.
   - Small: let a person mark a calendar, or a label, as "business", so client meetings, shoots and deliveries show on the line and count in "due" like class and shifts.
   - Medium: one "Owed to you" list (client, amount, date promised), added by one sentence to the skyling or read from a photo of an invoice. It shows what is waiting and how late. It is never counted in Available now, never predicted, and nothing is sent to a client.
   - Proves: whether the photographer keeps it for a week without us asking. Do not build invoices, contracts or portals.
6. **Add "first-look answer rate" as a standing test measure.** Size: small. After each test student looks at Today, ask one yes or no: "Did this answer what you came for?" Keep the count per week. Proves whether proposals 1 to 4 worked.
7. **Keep the change receipt with Undo as the way to show what the skyling did.** (F2.) Size: small, already planned as idea 1 in the notifications report.

## 5. Things to avoid

1. **Widening to "a SuperApp".** Motion's move to docs, wikis and agents is already called "feature bloat" in a review. Every screen earns its place.
2. **A note that points days ahead while something is due tonight.** Time order wins over cleverness. A later thing never outranks one due in 24 hours.
3. **A growing overdue pile or red badges on Today.** "Daily proof that I was falling behind" is a reason to quit.
4. **A due list that shows finished or stale items.** Canvas lost trust with its 8.1 To-Do list. Done items leave at once; test it.
5. **Making people move their calendar into ours.** Billing tools that asked freelancers to leave Google Calendar are criticised. Read from where they already keep it.
6. **Building a client business suite.** HoneyBook and Dubsado already do contracts and portals, with a steep learning curve (Dubsado). We only show dates and who owes what.
7. **Counting money owed as money in hand.** An unpaid client invoice is never in Available now. Same rule as pay.
8. **Sub-task previews and more rows on Today.** Todoist added them; the evidence for the day is a short list and one size line.
9. **Quoting a number as "Apple gives none".** Check the primary page before writing "no number exists". (Audit claim 1.)
10. **Repeating the earlier notification rules is still required:** no guilt words, no push on empty days, no streaks, nothing private on the lock screen.

## 6. Situation seeds

1. **Student with an evening shift, a problem set due at 11:59 PM tonight, and an exam in six days:** the note must lead with tonight's problem set and when the free hours are, not the exam. Must not: lead with the exam because it is bigger.
2. **Student photographer with a shoot Saturday, a delivery due Monday and a client who owes $300 from two weeks ago:** the line shows the shoot and the delivery with the classes; "Owed to you" shows $300, 14 days. Must not: add $300 to Available now.
3. **Same student, a client meeting on Tuesday at 2 PM during a lab:** clash flagged like a shift and class clash. Must not: ignore it because the meeting is "not school or work".
4. **Student who finishes everything due today at 3 PM:** Today says there is nothing due tonight and shows the next thing. Must not: invent a task or show a streak.
5. **Student who ticked a Canvas assignment as done:** it leaves the due list at once, on every screen. Must not: keep it listed until the next sync.

Four of five are students.

## 7. Sources

All read 2026-11-16. "Summary" means only the search-result summary was read, not the page. Opened pages are marked.

**Opened**
- [Keeping a widget up to date (Apple, markdown form)](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date.md)
- [Adding interactivity to widgets and Live Activities (Apple)](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities.md)
- [Apple forums: app group between iOS and watchOS](https://developer.apple.com/forums/thread/798969)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Developer Program: what's included](https://developer.apple.com/programs/whats-included/)

**Summary only: competitors**
- [Todoist 2026 changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd), [Sunsama changelog](https://roadmap.sunsama.com/changelog), [Structured 4.3](https://feedback.structured.app/changelog/structured-43-new-task-editor-liquid-glass-and-more), [Structured iOS 26 post](https://structured.app/blog/ios26), [Notion releases](https://www.notion.com/releases/2026-07-16), [Neowin on iOS 26 Reminders](https://www.neowin.net/news/exploring-ios-26-5-new-features-you-can-find-in-the-reminders-app/), [Morgen on Motion](https://www.morgen.so/blog-posts/motion-review), [DailyAIFixs on Motion pricing](https://dailyaifixs.com/blog/motion-pricing-2026-no-free-plan-ai-credits), [Any.do reviews on Capterra](https://www.capterra.com/p/173614/Any-do/reviews/)
- Canvas and Brightspace: [Rutgers](https://canvas.rutgers.edu/2026/05/25/canvas-student-dashboard-changes/), [Harvard](https://teach.dce.harvard.edu/resource/canvas-student-dashboard-update), [Georgetown](https://canvas.georgetown.edu/news/summer-2026-canvas-changes-and-updates/), [Canvas Student widgets post](https://community.canvaslms.com/t5/RELEASED-Items-Roadmap/Canvas-Student-app-widgets-now-offer-quick-access-to-key/ta-p/641375), [Canvas Community To-Do thread](https://community.canvaslms.com/t5/Canvas-Mobile-Forum/To-Do-List-for-Assignments-Not-Working-For-Students/m-p/544617), [Penn State IT](https://www.it.psu.edu/news/canvas/attention-students-mobile-to-do-list), [Illinois State](https://help.illinoisstate.edu/technology/support-topics/canvas/canvas-to-do-list-showing-past-assignments), [Arizona IT Jan 2026](https://help.intech.arizona.edu/article/949-january-2026-updates), [APKMirror Pulse](https://www.apkmirror.com/apk/d2l-corporation/brightspace-pulse/)

**Summary only: students and planners**
- [UW-Madison student blog](https://mediafluency.sjmc.wisc.edu/?p=5466), [Newcastle Canvas calendar](https://www.ncl.ac.uk/learning-and-teaching/digital-technologies/canvas/calendar/), [Product Hunt: apps become overwhelming](https://www.producthunt.com/p/anchor-14/why-do-so-many-productivity-apps-become-overwhelming-after-a-week), [Product Hunt: backlog hit 200](https://www.producthunt.com/p/lunelo/every-planner-i-built-worked-until-the-backlog-hit-200-items), [Product Hunt: PlanHourly](https://www.producthunt.com/p/planhourly/planhourly), [Get Alfred blog](https://get-alfred.ai/blog/why-every-productivity-app-failed)

**Summary only: side business**
- [r/OnlineESLTeaching thread](https://reddit.birdcat.cafe/r/OnlineESLTeaching/comments/1kpo9s5/is_it_normal_to_feel_this_overwhelmed_by), [Indie Hackers](https://www.indiehackers.com/post/im-testing-a-simple-tool-for-freelancers-who-struggle-with-unpaid-invoices-0f65288673), [DEV post](https://dev.to/vishal_parmar_661f71820d2/i-built-a-tiny-tool-to-track-unpaid-invoices-because-i-kept-forgetting-4f11), [Moxie](https://www.withmoxie.com/product-pages/calendar), [Capterra HoneyBook vs Dubsado](https://www.capterra.com/compare/162588-206389/HoneyBook-vs-Dubsado), [Capterra HoneyBook vs Bonsai](https://www.capterra.com/compare/162588-238825/HoneyBook-vs-Bonsai), [Agiled](https://agiled.app/compare/dubsado-vs-honeybook), [Toolradar](https://toolradar.com/compare/honeybook-vs-dubsado), [VSCO Workspace](https://www.vsco.co/workspace/invoicing)

**Summary only: notifications**
- [Android Authority on Live Updates](https://androidauthority.com/android-17-live-updates-metric-style-template-3669117), [TechCabal on Android 17](https://techcabal.com/2026/06/16/android-17-features), [MacRumors on the patent](https://macrumors.com/2026/08/12/apple-patent-to-improve-summaries), [9to5Mac on iOS 26 summaries](https://9to5mac.com/2025/10/27/ios-26-brought-back-a-controversial-ai-feature-heres-whats-new/)

**Blocked or not allowed in this session:** apps.apple.com, play.google.com, reddit.com, www.todoist.com, roadmap.sunsama.com, community.canvaslms.com, support.apple.com, www.apple.com, capgo.app, forum.ionicframework.com, reddit mirrors, indiehackers.com (fetches failed; search summaries only).

## 8. Gaps

- **No real student quotes with counts.** I could not read store reviews or Reddit, so there is no "N of M reviews" this round. Fix: let the researcher reach apps.apple.com and play.google.com, or add survey v2 questions (below).
- **Survey v2 (proposed, the owner approves):** (a) "When you open a planner or life app, what is the one thing you want to see?" (open answer); (b) "In the last week, which of these did you open an app to check: due dates, next shift, money, today's events, a to-do list, goals, health?" (tick all); (c) "Do you earn money from something other than a job (photos, tutoring, selling, design)? Yes or no. If yes: do you keep track of who still owes you? How?" (short); (d) "Which apps did you stop using, and what was the last straw?"
- **Side business:** no student evidence at all. Fix: survey (c), plus one interview with the photographer tester about what he tracks today and where.
- **Competitor home screens:** I could not open the apps or their store pages, so "what was cut" is unknown. Cuts are rarely published. Fix: install and look, or read dated App Store version notes once the store is reachable.
- **iPhone web push buttons:** not re-checked this round. Fix: re-read MDN's table when raw.githubusercontent.com is reachable.
- **Audit scope:** five claims only. The plugin claims (Capgo, pkgstats, Ionic forum) and the 9.5 day estimate are unchecked.

## What changed because of this report

Nothing yet. The product session fills this in after the owner decides on the proposals.

## What changed because of this report
- 2026-11-16 (COO): the "Things to avoid" above are rules from today. The COO re-checked the Apple widget budget claim against Apple's page and corrected the 2026-11-09 widgets report. The Todoist, Motion review and Canvas Community sources could not be opened from the COO's session (hosts not allowed), so they stand as the researcher reported them.
- Proposals 1 to 3 back the owner's open yes/no list from the four test students (Today's first line is the next real thing within 24 hours; the morning brief on Today; a smaller first screen). Nothing is built until he answers.
