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
