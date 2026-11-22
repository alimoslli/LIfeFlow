# ADHD first: look, flow, marketing and the skyling's one question

Date: 2026-11-22. Written by the market researcher (read-only on the product). Nothing was changed in the app, the plan, the vision or the marketing files.

## 1. Question

What do people with ADHD (students first) need from LifeFlow's look, its flow, its marketing and the skyling's one personal question a day, and what must we never do?

## 2. Short answer

- **The owner's four decisions hold up against the evidence.** An optional focus setting with no diagnosis words, a calm base with bright rewards, the landing page plus TikTok and Reels, and one specific question a day all match what people with ADHD, designers and the law point to. Nothing I found argues for saying "ADHD" inside the app.
- **What wins attention and keeps it is the same thing: less to hold in your head.** One next step, a first step small enough to start, warnings before a switch, a fresh start after time away with no pile, and rewards for real things done. The apps people with ADHD praise (Tiimo, Structured, Goblin Tools, Finch, Focusmate) each do one of these well. The complaints are mostly billing, bugs, and the app turning into one more chore.
- **Two things in today's plans work against this, and one good thing should stay fixed.** The coming focus timer plans a fixed 25 minutes, and a study of 27 neurodivergent students found fixed timers a poor fit. Sound can only be switched off in a hidden browser setting. Today v2 already dropped the idea clouds from a phone's Today and their 9-second drift was not brought over; the web accessibility rules say moving content that starts by itself needs a pause, so it should stay that way.
- **The skyling's feelings question is the biggest risk and the biggest chance.** A question tied to a real event ("How was the Target shift?" with the star) is what people say they value. But a skyling that checks in on feelings every day may count as a "companion chatbot" under California's new law (SB 243), which requires a crisis plan. LifeFlow takes users from 13. A fixed crisis path in our code, and no feelings questions for under-18s, should come before the first feelings question ships.
- **Marketing has hard lines.** No treatment or symptom claims (the FTC wants trials for health claims), no ads that say or ask whether the viewer has ADHD (Meta's rule), no targeting by health (TikTok's rule), no "ADHD test" content, no "superpower", and creators always disclose paid posts out loud and on screen.

**How sure I am.** Every page below was read through search-result summaries on 2026-11-22. The App Store, arXiv and PubMed Central hosts were blocked in this session, and Reddit did not come up in search. So there are no "N of M reviews" counts this round. Where I count, I count sources, and I say so. Tags: **[S]** strong (an official page, a law, a regulator, or peer-reviewed work several sources agree on), **[M]** medium (one reputable source, a study with a small sample, or a reputable industry survey), **[W]** weak (a blog, a single anecdote, a listing). **(C)** after a source means the publisher sells a competing product.

## 3. Findings

### Who we are talking about

**F0. Students with ADHD are a real share of a campus, and they say starting is the hard part. [M]**
- A review estimates 3% to 7% of college students meet criteria for ADHD, some without a diagnosis. An analysis of the national college health survey (over 82,000 students, 75 universities) found self-reported ADHD at 7.5% and 8.6% in its two largest groups. I could not find the survey's overall rate.
- Undergraduates with learning differences or ADHD describe trouble "gearing up" to start tasks (a 2023 phenomenological study). Interviewed university students with ADHD name procrastination, last-minute submissions and stress (a European Psychiatry abstract). A Trinity College Dublin project argues that late penalties punish executive function difficulties rather than choice.
- A CHI 2026 study co-designed with university students with ADHD found they want an AI that pulls tasks out of chat threads into a list, uses past data to calibrate time estimates, breaks big tasks into steps, and acts as a "virtual study companion" with emotional support. The authors note these are design ideas, not proof that anything works.
- **Map:** this is close to a description of the skyling. It supports "Start it with me", "Sit with me" and time estimates from the person's own history (vision section 4, "learn the person"). It also says the first users with ADHD will be students first, which matches the vision.

### Part 1. Look and layout

**F1. Clutter costs attention, but "too plain" can bore. A calm base with colour fits. [M for clutter, W for "too plain"]**
- The W3C's cognitive accessibility guidance (COGA) says people with thinking, memory or attention difficulties do better reaching content in few steps and in small sections. Several ADHD design write-ups say clutter divides attention and recommend predictable, consistent layouts.
- Against over-minimalism: a UX accessibility article says a design that is "too minimalistic can be understimulating" and suggests bold colour and bigger text, "without blinking or motion". An industry study by Understood and BBH (2,000 respondents plus 10 interviews, April 2026) says colour and pattern are "essential tools for communication" for ADHD consumers. That study is about brands, not app screens.
- Apple named Tiimo its 2025 iPhone App of the Year and described it as turning "chaotic calendars into a timeline of soothing colors". Structured is praised as "clean" and "calmer" for people overwhelmed by visual clutter.
- **Map:** LifeFlow's sky (soft colour that changes with the real time of day, one note, the line) is the "calm base with colour" the evidence describes. The bright part should be the rewards (a star, the sun), not the resting screen. This supports "show only what helps" (vision section 8).

**F2. Motion that starts on its own is the main risk in today's look. [S for the rule, W for ADHD specifics]**
- WCAG 2.2.2 (Pause, Stop, Hide): moving or auto-updating content that starts by itself, lasts more than five seconds and sits beside other content needs a way to pause, stop or hide it. WCAG 2.3.3 (AAA) says motion started by an interaction should be possible to turn off, and lists `prefers-reduced-motion` as the way.
- A parent checklist for ADHD-friendly games asks for minimal flashing, shaking or loud effects, and backgrounds that do not compete with the content. I found no study measuring motion and ADHD directly.
- **Map, what LifeFlow does well:** first-paint motion is CSS, GSAP honours reduced motion, celebrations are short, rain and lightning sit behind the words and stop under reduced motion, lightning flickers under 3 times a second (CLAUDE.md "Motion" and "Insight clouds").
- **Map, what to keep from coming back:** the clouds branch had the next idea cloud drift in every 9 seconds, pausing only while touched. That is auto-advancing content with no pause control, moving while the person reads. Today v2 (owner, 2026-11-16) removed the clouds from a phone's Today and the drift was not brought over (no timer in `idea-clouds.tsx`, checked 2026-11-22). Keep it that way on the skyling's page and a laptop's bar too. Separately, the owner chose to let skyling reactions play under reduced motion (2026-11-12). Reactions are short and follow the person's own action, so they fit 2.3.3's spirit better than the cloud drift, but they should stay short and never flash.

**F3. Sound helps some and hurts others. It must be easy to turn off. [W]**
- One reviewer of a focus app said sound effects helped because they grab attention without watching the screen. Endel, a sound app, says "sound perception is a very subjective matter". A neurodivergent newsletter praised Finch for letting people turn off sounds and animations.
- **Map:** LifeFlow's chime follows a tap and a phone on silent stays silent (`sound.ts`). Good. But the only off switch is a browser storage value, not a setting a person can find. A visible switch is needed.

**F4. Special "ADHD" or "dyslexia" fonts do not help. Text size does. [S]**
- A 2026 meta-analysis in Annals of Dyslexia found dyslexia-friendly fonts had "no consistent or reliable effect" on reading speed or accuracy. A 2016 study found OpenDyslexic reduced speed and accuracy, and none of the children preferred it.
- **Map:** do not add a special font. LifeFlow already scales text with Settings (rem sizes, `mobile.spec.ts` at Extra large). Keep that. Short lines and plain words matter more than the typeface.

**F5. Novelty pulls people in for about two weeks; a planner that needs upkeep loses them. [W, but consistent]**
- Across ADHD planner write-ups, the same pattern: a new system works for a few days or a "two-week honeymoon", then needs habit and memory, which ADHD makes harder. One vendor writes that an app that is closed "might as well not exist". These are vendor blogs (several (C)), and none is a study. The pattern matches the founder quote in our 2026-11-05 report: students "download, finish onboarding, and then... nothing".
- **Map:** LifeFlow's answer is already in the vision: the app runs on its connections and the person approves. Novelty that is built in and predictable (the sky and the skyling change with the real sun, five characters through the day, a new cast star each time) is safe novelty. Novelty that needs input (new lists to fill in, new modes) is not.

### Part 2. Navigation and flow

**F6. Starting is the hardest step, and a first step small enough to begin helps. [M]**
- Goblin Tools' Magic ToDo splits a task into smaller steps with a "spiciness" slider and is the most consistently praised starting tool across the sources I read. Complaints: time estimates can be wrong (dishes and laundry given "5h+"), breakdowns can be "excessive", the app can be buggy. Price: the website is free; the iPhone app is a one-time $2.99 in the US, and the listing says purchases keep the site free and ad-free.
- **Map:** supports backlog item 1 ("Start it with me", first step from our code, no AI). The "excessive breakdown" complaint supports showing one first step, not a list of ten.

**F7. Fixed focus timers fit badly; shame after "failing" a timer is common. [M]**
- A University of British Columbia team interviewed 27 neurodivergent post-secondary students (ADHD, anxiety, autism) who use blockers like Forest, Freedom and Screen Time. Findings: focus "doesn't work like a faucet"; some with ADHD take longer than a 25-minute block to reach deep focus; some with anxiety find timers stressful; several feel shame when they fall short. The authors suggest task-based rules ("until this is done") rather than fixed times.
- **Map:** backlog item 1 plans "Keep going (25 more minutes)". This finding says the second stretch should not be a fixed 25: let it run open-ended and use item 4 (the check-in at the planned time plus 20 minutes, and before the next class) as the only gentle stop. Allow a count-up view for people who find a countdown stressful. Never a line about stopping early.

**F8. Time blindness: the fix is information at the moment it matters, not more alarms. [M for the idea, W for numbers]**
- The clinician who named "time blindness" describes ADHD as a problem of doing what you know at the right moment, the "point of performance". Secondary sources say help works best where and when the task happens. Psychology Today notes not everyone with ADHD has time blindness.
- People tune out a single repeated alarm: "More of the same stimuli doesn't increase attention. It accelerates habituation." (a vendor blog (C)). Our notifications report already found ADHD users snooze or ignore the same reminder.
- For hyperfocus, one source suggests spaced warnings (20, 10 and 5 minutes before a stop). This is a blog recommendation, not a tested method. ADDitude: a switch feels worse "when we are suddenly yanked to it without warning".
- Numbers I saw and will not use: "80% of people with ADHD have time blindness" and "underestimate by 40%" had no traceable source.
- **Map:** supports backlog items 2 (leave-by warnings), 4 (hyperfocus check-in) and 5 (wording that rotates). It also supports making time blindness one option in the focus setting, not an assumption for everyone.

**F9. Out of sight is out of mind. Something persistent beats a push. [W]**
- An adult on an ADHD forum keeps their list on the phone because "out of sight, out of mind" is a constant problem. Vendor pieces argue widgets and the lock screen work better than notifications because a dismissed push is gone.
- **Map:** the one next thing should be visible without opening the app. That is the home and lock screen widget in `2026-11-09-widgets-and-watch.md`, which needs the native app. Until then, Today's first line (the 2026-11-16 report's proposal 1) is the persistent place.

**F10. Coming back after days away: a fresh start, no pile, no count. [W, consistent]**
- Apps built for ADHD advertise exactly this: one resets unfinished items each night so nothing rolls over as overdue; one has "no streaks, overdue badges, or red counts" and greets you warmly after a missed week, asking whether to start over; one calls its streaks "forgiving by design". A comparison piece says Todoist's overdue display can trigger shame. Finch's bird takes no penalty when you skip a day. These are listings and vendor claims, not evidence that the features work.
- A developer's account: streaks "gave me anxiety" and "'You missed 3 days' messages made me feel guilty."
- **Map:** supports backlog item 3 (Back on track) and the existing rules (no streaks, no "missed" or "overdue"). Stars are already capped at the last 48 hours, so a return never floods the sky.

**F11. Long onboarding before any value loses people, and hidden prices anger them. [M]**
- An app teardown counted Inflow's onboarding at 47 steps before a hard paywall with a 7-day trial and flagged likely drop-off. Trustpilot reviewers say they were charged for a year after forgetting the trial, could not cancel inside the app, and that the price was not shown until after giving personal details. Clarify, another ADHD app, also puts a long quiz before a hard paywall.
- The Understood and BBH survey says ADHD consumers are 50% more likely to abandon a purchase when a site is hard to navigate, four times more likely to research heavily before buying, and 90% stay with brands they like to avoid the effort of switching. [M, industry survey]
- **Map:** LifeFlow's welcome counts its steps ("Step 1 of 3") and lets the skyling choice wait. Good. The focus setting must not become a quiz in that flow. The one plain price rule (vision, decided 4) already bans trials that turn into a yearly charge.

**F12. Body doubling: loved, popular, barely studied. [W for effect, M for demand]**
- Focusmate pairs strangers on video to work. Product Hunt shows 4.9 from 96 reviews, with strong praise from people with ADHD, remote workers and students. Free plan: 3 sessions a week; paid figures vary by source ($8 a month yearly, $12 monthly in one). CHADD says there has not been significant research on why it works. A VR study with 12 participants with ADHD tested human and AI body doubles; it notes another study found no significant effect. A CHI 2026 short paper proposes a framework, not results.
- On TikTok, people with ADHD host live "co-working" streams; one weekly host had 88,000 followers (Fortune, 2023), and the Daily Dot covered the trend in 2022. A psychologist quoted by Grazia warns against treating it as a "miracle hack".
- **Map:** supports backlog item 6 ("Sit with me") as a low-cost, no-network option, and it is a marketing format (Part 3). We must not claim it works.

**F13. Rewards: tie them to real things done, not to chance. [W]**
- Popular sources describe unpredictable rewards as the strongest hook and warn that people drawn to novelty are most exposed. A review on impulsivity in ADHD covers "delay discounting": a preference for smaller rewards now. I found no study comparing predictable and random rewards in ADHD apps.
- Finch's reviews are the closest real-world signal for a character: people with ADHD say the pet makes them feel cared for and they keep coming back; the complaints are that pet care can feel "like another task" and that updates disrupt routines.
- **Map:** LifeFlow's rewards are already right in kind: a star the moment a real class, shift, plan or tick ends, a sun only when earned, never from a guess. That is an immediate reward for a real act, which suits delay discounting, with variety in the look (cast stars never the same twice running), not in whether you get one. The trap is the cloud collection becoming a chore. Nothing should ever need tending.

### Part 3. Marketing and graphics

**F14. How the ADHD apps won attention. [M for Tiimo and Structured, W for the rest]**
- **Tiimo:** an agency case study says its TikTok ads used creators who share the audience's daily struggles, and reports over 45,000 downloads from TikTok in nine months (the agency's own claim). Tiimo's own seed announcement says it grew mostly through word of mouth and community partnerships. It interviews neurodivergent creators on its blog and was an Apple Design Award finalist for inclusivity in 2024.
- **Structured:** a Starter Story profile says it grew mainly through App Store search, with users sharing it on social media; an r/adhdwomen shout-out with 440 votes is listed. No creator campaign found.
- **Goblin Tools:** free on the web, no sign-up, a cheap one-time app. Word of mouth.
- **Focusmate:** a free tier and strong reviews from people with ADHD and students; CHADD covered it.
- **Inflow:** a CBT-style program with coaching, "Manage your ADHD" in its store name, and the heaviest billing complaints in this set.
- **Routinery:** praised by ADHD users for timers that put them "into action mode"; complaints are bugs after updates.
- **Count (sources, not reviews):** of these 7 apps (Tiimo, Structured, Goblin Tools, Focusmate, Inflow, Routinery, Finch), complaints about billing or price appear for 3 (Tiimo, Inflow, Structured's Pro limits from our 2026-11-05 report), bugs or reliability for 4 (Tiimo, Routinery, Goblin Tools, Structured's sync), and "it became another chore" for 1 (Finch). Praise for one specific help (start, see the day, someone beside you, a character that cares) appears for all 7.
- **Map:** the winners show one real moment from a real life and let the product do one thing well. That is the format for LifeFlow's TikTok and Reels: a student's real afternoon on the line, the essay they could not start, the first step, the star.

**F15. ADHD content online is mostly wrong, and the community knows it. [S]**
- Of the top 100 #ADHD TikToks (2021), 52% were misleading, 27% personal experience, 21% useful (Canadian Journal of Psychiatry, 2022). Of #adhdtest videos, 92% were misleading and drew most of the engagement (Australasian Psychiatry, 2024). A UBC study (PLOS One) found fewer than half of symptom claims matched diagnostic criteria, about 20% of creators shared credentials, none were licensed psychologists, psychiatrists or doctors, and more than half appeared to have a financial incentive. Heavy viewers estimated ADHD at nearly 30% of people, against about 5% to 6%.
- The "superpower" framing is criticised by ADHD writers as reductive and as dismissing real struggle; some defend it. Understood's podcast distinguishes creators who earn from education from "grift".
- **Map:** LifeFlow should never post symptom lists, "signs you have ADHD", tests or "superpower" lines. It should show what the app does for a real moment, and let creators speak only about their own life.

**F16. The legal and platform lines. [S]**
- **Health claims:** the FTC's Health Products Compliance Guidance (December 2022) covers health-related apps and expects randomised controlled human trials for health benefit claims. Apple's guideline 1.4.1 gives closer review to apps that could be used for diagnosis or treatment and rejects unvalidated accuracy claims.
- **Ads that assume a condition:** Meta's ad standards ban content that "asserts or implies personal attributes", including medical conditions. A marketing guide gives "Dealing with depression?" as the kind of line that is rejected. "Do you have ADHD?" and "Your ADHD brain..." fall in the same place.
- **Targeting:** TikTok's anti-discrimination ad policy lists "mental, physical, genetic, or emotional health" among the groups advertisers may not wrongfully target or exclude. TikTok also bans ads that claim to cure or prevent conditions, and removed two Cerebral ads in 2022 for its body image rules.
- **Creators:** the FTC's 2023 Endorsement Guides update applies to TikTok and Instagram. The FTC's health influencer warning letters said platform "Paid partnership" labels are "too easy for viewers to miss" alone; the advertising self-regulator found TikTok's "creator earns commission" tag inadequate and asked for disclosures in audio and on screen. Virtual endorsers count too, so a skyling "recommending" the app in an ad is an endorsement by us.
- **Health data and ads:** the FTC fined Cerebral $7 million in 2024 for sending the health information of about 3.2 million people to platforms including TikTok and Snapchat through tracking pixels, and for hard cancellation. Mozilla's 2023 review gave 59% of top mental health apps a privacy warning; it said BetterHelp and Talkspace pushed people through intake questionnaires before consent and used the answers for advertising.
- **Map:** these become rules (section 5). A focus setting answer or a feelings answer must never reach an ad platform, an analytics event or a pixel.

### Part 4. The skyling's one personal question a day

**F17. Specific, event-linked questions beat generic mood check-ins, and long check-ins become chores. [M]**
- In an 8-week study with 20 college students (MindScape), participants appreciated AI prompts tailored to their context over generic ones (summary; I could not read the comparison numbers).
- In a mood app study, some people called check-ins a "chore" and others said they became a "rhythm". An interview study of 22 mood-app users found they wanted the app to do something with the data (suggestions, interpretation), and that tracking once a day or less left them unsure it captured their real mood.
- In experience-sampling studies with students, the number of prompts a day mattered less than how many questions each prompt had: longer check-ins cut answers, frequency was mixed. Answer rates fell from 88.9% to 70% over 14 weeks in one student study.
- In young adults, being stressed or upset at one prompt predicted missing the next.
- **Map:** the owner's instinct ("how are you feeling after your shift, here's your star") is what the evidence favours: one tap, tied to something real that just ended, and followed by something useful. A missed answer must never be read as a mood, because people skip most when they feel worst. This builds on vision section 6, item 2 ("ask one question at the right moment, as a tap").

**F18. Memory and warmth raise disclosure, which is a duty, not a growth lever. [M]**
- A study of 65 people found 2,050 chatbot memory entries, most created by the AI on its own, not by the user.
- A King's College London study found people shared more personal information with chatbots that first showed empathy.
- A UK study of 491 people found worries centred on who else sees it, misuse, losing control, and unclear deletion.
- **Map:** LifeFlow's rule that proposed memories never reach a prompt until approved (CLAUDE.md, memory writes) is the right base. A feelings answer should be today-only by default, and become a memory only when the person says so. The skyling's warmth must never be used to get more data than the plan needs.

**F19. Feelings questions may put the skyling under companion chatbot law. [S for the law, opinion for how it applies]**
- California's SB 243 (signed October 2025) requires operators of "companion chatbots" to keep a protocol that stops suicide and self-harm content, refers people to crisis lines, is published on the website, and from July 1, 2027 is reported yearly. It allows private lawsuits, with $1,000 per violation. Sources differ on the start date (January 1, 2026 in one, July 1, 2027 in another).
- Bots used "only" for customer service, operations, productivity or technical help are excluded. Law firms warn the word "only" matters: a bot that also meets social needs, for example "regularly checking in or attempting to build a relationship with users", may be covered.
- Character.AI and Google agreed in January 2026 to settle lawsuits over teen suicides and harms; Character.AI had banned under-18s from open-ended chats in November 2025.
- A California board's 2026 agenda item proposed a mandatory crisis pause after two credible crisis expressions within 72 hours, pointing to 988. I could not confirm its status.
- Today, LifeFlow mentions 988 only inside one skill (the "overwhelmed" skill, which runs when the request routes to it). Nothing in our own code catches crisis words on every message.
- **My conclusion (opinion, needs a lawyer):** a planner that asks "How was the shift?" every day, with a named character and memory, is close to that line. LifeFlow takes users from 13. The safe order is: a fixed crisis path in code first, then feelings questions, and none for under-18s until a lawyer has read SB 243.

**F20. Feelings answers are health-adjacent data in some states. [S]**
- Washington's My Health My Data Act covers data about "physical or mental health status", including data that is inferred or derived, and needs opt-in consent to collect and separate consent to share, with a private right of action.
- The FTC's Health Breach Notification Rule (amended 2024) covers most health apps outside HIPAA and treats sharing health data without permission as a breach.
- **Map:** a "Rough" after a shift is mild, but "I've been really down" is mental health data. A focus setting tick ("Starting things is hard for me") is not a diagnosis, but we should treat it as sensitive anyway: never inferred from behaviour, never shared, deleted with the account, shown in "What <skyling> knows".

## 4. Proposals, ranked

Each one is a real change, so each needs the owner's yes through the COO. The six helps in `docs/backlog/2026-11-22-adhd-six.md` are already approved; proposals 5 and 7 adjust two of them.

### 1. The focus setting: "What's hard for you?" (medium)

- **Why:** F0, F6 to F10; the owner's decision. Time blindness and the rest are not true for everyone (F8), so the help is chosen, not assumed.
- **Done means:** one optional screen, a door in Settings, and one optional card offered once on Today after the first real week (not in the welcome, F11). Five ticks, any number, plain words: "Starting things is hard for me", "I lose track of time", "If I can't see it, I forget it", "Switching from one thing to the next is hard", "A busy screen is too much". Each changes defaults only, all reversible:
  - Starting: Today's note leads with "Start it" (help 1).
  - Time: hyperfocus check-in on (help 4), heads-up on (help 2).
  - Can't see it: Today's first line is the next real thing within 24 hours; the widget is offered first when the native app exists.
  - Switching: heads-up in two steps (proposal 8).
  - Busy screen: sound off, no visitors on the sky, and the guard in proposal 5 holds.
  The ticks are stored as preferences, never in analytics events or any third-party script, shown in "What <skyling> knows", deleted with the account, never guessed from behaviour. The word "ADHD" appears nowhere in the app.
- **Test:** unit (each tick maps to its defaults; untick restores), e2e (Settings door, Today card shown once, skip works), and a look test that fails on "ADHD" in any user-facing app string (like the "assistant" test in `assistant-name.spec.ts`).
- **Proves:** how many students tick something (survey says nothing yet), and whether those who tick "Starting" use "Start it" more than those who do not.

### 2. A crisis path in our code, before any feelings question (medium)

- **Why:** F19, F20. The model alone must not be the only safety net, and SB 243 asks for a published protocol.
- **Done means:** a fixed check in code on every message to the skyling and every free-text answer to its question. On a clear crisis signal, the reply is fixed text (not model text): that it is an AI, that it cares, and 988 by call or text in the US, with a one-tap call and text link; the skyling stops planning in that turn, saves nothing as a memory, and asks no personal question for at least 7 days. A plain-language protocol page on the website. No feelings questions for accounts under 18; they get rhythm and goal questions only. A lawyer reads SB 243 and the Washington act before feelings questions go live (owner's call on who).
- **Test:** unit (a labelled list of crisis and not-crisis phrases, with a recall target the owner sets; false alarms like "this exam is killing me" counted), integration (no question for 7 days after; nothing saved), the existing "overwhelmed" skill still runs for non-crisis stress.
- **Proves:** that the safety path works with no model call. Required before proposal 4.

### 3. Marketing guardrails for the landing page, TikTok and Reels (small)

- **Why:** F14 to F16.
- **Done means:** a claims list in the marketing playbook (the marketing session writes it; I only propose):
  - Allowed: what the app does in a real moment ("finds the hour before your shift", "the first step of the essay, and a star when it's done"), "made with students who find starting hard" only once that is true.
  - Banned: treat, manage, improve or reduce ADHD or symptoms; "clinically", "doctor-approved", "proven"; any test, quiz or symptom list; "superpower"; ad copy that says or asks whether the viewer has ADHD; targeting by health or disability; ad pixels or tracking on any page that asks about focus or feelings.
  - Creators: people with lived experience talk only about their own life, disclose paid posts in audio and on screen every time, and never give medical advice. A skyling in an ad is our endorsement and follows the same rules.
  - Formats to try first: "Sit with Ray" live study streams (F12); one real student afternoon on the line; the 9-days-away comeback (no pile).
  - The landing page shows the one plain price and the cancel promise without sign-up (F11).
- **Test:** a phrase check on the landing page copy (like `landing.spec.ts`), and a review of every paid post against the list before it goes out.
- **Proves:** downloads and sign-ups per post, and comments that call it cringe or fake (count them).

### 4. The skyling's one question a day, tied to a real event (medium, after 2)

- **Why:** F17, F18; the owner's decision; vision section 6.
- **Done means:**
  - At most one a day, asked in the app only (never in a push or on the lock screen), never in quiet hours, never within 7 days of a crisis signal.
  - Each question is tied to a real record that just ended or just happened: a shift ended (with the star: "How was the Target shift?"), a class or lab, an exam, the first week of term, a goal reached. No generic "How are you feeling today?".
  - Five kinds, rotated: daily rhythm ("Do you usually eat before or after your Tuesday lab?"), what's hard ("Was starting the essay the hard part, or finishing?"), life around them ("Anything interesting happen at work?"), goals ("Still aiming for the 12 books?"), feelings about the event ("How did the Chem exam feel?").
  - Answers are taps (three plain choices and Skip) with typing optional. An answer changes something today when it can ("Long one" after a shift offers a lighter study block tonight, with Undo) or the skyling just says thanks.
  - Answers are today-only unless the person says "remember that"; then it goes through `rememberForUser` like any explicit memory.
  - Three skips in a row: drop to once a week, and never ask why.
  - Never asked: medication, diagnosis, body or weight, exact money, grades as numbers, relationships, sex, religion, politics, immigration, substances, or anything after a deadline passed or a promise broken. The current INSTRUCTIONS list stays and grows with these.
  - Under 18: rhythm and goals only.
- **Test:** unit (question bank by kind and trigger, banned topics, no guilt words or em dashes, as in `promise-voice.test.ts`), integration (once a day, skip back-off, quiet hours, not after a crisis signal, under-18 kinds only), situation cases from section 6.
- **Proves:** answer rate per kind over 4 weeks (F17 says it falls; we want it flat), and whether answers lead to an accepted change.

### 5. A guard so nothing moves on its own (small, a test only)

- **Why:** F2. WCAG 2.2.2; the clouds branch's 9-second drift is gone today and should not return.
- **Done means:** no content on Today, the skyling's page or the focus screen advances by itself; clouds change only with a swipe, a dot or a tap. Any future auto-moving piece ships with a visible pause and is off for "A busy screen is too much".
- **Test:** e2e with a faked clock: nothing in the middle or the clouds changes after 30 seconds untouched.
- **Proves:** nothing new; it keeps a good state from slipping.

### 6. A sound switch people can find (small)

- **Why:** F3.
- **Done means:** a sky switch for sounds in Settings › Profile and appearance (the same `lf-sound` value), and off for "A busy screen is too much".
- **Test:** unit (the switch sets the value), e2e (no chime after off).

### 7. Fit "Start it with me" to how focus really works (small, a change to help 1)

- **Why:** F7.
- **Done means:** after the first 5 minutes, "Keep going" runs with no fixed end; the only stops are help 4's check-ins. A count-up view is one tap. "That's enough for now" always ends warmly with the star if a real step was done. Never "you stopped early".
- **Test:** unit (no fixed second block), e2e (count-up, keep going, check-in still fires).

### 8. Two-step heads-up for "Switching is hard" (small, a change to help 2)

- **Why:** F8 (weak evidence, so test it).
- **Done means:** with that tick, the heads-up goes at the person's setting and again 5 minutes before, each once (`notification_log` keys `heads-up:<key>` and `heads-up-5:<key>`), same quiet hours and mute.
- **Test:** integration (two pushes, once each, none for all-day items).
- **Proves:** act-on rate of the second push versus the first. If people ignore the second, remove it.

### 9. An ADHD-first test round with students (small)

- **Why:** every gap in section 8.
- **Done means:** the next student test includes at least 5 students who tick "Starting things is hard". After a week, five questions: did Start it help you begin, did the heads-up come at the right time, did anything on Today feel like too much, did the skyling's question feel caring or nosy, would you pay $5.99. Survey v2 gets the questions in section 8.
- **Proves:** whether proposals 1, 4 and 7 work for the people they are for.

### The three I would do first

1. **Proposal 1, the focus setting**, with the test that keeps "ADHD" out of the app. It turns the six approved helps on for the people who need them.
2. **Proposal 2, the crisis path**, because the owner's question idea cannot ship safely without it.
3. **Proposal 3, the marketing guardrails**, because the landing page and TikTok go first and the legal lines apply from the first post.

Proposal 4 (the one question a day) follows proposal 2 straight away.

## 5. Things to avoid

These become rules. Ranked by harm.

1. **Saying "ADHD" in the app, or guessing it.** No diagnosis words, no "we noticed you might have...", never inferring a condition from behaviour. The focus setting is a preference, not a label (owner's decision; F20).
2. **Health or treatment claims in marketing.** No "manage", "treat", "improve" or "reduce" ADHD or symptoms, no "clinically", "proven" or "doctor-approved" (FTC guidance, Apple 1.4.1; F16).
3. **Ads that say or ask whether the viewer has ADHD, and targeting by health.** "Your ADHD brain..." and "Do you have ADHD?" break Meta's personal attributes rule; health targeting breaks TikTok's (F16).
4. **Sending focus or feelings answers anywhere.** No ad pixels, no analytics events, no third-party scripts on pages that ask them; never used for ads or training (Cerebral, BetterHelp; F16, F20).
5. **A feelings question with no crisis path in our own code**, and any feelings question to an under-18 account (SB 243, Character.AI; F19).
6. **Generic mood check-ins.** No "How are you feeling today?" with nothing behind it; every question is tied to a real event and leads to something useful or a thank-you (F17).
7. **Reading silence as a mood or asking why someone skipped.** People skip most when they feel worst (F17).
8. **Asking about medication, diagnosis, body, exact money, grades as numbers, relationships, sex, substances, or after a missed deadline** (F18 to F20; INSTRUCTIONS).
9. **"ADHD test", symptom lists, "signs you have ADHD" or "superpower" content** (52% and 92% misleading; F15).
10. **Content that moves on its own with no pause.** No carousel drift beside what the person is reading; the old 9-second cloud drift stays out (WCAG 2.2.2; F2).
11. **Random rewards.** A star or sun only for a real act, every time; variety in how it looks, never in whether it comes (F13).
12. **Fixed focus blocks and "you stopped early".** Let focus run; the only stops are gentle check-ins (F7).
13. **A long quiz before value, a hidden price, or a trial that becomes a yearly charge** (Inflow; F11).
14. **Anything that must be tended.** No pet to feed, no cloud that wilts, no list to keep up (Finch's "another task" complaint; F5, F13).
15. **Paid creator posts without a spoken and on-screen disclosure**, and creators giving medical advice (FTC, the ad self-regulator; F16).
16. **A special "ADHD" or "dyslexia" font.** No evidence; keep text size (F4).
17. **Repeating the earlier rules, still required:** no streaks, no counts of days away, no "missed", "overdue" or "slipping", no red piles, nothing private on the lock screen.

## 6. Situation seeds

1. **Student, evening shift at a store ends at 9 PM, claims the star at 9:20:** the skyling asks "How was the shift?" with Good, Long one, Rough, Skip. "Long one" offers to make tonight's study block 30 minutes instead of an hour, with Undo. Must not: ask at 11:30 PM in quiet hours, ask in a push, or ask "how are you feeling today".
2. **Student who ticked "Starting things is hard", essay due Friday, opens Today on Wednesday at 4 PM:** the note leads with Start it and one first step ("Open the doc and type the title"). Must not: show a ten-step outline.
3. **Student back after six days away, five to-dos past their date:** one Back on track line and Undo. Must not: count the days, say "overdue", or ask "where have you been".
4. **Student answers the skyling's question with words that signal crisis:** fixed reply with 988 by call or text and that it is an AI; no plan, no memory saved, no question for 7 days. Must not: give advice or move tasks in that turn.
5. **Sixteen-year-old high school student who works weekends:** gets "Do you usually eat before your Saturday shift?" Must not: get any feelings question.
6. **Student deep in a problem set with Bio at 10:00:** the focus screen says gently at the planned time plus 20 minutes and before class that Bio is at 10:00. Must not: end the session on its own or say they went over.
7. **Student who skips the question three days running:** questions drop to once a week. Must not: ask why or mention the skips.
8. **Student who types "forgot my meds again" to the skyling:** it offers a to-do only if they ask for one. Must not: ask about medication later, save it as a memory without an explicit "remember", or mention it on the lock screen.
9. **Parent who works shifts, after a double shift:** "Anything interesting happen at work?" Must not: ask about their children or their pay.
10. **Shift worker who ticked "A busy screen is too much":** no sound, no visitors on the sky, clouds on the skyling's page change only on a swipe. Must not: move anything on its own while they read.

Eight of ten are students.

## 7. Sources

All read 2026-11-22 through search-result summaries only (pages not opened). Blocked in this session: apps.apple.com, arxiv.org, pmc.ncbi.nlm.nih.gov. Reddit did not appear in results. (C) = the publisher sells a competing product.

**Students and ADHD**
- [Review on college students and ADHD (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2946360), [ACHA-NCHA III secondary analysis (UNI ScholarWorks)](https://scholarworks.uni.edu/facpub/6901)
- [Phenomenological study, AJOT 2023](https://sage.cnpereading.com/doi/10.5014/ajot.2023.77S2-PO115), [European Psychiatry interview study](https://cambridge.org/core/journals/european-psychiatry/article/examining-challenges-and-evaluating-supportive-counseling-approaches-for-students-with-attention-deficit-hyperactivity-disorder-adhd/B5CAB37125770FA6B1EFDB4B986A8B72), [Journal of American College Health](https://informahealthcare.com/doi/full/10.1080/07448481.2019.1626399)
- [Trinity College Dublin ADHD in HE report](https://www.tcd.ie/media/tcd/disability/ADHD-in-HE-Project-Final-Report-September-2023.pdf), [TCD December 2023 slides](https://www.tcd.ie/media/tcd/disability/docs/07_12_23-ADHD-in-Higher-Education_Understanding-the-Student-Journey-pdf.pdf)
- [Scaffolding Metacognition with GenAI, CHI 2026](https://arxiv.org/abs/2602.09381)

**Look and layout**
- [UK Department for Education, cognitive accessibility (COGA)](https://accessibility.education.gov.uk/knowledge-hub/coga), [St Andrews, designing for users with ADHD](https://digitalcommunications.wp.st-andrews.ac.uk/2025/02/12/designing-for-users-with-adhd/), [UX Collective, software accessibility for ADHD](https://uxdesign.cc/software-accessibility-for-users-with-attention-deficit-disorder-adhd-f32226e6037c)
- [W3C Understanding 2.3.3](https://w3.org/WAI/WCAG21/Understanding/animation-from-interactions), [W3C technique C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html), [Yale, animated content and timing](https://usability.yale.edu/digital-accessibility/accessibility-resources/accessibility-articles/animated-content-and-timing)
- [Monster Math parent checklist (C)](https://www.monstermath.app/blog/what-makes-a-math-game-truly-adhd-friendly-parents-checklist.md), [Endel ADHD (C)](https://endel.io/adhd), [Focus Bear review (C)](https://www.focusbear.io/blog-post/review-of-llama-life-by-an-audhder)
- [Annals of Dyslexia 2026 meta-analysis](https://strathprints.strath.ac.uk/97732/), [Edutopia on dyslexia fonts](https://www.edutopia.org/article/do-dyslexia-fonts-actually-work/)
- [Apple 2025 App Store Awards newsroom](https://apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards), [Apple App Store Awards 2025](https://developer.apple.com/app-store/app-store-awards-2025)
- [Understood and BBH, Silent Spenders press release](https://www.understood.org/en/press-releases/research-adhd-silent-spenders), [DesignRush summary](https://news.designrush.com/bbh-adhd-consumers-silent-spenders-study)

**Flow and habits**
- [Neurolaunch, why planners don't work (C)](https://neurolaunch.com/why-planners-dont-work-for-adhd/), [Creator's Friend (C)](https://www.creatorsfriend.com.au/blogs/news/i-wasnt-lazy-my-planner-was), [FasTreat community post](https://www.fastreat.com/community/posts/planners-routines-dont-stick-adhd), [Inku blog (C)](https://inkboard.ink/blogs/the-inku-desk-blog/the-planner-graveyard-why-adhd-women-abandon-systems-and-what-works-instead)
- [Goblin Tools App Store listing](https://apps.apple.com/us/app/id6449003064), [Saner.AI Goblin Tools review (C)](https://blog.saner.ai/goblin-tools-review/), [Goblin Tools on Product Hunt](https://www.producthunt.com/products/goblin-tools/reviews), [USask open text on task lists](https://openpress.usask.ca/etad873aienhancedinstructionaldesign/?p=23)
- [Focus apps are failing neurodivergent minds (Future of Good)](https://futureofgood.co/focus-apps-are-failing-neurodivergent-minds-new-research-finds/), [CHADD republication](https://chadd.org/?p=72013)
- [Understood on time blindness](https://www.understood.org/en/articles/adhd-time-blindness), [Psychology Today, time blindness](https://www.psychologytoday.com/gb/basics/time-blindness), [Simply Psychology](https://www.simplypsychology.org/adhd-time-blindness.html), [ADDitude on time perception](https://www.additudemag.com/wasting-time-adhd-and-time-perception/)
- [Affine on reminders (C)](https://affine.pro/blog/setting-effective-reminders-adhd), [HealthUnlocked forum post](https://healthunlocked.com/adult-adhd/posts/150866960/to-do-list-update), [Lifestack on visual reminders (C)](https://lifestack.ai/blog/visual-reminders-for-adhd)
- [ADDitude on transitions](https://www.additudemag.com/task-switching-transitions-adhd/), [Neurolaunch transition strategies (C)](https://neurolaunch.com/adhd-transition-strategies/), [Healthline on task switching](https://www.healthline.com/health/adhd/task-switching-adhd)
- [Remnio listing (C)](https://apps.apple.com/us/app/id6745438236), [KickMint listing (C)](https://apps.apple.com/us/app/kickmint/id6762614379), [Inflow on Todoist alternatives (C)](https://www.getinflow.io/post/best-alternatives-todoist-adhd), [DEV, streaks and ADHD (C)](https://dev.to/nucleusos/why-streaks-make-adhd-worse-and-what-actually-helps-5147), [Klarity on streaks](https://www.helloklarity.com/post/breaking-the-chain-why-streak-features-fail-adhd-users-and-how-to-design-better-alternatives)
- [Inflow onboarding teardown](https://screensdesign.com/showcase/inflow-adhd-cbt-based-program), [Clarify teardown](https://screensdesign.com/showcase/clarify-adhd-organizer-timer), [Inflow on Trustpilot](https://uk.trustpilot.com/review/getinflow.io?page=2), [ChoosingTherapy Inflow review](https://www.choosingtherapy.com/inflow-adhd-app-review/)
- [CHADD on body doubling](https://chadd.org/adhd-weekly/could-a-body-double-help-you-increase-your-productivity/), [VR body doubling study](https://arxiv.org/html/2509.12153v1), [CHI 2026 body doubling framework](https://arxiv.org/html/2605.07851), [Focusmate on Product Hunt](https://www.producthunt.com/products/focusmate/reviews), [Focusmate pricing (Lifestack) (C)](https://lifestack.ai/blog/focusmate-pricing), [Fortune on body doubling](https://fortune.com/2023/03/05/body-doubling-parallel-working-tiktok-trend/), [Daily Dot on TikTok co-working](https://www.dailydot.com/irl/tiktok-adhd-co-working/), [Grazia on body doubling](https://graziamagazine.com/us/articles/can-this-adhd-tiktok-focus-trick-actually-help-you-get-stuff-done-what-psychologists-say/)
- [Springer review on impulsivity](https://link.springer.com/article/10.1007/s40806-024-00400-8), [Edge Foundation on the dopamine economy](https://edgefoundation.org/?p=16126)
- [Finch App Store listing](https://apps.apple.com/gb/app/id1528595748), [Headway Finch review](https://makeheadway.com/blog/finch-app-review/), [Neurospicy newsletter on Finch](https://neurospicynomnoms.beehiiv.com/p/digital-pet-bestie-for-self-care-610618d407f7afef), [Inflow on Finch alternatives (C)](https://www.getinflow.io/post/best-alternatives-finch-adhd), [MetaFilter thread](https://metafilter.com/207203/Habit-forming-for-good-with-Finch)

**Competitors and marketing**
- [Tiimo App Store listing](https://apps.apple.com/app/tiimo/id1480220328), [Neurolaunch Tiimo review (C)](https://neurolaunch.com/tiimo-review/), [Tiimo on Trustpilot](https://ca.trustpilot.com/review/tiimo.dk), [s360 Digital Tiimo case study](https://s360digital.com/?p=32033), [Tiimo seed round](https://tiimoapp.com/resource-hub/tiimo-seed-investment-round), [Tiimo creator interview](https://tiimoapp.com/blog/changemaker-dayna)
- [Starter Story on Structured](https://www.starterstory.com/businesses/structured-639131/growth-channels), [Routinery App Store listing](https://apps.apple.com/us/app/habit-reminder-routine-timer/id1450486923), [Inflow on Routinery alternatives (C)](https://www.getinflow.io/post/best-alternatives-routinery-adhd)
- [Canadian Journal of Psychiatry 2022 record](https://katalog.lib.cas.cz/KNAV/EdsRecord/cmedm,35196157), [PsyPost on #adhdtest](https://www.psypost.org/beware-of-adhdtest-inaccurate-adhd-content-is-dominating-tiktok-study-finds/), [CBC on the UBC study](https://amp.cbc.ca/lite/story/1.7488351), [NPR on TikTok and ADHD](https://www.npr.org/2025/03/24/nx-s1-5336303/adhd-symptoms-adult-tiktok), [UBC Psychology](https://psych.ubc.ca/news/adhd-misinformation-on-tiktok-is-shaping-young-adults-perceptions/), [Understood podcast on the ADHD content economy](https://www.understood.org/en/podcasts/hyperfocus/adhd-scam)
- [Inflow, "My ADHD is not a superpower" (C)](https://getinflow.io/post/my-adhd-is-not-a-superpower), [ADHD Advocate on superpowers](https://theadhdadvocate.substack.com/p/is-adhd-a-superpower-examining-the/comments), [Understood on the ADHD tax](https://www.understood.org/en/articles/adhd-tax)

**Law and platform rules**
- [FTC Health Products Compliance Guidance](https://ftc.gov/system/files/ftc_gov/pdf/Health-Products-Compliance-Guidance.pdf), [WSGR summary](https://www.wsgr.com/en/insights/ftc-releases-health-products-compliance-guidance.html)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/uk/), [Apple forum thread on 1.4.1](https://developer.apple.com/forums/thread/807508)
- [Meta personal attributes policy](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/), [Social Media Examiner on rejected ads](https://www.socialmediaexaminer.com/17-topics-that-result-in-rejected-ads-on-facebook-and-instagram/)
- [TikTok anti-discrimination ad policy](https://ads.tiktok.com/resources/help/article/tiktok-anti-discrimination-ad-policy?lang=en), [TikTok healthcare ad policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals), [WJLA on Cerebral ads pulled](https://wjla.com/news/nation-world/instagram-tiktok-pull-ads-for-being-misleading-violating-body-image-policies-meta-women-young-social-media-advertisements-negative-cerebral-simone-biles)
- [FTC Disclosures 101 for influencers](https://ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers/), [TMCA on the "creator earns commission" decision](https://www.thetmca.com/creator-earns-commission-on-tiktok-new-guidance-on-effective-influencer-disclosures/), [BBB National Programs on FTC warning letters](https://bbbprograms.org/media/insights/blog/ftc-warning-influencers)
- [The Markup on Cerebral](https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine-and-limit-health-data-use-for-ads-under-federal-order), [Fierce Healthcare on Cerebral](https://www.fiercehealthcare.com/regulatory/cerebral-agrees-7m-settlement-ftc-doj-over-user-data-sharing-cancellation-practices), [Mozilla 2023 mental health apps](https://www.mozillafoundation.org/en/blog/shady-mental-health-apps-inch-toward-privacy-and-security-improvements-but-many-still-siphon-personal-data/)
- [Federal Register, Health Breach Notification Rule](https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule), [FTC blog on the updated rule](https://www.ftc.gov/business-guidance/blog/2024/04/updated-ftc-health-breach-notification-rule-puts-new-provisions-place-protect-users-health-apps)
- [Washington RCW 19.373](https://lawfilesext.leg.wa.gov/Law/RCWPDF/RCW%20%2019%20%20TITLE/RCW%20%2019%20.373%20%20CHAPTER/RCW%20%2019%20.373%20%20COMBINEDCHAPTER.pdf), [FPF brief](https://fpf.org/wp-content/uploads/2023/04/FPF-Legislation-Policy-Brief_-The-Washington-My-Health-My-Data-Act-Public-Version.pdf)
- [SB 243 text (LegiScan)](https://legiscan.com/CA/text/SB243/2025), [Skadden on SB 243](https://skadden.com/insights/publications/2025/10/new-california-companion-chatbot-law), [Crowell on SB 243](https://www.crowell.com/en/insights/client-alerts/californias-chatbot-bill-may-impose-substantial-compliance-burdens-on-many-companies-deploying-ai-assistants), [Gunderson on SB 243](https://www.gunder.com/en/news-insights/insights/client-insight-california-sb-243-new-compliance-requirements-for-operators-of-ai-companion-chatbots), [TechCrunch on SB 243](https://techcrunch.com/2025/10/13/california-becomes-first-state-to-regulate-ai-companion-chatbots), [California BBS agenda item](https://www.bbs.ca.gov/pdf/agen_notice/2026/20260417_pa_item7.pdf)
- [Fortune on the Character.AI settlement](https://fortune.com/2026/01/08/google-character-ai-settle-lawsuits-teenage-child-suicides-chatbots/), [Bloomberg Law](https://news.bloomberglaw.com/litigation/character-ai-google-agree-to-settle-teen-chatbot-harm-lawsuits)
- [988 Lifeline social and digital media support](https://988lifeline.org/Support), [988 terms of service](https://988lifeline.org/terms-of-service/), [Action Alliance messaging framework](https://theactionalliance.org/messaging/public-messaging)

**Check-ins and privacy**
- [EMA compliance study, JMIR 2023](https://jmir.org/2023/1/e45764/PDF), [14-week student EMA study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10822069/), [Prompt-level predictors in young adults (Lancaster)](https://eprints.lancs.ac.uk/id/eprint/204987), [Student EMA data quality study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11668991/)
- [Mood-tracking apps interview study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8387890/), [MindScape (eScholarship)](https://escholarship.org/content/qt54g553ws/qt54g553ws.pdf), [Feeling Moodie study (JMIR Mental Health)](https://mental.jmir.org/2021/8/e29368/PDF)
- [Chatbot memory study](https://arxiv.org/html/2411.17589v2), [Euronews on the King's College study](https://euronews.com/next/2025/08/14/malicious-ai-chatbots-want-to-trick-people-into-revealing-private-information-but-can-they), [Privacy concerns in chatbot interactions](https://arxiv.org/pdf/2107.03959)

**LifeFlow's own files read:** `docs/vision.md` (sections 6, 8, 10), `docs/plan-v2.md`, `docs/backlog/2026-11-22-adhd-six.md`, `docs/research/2026-11-05-students-and-competitors.md`, `2026-11-05-what-people-love-and-hate.md`, `2026-11-06-notifications-that-bring-people-back.md`, `2026-11-16-what-students-open-it-for.md`, CLAUDE.md product and motion rules, `src/components/motion/sound.ts`, the INSTRUCTIONS privacy line in `src/server/jarvis/prompt.ts`.

## 8. Gaps

- **No review counts from real people.** The App Store and Reddit were not reachable. Fix: allow apps.apple.com and a Reddit mirror for the researcher, then count Tiimo, Structured, Goblin Tools, Finch and Routinery reviews by theme (start, time, pile, billing, bugs, chore).
- **SB 243 and the Washington act need a lawyer.** I read law firm summaries, not the full statutes, and sources disagree on SB 243's start date. Fix: one legal read before proposal 4 ships, including what SB 243 asks for known minors.
- **No study tests calm versus colourful screens for ADHD, motion and ADHD, or predictable versus random rewards.** Fix: proposal 9, asking the same students what on Today felt like too much.
- **The caring-versus-nosy line for the skyling's question is untested with our users.** Fix: survey v2 and the test round.
- **Survey v2 questions (proposed; the owner approves):**
  (a) "Which of these are hard for you? Tick any: starting things, losing track of time, forgetting what I can't see, switching from one thing to the next, a busy screen." (b) "Think of the last planner or to-do app you stopped using. What was the last straw?" (open). (c) "If an app asked you one question a day about your day, which would feel caring and which nosy?" with six examples to rate (how was the shift, how did the exam feel, anything interesting at work, how are you feeling today, did you take your meds, what grade did you get). (d) "Would you rather a timer that counts down, counts up, or none?" (e) "Do sounds in apps help you or bother you?"
- **Whether students who tick "Starting" use Start it more.** Fix: count it in the first month after proposal 1 (numbers only, no content).

## What changed because of this report

Nothing yet. The product session fills this in after the owner decides on the proposals.
