# The day clock that turns into a timeline: spec (v3 home)

Owner's concept, 2026-11-07. The look is set by the owner's two GIFs (`owner-concept-1.gif`, `owner-concept-2.gif`); their frames are in `storyboard-1.png` and `storyboard-2.png`. Where this spec and the pictures disagree, the pictures win. The first prototype is `prototype.html`; its motion code was the reference for the real build.

**The owner's artifact** (https://claude.ai/artifact/UgiwwCiRsyigsHhvn1LoND, "LifeFlow Day Clock") now shows the concept as built on the branch (owner, 2026-11-08: "go into the concept using the artifacts until we build it into the main page").
- **What it is:** `concept.html`, which runs the app's own `engine.ts` and `day-clock.css` on the app's theme tokens, with a made-up student's week placed on the viewer's real clock.
- **What works in it:** a "see it at" time picker; pinning, Done and Open work in the page only.
- **Keeping it current:** after any clock change, run `npx tsx scripts/dev/build-clock-artifact.ts` and republish `docs/design/clock/concept.html` to that URL, so the artifact never drifts from the branch.

## 1. What it is
- The home screen. It is your time, today, shown as a clock. Tap it (or pull it) and it turns into a timeline you scroll through, day by day.
- **The bar (owner, 2026-11-07, through the COO):** "a simple, out-of-the-box concept, but not basic". It's understood in seconds and original (nothing borrowed from other apps), with real craft in how it looks and moves.
- The person should understand it in 5 seconds:
  - the hands are now;
  - green on the rim is busy time;
  - the icons are what's coming, each with its time.

## 2. The clock (storyboard frame 1)
- **The screen:**
  - pure black;
  - **two colours only:** white (with greys) and one mint green, `#7EE0AE`;
  - emoji icons keep their own colours, as in the owner's frames.
- **The header:**
  - the wave logo and "LifeFlow" on the left, the bell on the right;
  - below them, "Today ⌄".
- **The face:**
  - 12-hour analog, with the numerals 12, 3, 6 and 9 and short ticks at the other hours;
  - white hands with round ends: a short, thick hour hand and a long, thin minute hand. The hub is a white dot.
- **The rim:**
  - a thin grey circle;
  - busy blocks are mint arcs on it, with a soft glow;
  - spends are small mint pins on the rim at the minute they happened.
- **What the rim covers (owner, 2026-11-08): the next 24 hours, from the hand, on two rings.**
  > "It shows the 24 hours after… as he completes 1:00, it goes to showing 1:00 am, but it's obvious."
  - **The inner ring** (the clock's own) is the next 12 hours. **The outer ring**, just outside it, is the 12 after.
  - **Every spot holds two times:** the next time the hand reaches it (inside) and the time after that (outside).
  - **It rolls:** once 1 PM is done, the 1 o'clock spot inside holds 1 AM, and 1 PM tomorrow sits outside.
  - **One spiral:** a short step at the hand joins the two rings. Start at the hand, go round inside, step out, go round again.
  - **Tomorrow is obvious:**
    - from tonight's midnight on, the rings are tinted in the accent;
    - a tick and the word TOMORROW mark where tomorrow starts, on whichever ring midnight falls (the outer ring by day, the inner ring by night);
    - anything after midnight carries "TOMORROW" under its time.
  - **The outer ring is quieter:** thinner arcs at about 60% and smaller labels, because it's later.
  - **It starts wherever the hand is** when the person opens it (or wakes up). What's done falls off; a block already running shows "till 4:30".
  - **A very full day:** the soonest 10 things keep their markers, and every busy stretch still shows as an arc.
  - **All-day deadlines and bills** show as due by the end of their day ("due tonight", "$45 due").
  - **On the open timeline,** tonight's midnight is a mint tick labelled "TOMORROW".
  - *(This replaces the 12-hour windows decided earlier on 2026-11-07 and 2026-11-08.)*
- **The markers:** one icon plus one line of text around the rim, joined to the rim by a hairline (frame 1).
  - Blocks show their start time ("6:00 PM"). A block already running shows "till 4:30 PM".
  - Spends show the amount ("$14.20").
  - Markers never overlap: they spread apart, and the hairline points to the real time.
  - Things that are over are faded.
- **Inside the face: the important data** (owner, 2026-11-08: "we should have the important data on there and not just focus on simplicity… as much as you want it to be functional and productive"):
  - **Top (between the 12 and the hub):** a small line says when and a bigger line names it.
    - What's happening now: "NOW · TILL 4:30 / Work".
    - If nothing is, what's next: "NEXT · 6 PM / Class", or "TOMORROW · 8 AM / Run with Sam".
    - With nothing in the 24 hours, the next real thing whenever it is ("MON · 10 AM / Exam 2"), or "Nothing planned yet".
  - **Bottom:** today's numbers, only the real ones:
    - steps and last night's sleep ("6,240 steps · 7h 18m sleep");
    - what was spent today ("$69.20 spent today"), only while the Money lock is open.
  - No step goal is shown until one is stored, and no bedtime until Apple Health sends times.
  - The steps and sleep are not tiles on the timeline (see section 4).
- **What appears on the clock:**
  - Only real things from connections: calendars, school, work, the bank, Apple Health.
  - A spend appears only after it happens; nothing is guessed onto the rim.
  - Expected things (bedtime, steps by the end of the day) are labelled "usual" or "expected".

## 3. The motion: clock to timeline (frames 2 to 6)
One continuous, reversible motion driven by a single progress value `p` from 0 to 1, run on a spring.
- **Tap:** it plays.
- **Pull:** your finger drives `p` directly. On release it settles to whichever side is closer, or the side you flicked toward.
- **Reverse:** the same path backwards.

| `p` | What happens | Frame |
|---|---|---|
| press | The centre fills with a mint glow, the hands turn mint, and the face dips slightly (0.98). Haptic tick. | 2 |
| 0 to 0.15 | The time labels and hairlines fade. Mint tendrils grow out of the rim toward each icon. | 2 to 3 |
| 0.06 to 0.44 | Each icon becomes a dark round bubble, held to the clock by a liquid neck that thins as it stretches. The ring of bubbles turns as one piece until the day reads left to right (the earliest thing on the left, the latest on the right), the way the owner described the clock "turning around based on your day". The bubbles stay outside the rim and never pass over each other. A bubble whose place on the line is off screen slides just past the screen edge and fades, and its neck lets go early, so no liquid stretches out to the edge. The clock squashes a little (wider, shorter). Haptic at the snap. | 3 |
| 0.36 to 0.8 | The body melts from a circle into a wide glowing capsule, and the ends flop out to both sides. The face (numerals, ticks, hands, arcs) fades and shrinks. The necks are absorbed, and the bubbles settle in a row inside the capsule, in time order. The line draws from the centre outward, with a node under each icon. | 4 |
| 0.8 to 1 | The capsule's outline lets go: it widens and fades. "Today ⌄" fades out (by 0.77) before the day picker fades in (from 0.78), so the two never overlap. The tiles rise in under the line one after another, labels appear under each node, and the "now" pill drops onto the line with a small bounce. Haptic at landing. | 5 to 6 |

- **How it's built:** the liquid outline is a signed-distance field drawn in a WebGL shader, which gives a smooth union of the body, the necks and the bubbles, with an anti-aliased mint outline and glow at 60 fps. The face is SVG and is squashed with the same transform, so the arcs stay on the outline. Everything is a pure function of `p`, so the motion is interruptible, scrubbable and exactly reversible.
- **Motion rules:**
  - transform and opacity only, outside the shader;
  - reduced motion: a short crossfade, no liquid;
  - content never waits on the animation.
- **Haptics:** at press, snap and landing.
  - In the app: native haptics.
  - On the web: `navigator.vibrate` where it exists, and the iOS 18 switch-tap where it doesn't.
  - Never more than 3 per open.

### The wrap: timeline back into the clock (owner, 2026-11-07, through the COO)
The way back is as crafted as the way in. It is never a plain fade or cut: it is the same path, run backwards as one motion, with its own touches.
- **Ways to start it:**
  - **Pull the line down** (or pinch it). It follows your finger: 250 px of pull is the whole way.
  - **Let go** and it wraps if it's past 30%, or if you flick down. Otherwise it springs back open.
  - **One haptic tick** when you've pulled far enough to wrap.
  - **Tap the "now" pill** (it carries a tiny clock showing the time) or "Today", press Escape, or use the back gesture. The same wrap plays, in 1.15 s.
  - **The hint:** a quiet line under the tiles says "Pull down to wrap your day" until a card is open.
- **From another day** there's no wait. The line rewinds to now in the first part of the same motion (`p` 1 to 0.78), and up to 0.45 s is added for a long rewind. The bubbles ride with the line, so nothing jumps.
- **The order:** the tiles, labels and day picker leave. The line gathers from both ends into the glowing capsule, and the bubbles rise out of it on liquid necks. The ring turns back until the markers sit at their real times, and the face returns.
- **The rim refills clockwise** from 2 hours ago (`p` 0.34 to 0.1), so the day visibly pours back into the clock. Opening runs the same in reverse: the rim empties as the clock stretches.
- **The landing:** the press glow lets go with a slight overshoot, so the clock settles rather than stops, with a haptic tick.
- **Reduced motion:** a calm crossfade that still follows the finger, with no liquid and no rewind sweep.

## 4. The timeline (frames 5 and 6)
- **The header:** the logo and bell stay. "Today ⌄" becomes a day picker, "‹ Wed Thu Fri [Today] Sun Mon Tue ›", with today in a mint pill and the day centred. The line sits right under it.
- **Up to three tiles under the line** (where the owner's frame 6 puts them) round up the day in view with what's tied to the clock: its time-bound commitments. *(Owner, 2026-11-07, through the COO: "work shifts, deadlines, classes and the like", not spent, steps or sleep, and not tasks or focus.)*
  - **Work shift:** "Work till / 4:30" while it runs, "Work / 1 PM" before it starts, and the hours it took ("Worked / 7h 30m") once it's over. The hours come from the schedule; the tile never shows pay.
  - **Class:** the class running ("Class / till 8") or the next one that day ("Class / 6 PM"). Once today's classes are over, it says "Class / done"; on other days, the day's first.
  - **Deadline:** that day's exam, assignment or bill ("Exam / 10 AM", "Phone bill / $45 due"). On today and later days with no deadline of their own, the next deadline ahead with its day ("Exam / Mon").

  The tiles:
  - **Only real items.** A day without a shift, class or deadline simply has fewer tiles. Appointments and plans (the dentist, a study session) stay on the line, not in the tiles.
  - **Order:** the order they happen; a deadline on a later day comes last.
  - **The tile (frame 6):** a mint icon (briefcase, cap or flag) on the left, a small grey label, and a short value in white below it. The tiles are equal widths, up to 150 px. If the row is too tight, the widest tile gives way first and ends in "…".
  - **Tap:** opens that item's card (a later day's deadline says "in 2 days"), and the tile gets a mint edge. A same-day item also scrolls its node into view.
- **Spending, steps and sleep** stay where they were: spends are pins on the rim and nodes on the line, steps are the line inside the face, sleep is the bedtime marker and a band on the line.
- **Order on screen:** the day picker, then the line, then the tiles, then the card when one is open.
- **The line:**
  - one horizontal mint line;
  - a node for each thing, with its icon above and its time and name below (for spends, the name and amount);
  - past nodes are filled and future nodes are hollow;
  - a block's duration is a soft mint band along the line, from its start to its end.
- **Spacing:** nodes are almost evenly spaced, as in the frames, so the line reads at a glance. Long empty gaps get a little more room. The "now" pill sits between its neighbours at its real time.
- **Scrolling:** the line scrolls sideways through time and keeps going into the next and previous days.
  - Midnight is a small tick with the day's name. Tonight's midnight is mint and says "TOMORROW" (section 2).
  - The day picker and tiles follow the day in the middle of the screen. Tapping a day scrolls to it.
- **No card until you ask.** Like frame 6, the open timeline shows the line and the tiles only. **Tapping a node** (or a tile) opens one quiet card under the tiles; tapping it again, or changing the day, puts it away. The card: the icon, name, time, where it came from ("from your work calendar", "from Chase", "from Apple Health") and one action.
- **Back to the clock (the wrap, section 3):** pull the line down or pinch it. Or tap the "now" pill (with its tiny clock) or "Today", or use the back gesture.

## 5. States
- **First open of the day:** the clock.
- **Nothing in the next 10 hours:** the clock with empty rim arcs and one line: "Nothing planned until 9:00 AM tomorrow".
- **No connections yet:** the clock with hands only and one button, "Connect your calendar". Nothing invented.
- **A busy rim:** first the rim switches to ahead only (section 2). If it still has more than 7 markers, the nearest 6 are shown, and the rest are behind "+2" at their place on the rim.
- **Text size up to Extra large:** the markers move outward and the face shrinks, and nothing overlaps (checked like `no-overlap-phone.spec.ts`).
- **Screen readers:** the clock reads as "Today. Now 1:40 PM. Next: Class at 6:00 PM. 6,240 of 15,000 steps." Each node is a button.

## 6. Data
- **It reads the one timeline** (`docs/vision.md`, "find the dots"): events (calendars, school, work), transactions (bank), health (steps, sleep), and tasks with a time.
- **Each marker comes from one service read.** No queries in components.
- **The example day in the prototype is the owner's**:
  - work 9 to 4:30;
  - $14.20 lunch at 1 PM;
  - $55 gas at 5:15;
  - class 6 to 8;
  - study for the exam 8:30 to 10;
  - a 15,000-step goal;
  - sleep.

  The other days are fresh made-up days, each different (docs/team.md).

## 7. In the app (branch `v3-day-clock`, owner 2026-11-08: "start building this concept into a branch of a duplicate of the current live app")
- **Where:** the Today tab is the clock (`src/app/(app)/page.tsx`).
  - **The tabs** are now Today, Assistant, Money, School. Plan is gone as a tab.
  - **The old Plan pages** (Calendar, To-dos, Goals, Milestones, Health, Work) are pills on each of those pages, so every page stays two taps away. Below the fold, Today keeps only Health and Work as pills. Calendar, to-dos, goals and milestones are on the timeline itself (owner, 2026-11-08: "All the to-dos, all the goals, and the milestones are going to be in the timeline").
  - **The floating ask button** is off Today, because the home has its own ask bar.
- **One screen on a phone:** the clock, and at its foot the assistant's one line (the top insight that needs attention, with its action). The line steps aside while the timeline is open and comes back on the wrap. The ask bar and the pills are below the fold.
- **Data:** one read, `dayClockData` (`services/day-clock.ts`). It covers the week around today from the one agenda (calendars, work shifts, class deadlines and exams, to-dos with a time) plus today's steps, in wall-clock minutes in the person's time zone.
  - **Icons** come from the title's words first, then the kind.
  - **Tiles:** work shifts feed the work tile, classes the class tile, and exams, deadlines and timed to-dos the deadline tile.
  - **Cards** say where each thing came from, and "Open" goes to the page that already owns it (calendar, work, the class, to-dos).
- **Drawing:** `components/day-clock/engine.ts` is the prototype's motion code, typed. React renders the skeleton once. Colours are the theme tokens, so it reads right in light and dark.
  - **Live time:** the clock follows the real time, redrawn each minute but never while the timeline is open or moving, and it fetches again when the day turns.
  - **State:** `data-state` (clock, moving, timeline) tells tests and assistive tech what it's doing.
- **Not shown yet, honestly:**
  - **Spend pins:** the bank feed gives a date but no time, so spends aren't pinned on the rim; the face shows today's total instead. Adding the time Plaid sometimes sends needs a database change, which is held for the owner.
  - **Sleep:** Apple Health sends hours per night but no bedtime, so there's no bedtime marker.
  - **A step goal:** none is stored, so the face shows the step count with no goal.
- **The timeline is the whole life (owner, 2026-11-08):** one line from the first milestone to the furthest plan.
  - **The week:** shown day by day, as before.
  - **Plans out to 60 days:** flights, trips, exams and shifts.
  - **Goals ahead:** at their target day.
  - **Behind:** every dated milestone and every goal reached (a birth date pinned as a milestone sits at the start).
  - **Long empty stretches stay short:** outside the week, a month mark ("NOV", "APR 2027") or a year ("2006") sits before the first thing in it, so no gap is wider than a short step. The further a thing is from today, the quieter it looks, down to half strength.
  - **Someday:** to-dos and goals with no day wait in a row at the very end, under "Someday". They carry no time, and you can't pin into that stretch.
  - **Done on the card:** a to-do's or an assignment's card has **Done** beside Open. It is the same action as To-dos and School; the line refreshes in place.
  - **Edit on the card (owner, 2026-11-08: "I can't edit anything on the timeline"):**
    - events, shifts and assignments open Plan's own editor (`BlockSheet` in `plan/block-editor.tsx`) right there, with delete inside it; saving refreshes the line;
    - the editor's data loads only when Edit is tapped (`blockForEditAction`), so Today stays one read;
    - to-dos, reminders, goals and milestones say **Edit** and open their own page.
  - **Milestone cards** say how long ago ("2 years ago"). Goal cards say "Your goal, by the end of this day". "Due" is only ever said of to-dos, assignments and bills.
  - **On the clock:** milestones (things that happened) never sit on the rim. A goal whose day falls in the next 24 hours shows as "goal day".
  - **Never an empty clock (owner, 2026-11-08: "the clock is empty"):**
    - a to-do or an assignment still open after its time belongs to now: one **overdue** marker at the hand (with "+N");
    - an all-day plan (a birthday, a trip) reads "today" at the hand or "all day" at midnight, never "due";
    - a face with nothing measured and nothing in the next days counts what the line holds ("On your line: 12 to-dos · 3 goals · 5 milestones").
- **Everything with a time flows in (owner, 2026-11-08: "every piece of data that qualifies… perfectly flowing in there"):** one read, `dayClockData`, from the person's own data only.
  - **Calendars:** Google, Outlook and LifeFlow events, merged across sources. Further out than the week, only one-off plans (a flight, an appointment, a birthday). An event that repeats three or more times in the next 60 days (a weekly class, a daily event) shows in the week only.
  - **Work:** shifts, in the week.
  - **Classes:** Canvas and added deadlines and exams, out to 60 days.
  - **To-dos:** every open one, at its due time, any distance away. Overdue ones stay where they were due. Undated ones wait under Someday.
  - **Reminders:** a to-do's reminder that rings an hour or more before it's due is its own moment (🔔), on the clock and the line. Done works on it.
  - **Goals and milestones:** goals at their day; milestones and goals reached behind. A milestone known only by month or year says "Sep 2019" or "2019".
  - **Money, only with the Money lock open:** bills and trial ends in the next 30 days ("then $15.99"); money goals by their day; salaried pay as "Payday, $X expected" (shown, never counted, never hourly); and what was spent today.
  - **Not on it, on purpose:** habits and health have no time of day (steps and sleep are on the face). Spends have no time (the face shows today's total). Past paychecks belong to Money.
- **It never gets crowded:**
  - **On the clock:** things within half an hour of each other on the same ring are one marker. The one that matters most leads (a block of time, then an exam, a deadline, a reminder or plan, money), and "+2" says the rest. At most ten markers; every busy stretch still shows as its arc.
  - **On the line:** things at the same minute in the week, or on the same day further out, are one stop with "+2" on its icon. Its card lists them ("3 things · Sun, Nov 8 · 11:59 PM"), one 44 px row each, and a row opens that thing's own card. On a short screen the list stops halfway through a row, so it's plain it scrolls.
  - **Someday:** the first seven stand alone; the rest share one stop. Someday is a place, not a day: no day is lit and there are no tiles.
- **Pin anything (owner, 2026-11-08):** "Pin something" under the open line, or a tap on an empty spot of the line, opens one sheet. It takes the day and time from where you are, an emoji, a name, and what it is: a to-do, a plan (one hour), a goal (by that day) or a milestone (past days only).
  - **The emoji** is kept as the title's first character, so no database change is needed. It becomes the node's icon everywhere.
  - **Saving** shows it on the line at once.
- **Tests:**
  - `tests/unit/day-clock.test.ts` (icons, tiles, sources, wall-clock minutes across daylight saving);
  - `tests/integration/day-clock.test.ts` (the real read);
  - `tests/e2e/clock-phone.spec.ts` (open, the card and its Open link, the now pill wrap, the pull-down wrap, pinning a ✈️ plan, Done on a to-do, three deadlines stacking into one stop and one "+2" marker);
  - the layout, touch-target and core tests, updated for the four tabs.
- **For screenshots:** `scripts/dev/seed-clock-look.ts` gives a local account a made-up week (`--busy` adds a full life on top: a pile of deadlines tonight, a reminder, a weekly lecture, a trial, rent, a money goal and ten undated to-dos). It refuses any database that isn't on localhost.

## 8. Out of scope for this step
- Editing from the timeline beyond opening the existing editor.
- The week view.

## 9. Open for the owner
1. ~~The rim~~ **Decided (2026-11-07): B, the 12 hours around now, as built.** The owner saw both in `rim-options.png` (A: the whole day on one face; B: the 12 hours around now; same day and data at 8:45 PM). He couldn't see a difference, so the COO chose B on the recommendation. He can still switch to A.
2. Should a pull also turn it into the timeline, or only a tap? (Still open; the prototype does both.)
3. ~~Should the three chips be spent, steps and sleep, or spent, tasks and focus?~~ Answered (owner, 2026-11-07, through the COO): neither. The chips show time-bound commitments: shifts, classes and deadlines (section 4).
