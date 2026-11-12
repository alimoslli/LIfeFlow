# Sky Relay: the skylings' game (prototype, 2026-11-12)

Owner's brief (2026-11-12): a beautiful skyling world that is also an immediately satisfying, replayable game, with an
"I want another try" feeling from playing and improving. Build the fun first as a small playable test, then let the owner
play it before anything else is added. This is a prototype outside the app: nothing in `src/` changes, nothing ships.

## Decisions the owner made (2026-11-12)

| Question | Owner's answer |
|---|---|
| Core idea | **Sky Relay**: one day passes between all five skylings, each with its own move (after "swing and bounce felt like the same game; make it more interesting") |
| Falls | A full day every round; a fall into the sea costs the chain, Puff bounces you back up |
| Real life | A pure game. Later, in the app: the items the person's real life unlocked on their skyling's cloud appear in the game, looks only |
| What brings people back | Beating your own best, unlocking things, something new each day |
| Friends | Not now |

## Research, kept brief (2026-11-12)

Sources: only the three games' official App Store listings could be opened from this session (the developers'
blogs and trade press were blocked by the network). Everything else below is marked as unverified or as our
own reasoning.

| | Observed (App Store listing) | Our hypothesis about why it works |
|---|---|---|
| Block Blast | Drag blocks onto an 8x8 board; full rows and columns clear; "chase combos" for big points; daily puzzles; an Adventure mode | One action, no rotation, no timer: nothing to teach. The skill is greed (a combo now) against room for later. Unverified: three-piece hand, streak rules |
| Candy Crush | Match-3 levels with "explosive combos"; boosters; thousands of levels; paid extra moves and lives; daily login boosters | Cascades feel like free rewards; complexity arrives one blocker at a time. Unverified (King's GDC talks, via search summaries): hard levels kept short, and easing a level kept players longer than making it harder |
| Subway Surfers | "Dash", "dodge the trains", swipe acrobatics; hoverboards and a jetpack; season hunts, a world tour of cities; paid keys | Fixed lanes make every swipe a clear, readable choice; speed is the visible pressure; challenges like "Floor is Lava" change how you play without changing the action |

What we took (all hypotheses until tested): the core action fits in one line; pressure is visible on screen; one new
thing at a time; failing costs little and retrying is instant; difficulty asks for a choice; rewards change the look,
never the rules; a daily twist keeps replays fresh. What we left out: lives, paid continues or moves, login rewards,
streaks, and anything tuned for spending.

## Concepts considered

1. Starline (swing between stars) and 2. Puff Hop (bounce and dive): the owner felt they read as the same game.
3. Night Lights (a calm one-stroke puzzle): closest to existing connect-the-dots games.
4. The owner's starting idea, world first: kept in spirit (movement, discovery, bests, looks) but reversed in order:
   prove the movement in one short round first, then grow the world from the same pieces.
5. **Sky Relay** (chosen): all five skylings, one day, one input that means something different for each.

## The game in one line

Hold the screen to use the skyling's move. One round is one day (90 seconds): Dawn floats, Ray swings, Goldie
bounces, Twinkle lights stars and Dreamy glides, 18 seconds each, and one chain runs through the whole day.

| Leg | Sky | Move | The one input | Skill |
|---|---|---|---|---|
| Dawn | first light | Float | hold to rise, let go to sink | tracing lines of light |
| Ray | day | Swing | hold to catch the star ahead, let go to fly | when to let go (the thread turns gold) |
| Goldie | golden hour | Bounce | hold to dive | where you land; dive on clouds to pop them, on storms to clear them |
| Twinkle | sunset into evening | Light | tap a star to zip to it | route and rhythm; whole constellations |
| Dreamy | night | Glide | hold to climb, let go to swoop | speed from height; skimming the sea |

Shared rules: clouds always catch you, storms zap you (except Goldie's dive from above), the sea costs your chain.
Every good move adds to the chain; every 8 raise the multiplier (up to x10). Keeping a chain of 8+ through a handoff
is a Relay bonus.

## Done means (the prototype)

1. A meaningful action in the first 3 seconds (Dawn is already flying; "Hold to rise").
2. Each leg's move is told in one line at its handoff, during a short slow-down, never a tutorial screen.
3. A round is exactly 90 seconds; "Play again" starts the next one in under a second.
4. Feedback for every action (sound, particles, a word or a number), and nothing that hides what's coming.
5. Fair: hazards are visible before they matter; every gap can be crossed (checked by the bot over many skies).
6. Mastery shows: per-leg splits against your best, a ghost of your best run on Today's sky, "New best!" the moment
   you pass it.
7. Fresh each day: Today's sky (the same layout all day, with a twist like Windy or Stormy) and Any sky (random).
8. Unlocks come from mastery, not grinding: beat a leg's target to unlock that skyling's trail; constellations
   found are collected.
9. No energy, no lives, no paid retries, no streaks or punishment for missing a day, no fake near misses, no tasks.
10. Measurement is local only (this browser): round results, frame timing and an optional one-line note, with a
    "Copy" button. No analytics service.
11. Runs at 60 fps on a phone, portrait first, works on a laptop (mouse, space bar).

Out of scope for this test: the open world, friends, the app's cloud items, more legs or modes, accounts.

## What the bot found while tuning (before the owner played)

The bot (`?bot=1`) plays with perfect information, so it measures fairness, not fun.
- Goldie's first cloud was placed where the skyling had already flown past: it now goes where you will land.
- Storms zapped you from an area wider than they look; a dive cleared from the same area. Now a dive clears from a
  generous area and a zap needs a real touch.
- Goldie's popped clouds threw you too high to land the next one: a lower pop, a little slower, wider clouds, and a
  low safety cloud in most gaps, which also gives a safe route under the risky one.
- Dreamy splashed when pulling up late: the pull-up is quicker and a shallow touch now skips off the sea for points.
- Ray's leg scores the most (it builds the chain fastest). Each leg has its own trail target, so this is left as is
  until real rounds say otherwise. Targets: Dawn 1,500, Ray 9,000, Goldie 4,000, Twinkle 6,000, Dreamy 2,500.
- 60 fps at phone size in a headless browser; no page errors over many rounds.

Debug parameters for local testing: `?bot=1`, `?speed=N`, `?leg=N` (start at a leg), `?debug=1` (fps and motion).

## Files

- `engine-entry.ts`: bundles the real skyling art from `src/` (the five skylings, cloud, star, Puff), unchanged.
- `game.html`: the page; `game.js`: the game. `build.mjs` bundles them into `sky-relay.html` (the published prototype).
- `check.mjs`: plays rounds with a bot in a headless browser (phone size), fails on errors, prints scores and frame
  times, and saves screenshots of each leg.

Build and check: `node docs/design/2026-11-12-sky-relay/build.mjs && node docs/design/2026-11-12-sky-relay/check.mjs`.
