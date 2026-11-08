# Audit: /welcome on a phone, rendered (2026-11-08, evening)

**What I did.** Production build (.next from 19:04) with `next start` on port 3100 against `budgetflow_e2e` and the fake model. A throwaway Playwright script outside the repo signed up a new user through the real UI and walked every step (hello, what fills your week, class and job, make it yours, Your day, connected, then Today with the tour) with the iPhone 15 device (393 px wide), at default text and at Extra large (`lf_text=xlarge`, root font 20 px). Chosen path: "Both", PSY 101, Target, "Nova", Coach. Not covered: the "Neither"/"Classes only" paths, dark theme, and real Safari (Chromium only). The repo's own `tests/e2e/onboarding.spec.ts` exists (desktop project); I did not run it.
Screenshots: `docs/audits/shots/2026-11-08-welcome/` (`default-*` and `xlarge-*`, numbered in step order).

**Clean (checked in the rendered page).**
- No horizontal overflow and nothing off screen on any /welcome step, at either size (scrollWidth 393 everywhere).
- Text scales: root font 16 px to 20 px, every step re-flows with no clipping.
- No em or en dash on any step, and "Jarvis" never appears. The assistant shows as "Nova" or "Your assistant".
- Every button did something: Let's go, Continue, Back, the name suggestions, the personality rows, Show me my day, Skip, the three card actions (each opens its note), Show me another day, Meet Nova first (reaches Today with the tour). No page or console errors in either run.
- While the day "connects", every invented chip carries "EXAMPLE" (checked in the DOM at both sizes: the only untagged chip is the real clock time). Nothing says Jarvis.

## Findings, ranked

### 1. Text boxes are 40 px tall at default text size: fix now
Name ("What should I call you?"), class, job and assistant name are 345 x 40 px, under the 44 px rule. At Extra large they pass (the height is in rem). Shots: `default-01-hello.png`, `default-03-details.png`, `default-04-yours.png`. Fix: `min-h-11` on `Input` (src/components/ui/field.tsx) or on these inputs.

### 2. Long job name is cut off in the example chips at Extra large: fix now
"18.5 paid hours this week · Targ…" in the result card and "Shift · Wed 5 to 10 PM · Tar…" while connecting: the user's own job name is truncated (`truncate` on the chip label in `day-preview.tsx`). A longer job name (up to 60 characters is allowed) will cut at default size too. Let the label wrap (drop `truncate`, allow `break-words`). Shots: `xlarge-07-day-result.png`, `xlarge-06b-day-connecting-chips.png`.

### 3. Personality row is cramped at Extra large: fix now (minor)
On the selected Coach row, "Coach" and "Motivating, holds you to your goals" sit hard against each other and the hint wraps up beside the label; it reads as one jumbled line. Stack the hint under the label when it doesn't fit (`flex-wrap`/`flex-col`). Shot: `xlarge-05-yours-filled.png`. Fine at default size.

### 4. On the result screen, the invented numbers have no "example" tag next to them: needs the owner
The tags show while the day connects, but on the result cards the chips are built with `example: false` (day-preview.tsx, "From" chips) and the numbers in the titles ("Add $55 a week...", "$186 available", "Rent ($1,100)") carry nothing. The only marker is one small line under the last card: "Example numbers. Connect your accounts and these become real." At Extra large the page is about 4,600 px tall, so the first card shows its numbers a long way from that line. This breaks "every invented number is tagged example" as written in CLAUDE.md. The fix changes how the screen looks (tag per card, or the note pinned at the top), so it is the owner's call. Shots: `default-07-day-result.png`, `xlarge-07-day-result.png`.

### 5. Two "Skip" buttons with different meanings while the day connects: needs the owner
"Skip setup" (top right, leaves onboarding) and "Skip" (just below, jumps to the result) are stacked about 40 px apart. A tap on the wrong one ends onboarding. Not a bug, a wording/layout choice. Shot: `default-06-day-connecting.png`.

### 6. The first screen guesses a name from the email: fix now if confirmed, small
A test email `qa-...@example.com` produced the title "Hi Qa." and a pre-filled field. It is editable and required before continuing, so it is harmless, but an address like `jdoe1234@...` would greet someone as "Jdoe1234". I only saw this one case; check how `firstName` is derived (page.tsx) before changing. Shot: `default-01-hello.png`.

### Outside /welcome, noticed in passing (not investigated)
After the tour, Today has a horizontal chip row ("Help me study" runs past the right edge, at both sizes) and a "300 characters left" label that clips. Probably a scroller by design; worth a look in a Today pass. Shot: `default-11-after-today-tour.png`.

## Hand-off
Findings 1, 2, 3 (and 6 once confirmed) are `fix now` for the developer. 4 and 5 are `needs the owner`.
