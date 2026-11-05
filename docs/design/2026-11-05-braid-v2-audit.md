# Audit of the braid v2 prototype (2026-11-05)

Independent audit by a fresh reviewer given none of the design conversation, against the owner's complaint that the prototype is busy, the line is not understandable and time is hard to read. Prototype: scratch file `lifeflow-braid-v2.html` (published link in the product chat). No changes were made; the fix list is decided with the owner first.

---

# LifeFlow braid v2: first-time user and QA audit

Prototype: `lifeflow-braid-v2.html`, tested in Chromium (Playwright) at 393x852 unless stated. Screenshots are in `shots/`. Scripts are `s1.js` to `s11.js` with helpers in `h.js` and `hook.js` (it records every word drawn on the canvas with its box, so overlaps are measured, not guessed). Google Fonts loaded in this run.

## 1. Verdict

The owner is right: the problem is what the line means, not how it is drawn. In all three forms, height and twist on screen mean nothing a person can read, so a stranger sees colored lines with the letter D on them, not "my life over time". The screen gives the person one clear sentence (what Dev did tonight) and one clear line (free for 20 minutes, then the shift), but never says, in words, how money, school, work, health and life are doing right now. The readable version already exists inside the prototype: hold a finger on the braid and the panel lists each area in words, and tapping a knot puts words on each strand. That is hidden behind a gesture nobody is told about. On top of that the time is hard to read: there are no hours, the Now label disappears as soon as you move, three different time markers can show at once, and "Back to now" sits on top of the moving time label and hides the day.

## 2. Root causes

1. The vertical position, the twist and the crossings carry no meaning a person can read, so the eye reads a line chart that is not a chart.
2. Nothing on the opening screen says, in words, how each part of life is doing right now; the only per-area words appear while holding a finger down.
3. Too many visual codes at once (about 15: five colors, width, three dash styles, fade, twist, water band width and tint, four knot styles all marked "D", five bead styles, glow) with only two of them explained.
4. Time has no anchors: no hour marks in Days, the Now label vanishes when you pan, and the moving time label sits under the "Back to now" pill.
5. Two "nows" compete: the top line always describes the real now while the panel describes wherever you dragged, and nothing ties the two together.
6. The screen tries to hold everything at once (Dev sentence, now line, zoom, braid, legend, panel, six suggestion chips, input, footnote), so the one thing that matters has no room.

## 3. Findings

Severity: blocker = stops a first-time user understanding or trusting the core; major = a real person will hit it and be confused or misled; minor = polish or edge case.

| id | sev | area | what is wrong | evidence | suggested fix |
|---|---|---|---|---|---|
| A1 | blocker | A | Height and crossing of a strand mean nothing. The money strand pulled out still twists up and down; its value is only in width. People read up as more. | `B-strand-money.png`, code `strandPos` (y = sine of phase) | Give each area its own row where height or a filled band is the value, or drop y as a signal and say so. |
| A2 | blocker | A | No per-area state on open. You cannot tell how money, school, work, health or life are doing without holding or tapping. | `A1-open-*-nointro.png`; per-area words exist only in `B-hold-to-simplify.png` | Put five one-line rows (area name, state in words, next thing) on the opening screen. |
| A3 | blocker | A | "Back to now" covers the left part of the moving time label: you see ":1:39 AM" but not the day. Reproduces the owner's complaint at every pan beyond about 30 h. Overlap measured 28 to 32 px by 9 px of the text; the pill boxes overlap more. | `A3-owner-overlap-backtonow-covers-day.png`, `A3-owner-overlap-during-drag.png`, `C-rosa-knot-helix.png` | Move "Back to now" to the side where now is (with an arrow) or into the time label itself ("Thu 11:39 AM, back to now"). |
| A4 | blocker | A | The line is not explained anywhere on the first screen. The Dev sentence talks about tonight; the intro card explains loose and tight only; the help list ("Try this") only shows on desktop. | `A1-open-braid-intro.png`, `C-1440x900-light-nointro.png` | One fixed caption on the braid: "Your next 3 days. Each line is a part of your life." |
| A5 | major | A | Colors are tied to areas only by a legend below the time axis, far from the lines. Money (#23704f) and Life (#25707a) are near twins; Work and Mia are both brown; School and Clients are identical. | `A1-open-braid-nointro.png`, `C-rosa-knot-helix.png` | Label each line at its left end; pick five colors that differ in hue and lightness. |
| A6 | major | A | Days zoom has no hour marks. The only way to know when a point is, is to press it. Day names sit at noon ("Today" centered on noon) so a stranger cannot read 1:40 PM from the axis. | `A1-open-braid-nointro.png` | Add 6 AM, noon, 6 PM ticks and a "now 1:40 PM" label that always stays. |
| A7 | major | A | The "Now" label disappears as soon as the view leaves now; the green now line stays unlabelled, often at the very edge. | `B-knot-money-open.png` (green line at left, no label) | Keep a small "Now" tag on the now line at all times. |
| A8 | major | A | Up to three time markers at once: now line, lens line with top pill, touch line with bottom pill. Each says a different time. | `B-hold-to-simplify.png` (Thu 6:30 AM, Fri 8:54 AM, plus now) | Keep one marker: the lens. When touching, the lens follows the finger. |
| A9 | major | A | Two "nows": the top "Now: Free for 20 minutes" never changes when you pan, while the panel describes the dragged time. Nothing links them. | `A3-pan--120.png` (top says now, panel says Thu 11:39 AM) | When away from now, change the top line to the dragged time or fold it into the panel. |
| A10 | major | A | Which way time runs is not shown. Past is only slightly faded; no arrow, no "earlier / later". | all opening shots | Add "Earlier" and "Later" edge hints or fade the past more and say "past" once. |
| A11 | major | A | Knots all read "D". Four knot styles (green filled, amber filled, outlined, dashed) are not explained; D (Dev) is never named on the canvas. | `A1-open-braid-nointro.png` | Replace D with a short word or icon per kind ("Fixed", "Needs you"). |
| A12 | major | A | The water band (tan wash that widens and turns amber) is a whole extra code that is never explained on the phone. | `A1-open-braid-nointro.png` | Remove it, or use it as the only "busy" signal and label it. |
| A13 | major | A,D | "Two things need you" but only one is visible on the Days screen (the second is a December week knot). | `A1-open-braid-nointro.png`; `needs()` includes week knots | Count only what this view shows, or list both in the panel. |
| A14 | major | A,D | "Next up" lists events that already happened (10:30 AM Econ, cafeteria, Target) above the real next thing; in Pulse and Helix at 393x852 the next thing (the shift) is below the fold, so "Next up" shows only the past. | `A1-open-pulse-nointro.png` | Title it "Today" or start the list at now. |
| A15 | major | A | Helix shows only one "digital" strand at a time (the dominant one), switching color along the backbone; the 5-color legend no longer matches. The Life backbone is drawn tan (the "you" color), not the Life teal in the legend. | `A1-open-helix-nointro.png`, code `dominant()` | If Helix stays, legend must change to "Digital life / Real life". |
| A16 | major | A | Pulse lanes have no names. Lane order matches the legend but nothing says so; "Call with Mom" is drawn on the School lane. | `A1-open-pulse-nointro.png` | Name each lane at its left end. |
| A17 | major | B | Hold-to-simplify has no hint anywhere before you hold; the hint ("hold to read, let go to see it all") only appears while holding. Not in the intro card or the help list. | `B-hold-to-simplify.png`, `A1-open-braid-intro.png` | Make the readable state the default, not a hidden gesture. |
| A18 | major | B | Knot words are not tappable. Tapping "$10 short tomorrow" moves time instead of opening the knot. Knot hit area is a 26 px circle on the D only. | s4 output: tap word gives focus "time" | Make the word and the D one target. |
| A19 | major | B | A short drag that ends within 24 px of any knot opens it (drag 60 px opened "I loosened tonight"). Panning past knots keeps snapping into them. | s2 output, DRAG -60 | Snap only on tap, not on drag end. |
| A20 | major | B | A tap anywhere on empty canvas jumps time (tap top right moved 48 h ahead). Easy to lose your place by accident. | s10 output | Tap on empty space should do nothing or show the moment, not move the view. |
| A21 | major | B,D | Dragging the dashed review bead is far too sensitive: 60 px moved it 11 hours, past the quiz, and Dev then said "Lights out 9 AM: 0 h before the quiz". | `B-bead-drag-after.png` | Limit drag range to the same evening; refuse moves past the event it serves. |
| C1 | major | C | Play: the date in the top bar never changes after midnight ("1:08 AM WED NOV 4", should be Thu). | `B-play-wrong-date-stale-panel.png`, s6 log | Re-render the date in `stepLive`. |
| C2 | major | C | Play: the panel freezes. At 2:44 AM it still shows "Next up: 2 PM shift". | `B-play-wrong-date-stale-panel.png` | Re-render the panel when now passes an event. |
| C3 | major | C | Rosa's Home strand has no color: `--home` is not defined, so the chip has no swatch and the line falls back to the accent green, next to Money green. | `C-rosa-knot-helix.png` (Home chip without swatch), grep `--home` = 0 | Add `--home` in light and dark. |
| C4 | major | C | Canvas label contrast in light mode fails: "Call with Mom" 2.6:1, "Concert" 2.6:1, "Thanksgiving" 2.6:1, "Evening at home" 3.9:1, "Tomorrow" 4.05:1. All canvas text is 11 to 13 px. | s8 output | Darken the "you" label color; raise canvas text to 13 px minimum. |
| C5 | major | C | Past rows in the panel are at 55% opacity: time text about 2.3:1, label about 3.9:1. | CSS `.moments .past` | Use a muted color that passes 4.5:1 instead of opacity. |
| D1 | major | D | School shows "Pressure 62 of 100", a score. The vision says no scores, no percentages. | hold panel and school point | Say it in words: "Busy week: 2 exams, 4 assignments". |
| D2 | major | D | Movement does not match between views: Health totals "42 active minutes" today vs the strand at now "35 active min" (Ali); Rosa 18 vs 40; Sam 61 vs 45. | s3 output | One function for "movement today". |
| D3 | major | D | Sam: knot "Morning runs: 4 of 5 kept this week" vs Health totals "3 of 4, your goal". | s3 output | Same source for both. |
| D4 | major | D | Future values shown as fact in the hold panel: at Fri 8:54 AM "Money $400.12" (includes expected pay, not marked) and "Slept 6 h 10 min, 35 active min" for a day that has not happened. | `B-hold-to-simplify.png` | Mark expected values "expected"; show nothing for future health. |
| D5 | major | D | After "Remind me at 8 AM" the knot turns to "Handled, Covered". Nothing is covered; only a reminder exists. | `B-knot-money-after-fix.png` | Say "Reminder set. Still $10 short until you move it." |
| B1 | major | B | Tap targets under 44 px: Play 62x34, Dev knows 81x34, A 34x34, Days 48x30, Weeks 57x30, Horizon 62x30, every strand chip (34 high), Got it 57x34, Back to now 94x30, Send 38x38, every suggestion chip (36 high), "You might be short" line (40 high); in sheets Close 36x36, Braid/Pulse/Helix and System/Light/Dark (34 high), Cancel (40 high); knot hit circle 52 px but beads only 26 px. | s5 output | 44 px minimum height. |
| F1 | major | F | Sheets are `aria-modal` but focus is not trapped: Tab leaves the sheet into the page behind. | s5 "TAB in sheet" | Trap focus; restore on close (already done). |
| F2 | major | F | The panel is `aria-live="polite"` and re-renders on every pan frame, so a screen reader is flooded while dragging. | code `queuePanel` + `#panel` aria-live | Announce only when the drag ends. |
| F3 | major | F | The canvas has one fixed label. The braid's content (strands, knots, beads) is not exposed except through the panel. | `#rope` aria-label | Add a hidden list of the visible moments and knots, updated with the view. |
| E1 | major | E | Each frame strokes about 680 separate 3 px segments (braid and pulse; helix 280), and `pressure()` loops over every event for every sample. Fine on a desktop CPU (avg 17 ms) but at 4x CPU slowdown it runs at 15 fps (avg 66 to 69 ms, worst 117 ms), idle or panning. | s9 output | One path per strand per style run; cache pressure per time step. |
| E2 | major | E | The canvas redraws at 60 fps forever while idle ("always moving a little"). Battery cost on a phone. | s9 idle measurement, `frame()` | Stop after a few seconds idle; resume on touch. |
| A22 | minor | A | The Now line runs through the knot words "Tonight, loosened" and "3 of 4 early nights" and the "Today" label on open. | `A1-open-braid-nointro.png` | Keep knot words out of the now column. |
| A23 | minor | A | Knot words are cut at the screen edges ("onight, loosened", "Pay a bit smaller", "Saturday morning, yours"). | `A3-pan--120.png` | Clamp words inside the canvas. |
| A24 | minor | A | Weeks: three D badges stack on top of each other near now ("DDD"). | `A-zoomWeeks-braid.png` | Merge into one badge with a count. |
| A25 | minor | A | Horizon: "Jan 2027" and "Feb" labels touch; data stops mid-screen with no "no plans yet" note. | `A-zoomHorizon-braid.png` | Short "Jan" with year under it; say where data ends. |
| A26 | minor | A | Knot open: untangled lane word "$40 left, bills $50" overlaps "Evening at home" (93x12 px). Rosa Helix: "Shift at 7" overlaps "Friday night, movie with Mia". | `B-knot-money-open.png`, `C-rosa-knot-helix.png` | Hide water words while a knot is open. |
| A27 | minor | A | Hold: the touch time pill covers the knot word "Pay a bit smaller" (73x8 px). | `B-hold-to-simplify.png` | Put the touch time at the top with the lens. |
| A28 | minor | A | The strand chip row is cut off: Ideas at 393, Life and Ideas at 360 are off screen with no scroll hint. Ideas is a chip but not a strand on the braid. | `C-360x780-dark-nointro.png` | Fit five chips; move Ideas elsewhere. |
| B2 | minor | B | Play: the "Preview" tag slides under the Stop button. A toast covers the panel and chips. | `B-play-wrong-date-stale-panel.png` | Drop the tag; the Stop button says enough. |
| B3 | minor | B | Money list shows "Fri 9 AM Paycheck $466.00" with no date; it is last Friday, next to this Friday's expected paycheck, also "Fri 9 AM". | `B-strand-money.png` | Show dates for other weeks. |
| B4 | minor | B | Short screens: at 393x700 the panel is 128 px tall; with the intro card the "Got it" button is below the fold of a scrolling box. At 320 px the date in the header is clipped. | `C-393x700-light-intro.png`, `C-320x640-light-intro.png` | Show the intro as an overlay, not inside the panel. |
| D6 | minor | D | Mia's strand uses the "Life" template: "2 stretches that are yours this week", "Next with people: Pick up Mia". | `C-rosa-pulse-strand-mia.png` | Own summary for a person strand. |
| D7 | minor | D | Rosa: "Slept 5 h 20 min last night" though she slept in the day after a night shift. | s3 output | "Last sleep". |
| D8 | minor | D | Ali Life at now reads "0 h of your own time" while the top says "Free for 20 minutes" and Life totals "4 stretches that are yours this week". | s3 output | Do not show a zero as a fact mid-day. |
| D9 | minor | D | Work "22 h this pay period" vs strand "7 h scheduled" (7 days around the moment); both say scheduled. Sam's clients show "this pay period" with "no fixed pay". | s3 output | Name the window ("this week", "this pay period"). |
| D10 | minor | D | Dev knows: trust text lists "Connected now: your bank, Canvas, Apple Health and the schedule photos" but the list above says "Your calendar feeds Life". | `B-sheet-devknows.png` | Make the two lists the same. |
| D11 | minor | D | Tech words in user copy: "Every connection is a variable", "feeds", "computed only from the connections", "inputs", "Nothing synced here", "Form (exploration)". No em dashes, no "AI" or "model" found. | grep | Plain words: "Where this comes from". |
| F4 | minor | F | The text input has no visible focus style (`outline: none` and no focus ring on the form). | CSS `.tellform input:focus` | Ring on `.tellform:focus-within`. |
| F5 | minor | F | Keyboard path works but is long: knot opening needs canvas focus, arrows, Enter; the knot's own buttons are then reached by Tabbing through zoom and all chips first. | s5 output | Move focus to the panel title when a knot opens. |
| F6 | minor | F | Reduced motion: drawing stops when idle and the intro shows a still frame with all three captions; works. Knot pulse and drift stop. No issue beyond the static intro being hard to read. | `C-393x852-rm-intro.png` | None needed. |
| C6 | minor | C | No console errors or page errors in any run; no horizontal page overflow at 320, 360, 393 or 1440, light or dark. | s1 to s11 logs | None. |

Totals: 4 blockers, 33 majors, 20 minors (the minors include two "works as expected" rows, F6 and C6, kept for completeness).

## 4. Shared across all forms vs form specific

Shared by Braid, Pulse and Helix (so the owner is right, it is the representation and the screen around it):
- y position carries no readable value (A1).
- No per-area state in words on open (A2).
- No hour marks, Now label vanishes on pan, three time markers, "Back to now" over the time label (A3, A6, A7, A8).
- D knots, water band and dash styles unexplained (A11, A12).
- Two nows, "Two things need you" with one visible, "Next up" shows the past (A9, A13, A14).
- Interaction traps: words not tappable, drag snaps to knots, tap jumps time (A18, A19, A20).
- All data and honesty issues (D1 to D11) and all accessibility issues.

Form specific:
- Braid: strands cross constantly, so following one color is close to impossible; depth shading makes back halves fade into the water.
- Pulse: the most readable of the three because each area keeps its own lane, but lanes have no names and the beat shape means nothing (A16). It is the best base to build on.
- Helix: shows only one digital strand at a time and draws Life in the wrong color, so the legend is wrong (A15). Its "digital life and real life" idea needs a sentence the screen does not have.

## 5. Information audit of the opening screen (A8 in the brief)

| Item on open | Needed in first 5 s | First minute | Only on demand |
|---|---|---|---|
| Time and date (1:40 PM Wed Nov 4) | yes | | |
| Play button | | | yes (demo tool) |
| Dev knows button | | | yes |
| A (person sheet with plan, forms, theme) | | | yes |
| "Dev" label | | yes | |
| Dev sentence ("Tonight's tight, so I loosened it. Two things need you.") | yes, but it should say what needs you | | |
| Now line ("Free for 20 minutes. Then your shift, 2 to 9 PM") | yes | | |
| Now pill on the braid | yes | | |
| Days / Weeks / Horizon | | yes | |
| Braid: 5 strands, width, dashes, twist | only as "how busy" | | the exact numbers |
| Water band and its tint | no | | no |
| 4 D knots | the one that needs you | the others | |
| 4 knot words | the one that needs you | | |
| 14 beads | | | yes (they are the list below) |
| 2 real-life words ("Call with Mom", "Evening at home") | | yes | |
| Day labels | yes, with hours | | |
| Strand legend chips (6) | yes, if they also carry state | | |
| Intro card (animated, 3 lines, Got it) | no; it covers the panel | first visit only | |
| "You might be $10 short tomorrow" | yes | | |
| "Next up" list | the next 1 or 2 items | the rest | past items: on demand |
| "Noticed here" line | | yes | |
| 6 suggestion chips | | | yes |
| Tell Dev input | | yes | |
| "Prototype..." footnote | no | | |

Count on open (no intro): 17 visible buttons, 38 visible text items in the page, 14 words on the canvas, 14 beads, 4 knots, 5 strands, about 15 distinct visual codes. With the intro card the panel shrinks to two rows.

Minimal opening set:
- Stays: time and date; one Dev sentence that names what needs you; the "Now" line; five area rows, each with name, color, state in words and next thing (this replaces the legend and most of the panel); one band of time with the now marker, hour marks and the area lines labelled; the one "Needs you" card; the input.
- One tap deeper: Weeks and Horizon (a single "Zoom out" control), Play, Dev knows, the other knots, the full list of moments, real-life words, the person sheet.
- Disappears: the water band and its tint, the D letter on knots, the separate legend row, dash-style meanings on the main view, the 6 suggestion chips (show one, as a placeholder in the input), the footnote, the intro card as a panel item (if kept, an overlay with one sentence).

## 6. What is missing (A9 in the brief)

On open a person most wants, in plain words, and the screen does not say:
- How each area is right now: "Money: $40.12 in checking, bills $50 tomorrow", "School: Bio quiz tomorrow 9 AM", "Work: shift 2 to 9 PM", "Health: slept 6 h 10 min", "Life: call with Mom tomorrow". The data exists (hold panel, totals) but is hidden.
- What needs me and by when, in one line, and what the second "thing that needs you" is.
- What Dev already handled, as a list I can check ("I moved your review to 9:30 PM").
- What this picture is: "your next three days", "now is here", "later is to the right".
- How the rest of today goes, hour by hour, without pressing.

## 7. The ten things to fix first

1. Put five area rows in words on the opening screen (A2). This alone answers "how is my life right now" and is the owner's ask.
2. Give the line a readable meaning: one lane per area with the name on it, and height or a filled band as the value (A1, A16). Pulse is the closest start.
3. Add hour marks and keep a "Now" tag on the now line always (A6, A7). People need to know when a point is without pressing.
4. Fix "Back to now": move it next to the now side with an arrow, or merge it into the time label (A3). This is the owner's exact complaint.
5. One time marker only: the lens. Make the top "Now" line follow it or say clearly it is "right now" (A8, A9).
6. Make the readable state the default: what hold shows today should show at rest (A17).
7. Cut codes: drop the water band, the D letter, and dash meanings from the main view; label knots with a word (A11, A12).
8. Fix the counts and lists that disagree with what is shown: "Two things need you", "Next up" with past items, "Covered" after a reminder (A13, A14, D5).
9. Fix data mismatches and the score: movement minutes, runs, future values shown as fact, "Pressure 62 of 100" (D1 to D4). Trust breaks on the first mismatch.
10. Fix interaction traps and Play bugs: tappable knot words, no snap on drag, no time jump on tap, bead drag limits, Play date and panel (A18 to A21, C1, C2).

## 8. What I could not test

- Real phones (iOS Safari, Android Chrome): touch was emulated through Chromium, so momentum, edge swipes, the home bar and safe areas were not checked.
- Screen readers: checked labels, live regions and focus by code and keyboard only, not with VoiceOver or TalkBack.
- Real first-time users: the 5-second tests are my reading as a stranger, not observed people.
- Frame timing on real phone GPUs: measured on a desktop CPU, with 4x CPU slowdown as a rough phone stand-in.
- Fonts offline: Google Fonts loaded here; the fallback fonts were not checked for label widths.
- Every persona action (photo shifts, tells, forget, guesses) was only partly exercised; I ran the money knot, the review bead, Play, strand pull-outs, sheets, and all three people.

## Appendix: 5-second test per form (A1 to A7 in the brief)

Braid, intro dismissed (`A1-open-braid-nointro.png`). A stranger gets: it is 1:40 PM Wednesday; Dev loosened tonight; something about $10 short tomorrow; free for 20 minutes then a shift 2 to 9 PM. They do not get: that the colored lines are their life over time, which line is which, why lines go up and down, what D means, what the beige band is, what time any point is besides "Today". Time direction: not shown. Now: the green "Now" pill is clear until you move. What Dev handled: one item in the sentence, the rest are D badges.

Braid with intro: the intro card explains "loose and wide is yours, tight and glowing is a conflict" with a looping animation, but it pushes the useful panel down to nothing and does not say this is a timeline.

Pulse (`A1-open-pulse-nointro.png`): reads more like "five things over time" because lanes are separate, but lanes are unnamed and the Dev sentence grows to three lines ("Each line beats with its own pressure"), pushing the next thing below the fold so "Next up" shows only past items.

Helix (`A1-open-helix-nointro.png`): reads as one or two lines; the five-color legend does not match; "Digital life and real life, twisting together" is abstract. Least understandable of the three.

Per-area state at a glance (all forms): not possible. Width differences are too subtle to compare and are scaled to each person's own range, so "thin" means nothing absolute.

Panning (all forms): the panel updates (title is the dragged time and "A full stretch" or "Loose water"), but the top line stays on the real now, the day part of the time label is hidden under "Back to now", and the Now label is gone. Way back: the "Back to now" pill, which works.
