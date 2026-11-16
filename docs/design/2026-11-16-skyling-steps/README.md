# Skyling Steps (prototype, 2026-11-16)

After Clear Skies round 3 the owner said: "no I don't like it, I'm always stuck to the sides, the idea itself got
lost." Asked which idea, he chose **the skylings at the heart**, and for movement **one step per arrow** (sliding until
something stops you always ended at the edges).

## The game, four rules

1. Every step leaves a star behind (one arrow is one step; holding a key keeps walking).
2. You can't step on a star.
3. A row or column full of stars flies up into the sky; those squares are free again.
4. Don't get boxed in. Now and then a cloud forms (a dashed square counts down where); a cloud keeps its row and
   column from clearing until a line clears beside it and blows it away.

## The skylings at the heart

- You play the skyling you choose, or "Changes with the sky": whoever is up in the real sky right now (by the clock
  here; the app follows the real sunrise and sunset).
- Each plays under its own sky, from the app's sky colours: Dawn's first light, Ray's day, Goldie's golden hour,
  Twinkle's evening, Dreamy's night; the sun by day, the moon by night.
- The stars you send up stay in the sky behind the board, so a good run leaves a full sky.
- The skyling walks, cheers when a line flies up, looks worried when it has one way left, and falls asleep at the end:
  "<name> sent 63 stars to the sky."

Nothing else: no levels, power-ups or extra pieces. Arrow keys or WASD; on a phone, on-screen arrows and swipes.

## Checks

Bot runs at phone size: a first-timer-like bot (plans one step, a random step one time in five) lasts 27 to 65 steps;
a careful one (plans four steps) 60 to 170 steps and up to 21 lines. No page errors, 60 fps.
`node docs/design/2026-11-16-skyling-steps/build.mjs && BOT=human node docs/design/2026-11-16-skyling-steps/check.mjs 6 40`

## Round 2, after the owner played (2026-11-16)

The owner: "Okay, I love the idea now, but make it more understandable. It took me a bit to figure out ... build more
into this idea, enhance it, make it look better ... make it more addictive. Take a look at other games and how they
keep players in." The four rules stay exactly as they were; everything new sits around them.

### How other games keep people playing

Seen in the games themselves and their public store pages, vs. our guesses (marked *guess*):

| Game | What you can see | What we take |
|---|---|---|
| Block Blast | Clearing lines in a row keeps a combo going, shown with growing words ("Good", "Great", "Excellent") and a bigger number; the best score sits on screen all run; one tap to play again. | A streak: clear again within 10 steps and the next clear counts ×2, ×3...; your best on screen; "New best!" the moment you pass it. |
| Candy Crush | The first levels are built to teach one thing each with a hand pointing at the move; a map of progress you can see. | A guided first board (one step clears a row); the skyling's cloud filling up as the progress you can see. |
| Subway Surfers | Coins and pickups along the way; a second chance after a crash (paid there). | Wishes to catch (they fade, so they pull you somewhere new); one free rewind a run. Never paid. |
| Wordle / daily puzzles | One shared puzzle a day; people compare. | Today's sky: the same board for everyone today, with its own best. |
| Snake, Tron | The trail you leave is your enemy, and it's clear why you lost. | Already ours (rule 2); now the path is drawn as a constellation so you see it. |

*Guess:* the pull to replay comes from runs that end with a clear "I could have gone the other way" (the rewind and
the path make that visible), from a goal just ahead (the next thing on the cloud, "4 more stars to the kite"), and
from a number to beat (best, today's best). We avoided energy, paid retries, streak-days that punish missing a day,
and fake near misses: every number shown is the real one.

### What changed

Easier to understand:
- The first board ever is a row full of stars except where the skyling stands; the only ways are up or down, and the
  star it leaves fills the row ("Step up or down. The star you leave fills the row!"). The first thing you do is a
  clear.
- The path is drawn as a constellation (a line between stars laid one after another), and a faint star under the
  skyling shows the star it will leave.
- A square that would finish a line has a soft gold outline ("Gold outlines show where one more star fills a line").
- One short line at a time, each once per device: the rule after the first clear, then the gold outlines, clouds and
  wishes as they first come up. Bumping says why ("Can't step on a star", "A cloud is in the way"); with one way left,
  "Careful! One way out" and the board's edge glows warm.
- The home card says the three rules in one line each.

Looks better: rounded tiles on a glass board, stars that glow, sent stars arc up and stay in the sky, cheer words
above the board (never over it), the screen shakes gently on a Double (not with reduced motion), the skyling hops as
it walks, waves before the first step and is surprised when boxed in. Background clouds never show through the board
(there a cloud means a blocked square). At the end only the sky stays, full of the stars you sent up.

More reason to play again:
- Streak: clear again within 10 steps for ×2, ×3... (a bar under the score shows the steps left); "Lovely!",
  "Brilliant!", "Dazzling!", "Radiant!", "Stellar!".
- Wishes: after the first clear, a pale star appears every 14 steps or so; step on it before it fades (12 steps) for
  25 × your streak.
- Rewind: once a run, when boxed in, go back 3 steps and try another way (Enter), or end the run (Esc).
- The skyling's cloud: every star sent up (7 a line, 3 a wish) counts for good. The cloud fills with the app's own cloud
  things in order, star lights at 14, kite 40, Puff 80, swing 130, hammock 200, rainbow slide 290, balloon 400, cloud
  house 540, telescope 700, tiny planet 900, floating garden 1,150; the next one waits faint, and the end card says
  "New on the cloud: Kite!" and how many more to the next.
- Today's sky: the same board for everyone today, with today's best.

### Checks (round 2)

First-timer-like bot: 17 to 126 steps, up to 15 lines, streaks up to ×5; careful bot: 76 to 188 steps, up to 24 lines,
streaks up to ×6, 3 to 6 wishes a run, every boxed-in run used its rewind. No page errors, 60 fps. Doubles are rare
(the star you leave has to finish a row and a column at once), so they stay a treat.
