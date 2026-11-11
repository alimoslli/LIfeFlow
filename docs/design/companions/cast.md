# The cast: six companions, named for the sky

Concept for the owner, 2026-11-09. Design only; nothing under `src/` changed. The live page is `cast.html` next to this file
(self-contained, works at phone width); the picture is `cast.png`.

**Why.** The owner (2026-11-09): "I want to remake the characters ... each one maybe has a personality, different traits, or
skills, because in the end, that's the AI assistant too ... that will be the name of the AI assistant, whichever one it is
named. Or you can have a custom name. And you want those names built on the names of times of something related to what they
are showing." And: "I want them bigger too." And: "That small guy has a life to him too."

**The idea in one line.** The little one running on top of Today's wheel is the assistant. You pick one of six, each named
for a moment of the sky; it takes that name unless you give it your own, and its personality sets the assistant's tone.

## The six

| Name | Named for | Personality | Traits | Best at (for a student) | Tone today |
| --- | --- | --- | --- | --- | --- |
| **Dawn** | First light, 6:30 | Up before you, quietly glad you're here. | gentle, patient, hopeful | Getting the morning started: the first small thing, before the day piles up. | `friend` |
| **Ray** | Morning sun, 9:00 | All go, and it rubs off on you. | energetic, honest, cheerful | Planning the week and keeping it moving: the big thing first, momentum after. | `coach` |
| **Noon** | Midday, 12:30 | Few words. Clear light. Nothing wasted. | focused, calm, exact | Protecting focus blocks: the right task, the phone face down, the clock watched. | `direct` |
| **Goldie** | Golden hour, 16:00 | Warm, steady, and never in a hurry about money. | warm, steady, practical | Keeping money calm: what's available now, what's due this week, and no drama. | `friend` |
| **Dusk** | After sunset, 17:45 | Soft voice, slow breath, the day set down. | calm, kind, unhurried | Winding down: closing the day, a kind look at tomorrow, and off to sleep. | `friend` (a fourth tone, Calm, would fit better; see decisions) |
| **Star** | Night, 22:30 | The night owl who sees far and says little. | far-sighted, quiet, dependable | Deadlines far ahead: counts back from the due date, so the last night is never the whole project. | `coach` |

Names are plain sky words: short, warm, easy to say, not app names. The hour is only where the name comes from: the pick
stays with the person all day and wears its night form after sunset (Star is the other way round: pale and squinting by day,
itself at night).

### How each one talks (examples of tone, not product copy)

Three moments each: a morning nudge; "you finished everything today"; short on time before a deadline. No guilt words, no
em dashes, short.

- **Dawn:** "Morning. Water first, then one small thing: the BIO reading. That's the whole plan for now." / "Everything's
  done. The day is yours now, I'll be quiet." / "The lab is due at 11 and there's about an hour. Let's do the write-up only
  and skip the extras."
- **Ray:** "Up and at it. Two things today, the quiz prep is the big one. Let's open with that." / "All of it, done. Nice
  work. Tomorrow starts easier because of today." / "Essay in 2 hours. Outline the three points now, write for 60, read it
  once. Go."
- **Noon:** "Today: class at 10, then 90 free minutes. Use them for the lab." / "Done. Nothing left on the list." /
  "50 minutes until the quiz closes. Phone face down. Questions 1 to 8 first."
- **Goldie:** "Rent is set for Friday and there's $212 left after it. A slow morning is fine." / "That's everything. Good
  day, well kept." / "Two hours to the deadline. Enough for the part that's graded. The rest can wait."
- **Dusk:** "Easy start. One thing before noon, the rest later." / "All done. Dim the lights, you earned a quiet evening." /
  "An hour left. One breath, then the first paragraph. Just that."
- **Star:** "Morning. Three days to the project. Today's piece is the data table." / "Everything's done. Bed by eleven and
  tomorrow is already lighter." / "90 minutes. The order that fits: method, results, skip the intro. I'll watch the clock."

Each companion also carries a one-line **voice note** for the prompt (in `cast.html`, `voiceNote`), for example Goldie:
"Warm and steady, says the number once, then what it means for the week." Tone + voice note = the personality.

### How picking works

- Onboarding's "Make it yours" step becomes **Pick your companion**: six in a row, tap one. The big one on the sky at the top
  of the step celebrates. Under it: name, personality line, best at.
- **Its name** is filled with the companion's name. The person can type their own; a custom name keeps the look and the
  tone, and every user-facing text uses the name they chose (the app never says "Jarvis"). Until something is picked, nothing
  is chosen and it stays "your assistant", exactly as today (`UNNAMED_ASSISTANT`).
- The pick sets `assistantStyle` to the companion's tone (`friend`, `coach` or `direct`, the three in
  `ASSISTANT_STYLES`, `src/lib/assistant.ts`). Tone stays editable in Settings for anyone who wants Noon's look with a
  friendlier voice.
- Settings › your assistant gets the same row at the top (companion, name, tone) with "Change" opening the same six.

## The sprite format

- **Grid:** 24 × 24 cells, transparent background (today: 16 × 16). Body on rows 7 to 20, feet on 21 to 22, a soft shadow on
  row 23 (narrower in the air), crown above the head (up to row 3). Drawn in code from a few numbers per companion, no image
  files, like today's `companion.ts`.
- **One engine, six bodies:** a shape (`round`, `tall`, `boxy`, `pear`, `drop`, `hood`: one inset per row), a crown (`wisp`,
  `rays`, `halo`, `lowsun`, `firststar`, `antenna`), eyes (`round`, `focused`, `lidded`, `glow`), a mouth (`smile`, `grin`,
  `line`, `soft`, `smirk`), optional band (Goldie's scarf, Dusk's sunset stripe) and a few one-off touches (first light on
  Dawn's right side, Star's constellation). A new companion is one data row.
- **Palette:** five colours each (body, shade, highlight, trim, trim 2; a band for two of them) plus one shared ink,
  `#262320`, for outlines, eyes and feet. Colours are the sky's: peach and gold by day, blues after sunset, no purple.
  - Dawn `#f4b59c #d4866c #ffe6da #fff1e6 #ffd27a`
  - Ray `#f6b357 #d4842c #ffe3ad #f9a63a #ffe08a`
  - Noon `#ffdc6e #dcae35 #fff6d0 #fff6cf #ffe9a0`
  - Goldie `#f3a65a #c97a33 #ffd9ad #ffcb63 #fff0b8`, scarf `#c4542a`
  - Dusk `#5f87c4 #3f5f99 #bcd3f1 #ff8a45 #ffc08a`, stripe `#ff8a45`
  - Star `#203556 #142339 #3f5a86 #ffd77a #fff3c4`, eyes `#ffd77a`
- **Night form:** the same shape washed in moonlight (body toward `#dde6f3`, shade toward `#9eb0cc`, highlight white, crown
  paled toward gold or white) with a small gold crescent pin by the head, `#ffd77a`. Star inverts: by day it is the washed
  form with squinting eyes and no pin; at night it is its own colours with glowing eyes.
- **Frames:** idle 2 (the second is a blink, shown about 140 ms every 3.4 s); walk 4 (feet apart, together with a 1 px bob,
  apart the other way, together; arms swing); celebrate 4 (crouch, jump 3 px with arms up and happy eyes, the same with
  sparkles, land); sleep 2 (slumped 1 px, eyes closed, no feet, a Z that drifts). Walk runs at about 8 frames a second;
  celebrate is a 2.2 s cycle with idle in the gaps. Reduced motion shows frame 0 of each pose.
- **Scale:** whole multiples only, `image-rendering: pixelated`: 2× in lists and chips (48 px), 3× on cards (72 px), 4× on
  a phone's wheel (96 px, up from 64), 5× portraits (120 px), 6× on a laptop's wheel (144 px, up from 96). The wheel's
  `rest` size rule in `sky.ts` ("whole multiples of its 16 px sprite") becomes multiples of 24.
- **Facing:** sprites face right; the wheel flips them with `scaleX(-1)` when it turns back in time, as now.

## What would change in the app to adopt it

Nothing here is built; it needs the owner's yes (a design change to Today, onboarding and Settings).

**Companion engine** (`src/components/day-clock/companion.ts`, used by `day-clock/sky.ts`, `sky/companion-glyph.tsx`)

- Replace the 16 × 16 engine with the 24 × 24 one in `cast.html` (`SHAPES`, `FRAMES`, `pixels`, `formOf`): `Pose` becomes
  `"idle" | "walk" | "celebrate" | "sleep"` with a frame index; `nightOf` becomes `formOf(c, night)` (handles Star's
  inversion); `drawCompanion` paints 24 × 24. `COMPANIONS` becomes the six above, keyed (`dawn`, `ray`, `noon`, `goldie`,
  `dusk`, `star`); the old Aurora, Sol, Zenith, Gloam, Dusk and Nox go.
- `sky.ts`: the wheel draws the user's pick (not `COMPANIONS[1]`), size in multiples of 24 (4× phone, 6× laptop), `walk`
  frames on the step counter, `idle` while still (the blink gives it life at rest), `celebrate` when a thing is done (the
  done burst already hops the element; the pose adds the face and arms) and when a visitor beams it, `sleep` after 11 PM as
  now. The "stand" pose maps to `idle`.
- `CompanionGlyph` (the tab icon and chat avatar) takes the pick too, 24-cell viewBox. It renders on the server, so the
  pick must be readable from preferences in a server component (it is: `u.preferences`).
- The companion choice is a new preference, `preferences.companion` (`"dawn" | ... | "star"`, optional; unset = not chosen,
  Today shows Dawn by default so the wheel never has nobody on it). Schema: `UserPreferences` in `src/server/db/schema.ts`
  (a JSON column, so no migration). The `avatar` preference (`spark | orb | initial`) is retired in favour of the companion;
  `JarvisAvatar` draws the companion glyph.

**Onboarding, "Make it yours"** (`src/app/(onboarding)/welcome/onboarding.tsx`, `services/onboarding.ts`)

- The step becomes the pick (mock in `cast.html`): six companions, name field prefilled with the pick (clearing it keeps the
  pick and falls back to "your assistant"), the companion's morning line as the live sample, the tone shown as one line
  ("Talks like a friend") and changeable later in Settings. `NAMES` (Nova, Sage, Atlas, Max) goes; the companion names are
  the suggestions. `SAMPLE` by tone becomes a line per companion. Appearance (theme) stays on the step.
- `completeOnboarding` saves `assistant: { name, style, companion }`; style defaults to the companion's tone.

**Settings › your assistant** (`settings/jarvis/page.tsx`, `settings/memory/assistant-card.tsx`)

- A companion row at the top (sprite, name, tone, night form note) with "Change" opening the six. Name and Personality stay
  below; the Avatar radio goes. The preview messages (`composeMessage`) show next to the companion sprite.

**Prompt** (`src/server/jarvis/prompt.ts`)

- `buildContext` adds the companion's voice note next to `Personality:` (per-user, so it stays out of the static
  `INSTRUCTIONS`); bump `PROMPT_VERSION`. The model still never sees "Jarvis" as a user-facing name; it addresses itself by
  the chosen name.

**Tests to update or add**

- `tests/e2e/onboarding.spec.ts`: the "Make it yours" step (pick a companion, name prefilled, custom name wins, nothing picked
  keeps "your assistant"); `tests/e2e/helpers.ts` `signUp()` skips onboarding and is unaffected.
- `tests/e2e/clock-phone.spec.ts`: the companion on the wheel and on the line (size now 96 px on a phone; the tap on it still
  folds the line).
- `tests/unit/day-clock.test.ts`: add engine cases: every companion in every pose and frame stays inside 24 × 24, has an
  outline and two feet when on the ground, the night form differs from the day form, Star inverts, reduced motion is frame 0.
- `tests/e2e/mobile.spec.ts` and `no-overlap-phone.spec.ts`: the pick row at Extra large text (six 48 px chips fit a phone).
- A unit test that no user-facing string in the companion data contains "Jarvis" or an em dash.
- ADR: a new `docs/adr/00xx-companion-cast.md` (the cast, the pick, the tone mapping, the 24 × 24 format).

## Decisions for the owner

1. The six names and looks (Dawn, Ray, Noon, Goldie, Dusk, Star), and whether any should be swapped.
2. Tone mapping: keep the three tones with Dusk on `friend`, or add a fourth tone, **Calm** (quiet, kind, one thing at a
   time) for Dusk. Three companions on `friend` is a lot; Calm would also suit Goldie's money voice.
3. Default when nothing is picked: Dawn on the wheel (proposed), or keep the current Sol-like look until a pick.
4. Retire the `avatar` setting (spark, orb, initial) in favour of the companion.

## The cast becomes five (owner, 2026-11-11)

The owner asked whether the skylings look like their part of the day, wanted night to get the morning's attention
("alot of nightowls out there"), and settled on five that follow the real sky, like the five times the sun marks
(the app never mentions prayer times): **Dawn** (first light), **Ray** (the day; Noon folded into it), **Goldie**
(golden hour), **Star** (sunset into the evening; Dusk folded into it, so Star wears the last sunset glow for its first
hour) and **Moon** (new: from 9 PM, or two hours after sunset when later, until first light, when it turns into Dawn).
Moon is a moon: its night side in deep blue down one side, craters, half-closed eyes and a small smirk, two little stars
beside it; calm late-night company that never scolds anyone for being up. Saved choices of Noon become Ray and of Dusk
become Moon. Pictures: `five-skylings.png` (drawn first, approved), `cast-by-moment.png` (the six before).
