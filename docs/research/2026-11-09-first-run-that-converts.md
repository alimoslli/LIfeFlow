# The first run that converts: landing page, sign-up and the first 60 seconds

Date: 2026-11-09. Asked by: LF Main, through the product session. Written by: the market researcher (read-only on the product).

## 1. Question

What makes a landing page, sign-up and first minute convert for student and consumer apps in 2025-2026, what did competitors do lately, and do five claims in `2026-11-09-the-mechanism.md` hold?

## 2. Short answer

- **Weak evidence this round.** Most sites (RevenueCat, Chrome docs, Medium, Product Hunt, App Store, Finch's own page) were blocked in this session. I opened only two pages (both GitHub). Everything else below comes from search-result summaries, which I did not open. They are leads, not proof. Read the "How sure" tag on each finding.
- **Direction that most leads agree on:** long, personal onboarding (10 to 30+ screens) before a paywall works for emotional apps. A character (Finch) leads with hatching and naming, not a feature list. Hard paywalls beat freemium on revenue per install, with the same one-year retention.
- **For LifeFlow:** a no-free-term price is normal for the best-measured group. The risk is not the paywall. The risk is showing no value before it. The skyling and the user's own real day are the value.
- **Competitor moves:** I found nothing new and dated in the last two months. Say so, do not invent it. Section 4.
- **Claim audit:** 5 of 5 checked claims hold. Three I could prove myself (opened source or arithmetic or code), two rest on search summaries. Section 7.

## 3. Findings (question 1)

Tags: **Opened** = I read the page. **Summary** = search-result summary only, not opened.

### F1. Hard paywall beats freemium on money, not on keeping people. How sure: Summary.

- RevenueCat State of Subscription Apps 2026 (115,000+ apps, $16B+): Day 35 trial-to-paid about 5x higher with a hard paywall. Revenue per install at day 60: $3.09 hard vs $0.38 freemium. One-year retention: 27% hard vs 28% freemium, "statistically negligible".
- Caveat in the same summary: only apps that use RevenueCat and clear a revenue floor. A 10.7% vs 2.1% figure from a DEV post could not be verified. Do not quote it.
- Map: supports "no free term" (CLAUDE.md price rule). It does not say students accept it. Students are a price-sensitive group; test it.
- Source: https://www.revenuecat.com/state-of-subscription-apps (search summary, not opened).

### F2. Number of screens before the paywall: about 10 to 15 is typical, 25+ in health and habit. How sure: Summary.

- Lazyweb study of 40 flows (July 2026): first paywall around step 11 of about 17. Small sample, skewed by long flows.
- Cal AI: 25+ cards. Dear Me habit tracker: 37 steps, reported at $50K MRR. Noom: 113 screens.
- Only 3 to 5 answers need to drive the logic for it to feel personal. Showing the user's own goal on the paywall "outperforms most layout experiments" (Adapty/Funnelfox summaries).
- Lazyweb: 23 of 119 quiz apps ask a habit or frequency question. Ask only what changes the plan.
- Map: LifeFlow's welcome already has five beats (hello, what fills your week, one class or job saved for real, make it yours, "Your day, connected"). That is inside the normal range. Each question must change the first day, or cut it.
- Sources: https://www.lazyweb.com/research/how-many-steps-before-the-paywall-in-onboarding , https://www.airbridge.io/en/blog/5-steps-app-onboarding-before-the-paywall , https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/ (all search summaries, not opened).

### F3. How a character app wins the first session (Finch). How sure: Summary, third-party only.

- Onboarding starts by hatching, naming and choosing a trait for the bird, not by a feature list. Setup is long (listed as 46 steps; another gallery says 30+) and includes picking habits.
- Estimated retention D1 54%, D7 37% (Deconstructor of Fun, credited to Sensor Tower, not Finch). Duolingo compared at 51% and 35%.
- Why people return, from review analysis: "my bird is waiting for me" (reciprocity). Widgets are argued to be a main repeat driver. The same sources warn that attachment is not proven to cause retention, and that a design critique flags long setup as a drop-off risk.
- Map: the skyling should be chosen and named in the first 30 seconds, then appear on the user's real day (not on a blank screen). A widget with the skyling is worth the same effort as in `2026-11-09-widgets-and-watch.md`.
- Sources: https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/ , https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/ , https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl , https://screensdesign.com/articles/finch-app-onboarding-design/ (search summaries, not opened).

### F4. Permissions and connections: no evidence found this round. How sure: none.

I found no opened or summarized data on when to ask for calendar, Canvas or bank access. This is a real gap (section 8). My opinion, labelled as opinion: ask after the person has seen their own saved class or job on screen, and show what the connection will fill in before the system prompt. Bank last, and only after the first day looks useful.

### F5. Above the fold: no page was opened. How sure: none.

Finch's site and the App Store pages were blocked. I cannot tell you what top landing pages show. I will not guess a pattern. Use the existing board in `2026-11-07-top-ads-reference-board.md` and a manual look (section 8).

## 4. Competitor moves, last 1 to 2 months (question 2)

Nothing dated Oct to Nov 2026 turned up. What the search summaries showed, all earlier or undated, all not opened:

- IntelliPlan: free AI study planner that imports Canvas, StudentVue and Schoology (Product Hunt, launch date not given).
- College Orbit (launched Jan 28, 2026) and VuSchool (Feb 9, 2026) on Product Hunt.
- Instructure and OpenAI: AI tools inside Canvas (Aug 2026 newsletter). This matters: Canvas itself is getting an assistant. Our line "your life, connected" is what Canvas cannot do, since it only sees school.
- Student pricing: Notion Education is free with a school email. YNAB gives a free year with student proof. Todoist, Monarch ($14.99/mo or $99.99/yr), Copilot Money ($95/yr, 30-day trial), Rocket Money: no student plan found. Treat as unverified; the source is review sites.
- Map: at $5.99 we are above free planners and below Monarch and Copilot. Students already expect free school tools. The money and shifts link is what is not free elsewhere.
- Sources: https://www.producthunt.com/products/intelliplan , https://www.producthunt.com/products/college-orbit/launches , https://getcoai.com/news/canvas-integrates-openais-ai-tutors-directly-into-classrooms/ , https://dupple.com/learn/best-ai-money-apps-for-students (search summaries, not opened).

## 5. Things to avoid (rules)

1. Do not put a paywall before the person has seen their own day. Show a real saved class or job first.
2. Do not add a question that does not change the first day. Each welcome question must name what it changes.
3. Do not lead the landing page or welcome with "AI". Lead with the skyling and the connected day (owner's marketing rule).
4. Do not ask for the bank in the first minute.
5. Do not quote the DEV 10.7% vs 2.1% figure, or Finch retention as Finch's own. Both are unverified or third-party.
6. Do not show an invented number without "example" on it (already in CLAUDE.md for the day preview; keep it on the landing page too).
7. Do not make a 40-step flow because Finch has one. Finch's pet carries it. Ours must earn each step.

## 6. Proposals (ranked)

Held for the owner's yes where they change the app. All are small unless stated.

1. **Name the skyling before anything else is asked.** (small) Done means: in `/welcome` the first interaction is choosing one of six skylings and naming it; the name shows on the next screen and on the first Today. Proves: Finch-style ownership works for a planner. Measure: share who finish welcome.
2. **Paywall comes after "Your day, connected", never before.** (small) Done means: the paywall screen shows the user's saved class or job and the skyling's name; no paywall screen can appear before one real item is saved (test). Proves: no free term can convert when value is shown first.
3. **Every welcome step carries a one-line "this changes: X" in the spec.** (small) Done means: the spec lists, per step, the exact change to Today; steps without one are cut. Proves: five steps are enough.
4. **Connections are offered after the first saved item, with a preview of what they fill.** (medium) Done means: calendar and Canvas prompts show "we will add your classes and due dates" with an example, bank is a later card on Today, not in welcome. Proves: connections can wait without hurting fill rate.
5. **Landing page above the fold: skyling, one line on the connected day, price including the student $5.99, one button.** (medium) Done means: the page passes the 5-second test with five students (what is it, who for, what it costs). Needs a picture approved first.
6. **Add events to measure the first 60 seconds** (small): welcome step reached, first item saved, paywall viewed, paid. Done means: five counts on the admin App page, no user content.
7. **Run the manual teardown (section 8) before the page is final.** (small)

## 7. Claim audit: `2026-11-09-the-mechanism.md`

| # | Claim | Check | Verdict |
|---|---|---|---|
| 1 | `normalizeWheel` uses lines x 40 px, pages x 800 px (S1) | Opened the GitHub file: `LINE_HEIGHT = 40`, `PAGE_HEIGHT = 800`. (It also has `PIXEL_STEP = 10`, not mentioned.) | Holds |
| 2 | Rubber band `f(x) = (1 - 1/(x*c/d + 1))*d`, c = 0.55, gives about 52 px for 100 px on 960 (S11) | Opened the gist: "b = (1.0 - (1.0 / ((x * c / d) + 1.0))) * d", "UIScrollView uses 0.55". My arithmetic: 52.02. | Holds |
| 3 | Today's wheel decay 0.93 per 16 ms is about 0.9955 per ms; 0.998 per ms is 0.967 per frame at 60 Hz and 0.983 at 120 Hz; projection is 499 x v | Computed: 0.99547, 0.9672, 0.9835; 0.998/0.002 = 499. The claim that iOS uses 0.998 (S7) I could not open (Medium blocked). | Maths holds; the iOS 0.998 source is unchecked |
| 4 | Chrome 73 made wheel listeners on window, document and body passive, so `preventDefault()` is ignored; fix is `{passive: false}` (S5) | Chrome's blog page was blocked. The search summary of that page says the same, including the intervention warning. Not opened. | Holds per summary, not opened |
| 5 | Code facts: no `wheel` listener in `src/`; `wheelR` clamps 96 to 138; dome rebuilds its SVG every frame; `.dc` is 620 px tall; sprite pixelated | Searched the repo now (HEAD 6cc6219): no `addEventListener("wheel"` or `onWheel` anywhere; `dome.ts:45` is `clamp(W/2 - 56, 96, 138)`; `dome.ts:144` is `svg.textContent = ""`; `day-clock.css:15` is `height: 620px`; `:848` is `image-rendering: pixelated`. Line numbers match the report's. | Holds |

Small slips: the report says it read `origin/main` d988772; the code now is on a later merge, but these lines are the same. Its S16, S18 and others were not re-checked.

## 8. Gaps and how to close them

- **Blocked sites.** RevenueCat, Chrome docs, Medium, Product Hunt, App Store, Finch, ScreensDesign, Deconstructor of Fun and Dormway did not resolve here. Ask the owner or ops to allow them, or run the teardown from a normal laptop. Then re-open F1 to F3 and upgrade "Summary" to "Opened".
- **Above-the-fold patterns (F5).** A 45-minute manual teardown of 8 landing pages (Finch, Duolingo, Todoist, Notion Calendar, Copilot Money, Fantastical, Opal, a student planner), saving a screenshot and a one-line note each. No logins.
- **When to ask for connections (F4).** A survey question in v2: "When would you connect your school account?" (right away / after I see it work / never). Also a 5-student test of the welcome.
- **Paywall timing for students at $5.99.** Needs our own test with the first 10 students; no source gives it.
- **Competitor moves.** A weekly check of Product Hunt "student" and App Store "What's New" notes for IntelliPlan, College Orbit, Canvas AI, Monarch, Copilot.

## 9. Sources

Opened (read 2026-11-09):
- https://github.com/facebookarchive/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js
- https://gist.github.com/originell/6961057
- Repo files: `src/components/day-clock/dome.ts`, `day-clock.css`, `engine.ts` (searched).

Search summaries only, not opened (2026-11-09), treat as leads:
- https://www.revenuecat.com/state-of-subscription-apps
- https://developer.chrome.com/blog/scrolling-intervention-2/
- https://www.lazyweb.com/research/how-many-steps-before-the-paywall-in-onboarding
- https://www.airbridge.io/en/blog/5-steps-app-onboarding-before-the-paywall
- https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/
- https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/
- https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/
- https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl
- https://screensdesign.com/articles/finch-app-onboarding-design/
- https://www.producthunt.com/products/intelliplan
- https://www.producthunt.com/products/college-orbit/launches
- https://getcoai.com/news/canvas-integrates-openais-ai-tutors-directly-into-classrooms/
- https://dupple.com/learn/best-ai-money-apps-for-students

## What changed because of this report

(For the product session to fill in, with commit links.)

## What changed because of this report
- LF Main, 2026-11-09 (2e7f8dc and the commit after it): the remade first run follows rules 3 and 6. The landing page, sign-up and welcome lead with the skylings and the connected day, never with "AI" (the FAQ and legal pages still say plainly that a skyling runs on AI). Every invented number on the landing page carries "Example", and the welcome's sample skyling line now does too. Proposals 1, 2, 4 and 5 change the flow or show the price, so they wait for the owner's yes.
