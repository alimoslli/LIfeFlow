# Clear Skies (prototype, 2026-11-16)

The third direction for the skylings' game, after Sky Relay (`../2026-11-12-sky-relay/`) and Starlight
(`../2026-11-12-starlight/`).

## Why a new direction

The owner, after Starlight's round 5: "The game is still very tiring to play on a MacBook, especially since the stars
sometimes are very close together. Even the motion of it, I don't know. I don't like it. Think of something better."
Every Starlight version kept three tiring things: a screen that never stops moving, small targets to hit, and a clock
to keep up with. What he responded to across all of them: lighting stars along a line, shapes and lines completing,
and Twinkle. His games are Block Blast and Subway Surfers. He chose this over a lane runner ("Starfall").

## The game in one line

A still night sky on a 7 x 7 grid: slide Twinkle to light the stars, clear whole rows and columns, and don't get
boxed in by the clouds.

- One move is one arrow key (or WASD), one swipe, or one click or tap on the side of Twinkle you want. On a laptop,
  hovering shows where that side's slide would stop.
- Twinkle slides until a cloud or the edge stops it, lighting every star it passes: +1, +2, +3... in one slide.
- A row or column of lit stars clears: its stars rise into the sky and leave empty night behind, and the clouds touching
  it are blown away. Two lines in one slide is a Double (4x), three a Triple (9x); clearing on back-to-back moves
  builds a streak. No clouds left: "Clear skies!" +50.
- After each move a storm cloud lands where a dashed outline showed it would (one at first; two from about move 25,
  sometimes three after move 110), and about six new stars appear in empty spots.
- A line one star from clearing glows softly. Small arrows at Twinkle's sides show the ways it can go.
- No timer, and nothing moves until you do. Boxed in on all four sides: night falls.

## What the bot found while tuning

- First rule (clouds didn't count against a line): far too easy; a line cleared almost every move. Now a cloud in a
  line blocks it, and clearing a line next to a cloud is how clouds go.
- A loop: standing on a cloud's landing spot made it skip; it now drifts to another spot.
- A loop: slide along an empty row, it clears, slide back, it clears again. Cleared stars now leave empty sky that
  refills a few stars at a time, so a line needs several moves.
- An early trap: in the first dozen moves no cloud lands where it would box Twinkle in. The opening clouds stay out of
  Twinkle's row and column, so the second move can clear the first line.
- Now: first-timer-like runs (one move ahead, a slip one time in five) last about 45 to 60 moves, about 1.5 to 2
  minutes, with 3 to 12 lines; a careful bot (two moves ahead) 60 to 70 moves and a clear every 3 or 4 moves. Doubles
  are rare for the bots, which don't plan for them; a person who lines up several rows one star short and slides
  across them can make them. No page errors, 60 fps.

## Files and checks

`game.html` + `game.js`, `engine-entry.ts` (the app's real Twinkle, star and cloud art), `build.mjs` (bundles them into
`clear-skies.html`), `check.mjs` (bot runs at phone size). Debug parameters: `?bot=1`, `?bot=human`, `?speed=N`,
`?seed=N`, `?debug=1`.

`node docs/design/2026-11-16-clear-skies/build.mjs && BOT=human node docs/design/2026-11-16-clear-skies/check.mjs 6 60`

## Round 2 (owner, 2026-11-16)

The owner: "It's pretty nice. I like that you're thinking outside of that ... but it's impossible to win. You always get
boxed in. Add more to it ... I want the game to be played with the arrows. I'm addicted. Faster-paced, maybe."
- Eight nights you can win, each a goal and one new thing, with a move limit ("moves left"; run out and morning comes)
  and 1 to 3 moons by moves (par): 1 First light (clear 3 lines), 2 Shooting star (5 lines), 3 Golden stars (260
  points), 4 Winds (6 lines), 5 The Kite (light its 9 stars, 42 moves), 6 Storm front (blow away 10 clouds), 7 Double night (a
  puzzle start: a row and a column one star short meet at one star; up, then right), 8 The long night (12 lines).
  Endless opens after Night 3. Progress and moons stay in this browser.
- Shooting stars, the way out of a box: Space, then an arrow, and Twinkle blasts straight to the edge through the
  clouds, blowing them away. Earned from Doubles, golden stars and every 6 lines or so (up to 3). Boxed in only ends
  the night with none left.
- Golden stars (+5, and they charge a shooting star). Winds: Twinkle turns where a wind blows, so one key can light an
  L or a zigzag; clouds can cover a wind, and it blows again once the cloud goes. The kite: outlined stars, never
  covered by clouds.
- Faster: slides at 30 cells a second, clears in 0.3 s, up to two arrow presses queue up. Arrow keys or WASD on a
  laptop; on a phone, on-screen arrows and a shooting-star button, and swipes.
- Bot checks (careful bot, 3 tries a night): nights 1 to 3 and 6 won every time, 4, 5, 7 and 8 most times; a
  first-timer-like bot wins 1, 2 and 6 easily and finds 4, 5, 7 and 8 hard. Two loops found and closed (winds and the
  kite were never covered, so a run could go on forever; now clouds cover winds and every night has a move limit).
  `node docs/design/2026-11-16-clear-skies/check.mjs 3 1` (tries per night, Endless runs).

## Round 3: back to simple (owner, 2026-11-16)

The owner on round 2: "too long, boring, got too complicated and far from the vision of a simple addicting game."
Round 2 answered "add more to it" with eight nights, goals, move limits, moons, shooting stars, winds, golden stars and
a kite, which buried the simple loop he was hooked on in round 1. Round 1's code is back as the base, with only:
- One rule that fixes "always boxed in": a cloud only drifts in when a move doesn't clear a line (where the dashed
  outline shows). Keep clearing and the sky stays clear; how long you last is down to your play. From move 40 a miss
  sometimes brings two.
- Faster: slides at 30 cells a second, clears in 0.3 s, two arrow presses queue up.
- Arrows: arrow keys or WASD; on-screen arrows on a phone (and swipes).
- Checks: first-timer-like runs 54 to 102 moves (7 to 38 lines), careful 89 to 106 moves with a clear about every
  third move; no page errors, 60 fps.
Round 2 stays in git (commit `ae91bf8`) if any of its pieces are wanted later, one at a time.
