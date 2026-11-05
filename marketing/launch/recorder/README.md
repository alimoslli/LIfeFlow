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

## "Assistant in action" (rec_act.cjs)

The fully connected look on the demo account, with the real assistant replying:

1. Shift the clock to a morning (the server, Postgres and the browser must agree): `apt-get install -y faketime`, then
   `OFF=<seconds to 8:32 AM New York>`; start Postgres with `pg_ctl` under `LD_PRELOAD=.../libfaketime.so.1 FAKETIME=+$OFF`,
   and run `seed-demo.ts`, `film_setup.ts.txt` (copy it to `scripts/_film/setup.ts` in a checkout of main; it names the assistant Remy and runs the
   morning check) and `next start` under `faketime -f +$OFF`. Put `$OFF` in `off.txt` next to the recorder.
2. The assistant needs an OpenAI key: save it as a network secret for api.openai.com on the cloud environment (never in a file),
   and start the server with `OPENAI_API_KEY=sk-proxy-injected NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
3. `node prep.cjs` (sign in, allow the assistant, close the sample-data pill), then `node rec_act.cjs <scene>` for
   today, tour, feed, lab, swap, quiz, in that order. Capture runs at 0.05x while tapping and typing, and real time while the
   assistant answers. `crop_rects.py` cuts the replies and the feed card for the pops; `plan_act.py` writes `plan_p_act.json`.

Chat shots start when the message is sent: the empty chat shows a "Connect me to do more" banner on the demo account.
