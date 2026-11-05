# Recording the app for reels

`rec_try.cjs` is the "Test-drive your assistant" take (student, PSY 101, seed 29259): it taps Block it, Show me and Quiz me, then
Show me another day. `crop_cards.py` cuts the tapped cards (with their notes) out of the 3x frames for the 3D pops, and
`plan_try.py` builds `plan_p_try.json`. Screenshots use Playwright's `scale: 'device'` so frames are 1170x2532.

`rec_day.cjs` films the real sign-up onboarding ("Your day, connected") with Playwright at 390x844, 3x.
It slows the page clock (GSAP reads `Date.now`) and CSS animations to 0.2x, screenshots about 60 times a
second of app time, and logs every tap. `build_rec.py` turns the frames into a 60 fps 1080x2338 clip with a
finger mark on each tap (`rec/day.mp4`). `plan_day.py` builds `plan_p_day.json` from the recording's marks.

Run against a local production build on a fresh database (`next build`, `next start`), never production.
The assistant's name chips are hidden and the name is typed by hand so the default name never shows.
The preview's three suggestions come from a fixed seed (1057) so the take is repeatable.
