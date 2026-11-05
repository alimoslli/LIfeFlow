# LifeFlow vision: connect the dots

Captured 2026-11-04 from the owner, in a long thinking session with Claude Code. The owner's own words are at the bottom.

**Status:** the direction is agreed. The open questions (section 15) still need the owner's answers. Nothing here is built yet. App changes start only when the owner says go, one step at a time, following `docs/playbook.md`. Where this document and `plan-v2.md` disagree, this one is the newer direction.

**Names:** "Dev" is the owner's own name for their assistant. The default name and renaming stay as they are; this document says Dev for short.

---

## 1. The idea

LifeFlow is not a health app, a money app, a calendar or a to-do list. Those exist and are very good at what they do. **LifeFlow connects them, finds the problems that only show up when you look at all of them together, and solves them.** That connected picture, and the fixes that come from it, is what people pay for.

- **Every piece of a person's life is a variable** that changes what the other pieces mean.
- **The assistant (the owner calls theirs "Dev") sees what's coming** and helps before it becomes a problem.
- **It solves, not just warns.** "You'll be short on money" is not the product. The fix is.

Today the app doesn't show any of this. It looks like Apple Health, a calendar and a bank app, each restyled and put in one app. A new user sees copies of apps they already have, so the vision is invisible.

### Digital life and real life (owner's principle, 2026-11-05)

A person's life is much more than what their phone knows. Friends, family, time alone, a walk, a call, doing nothing, resting, studying. The app has been built around everything except that.

- **The app connects your digital life** (money, work schedule, school, calendar, email, health data: everything you use your phone to manage) **so you can organize it around your real life.** Real life is the point. The digital side exists to serve it.
- **The gaps on the line are not empty. They are your life.** Free time is never shown as blank or as "available slots". It has quiet presence in words: "Evening at home", "Sunday, yours", "Nothing planned. Keep it."
- **Dev protects real life instead of filling it.** No optimizing every hour. When Dev places study blocks, trip prep or project steps, it uses the stretches the person would least miss and leaves evenings and weekends alone unless the person says otherwise. Its reasons say so: "I kept Saturday free."
- **Real life enters lightly, never by surveillance.** From the calendar (family dinner, a birthday, a trip), from Apple Health (sleep, a workout the person planned), and from one sentence to Dev ("I'm with my cousin tonight"). No screen-time tracking, no location trails, no logging of small things. The app doesn't need the detail; it needs to understand that the life is there.
- **Only what matters (owner, 2026-11-05).** Real life on the line is the level at which a life is organized: time with family and friends, rest, a trip, a wedding, a personal project, a day kept free. Never trivia: no walks between buildings, no errands, no step counts, no micro-moments. "We are a different level of organization."
- **Dev may notice when real life is being squeezed** (three weeks without a free evening, no time with people before a hard stretch) and say it once, gently, as "just so you know". Never a nag, never a score.
- **Checks gain a variable:** rest and time with people count alongside money, time, school and work when Dev decides whether a plan is good.
- **How much the person tells the app:** lightly, by default. Calendar, health data and one-sentence tells when they feel like it. Never logging; that turns the app into a chore.

### The promise (owner, 2026-11-05)

> Organizing your digital life and real life together, so you find the perfect way to balance both and never miss anything. We value the user's time. Know where your life is going, how it looks, and where it's headed.

- **Never miss anything** stays the promise from `plan-v2.md`.
- **Balance** is felt, not measured. When real life is squeezed, the line and Dev's words say so. When it's fine, free stretches read as the person's own time. No scores, no percentages.
- **Where your life is headed:** the line has a horizon. Zoomed out, it shows the destinations the person is moving toward (a trip, the end of the semester, a savings goal, a project finished) and, behind them, the milestones they reached. This is where goals and milestones live: on the line, not on their own pages. Dev states the direction in plain words from the data only ("You're on track for Cairo. The trip fund is $40 behind; one more set-aside fixes it."), never a number the data doesn't support.
- **"Perfectly" means correct every time**, not clever. The way there is the brain (section 7): general checks, the situation library as tests, every real miss added, and real users for two weeks before anything is called done.

## 2. Why not just a money app (or any one niche)

The owner considered narrowing back to personal finance, where LifeFlow started (BudgetFlow). The answer is no:

- Rocket Money and apps like it have lots of sign-ups and lots of cancellations. They mostly show you what you already know ("you spent $400 on food"). Their value is front-loaded: forgotten subscriptions get found once, then there is little reason to come back.
- They only see money. Spending is a symptom of what's happening in your life, and an app that only sees the symptom can only nag.
- ChatGPT, Meta's Muse and the banks themselves are all adding money features. A money-only app gets squeezed from every side.
- LifeFlow's own rules rule out Rocket Money's main features: we never cancel, never negotiate and never move money for the user.

**Narrow the promise and the audience, not the data.** Money can be the easiest door in ("the app that knows *why* you spend"), but the edge is the connections.

## 3. What makes LifeFlow hard to copy

The big assistants are moving toward connecting things too, so "we connect your data" is not enough on its own. These are:

1. **Pick a type of person, not a feature.** Students first: classes, shifts, little money, sometimes far from family. Then anyone with a busy life. We connect *everything* for that person. General assistants are built for everyone, so they are shallow on anyone in particular.
2. **Knowing which connections matter.** That a late shift before a 9am exam matters, that hourly pay isn't money until it lands, that food spending jumps when no one's cooking at home. This know-how lives in the situation library (section 9) and grows every week.
3. **Being right every time.** Numbers come from real data, with the trace shown. A chatbot guesses.
4. **A surface, not a chat.** We can lay a life out and show where things collide (section 8).
5. **Dev acts inside your plan.** LifeFlow holds the calendar and to-dos, so Dev can block study time or move a to-do, with Undo.

## 4. How Dev thinks

### Every piece of data is a variable

Each fact changes how the others should be read:

- A shift until 11pm is just a shift. The night before a 9am exam, it means no review time and less sleep.
- $40 more on food is just spending. With "my aunt is travelling", it means no one is cooking, and it lasts until she's back.
- A heavy work week with an exam in 5 days means study time has to move earlier.

### Change, ripple, trace

1. **Something changes:** a purchase, a new shift, a bad night of sleep, an exam added, a flight booked, a smaller paycheck, someone leaving home.
2. **Dev follows the ripple:** everything that change touches. A purchase touches the balance, then the bills due before the next deposit, then goals.
3. **Dev shows the trace:** the chain, with each step being real data the user can tap.

   > **You might come up $10 short Thursday.**
   > $85 at Target → $40 left in checking → Claude ($20) + phone ($30) due Thursday → payday is Friday.
   > [Move $10 from savings] [Remind me Thursday]

### General checks, not one-off notifications

We can't write a notification for every situation. A few general checks run whenever anything changes, for any combination:

| Check | Example it catches |
|---|---|
| **Can I afford what's coming?** | A purchase today, bills before payday |
| **Do I have time for what's coming?** | A work week plus an exam in 5 days |
| **Will this hurt my rest?** | A late shift, then an early class |
| **Did a pattern change, and why?** | Food spending up, and Dev knows the aunt is away |
| **Is something I care about drifting?** | A savings goal behind, a trip in 3 weeks |
| **Is a heavy stretch coming?** | 5 midterms the week before a flight |

### Big events cast a shadow

Every big event has hidden work before it. On paper, five midterms and a flight on Dec 10 don't overlap. In real life there are study hours for each exam, one to two weeks of trip prep (shopping, errands, packing, money), plus classes, shifts and sleep. Dev has to see the shadows, not just the events:

- Know roughly how much work each kind of event needs (exams, trips, moving, a new job, finals week).
- Look weeks ahead, add up the hidden work per week, compare it with real free time, and find the week that goes into the red.
- Warn early, with a plan ready, and check in along the way.

### Plan before all the facts are in, then replan

Some facts arrive late. Shift schedules often drop only two weeks ahead.

- **Plan with what's expected, clearly marked:** keep room for the usual shifts instead of pretending those nights are free.
- **Know when the real facts land** (learned from history, or asked once).
- **Say what's worth doing before then:** "Your December schedule usually comes out around Nov 26. If you want lighter shifts during midterms, ask your manager before then."
- **Replan the moment new facts arrive:** "Your schedule's in. Thursday's shift is the night before Bio. I moved your Bio review to Wednesday morning. [Undo]"

### Predicting pay for hourly jobs (owner's decision, 2026-11-04)

Hourly pay will be predicted, but only when it can be done very accurately. Dev learns it from the user's own history, not from a formula:

- **Each past pay period is a pair:** hours scheduled in that period, and the paycheck that actually landed. The pair already includes how long they really clocked in, call-outs and taxes, so Dev doesn't calculate any of those separately. "When Ali is scheduled 25 hours, about $X lands."
- **Find the pay period:** how often pay lands (from deposit dates) and how many days after a period ends it arrives, by testing which fit matches past paychecks best.
- **Predict a range, not a number:** the hours scheduled in the current period, compared with what similar periods paid, shown as a range ("about $410 to $450, Friday"). Recent periods count more, so a raise shows up.
- **Earn the right to predict:** only once it meets the pay model's target in ADR 0023 (within 3% of the deposit for at least 9 of that person's last 10 paychecks), and only while it keeps landing that close. If they drift, Dev stops predicting for that user and says why.
- **Check every paycheck:** when pay lands, compare it with the prediction and learn from the difference. It gets better over time.
- **Never counted as money you have:** Available now stays checking + cash. Predicted pay is for planning ("you'll be short until Friday's paycheck") and is always marked as expected.
- **Edge cases to test:** overtime, holiday pay, tips, a raise, a new job or two jobs, a missed paycheck, a schedule changed after it dropped, a call-out.

This replaces the old rule "hourly pay is never predicted" once it is built and passes its tests. Until then, the old rule stands.

### Learn the person, not averages

- How long *this* person actually studies, preps for a trip, sleeps, and when they get things done. Learned from what they do (blocks used or skipped, check-offs), what they say, and what worked last time. Averages are only the starting point.
- **Fixed vs flexible:** an in-person exam is a fixed point. An online exam usually has a window (Canvas often gives open and close times), so Dev can place it where it fits best, such as a rested morning rather than right after a shift.
- **Three kinds of spending:** fixed (subscriptions, the phone bill), steady but varying (gas around $200 a month, groceries), and one-offs (a concert, a trip). Today the app lumps the last two into one "usual spending" number.

## 5. Solve, don't just warn

### Notice → find why → fix → act → check back

The owner's example, with the dots it connects:

1. **Bank:** food spending is up.
2. **Where:** much of it is the school cafeteria (it may show up as ARAMARK or SODEXO), the rest is fast food.
3. **Life:** the aunt who cooks is travelling; the owner lives abroad.
4. **School:** class times, so Dev knows when lunch falls.
5. **Distance:** home is about 10 minutes from campus.
6. **Health:** the user's own goal to lose weight.
7. **Web:** a real recipe that's cheap, packs well for work and fits the goal (cited source only).
8. **Timing:** sent Sunday evening, when there's time to shop and prep, without the user asking.

- **The fix is personal.** Same problem, different fix per person. Someone 10 minutes from home: go home for lunch on long-break days, meal prep for long days. Someone 40 minutes away: cheaper campus options or prep only.
- **Checking back is what sells it:** "You spent $35 less on food this week." That's when someone decides the app is worth paying for.
- **Acting alone (owner's decision):** Dev may add study blocks and reminders (calendar and to-dos) by itself, always with Undo and a note saying what it did. Money never moves on its own.

### Two kinds of messages

- **"Just so you know":** nothing to do, just useful. "Your Spotify went up $2." "Three nights under 6 hours, exam Friday."
- **"Want me to fix it?":** the meal prep, moving study time, setting money aside.

The **Updates** page next to the chat becomes this feed: everything Dev noticed, and push notifications carry what Dev noticed to the person (owner, 2026-11-05: notifications are how Dev brings people back every day; see "Decided from research" 5).

### Knowing what helps and what doesn't

The hardest and most important part. Before anything reaches the user it passes a filter:

- Is it new to them?
- Would they want to know?
- Can they do something with it?
- Is now the right time?
- Have they ignored this kind of thing before?

Only the best one is sent. Dev learns what *doesn't* help from tests where the right answer is "stay quiet", and from how each user reacts (taps, ignores, thumbs down). Too many messages and people turn it off.

## 6. Learning about the user without being creepy

Users won't type "I live 10 minutes from school". Dev learns it carefully:

1. **Notice from what's already connected.** Cafeteria purchases on class days mean "eats on campus". Calendar gaps mean "2-hour break Tue/Thu". No new data needed.
2. **Ask one question at the right moment, as a tap.** "You have 2 hours free at noon. Is home close enough to eat there?" [Yes, about 10 min] [No]. Builds on the existing get-to-know questions (`services/proactive/questions.ts`), but asked when they matter.
3. **Learn from reactions.** Ignored "go home for lunch" twice means stop suggesting it.
4. **Keep the rough fact, not the details.** "Home is about 10 min from campus", never the address or a location trail. Phone location only if the user turns it on.
5. **Show everything Dev knows.** A "What Dev knows about you" page: every fact says where it came from and can be changed or deleted. Guessed facts wait for the user's yes before Dev uses them (already the rule: proposed memories never reach a prompt).

Care points:

- **Food and weight:** only suggest meals for a health goal the user set themselves; never comment on someone's body or weight unprompted.
- **Graded work:** Dev stays a strict coach (ADR 0016). It plans for real study by default; the user decides how much time they actually put in, and Dev adapts without nagging. Admissions about schoolwork are never saved.

## 7. "Training the model": what it means now and later

Decided 2026-11-05, ADR 0023. The owner asked: if every message goes to the OpenAI API, how does our data change the app? It doesn't change OpenAI's model (it's stateless, `store: false`, and never learns from us), and it doesn't need to. Dev is two parts:

- **The brain (ours):** the connections, one timeline, the checks, and learned models for the jobs that matter. It finds the facts, the clashes and the best time, each with a source.
- **The words (rented for now):** the language model understands what the person says and words the answer. Swap it and Dev must give the same answer.

How the brain works:

1. **Find the dots (code, no AI):** one timeline of the user's life with every class, shift, exam, bill, payment, night of sleep and event on the same clock, plus what Dev knows.
2. **Connect the dots:** written, tested checks for the important patterns, plus a daily AI look over the week for patterns no check covers. Every claim must point to real data or it's dropped.
3. **Decide what helps:** the filter in section 5.

The three levels of owning our AI:

1. **Now: our own learned models** for routines, pay from hours, bills and subscriptions, the best time for a task, and which suggestions this person takes. They start from the simulator's made-up lives and adjust to each person from their own history, inside their account, shown with sources in "What Dev knows". Each ships only at its targets in ADR 0023.
2. **After the 10-student test: our own language model.** An open model we train on thousands of situations (simulator, plus real ones from people who say yes) and host ourselves, so no user data leaves LifeFlow. It replaces the current one only when it beats it on every test.
3. **Not doing: a model built from zero.** It costs tens to hundreds of millions and wouldn't make Dev better than level 2.

The **situation library** is the exam every version of Dev must pass, the material for tuning the checks, the training data for the learned models, and later for our own language model. Every real miss becomes a new case. This is the training loop in `docs/playbook.md`.

**Later:** see section 11.

## 8. The surface

**The problem:** the app looks like other apps restyled and put in one place. The owner wants a surface no one has seen before, one that changes how people manage their life and doesn't look like any existing app. Nobody knows yet what it looks like. It has to be created.

### Know everything, show only what helps (owner's rule, 2026-11-04)

There is a big difference between what the app **knows** (everything connected and synced every day) and what the user **sees**. The user doesn't need to see all their data.

1. **What LifeFlow knows:** everything synced: transactions, schedules, sleep, goals, memories. It stays in the background.
2. **What Dev uses:** all of it, to notice, plan and fix.
3. **What the user sees:** only the moments that help. A decision is coming, something needs to change, here's the fix, or something worth celebrating. Plus anything they ask for.

Example: the user tells Dev they have a budget goal. **No** progress bar, no "50% of your budget", no goal settings screen; that is just another money app. Instead the goal shapes Dev's help:

- At a decision: "The concert is $60. You'd still hit your goal if you skip takeout twice next week."
- In a fix: food spending is running high, so Dev quietly plans Sunday meal prep. The user gets the meal plan, not a percentage.
- At the right time, rarely: "You're on track for Japan. Nothing to change." Or nothing at all.

**The test for anything on screen:** does it help the user do or decide something now? If it only shows what they have, cut it, or let Dev use it instead.

**Hidden by default, never hidden from the user.** Anyone can ask Dev "how's my budget?" and get the exact numbers, and the "What Dev knows" page shows everything, for privacy and trust.

**The line is the main thing, not the only thing (owner's rule, 2026-11-05).** From the line, one tap shows everything in one area of life: all your money (available now, what came in and what went out this month, in total, then the list), all your classes, all your assignments, all your shifts. Not a tab and not a page. The line itself opens into that area (for example, tap the money part of the line and it becomes your money line with the totals above it) and closes back with one tap, without losing your place in time. Totals are always real sums of the data, never estimates, and expected pay is never added to "available now".

**Guardrails (they make the new surface usable, not plainer):**

- **Everyday things stay instant.** The owner's rule: "I want my calendar, what's the easiest way? That's how a user should get there." Calendar, to-dos, money and the assistant are one obvious tap away, however new the surface is.
- **Self-explanatory.** With no reference, users have no habits to fall back on, so it must make sense on first sight.
- **Built from situations, not from other apps.** Start from what a person needs to see and feel in the real situations (section 9), not from how calendars or banks look.
- **The brain comes first.** A beautiful view of weak insights is worth nothing. The connected insights must be real before the surface is built around them.
- **Less, not more.** The current tabs hold too much (to-dos, milestones, habits, health charts, notes...). These stop being separate mini-apps. The data stays, connected underneath; Dev brings it up when it matters ("2 books from your goal, Sunday is free").
- **Phone first**, fast, accessible, light and dark.

**How to invent it (not guess it):**

1. Pick 10 situations from the library.
2. With the designer, sketch 3 to 5 very different concepts for how a person would see their life in each.
3. Test rough prototypes (Figma or paper) with 5 students each. Watch what they understand and what they reach for.
4. Pick one, refine, test again. Only then build.

**Starting ideas to push past:** your week as one flow, with the spots where things collide lit up (it fits the name); ripples, where tapping anything shows what it touches; a pressure view shading each day by how heavy it is across time, money and rest. These are starting points, not the answer.

**Decision (owner, 2026-11-05): the surface is the braid.** Four prototypes were tried. The braid (concept 3) is the one: five strands of life twisting into one rope across the screen, loose when calm, tight and twisting when things collide, knots where strands pull on each other that untangle when the problem is solved, moving with the person's life. "This is where we start our build." The "one line" prototype (concept 4) was rejected because it looks like every other app; its mechanics (one tap to all of an area with real totals, Play, shifts from a photo, the why-line and mute, check-backs, visible trust, one plain price, three lives) move into the braid. The braid's one weakness, "a bit hard to understand", is fixed inside the braid with words on it, fewer symbols and a sentence from Dev that always says what it's showing, never by flattening it into a list. Prototypes: concept 3 `lifeflow-braid.html`, the upgrade `lifeflow-braid-v2.html` (scratch files; the published links are in the product chat).

**The form is still open, the rule is not (owner, 2026-11-05).** The owner likes the different lines and wants more forms explored before locking one: the braid, a heartbeat (the pulse of a life along time), strands of DNA (two backbones, digital life and real life, with rungs where they connect), and others we find. Whatever the form: it is a timeline with events in it; it may look complicated at rest, but when the person touches it, it simplifies and shows exactly what everything is, in words; and anything they want to know is one touch away. Next step: the same data and the same touch-to-simplify behaviour rendered in two or three forms side by side, then pick with real people.

**Where the surface stands (owner, 2026-11-05, evening).** Three forms are built into the prototype (braid, pulse, helix) and the owner keeps all three for now; each will be edited and tested. The owner's diagnosis: the problem is not the form, it is what the line represents and how the graph reads. It is not clear that it is a timeline, not clear when the point under your finger is or what is happening there, the "Back to now" label collides with the scrolling time label, and a person cannot tell at a glance how each part of life is doing right now. The goal restated: open the app and, with no learning, understand "this is my life, this is what's happening at this moment for each part of it". Method from here: audit the whole prototype first (comprehension, time legibility, per-part state at a glance, interactions, bugs, honesty, performance, accessibility), agree the fix list, then fix everything at once.

**Each strand is drawn from its data (owner's rule, 2026-11-05).** How a strand looks is how that part of life is doing, and every visual property is computed from the real data at that point in time, never drawn to look lifelike:

| Strand | Thickness | Tightness and density | Beads |
|---|---|---|---|
| Money | Available now (checking + cash) over time; net worth on the horizon zoom. Scaled to the person's own range, with a floor so it never vanishes | Bills and pay due close together | Transactions, bills, pay |
| School | | Pressure: class hours, assignments due this week, exams and the study shadow before them | Classes, due dates, exams |
| Work | Hours scheduled | Shifts stacked with school | Shifts, pay landing |
| Health | Rest: sleep hours (thin after a short night) | | Workouts the person planned |
| Life (real life) | Time that is the person's own and time with people | | Named moments that matter: dinner with family, a friend's birthday, a trip, a call with someone far away |

**Health, in full (owner, 2026-11-05).** The Health strand's state comes from everything connected to health: sleep, movement, exercise, food and calorie intake against the goals the person set (a gym goal, a calorie goal), and later, if the person chooses, medical treatments and medication. Movement data is an input to how the strand looks, never a moment on the braid (a walk changes the strand's thickness; it is not an event). Goals connect to each other: a gym goal and a calorie goal are read together. Medical data comes later, only with the strongest privacy, never used to diagnose (CLAUDE.md), and never shown as a score; the strand's thickness is the only "health bar" there is.

**Every connection is a variable.** Each thing connected to the app, and every connection added later, changes how the strands move. A new connection must say which strands it feeds and how (the one-function-per-strand mapping), so the braid stays accurate as the app grows.

Across all strands: expected is dotted, Dev-planned is dashed, the past fades, and missing data is a flat neutral strand that says "nothing synced here", never an invented shape. Each strand can be pulled out on its own to show its curve and the numbers that drive it; tapping any point shows the exact number and its source, so a person can check the line is honest. The braid is 3D (depth as the strands twist), always moving a little, still readable with reduced motion, and smooth on a phone. The mapping lives in one place in the code, one function per strand, so it is testable and later driven by real sync data.

## 9. Situations Dev must pass

Each becomes a test: the data, what Dev must notice and trace, what it suggests, and what it must not do.

1. **Aunt is away.** Food spending up at the cafeteria and fast food. Dev links it to no one cooking, uses class times, distance from home and the user's health goal, and sends a cheap meal-prep recipe on Sunday evening. Checks back a week later. Must not: comment on weight, or treat it as permanent.
2. **A purchase leaves you short.** $85 at Target leaves too little for Claude and the phone bill two days later, before payday. Dev warns with the trace and offers fixes. Must not: count pay that hasn't landed, or cry wolf over a few dollars.
3. **The Cairo trip.** Flight Dec 10 in the morning. 5 midterms the week before, some online with flexible windows. Shifts continue until the day before, schedule unknown until 2 weeks out. Trip prep takes this person 1 to 2 weeks, and the trip costs money. Study time follows this person's real habits. Dev flags the heavy stretch about 5 weeks ahead, plans backwards from Dec 10, suggests asking for lighter shifts before the schedule drops, places online exams well, and replans when the schedule arrives. Must not: assume a fixed number of study hours, or pretend unknown nights are free.

4. **The paycheck.** The user is usually scheduled about 25 hours a pay period, but what lands changes with real clock-in time, call-outs and taxes. Dev predicts the next paycheck as a range from past periods, uses it to plan, and compares it with what actually lands. Must not: predict before there's enough history, keep predicting when past predictions were off, or count predicted pay as money available.

Still to write: about 30 more, including stay-quiet cases.

### The owner's situations are seeds, not the spec (owner's note, 2026-11-05)

The aunt, the cafeteria, Cairo and the paycheck are training examples. Dev will meet millions of lives that look nothing like them. So:

- **The checks are written for any life**, in general terms (money, time, rest, a pattern that changed, something drifting, a heavy stretch ahead). Only the data differs from person to person.
- **The situation library covers very different people**, not just the owner's week: a night-shift nurse with a kid, a freelancer with uneven income, a parent, someone with two jobs, a student with no job, someone who lives with family. Nothing gets built that only works for one kind of week.
- **The first audience sets the first examples.** Students who work (the owner and the people around them) give the first 30 situations, as broad as possible. Every real user miss adds one. For example: a subscription price went up; three short nights during exam week; a trip on the calendar with nothing saved; a smaller paycheck after fewer shifts; a professor moves a due date; aid or a scholarship lands; textbook week.

## 10. Order of work

1. **Fix what's wrong today first.** Subscription detection misses some of the owner's real subscriptions. Trust-losing bugs come first (playbook), and every money insight depends on it. Use the owner's real list as the test. Alongside: the design fixes from the UX review (section 13), in the other tab.
2. **Dev's brain:** the timeline, the general checks with traces, and the situation library as tests. Start with money + calendar + shifts + school, where the data is real.
3. **Solve, don't just warn:** fixes, the two message kinds, the filter, checking back, Updates as the noticed feed.
4. **Simplify:** fold the mini-apps into the connected model; everyday things one tap away.
5. **Test with 10 students for two weeks.** The checkpoint: do they open it most days and act on what Dev says? If yes, push hard. If not, learn why before building more.
6. **Invent the surface** with the designer (section 8), from what users reacted to. Then build it.
7. **Market the change** (section 14).

### Decided from research (owner, 2026-11-05)

From `docs/research/2026-11-05-what-people-love-and-hate.md`. The owner approved these five. Each is built the way everything else is: "done" written down first, tests first, shipped in small steps, measured after. Nothing is called done until it passes with real users.

1. **Pay-period planning for hourly students** (large, part of step 2). The gap every budgeting app leaves. **Done means:** Dev knows the pay period (learned from deposits, or asked once); shows scheduled hours this period and expected pay as a range, only once it meets ADR 0023's target (within 3% for at least 9 of the last 10 paychecks), labelled and dotted, never in a total; shows what comes out before the next payday against available now; never counts expected pay as money you have; compares every real paycheck with the estimate and learns. Tests: situation 4 plus overtime, a call-out, a raise, two jobs, a missed paycheck, holiday pay. **Measure:** share of users with shifts who open the app within a day of a paycheck landing.
2. **Checking back is the weekly habit** (medium, step 3). Where money apps die, LifeFlow earns month two. **Done means:** every fix Dev makes or suggests gets one follow-up (default seven days later) with the real number from data: "$35 less on food this week", "you kept 3 of 4 study blocks". If the data can't support a number, Dev says what it saw or stays quiet. Never a guess. Follow-ups show on the line and in Updates; the user can turn them off. Tests: a detector, its wording, and a stay-quiet case. **Measure:** share of users active in week five who got at least one check-back.
3. **Shifts are the fastest thing to add in the market** (medium, step 2). The hook for working students. **Done means:** a photo or screenshot of a schedule becomes shifts on the calendar in one step, with a confirm card listing each shift (day, start, end, place) and Undo; common formats work (a grid, a list, a scheduling app's screen); an uncertain read asks instead of guessing; a schedule is never filed as money; "I got a shift Friday, 4 to 10" by text or voice works too; Dev re-checks the week the moment shifts land (collisions, pay estimate). Tests: five schedule screenshot fixtures, no invented shifts. **Measure:** share of new users who add a shift in their first session; photo to saved shifts under 30 seconds.
4. **One plain price** (small, before the 10-student test). A promise none of the money apps can make. **Rules:** one price and one student rate; never a sliding scale; never core features moved behind a new tier after launch; cancel in one tap inside the app (with exact steps when the subscription is through Apple or Google); a reminder a week before every renewal with a one-tap cancel; never bill after a cancel. The pricing page says all of it. Tests: the billing state machine, the reminder, the cancel path on web and iPhone. **Measure:** refund requests and store reviews that mention billing.
5. **Notifications that bring people back every day** (owner, 2026-11-05; this replaces "one push a day"). Other planners get forgotten; notifications are how LifeFlow doesn't. The app runs on its connections, so a push never asks the person to log or type anything in. It gives them feedback on their life: what Dev noticed, what won't work in their schedule, a heads-up, a fix waiting for their yes. **Done means:** every push says in one line what Dev noticed and why, with the fix or the next step; no guilt words ("slipping", "you missed", "you failed"), but being off track for a goal is said plainly, with a way back; quiet hours respected; each push records opened, acted on, ignored or dismissed, per kind; Dev sends more of the kinds this person acts on and less of the ones they ignore; "why did I get this" and "mute this kind" are one tap. Kinds to design creatively and test: today's collisions in the morning, "I fixed this, Undo", money landed or on its way, the week ahead, on or off track for a goal, the schedule posted against the usual work days. **Measure:** the share of people who open the app every day, the act-on rate per kind, and the opt-out rate.

Numbers 4 and 5 are small, and the 10-student test will exercise both, so they come first.

### North star: use your time the way you want and need (owner, 2026-11-05)

LifeFlow changes how people manage tasks, time and their whole life: one simple timeline where a person sees their life connected in a flow and knows the best way to use their time. That means the best time to do a given task, the best use of free time, and what to do to keep a good life in health and wealth.

- **Finding the best time is a core action.** Add a task ("Econ problem set, 2 hours, due Friday") and Dev places it in the best stretch with a one-line reason ("Thursday 3 to 5 PM: free, rested, a day before it's due. I kept Saturday free"), offers one alternative, and gives Undo.
- **Optimizing means the person's way, not the most hours filled.** Best is measured against what the person wants and needs: rest, time with people and days kept free count as much as tasks and money. Dev never fills every hour, and never takes sleep or people time unless asked.
- **Situation data is mostly students (owner, 2026-11-05).** At least 70% of every new batch of situations and simulated people are students. The number of classes and assignments changes, and so does everything else (level, format, work, money, living, routines), but they are students. The other 30% keep Dev honest for everyone else.
- **Fit the person's routine (owner, 2026-11-05).** People go back to their routine, not to what an app tells them, so Dev's suggestions fit the routine first. Dev learns each routine from history (when they study, work out, call family, eat at home, sleep), shows it with its source in "What Dev knows", and lets the person correct it. A suggestion lands inside the matching routine window. It never proposes what's already done today (no gym tonight after the gym this morning) and never puts an activity where the person never does it (no evening study for a morning studier). Breaking a routine needs a one-line reason the person would accept ("only free morning before the exam"). Every situation case states the routine and the tempting suggestion that would break it.
- **Health and wealth are what "a good life" is measured on**, through the strands' real data (rest, movement, food against goals; money available, saved, going toward goals). Dev suggests what keeps both healthy, from the data only.

### The simplicity test (owner, 2026-11-05)

Whatever the surface becomes, it stays the simple place from version 2 of the plan: where people go to see what they have, what they're worth, what they're handling, and what's happening in their life. If a screen doesn't answer those four in plain words at a glance, it isn't done.

### How we work from here (owner, 2026-11-05)

Plan each change together before building. Build in small steps. While building, come back to the owner with questions at every real decision, with pictures where words aren't enough, so the result is exactly what we envision and no time or credits go into the wrong thing. The owner doesn't need to understand the technical fix; they need to see the choice.

## 11. Where this is going

The owner's dream: an AI model trained, at large scale, specifically to understand a person's whole life, connect the dots, see what's coming and help them plan. Possibly built with a partner like OpenAI, and one day on new kinds of devices.

The path:

1. Build on an existing model and make people love the product. Cursor and Perplexity started on other companies' models and trained their own only after millions of people used them.
2. Grow the asset no one else has: the know-how of thousands of real situations, which dots mattered, and what helped.
3. Train a specialized model on that know-how (level 2 in section 7 and ADR 0023), only with users' explicit opt-in, personal details removed, and only when it beats the current system on the tests.
4. Partnerships come to the team that has the users and the best understanding of how a life fits together.

Two things make it possible: **trust** (no one hands their whole life to a company that broke their trust once) and **the brain over the screen** (phone today, then watch, glasses, voice and maybe more; the part that understands a life is what lasts).

## 12. The pitch

> "I'm building LifeFlow. Your bank sees your money, your calendar sees your time, your health app sees your sleep. None of them see that you're spending more on food because no one's cooking at home, or that five midterms right before a flight is a crisis in the making. LifeFlow connects all of it and fixes problems before you feel them. Students first."

One line: **"Every app sees one slice of your life. LifeFlow sees all of it and fixes what's about to go wrong."**

## 13. Design fixes from the UX review (2026-11-04)

Being done in another tab:

- Each tab's loading skeleton matches its own page, shows only on the first visit, and switching tabs after that is instant.
- Buttons cut off at the top and bottom (Today: "Plan my day", "Review my spending").
- Only the green accent; the other colour options removed.
- Light and dark mode done properly, with System (follow the phone) as the default.
- A plain background instead of the light orbs.
- Chat and Updates keep the same layout when switching.
- Hard-coded "Jarvis" replaced with the user's chosen name.
- Performance tests for tab switching and page loads.
- The whole "Add to-do" bar is clickable.

## 14. Parked: marketing

The owner announced LifeFlow on Instagram and posted a lot of content, partly for attention and partly for feedback. After the changes land: show the change. "Here's what we changed and why" is content in itself. Follows `docs/marketing/PLAYBOOK.md`.

## 15. Decisions and open questions

Decided by the owner (2026-11-04):

1. **Name:** "Dev" is only the owner's name for their assistant. Defaults and renaming stay as they are.
2. **Acting alone:** Dev may add study blocks and reminders by itself, with Undo (section 5).
3. **Hourly pay:** predicted, but only very accurately, learned from past pay periods and improving over time (section 4).

Still open:

4. **The Money lock:** money goals sit behind the Money lock today. How do connected insights that touch money show when the lock is on? Suggested: with the lock on, Dev still uses money data, but notifications and cards don't show amounts ("Dev has a money heads-up") until the user unlocks. Lock-screen notifications can be read by anyone holding the phone.

Decided by the owner (2026-11-05, research round 2):

5. **Price:** $9.99 a month; students $5.99 a month. No free first term.
6. **Yes, build:** money on its way (aid refunds, stipends, paychecks shown as expected, dotted, never counted); the student week check (time and sleep, 14 days ahead, a plan for the week that won't fit).
7. **No to "ask before the schedule drops".** Instead, **usual work days**: everyone who works while in school has an availability sheet. Dev asks once when the person usually works (or learns it from past shifts) and always has an idea of their work week before the schedule is posted, shown as expected work and never counted as pay. Example, the owner: works Friday to Monday, classes Tuesday and Thursday, Wednesday off, with extra things added on top. Shifts are the one thing a person may still type in; we keep finding ways to connect them (schedule emails in Gmail or Outlook, schedule apps).
8. **Yes to school accounts with no admin needed,** and people can add school and bank accounts by hand when their bank isn't on Plaid or their school isn't Canvas or Teams (Teams is coming).
9. **Goals:** Dev tells people plainly when they're off track for a goal they set, with a way back. Never the word "slipping".
10. **Notifications are the engine,** not the problem: see "Decided from research" 5.

## 16. The honest hard parts

- **Accuracy today:** subscription detection misses some of the owner's real subscriptions. Fix it before building on it.
- **Messy data:** merchant names like ARAMARK for a cafeteria; Dev must learn them.
- **New users have thin data:** the first week or two Dev knows little, and gets better.
- **Staying quiet** is harder than noticing.
- **Cost:** checks are cheap; the deeper AI look runs about once a day.
- **The bank connection** must be rock solid in production; everything money-related depends on it.
- **Speed:** big assistants are moving into this space. Ship in small steps.

---

## The owner's words (verbatim, 2026-11-04)

### The UX review and the vision

> I just talked to a UX/UI major. He reviewed my app, and he has a couple of things I have to change right now. So he said the skeleton for loading is the same every time I change through tabs, which is wrong. It has to be the skeleton of the page that's loading. The skeleton is loading every single time I switch through tabs, which is wrong. It has to be instant. The skeleton can load for the first time only, but then the tabs have to be instant, like the time between switching tabs. The app is so slow. Has to change something else: a lot of the buttons are cut off at the top and the bottom. On the Today page, Plan My Day and Review My Spending, those buttons are all cut off. You said they're just done wrong or coded wrong. The four-color option in the settings: we don't have four. The couple of colors we're going to delete. It's just going to be green, and it's going to be light and dark mode.
>
> Based on the system, he said something about it. He said it's done wrong, the light and dark system, dark and light mode. He said they're done wrong. I don't know what it is. He said something about the system and how it's supposed to be default or whatever, just to change also, the background where we see a couple of light orbits, we want to change that to maybe a solid color or a simpler background. When I go from Jarvis's chat to updates, the thing changes. Everything changes. It can't do that. It has to stay the same user interface. I've changed the personal assistant's name from Jarvis to Dev, and it still says Jarvis in a couple places in the app. We have their own performance tests on the whole app. He mentioned a couple of different performance tests, like how long it takes to switch through tabs and everything to load, etc. For example, in the to-do section, when you click on the Add To-Do, just the Add To-Do is clickable, not the whole search bar, which is wrong. The whole search bar is supposed to be clickable. I can't remember any other things he said for the design of it.
>
> You have to understand something. We're trying to build an AI model that not just connects your life for the user, but when it connects and the model gets all that data, he finds the problems in that user's life. We want to train our model to see that the user has an exam tomorrow morning, that he works late tonight, that he doesn't have time to review at night, and that that will affect his sleep time because it's connected with his health app. We want to keep on training our AI model to catch every detail in that user's life using timestamps, the time when they coordinate together, or money. He can't afford events that are happening in his life, so he has to cut down on money by finding alternatives, like the example I gave: I was spending too much on food because my aunt was traveling. Because she's traveling, there's no one to cook, because I live abroad.
>
> It's all data that our AI model already has, and he has to take it into consideration when he finds new data. They're all connected together to give the user something to pay for. The idea of the app itself is that the vision is there. The app itself doesn't show it. Users would never know it because of the way our UI and UX are. Just simply because the way our UX is made, it looks like we're trying to remake apps that are perfect at what they do, like the health app and the money app, and any bank account. Or, let's say, a new user would go into ChatGPT and use the finance plugin to track their finances. They would do the same to help organize their classes, maybe, or their assignments. They would go to Apple's Health app or My Fitness Pal for health information. They would use their Apple Calendar or Google Calendar to put down all their to-dos or tasks, or they would use a task app that's way better than Ahead of Us. All of this is stuff that we can do. We can't be an app that has a health app with a finance app or whatever. We are an app that connects them and then sells that connected data to the user. Same as we are, but we shouldn't focus on having a health bar that is just showing exactly what the health is, like the Apple Health app is showing. We can't do that, then we're competing against Apple. No, we're building our own thing. So we have to find a way to make our UX exactly that: a surface where, when all of this is connected, this is what you get. I want you to remember all of this message that I'm sending. This is all updates. This is just me brain dumping everything I want LifeFlow to be. Because a lot of people are creating the Jarvis thing, which is the personal assistant, which is just connected to your life, and they're just the same we have to be different. We're building an AI model that actually understands every user's life and actually finds the gaps in their life and fills them. If he knows I have work stress from working a lot, I have to plan more time to study for my exam that's coming up, so I block time on my calendar. It's all how we implement the AI. It's just called the AI surface: how we implement AI into that idea, how that AI system is going to help that user get all that information and actually fix his life. That's what the user experience is: what every user has to pay for. This is way more than an app that just organizes your tasks, to-dos, or transactions. There are many apps that just show your transactions, but what connects them to real-life events, to how much you're working or how much you're sleeping? How does that connect to your health, what you're eating, where you're eating, or where you're going? How is all of that connected, and how can we provide that user with something he can get good out of? How can how can we benefit the users? Why would they pay for it? That's what we have to do: we have to connect the dots. Have me connect the dots and give it to the user. Connect all the dots with the data and different parts of his life connected to it. other than that, marketing for the app, I just announced it on my Instagram, and I created so much content, and I posted so many content for it, and I don't know why I did that. I wanted the exposure, I wanted the attention, but I also wanted the test you. I wanted user feedback, I wanted to see the testing, there is bad size and good sides to it, but now that I do a change, how am I gonna show the change? How am I gonna market for it? But that's for later, no? We should think about that later. Let's just focus on building, changing the actual app, showing the meaning of it, and showing the vision. Making sure our AI model is exactly what we want, make sure it actually works. Make sure all the designs are perfect, all the design UI and UX systems are perfect. Just how a professional software engineer would do it.

### Simplicity

> I think also we talked about was the simplicity of the design, not just design of it, of just like the first thing you'd think when you see the app. Like, I want to reach my calendar. What's the easiest way to get there? And that's how a user should get there. I want to reach my to-dos. What's the easiest way? I get there. We have to look at it that way. In terms of how the app the layout is and how it functions.

> example, like a lot of the tabs there's too much in them, so like there's to-dos, there's milestones, whatever, we're not trying to do like a to-do app and then a milestones app. Nope, it's just we have to think of the new way of having that data connected to the app, and it shows the user, but it's just not something that's just there, you know. It's connected through data, but not in a way that it just there for the user just to see.

> each data that's connected to that user is like to his life is a variable that changes how the other data relates and connects to the other data. We have to think of it as that way.

### Notifications that understand the situation

> So like a notification, I would want to see as a user, is like, you're low on money, let's say, with all the bills that you usually pay this month, which are, let's say, phone bill, like because he has transactions, so he knows that each month I spend like 30 bucks on my phone, $100 on my phone subscriptions, like Netflix, Claude, whatever, I pay usually, let's say, $200 a month in gas, there's variables to approximate how much I spend each month, and it doesn't change for these certain things. And there's fixed items like subscriptions, and then there's much more than I haven't stated that we have to make sure our model knows. And that all, sets into effect, and there's a

> like a notification would be like, you just spent 2 months, you won't be able to pay off the Claude subscription that is going to come in like 2 days, whatever. Like, just that concept itself, not exactly what I said it, but that concept, you have to think about it creatively, where it would that we could train it to comply with all different situations user users can face. And the model can trace what the data connected to it.

### Simple app or a never-seen design

> So another thing we talked about, me and the UX or whoever designer I was talking to, is like something that is going to significantly change us is either we talked about having a simple app or having making something like that has never ever been seen before and how a user sees his life. In a data and a on a screen, like just a design that has never been seen before, which is like that's just like setting like a big amount of our budget just on design. And a lot of our time just on like design and how the app is we're just creating something that has never been done before.

### Narrowing to personal finance

> Is there other suggestion? Was just make like closing down the app to something that will very good at which is what started it all, which is personal finance. Look at apps like Rocket Money. They have a lot of users. I signed up for it . I didn't find it helpful. I canceled it. And a lot of people did. And we can see that with the reviews on their app and not just their app. A lot of apps like them. So we can focus on one niche and be the best at it. And apply AI perfectly to it. Where it's not too much, but it's just like the perfect personal finance app. And become the number one on it.

> But then we got to talking, and then we have ChatGPT finance, which is a bummer. But then if we're gonna add any niche to it, it's just how we connect the dots with it and other variables in a person's life, which is how we're gonna stick to life flow , but change all that it is. It is.

### Solve it, don't just say it

> Yes, but the users, like, we're not just going to tell the users, okay, you're going to be short, you're short on money, or you're going to be short on money. Just tell them you're going to get your book. No, we have to solve it. That's what they're buying. That's what they're paying money for. So let's see why his money's down. Okay, it's because he's spending way too much on fast food. Okay, we know his aunt. Okay, we know his aunt is away, so no one's cooking. That's why he's spending too much on fast food. So maybe let's make his personal assistant send him a notification on a good recipe he found online to cook up food that's good to take to work that also fits with his health goals to lose weight. And the app sent him that notification for that meal prep without the user doing anything. That is how our AI model should be trained to do on that situation and many different situations. So did you see how many dots it connected? plus those meals I was spending . So if RAI model was smart enough, he would have detected that a lot of those food spendings were at my school cafeteria. So it means I was also spending a lot of money eating in the cafeteria while I was at school. Which is also implementing how school is implemented into this when my classes are, when my lunchtime is, when I can go home to eat, and come back, see all of that, just like different. So for example, it's a 10-minute drive, so I can go home, eat, and come back. For other people, it's not. So that's just different on what the AI system just knows about the user. But the user is not going to tell the AI, I live 10 minutes away. So that's where we have to creatively collect those data from the users by asking them. So we would not ask them, but I don't know how you do it, but all of this is I don't want to have a breach in privacy and policy, but we can think about

> And then some situations, he doesn't even have to act. Just sending a simple notifications on some things the assistant noticed that can help out the user if he knew. Is very important. As notifications, maybe if it was a tab integrated into the app, just that, training the AI model just to find all those things that can, connect all the dots, find dots, connect them. And know what will help the user and what will not. Important thing is he has to know what will not help the user and exactly what is the benefits of connecting them and what dots to connect for what and how to use all the data that's given to it properly. And manage it perfectly. Will we be able to even train our AI model like this or no? What I'm saying even making sense or

### Seeing what's coming

> It also has to be like very smart and like knowing of like what's coming for that user. Those thoughts to keep all those variables into consideration when giving anything out to the user. So like, for example, like I said, let me think of something. Yes, for example, I booked my flight to Cairo on December 10th, on the morning. But I have like 4 midterms or 5 midterms due the week before. So that doesn't mean anything on paper. That just means I have to be at the test place at those times and then leave and then go to my flight. On paper, there are different timings, so I'm good. But it doesn't show that there's so much preparation before flight. A lot of things I have to buy, a lot of things getting ready, whatever it takes me like at least for me, it takes me like a week or 2 weeks to do all the tasks for me before traveling out. Or before traveling. Plus studying for like 5 midterms. Which is all that data that's connected to my app. So he knows I have a flight on that date. He knows that I have those courses. And that I have exams on those days. But he has to know that there's a crisis coming up. On December 10th. Or the week before. Not a crisis. But I mean like there's something like time management has to be done for that time, you have to plan for it.

> Plus that I'm going to be like working there then. Like I'm not like I'm going to stop work is going to stop one day before I travel. So I'm going to have work probably like the day before my exam, the day on my exam. So, and those things, the app won't probably know before like 2 weeks before, because that's when my schedule drops. And that just has to get added to all of it.

> But just don't assume that I'm going to study 6 to 10 hours of studying each because [one personal remark left out]. Like, I'm going to probably study 30 minutes for each exam. You know, and I'm not going to trip about it. And something else, some of those exams are online exams. So they're very flexible on when they are. Like, these are all variables that you have to think about and that model has to be trained on. Or has to know.

### The dream

> Okay, at this, like, my future goals on, like, what I dream about this to happen, I would want to create an AI model that's trained, like, big time trained. Like, I'm talking, it's a collaboration with fucking OpenAI. That's fucking big. Or with fucking Elon Musk putting it in Neuralink. That's fucking big. It's a model AI that's strictly trained to connect all of the life, like the person's life, connect all the dots and predict, but like help him plan for things coming up and like exactly what I was describing, but on the big scale, you know?

### The surface

> Yes, so it also has to be on a surface that hasn't been seen before. So like I said, when people are opening my app, the UI and UX of it are just not what they expected for an app that's what it's meant to do. It just looks like connecting apps like the Apple Health app changing the UI of it and putting it in my app. Putting the calendar, changing it and putting it into the app. Putting it the bank, changing the design of it and putting it in the app. That's what it looks like. But we have to change it to a platform or UI surface. I don't know what it's gonna be or look like, something it's gonna we can't imagine now. It has to be created. Creatively, something that has no reference, I think, but that will change the game of how people will manage their life.

### Answers to the open questions

> dev is only my personal assistants name but to make it easier to refer to it, 2. it can, 3, if its fonna be predicted it has to be done perfectly, because our model rn is not even catching all my real subscriptions accurately, it will be predicted but we will use it in a very accurate way where our ai model sees past weeks and pay periods, how much i was scheduled and how much i got paid to calculate that, so that all becomes better over time, so he will see that when usually ali gets scheduled 25 hours hegeyx paid x, when he gets scheduled x he gets paid x, because there are differences in how long he clocked in, plus if he called out, plus taxes

### What the app knows vs what the user sees

> we have to understand there's a big difference between what the app knows and what, like what the app knows, what's connected to it and synced to it daily, and what the user is seeing. The user doesn't have to see all the data that's synced to him. So for example, I can tell the personal assistant that I have a goal to budget, but I don't want to see that I'm 50% in my budget goal and there's a UI setting for it and there's whatever. When I do a UI setting that shows how much of my goal is done, that's exactly doing another money app. No, we have to implement it into the user's life through the personal assistant in a way that has not been done before. So it's not just showing the user what he has, it's like using what he has to better his life.

### Examples, not the spec

> I want to make sure that our AI model knows that this is just my, like, just examples that we're going to be training him on. My own traveling, coming back, school cafeteria, that's all examples we're training him on. But there's going to be millions of examples that he's going to face with users that are connecting to him. Maybe not train them on the millions of ones right now, but make sure he's going to be compatible with mainly a lot of what's going to be connected to him. Like, the people I know, like, they all work similarly to me, so I'm just trying to give him examples as broad as possible to be able to connect everything.

### The line is the main thing, not the only thing

> I want like all the data that's also connected to it to be able to be viewed simply by the users, by them just like, I don't know, clicking on the line maybe, on their money, seeing all their money, you know, because seeing all their money, what came in, what came out in total is very crucial to my app too. Like see the total of the stuff, like total, like all, see all your classes in one button, see all your assignments in one button, with it not just being the flow of the line. Like that should be the main thing, but it shouldn't also be the only thing. So that if users want to see all the money coming in, all the money coming out, they can see that. But it's not there, like it's not a whole tab, it's not a whole page, and it's not there to make it overcomplicated, but it is accessible very in a very simple, creative way, implemented to the idea we already have.

### Digital life and real life

> We have built the app based around everything except like social life, family time, spending time on your own, chilling, doing nothing, studying. Like, I don't think, does our app understand that there's all these factors to a person's life? A person's life is way more than just that. I think if we're going to create a timeline, it's not just an app where it just connects, these things have to be implemented. The person is just not what digital life is. So we have to split between digital life and real life. So the app is connecting your digital life together so that you can perfectly organize it with your real life. Digital life as in all your finances that you see on your phone, all the work schedule, everything that's online and clicked to your phone that you like use your phone to organize and manage is all in one place in the same idea we have created. And then there's the real life where you're just out, maybe you took a walk, maybe you just sat with your cousin, maybe you just chatted on the phone with your friends, you scrolled on TikTok, you went to the bathroom. That's all in that timeline, no? If we're not going to add it to that much detail, we don't have to, but the app has to understand it, that there's a whole life to that. It's just not only that. There's a lot of, not just factors, but things going on other than the digital data it has.

### The promise

> And you should be able to implement it perfectly. So that this whole life, this whole app is organizing your digital life and real life together, so that you can find the perfect way to balance both and not miss anything. Because we value the user's time, we value everyone's time. You know how important it is to not miss anything, to organize your life and time, and know where your life is going and how it looks like and where it's headed.

### Each line shows its real data

> And we want to implement how that line looks, it's on how it's doing. So if you're like low on money, the line is thinner. If you're making, if like through time you made more money, the line gets thicker through time, then it becomes thinner, like thicker, thinner, you know, for like net worth, for example, for money. For school, you can just add like the pressure of it, like how, like when you have classes, like if it's like you mentioned it before, how the lines are different based if it's like a dotted line, whatever. We want to implement that into the flow of it and how they're all, each and different one is. I like the idea of being able to see each line on its own and how it's doing. That is a good thing, but also make sure it's like moving, it's 3D, is the new concept, it's accurate to what the real data is. We have to make sure each line accurately shows the data and it's just not a made up line showing a life.

### Real life means what matters

> and its not gonna be the small silly things like wall from cafetria or walking home from campus thst very dumb, we are a diffrent level of organization

### Health in full, every connection a variable, and the form

> Yes, but the data from Apple Health is gonna affect the health braid. So your health, how you're doing on your health. So maybe in the future, users can attach their medical treatments and what meds they take and everything else related to their medication so that we can have maybe a health bar or just in general, how the health is doing based on maybe movement and sleep and exercise and the type of food that we're eating. like calorie intake, or when we set goals for calories, that implements that. And we set goals to going to the gym, both of these connect. You have to see all of those connections. You have to think of every single connection of every single thing that can be connected in our app, plus anything else we're going to start connecting, like adding any additional connections. That will be extra variables to how all the lines change and move.

> And it's not just a braid. Let's think of it as a timeline. What's the best way to portray time with events happening in it in the same way we are in it? So like, I like how it's braids. We can maybe, I was thinking heartbeat, like strains of DNA maybe. Those are just some concepts I was thinking of. Maybe we can discover some more concepts. But I do like that it's different lines. It looks complicated, but when you hover over it or touch it, it simplifies and it shows you exactly what everything is. And when you want to know something about your information, it's easy, accessible, and simple.

### Still too complicated; audit first

> I still think it's very complicated. I'd like to keep the three options for now. I'll keep them in the app. I'd like to see how they turn out. Because we're going to be editing, I think, each and every one of them. Because I still don't feel like the lines are understandable enough. I think the problem is not with how the lines are shown, if it was a helix or DNA or whatever. But I think it's the problem itself is with what the line represents. It's not very understandable. And the graph itself is not very understandable. Scrolling through it, it's like not very clear what this is. It's not very clear that it shows a timeline. Back to now, back to today is overlapping with the time of where I'm scrolling. And where I'm scrolling, it's like very hard to know when is this and what's happening at that point, because it's not the easiest way to process it. We want the easiest way to process information as soon as you open the app. Like, I open the app, it's displayed in this way, but it's so simple that any person can understand that this is their life, this is what's happening at this moment for each aspect. We want to make sure that each piece that is connected is like shown in the best way possible. We need to keep on testing. I want you to audit the app before making changes so that you know what things are also broken and need to be fixed and changed, so that we can fix everything at once.

### Busy, and not the most useful information

> the app itself, with everything going on, is like very busy. Maybe it's because we tried fitting it all on like all that in one page, but there is a way to make it less like simplified, but still showing all that info. And I think we're not showing the most optimal info. I think there's a lot of improvement left to be made, but it's all gonna happen once you keep on reviewing the app and keep on working towards the vision we are working for.

### Which model, and don't lose the simple place

> And are we sure that using Fable on Macs is the best way to go on with this? Because, I mean Fable on Macs, that's what I said. Macs. Yep. So, is it the best thing to use for this, or should we go back to Opus 5.5? I really want to make sure we're coming out with the correct output we were looking for. We want to create something life-changing, something that will change the market on how users are connecting their life and seeing it in a way that they understand it and know how to do a change, know what's wrong with their life and fix it using the AI. We still don't want to lose the vision that we had on the version 2 of the app, where it's still very simple. It's still where a place people go to see what they have, see what they're worth, see what they are handling, see what's happening in their life.

### Sketch round 1 feedback (2026-11-05)

> So if anything, it's going to be B or C, definitely. But I still don't believe that this is the best way to show the data. Let's brainstorm more ideas on the design of how we're going to show the timeline of that user. I want it to be like editable. Users can like clearly see it. It's like the thing I hate most about this is the reading time, number 3, as well as where real life lives is not at all what I wanted, like not at all the way I wanted it to be implemented to the digital life.

Outcome: opening screen is B (line first, words under) or C (calmer braid, words under). Rejected: the time band with a moving cursor and an edge arrow; real life as a separate lane or as background water. Next: brainstorm other ways to show time and to merge real life with digital life, sketch the owner's picks.

### Confirmed: real life is the timeline (owner, 2026-11-05)

The hours a person actually lives (asleep, class, work, home, with people, a day off) are the timeline itself; digital life (money, deadlines, bills, pay, health data, Dev's notes) attaches to the moments it touches. Time is read in words (named parts of the day, "Tomorrow morning", "Friday night"), with the person standing still at now while life flows past. Five rows in words sit under the visual and follow the moment in focus. Being sketched as six live concepts on the same data: life line, braid around you, DNA, the road, day ring, day strips. Motion must be staged (not everything at once) and smooth.

> yes this is what i meant i want to see it in a couple of ways, even ways implementing the braid and the dna one. All of these designs when moving and changing to not all be shown at the same tume must be very smooth and in a flow. Also the 5 ways to see it, i want to see all

### North star

> In the end, we want a tool that changes the idea of how we task manage, how we do our tasks, how we manage our lives, how our timeline, how we use our time wisely. Our users have to use this app to use all of their time exactly how they want to and how they need to. Optimizing time is very important for time management, and this is what they are going to get from this. They're gonna control their whole life and manage it through one simple timeline, and the concept of it has to come to the simplicity of it, of how easily it is to see your life connected in a flow on a timeline and know what's the best thing or the best way to use the free time you have, or the time, or what time is the best to do a certain task, or what things would be optimal for you to do to maintain a good life in health and wealth.

### Fit the routine

> Yes, but also we have to know what the user is, what the user's normal life looks like, in order to suggest. So a normal user would always go back and do what his normal routine would look like, not what the app is telling him to do. So we're trying to fit what the app is telling him to do as close to his routine. So let's say he has a gap on free time from like 8 a.m. until like, let's say, sleep. We can't suggest that he should study in that time if he only studies in the morning. Or we can't suggest that he goes to the gym when he went to the gym in the morning that day. You know what I'm saying? We have to make sure it's very smart on how it catches those things and recommends the correct thing to do in the right time.

### What are we training? (2026-11-05)

> Yes, but what exactly are we training? Like, who are we giving this information to? Are we just giving it to the OpenAI API? Or what are we doing? Like, how are we putting those data in changing the app if it's, like, just going back to the OpenAI API? That's why I wanted to train my own AI model.

> I don't understand your question, but I do know that you're gonna do the most optimal and best thing. I trust you, man.

### Mostly students (2026-11-05)

> for all the next sets of data, I want 70% of the data. The default of them, they are students. The amount of classes and assignments does change, plus everything else, but they are students.

### Notifications, work days, price, goals (2026-11-05)

> push notifications, they're not telling us to log stuff. No, we don't, like, the app is perfectly operatable without the user. The user is only there to fix his own life, like to see what the personal assistant suggests as a fix, and he's there to approve the fix on his calendar and his timeline. But push notifications are not the problem. Nope, we need push notifications to give the user feedback on his life, on what was noticed, what is like not gonna work in his schedule, like, and just heads up and stuff, more like that. We have to think very creatively with the notifications to bring back those customers and users every day to our app and not forget it like those other planners. I think the target is with the notifications. It's not with the with stopping the notifications.

> I agree on one and two, but three is a no, because everyone that has a job in school already has like an availability sheet, which is something we can maybe ask the user on when does he usually work, so that the app would know before we would like send the schedule, because schedules are not synced and they are manually, but the app always has to have an idea of when this user usually works. Because for example, for me, I work Friday, Saturday, Sunday, Monday. On Tuesday, Thursdays, I have classes mainly, and on Wednesdays are my day offs.

> Yes, school accounts also could be added manually as well with bank accounts, because not everyone's bank is on Plaid and not everyone's school is Canvas or Teams, because we will be adding Teams soon. No, students already have like 50% off with the pricing. So it's gonna be $9.99 a month, and I think $5.99 for students.

> I don't like slipping, the word slipping. But yes, it is supposed to punish them, not punish them, but tell them that they're not on their track for their goals.
