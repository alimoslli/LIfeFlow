# "Let the sky choose" (2026-11-10)

A 17.6 s reel for the new "Changes with the sky" skyling choice, made with no credits:
- `probe.cjs` logs in to the demo account on a local build of main (fresh database `budgetflow_capture`, `scripts/seed-demo.ts`
  plus the local-only fuller week, see `../../teaser/moved-in/film_fuller_week.ts.txt`) and saves the session.
- `capture.cjs` films the real Settings tap on "Changes with the sky" and Today at six times (fake clock, New York, Nov 9):
  6:20 AM Dawn, 8:00 AM Ray, 12:30 PM Noon, 4:00 PM Goldie, 5:10 PM Dusk, 11:00 PM Star (the app's `data-skyling-now` confirms each).
- `reel.html` composes it (sky from `lib/sky.ts`, skylings from the app's sprite code via `../../logo/` `lf2.js`, the official
  logo frames from `../../logo/`), `render.cjs` renders 528 frames, `mix.py` makes the sound (effects only).
- Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/6c5b2cdc-eb34-4999-9cd4-e7a13f02ecfd.zip
