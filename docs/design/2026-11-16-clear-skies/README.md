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
