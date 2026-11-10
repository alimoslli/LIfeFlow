# "Something just moved into LifeFlow" (teaser, 2026-11-10)

Ali's brief: the old app gets taken over by the skylings, the new design shows up, introduce the skylings and the new idea;
smooth, cute, fun, a hint; a good hook; never a phone screen. Real art only, no credits:

- The old app: its own cards from `marketing/launch/cards/` (available, next, week, sleep, steps, lunch, habits).
- The skylings: the app's sprite code (`entry.ts` bundles `src/components/skylings/night.ts`, `day-clock/companion.ts`,
  `lib/companions.ts` from main into `lf.js`), day forms on the cream, night forms after the lights go out.
- Their new home: the landing page's night, captured live with `cap_night.cjs` (Playwright fake clock, cheers at 1.6 s and 11.2 s).
- The new day: the real Today sky from the latest main, run locally with the demo account (`scripts/seed-demo.ts`, a fresh
  database), captured as a cropped card with `cap_app.cjs` (fake clock at 2:30 PM New York: idle, a drag through sunset,
  back to now, the tap that unrolls the timeline). `app_probe.cjs` logs in and saves the session.
- `takeover.html` composes it (`seek(t)`), `render.cjs` renders 618 frames, `mix.py` adds pixel sounds and Ali's line
  (My Movie 6 at 5:58). Notes, beats and captions in `story-notes.txt`.

Words: "Something just moved into LifeFlow." / "They're redecorating." / "Lights out." / "Meet the skylings." / "Six little
ones. One of them is yours." / "Your day turns like the sky." / "Spin ahead. See it coming." / "Tap. Your week rolls out." /
"A new LifeFlow." / "Before December." (Ali: never "your whole life, on one sky".)
