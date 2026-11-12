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

## Round 2, after the owner played (2026-11-12)

The owner: "it's better but still feels too easy in the beginning so it's not understandable, but then I suddenly
die and can't attach." What changed:
- The danger is felt from the first tap: Twinkle starts just above the sea, which rises at once (45 a second) and
  then speeds up gently (+0.95 a second, up to 440), instead of crawling for the first minute and then racing.
  Early rows have one or two stars, so the way up is easy to read.
- No sudden drops: a twinkling star stays lit while Twinkle stands on it; twinkling only decides when you can jump
  to it. A tap on a dark star waits and jumps the moment it glows ("Wait for the glow").
- A tap always does something: a star too far, or empty sky, sends Twinkle to the reachable star nearest to it, and
  the reach ring flashes ("Too far" the first few times). Reach is 300.
- A last chance: when the sea reaches Twinkle's star there are 0.75 seconds to jump ("Jump!", then "Close one!").
- A clear warning: a warm glow rises from the bottom and the hum quickens as the sea gets close.
- The check now has `?bot=human` (slower taps, a so-so choice one time in five): first-timer-like runs last about 2
  to 3 minutes and end gradually; never stuck, no page errors, 60 fps. `BOT=human node .../check.mjs 5 12`.

## Round 3, after the owner played (2026-11-12)

The owner: "now it's way too easy. It became uninteresting. There's nothing changing. I just had my mouse in one spot
and just clicked it all the time." Round 2's "every tap does something" let one spot play the game, and nothing in
the sky ever changed. What changed:
- You tap the star you mean (within 46 px). Empty sky does nothing; a star out of reach shakes and the ring flashes.
  The space bar no longer picks a star. Waiting for a dark twinkling star to glow stays.
- The sky changes as you climb, one new thing at a time, each named once when it comes into view:
  150 m the sky sways (rows of stars move side to side together; aim at moving targets);
  350 m storm clouds (they sit in a row and stop a zip that crosses them; Twinkle drops and a quick tap can still
  catch a star; they never close the way up and never drift onto a star);
  600 m twinkling stars; 850 m shooting stars (catch one: +10 stars and the sea calms by 260);
  1,150 m "higher still" (more sway and storms, fewer stars).
- The sea is a little quicker (50 a second, +1.05 a second).
- Checks: first-timer-like bot runs last about 1.5 to 2.5 minutes and meet a new thing every 15 to 20 seconds; a
  strong bot is capped at 5 minutes; never stuck, no page errors, 60 fps.
