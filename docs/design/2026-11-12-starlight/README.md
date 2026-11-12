# Starlight: one move, built deep (prototype, 2026-11-12)

The second try at the skylings' game. The first, Sky Relay (`../2026-11-12-sky-relay/`), gave each of the five
skylings its own move. The owner's verdict after playing: "it felt like replicas of different games in one long
ununderstandable game." Our reading: five moves in 90 seconds meant every leg was a tutorial with nothing to master;
each move came from a familiar game; and too many systems ran at once (chain, multiplier, ghost, splits, trails,
shapes).

## What the owner chose (2026-11-12)

| Question | Answer |
|---|---|
| Did anything feel good? | Ray's swing, Twinkle's stars, Goldie's dive or Dreamy's glide |
| Next core | Go deep on one move: **Twinkle's stars** |
| Pace | Calm, then faster |
| Games he plays | Puzzles like Block Blast, runners like Subway Surfers |

## The game in one line

**Tap stars to climb. Don't let the sea catch Twinkle.**

- The move: tap a star in reach and Twinkle zips to it and lights it (+1 star). Stars in reach glow; the reach is
  a faint ring. A tap that lands near a star counts, and a near miss picks the reachable one.
- The pressure, always on screen: the sea rises, slowly at first, then faster (16 per second, plus 1.6 more each
  second, up to 460). It never trails more than 440 below you, so the view rides with it.
- The thinking (Block Blast's half): faint shapes from the skyling's cloud (kite, swing, teacup, ...). Light every
  star of one for +stars equal to its size, and the sea calms back by 170. A way past each shape is always there.
  Climb, or detour for the shape?
- The reflexes (Subway Surfers' half): from 220 m up, some stars twinkle. They can only be caught while they glow,
  flicker just before they go dark, and drop Twinkle if they go dark under it, which a quick tap can rescue.
- A run ends in the sea. "Play again" is one tap. Score is stars lit; your best is kept; shapes found are collected.

## Done means (this test)

1. The first screen shows everything: Twinkle on a star, the stars it can reach, "Tap a star".
2. A meaningful action in the first 2 seconds; the sea waits for the first tap.
3. One new idea at a time, each with one line, once: shapes (~5 s in), twinkling stars (~20 s in), the sea.
4. Every tap answers at once: a zip, a note that climbs the scale when you tap quickly, a burst; a miss shakes the
   star and flashes the reach ring.
5. Fair: from every star there is always a way up (the bot's check fails if it ever stands with no way up for 2.5 s).
6. Calm, then faster: a perfect bot lasts about 2 to 3 minutes; people should land around 1 to 2.
7. Nothing else until the move is fun: no chain, multiplier, ghost, daily twist, trails or other skylings.
8. Local only: runs, frame timing and an optional note after the 3rd and 8th run, with Copy. No analytics.

## Files and checks

`game.html` + `game.js` (the game), `engine-entry.ts` (the app's real Twinkle, star and cloud art), `build.mjs`
(bundles them into `starlight.html`), `check.mjs` (bot runs at phone size: page errors, stuck moments, frame timing).

`node docs/design/2026-11-12-starlight/build.mjs && node docs/design/2026-11-12-starlight/check.mjs 4 10`

Last check: 4 runs, no page errors, never stuck, 60 fps, bot runs of 105 to 165 seconds.
Debug parameters: `?bot=1`, `?speed=N`, `?debug=1`. On a laptop the space bar picks a sensible next star.
