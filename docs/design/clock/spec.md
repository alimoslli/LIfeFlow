# The day clock that turns into a timeline: spec (v3 home)

Owner's concept, 2026-11-07. The look is set by the owner's two GIFs (`owner-concept-1.gif`, `owner-concept-2.gif`); their frames are in `storyboard-1.png` and `storyboard-2.png`. Where this spec and the pictures disagree, the pictures win. The prototype that implements this spec is `prototype.html` (published for the owner as https://claude.ai/artifact/UgiwwCiRsyigsHhvn1LoND). Its motion code is the reference for the real build.

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
- **What the rim covers.** A 12-hour face can't show 9 AM and 9 PM apart, so it shows the 12 hours around now:
  - the last 2 hours, faded;
  - the next 10 hours, bright.

  As the day goes on, the arcs and icons turn with it. The whole day, and every other day, is one tap away on the timeline. *(Decided 2026-11-07: B, the 12 hours around now. The COO chose it on the owner's behalf, following the recommendation; the owner can still switch to A, the whole day on one face.)*
- **The markers:** one icon plus one line of text around the rim, joined to the rim by a hairline (frame 1).
  - Blocks show their start time ("6:00 PM"). A block already running shows "till 4:30 PM".
  - Spends show the amount ("$14.20").
  - Markers never overlap: they spread apart, and the hairline points to the real time.
  - Things that are over are faded.
- **Steps (Apple Health):** one quiet line inside the face, above the 6 ("6,240 of 15,000 steps"). It is not a tile on the timeline (see section 4).
- **Sleep (Apple Health):** the usual bedtime is a marker on the rim (🌙 11:00 PM). Sleep is a soft band on the timeline, not a tile.
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
| 0.06 to 0.44 | Each icon becomes a dark round bubble, held to the clock by a liquid neck that thins as it stretches. The ring of bubbles turns as one piece until the day reads left to right (the earliest thing on the left, the latest on the right), the way the owner described the clock "turning around based on your day". The bubbles stay outside the rim and never pass over each other. The clock squashes a little (wider, shorter). Haptic at the snap. | 3 |
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
  - **Class:** the class running ("Class / till 8") or the next one that day ("Class / 6 PM"), otherwise the day's first.
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
  - Midnight is a small tick with the day's name.
  - The day picker and tiles follow the day in the middle of the screen. Tapping a day scrolls to it.
- **No card until you ask.** Like frame 6, the open timeline shows the line and the tiles only. **Tapping a node** (or a tile) opens one quiet card under the tiles; tapping it again, or changing the day, puts it away. The card: the icon, name, time, where it came from ("from your work calendar", "from Chase", "from Apple Health") and one action.
- **Back to the clock (the wrap, section 3):** pull the line down or pinch it. Or tap the "now" pill (with its tiny clock) or "Today", or use the back gesture.

## 5. States
- **First open of the day:** the clock.
- **Nothing in the next 10 hours:** the clock with empty rim arcs and one line: "Nothing planned until 9:00 AM tomorrow".
- **No connections yet:** the clock with hands only and one button, "Connect your calendar". Nothing invented.
- **More than 7 markers in view:** the nearest 6 are shown, and the rest are behind "+2" at their place on the rim.
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

## 7. Out of scope for this step
- Building it in the app (Batch 1 replaces Today, Plan and To-dos after the owner's yes on the prototype).
- Editing from the timeline beyond opening the existing editor.
- The week view.

## 8. Open for the owner
1. ~~The rim~~ **Decided (2026-11-07): B, the 12 hours around now, as built.** The owner saw both in `rim-options.png` (A: the whole day on one face; B: the 12 hours around now; same day and data at 8:45 PM). He couldn't see a difference, so the COO chose B on the recommendation. He can still switch to A.
2. Should a pull also turn it into the timeline, or only a tap? (Still open; the prototype does both.)
3. ~~Should the three chips be spent, steps and sleep, or spent, tasks and focus?~~ Answered (owner, 2026-11-07, through the COO): neither. The chips show time-bound commitments: shifts, classes and deadlines (section 4).
