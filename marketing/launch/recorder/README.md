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

## "One chat. My whole day." (the conversation, `rec_act.cjs convo`)

One chat with the assistant, eight turns from `turns.json` (the reel uses the first six: today, a noon reminder, where the money goes,
a coffee budget, the trip goal, and setting its plan). Before filming, `film_mode.sql` runs on the local filming database only: the demo
account becomes a normal account and its rows lose the `demo` source, so the assistant talks as it would to a connected user instead of
calling it a demo (the end card still says it is a sample account). The chat scrolls inside its own panel, so the reply cards are cropped
from the frames while each reply streams in (`crop_convo.py`); `plan_convo.py` writes `plan_p_convo.json`.

## "Monday morning" (Jordan): the morning notifications, then the app, then the chat

A second sample person so the data is new: `film_seed_jordan.ts.txt` (copy to `scripts/_film/seed-jordan.ts` in a checkout of main)
creates Jordan, a business student and café barista, on Monday Nov 9 at 8:22 AM (shift the clock with faketime as above). The
assistant's real morning check (`FILM_EMAIL=jordan@film.local` with `film_setup`) then finds things days ahead: the STAT 201 midterm
on Thursday after a Wednesday closing shift, car insurance due Wednesday with checking $43.82 short, and Today flags Friday's shift
overlapping Spanish. The lock screen (`lock/lock.html`) shows the three notifications the app pushes, with their exact text from
`jarvis_messages` (`lock/notes.json`); the phone frame's clock follows each scene (`status_time`, `status_light` in the plan).
Scenes: `rec_act.cjs lock`, `open` (Today, the updates, Block it, Plan), `convo` with `turns.json`. `plan_jordan.py` builds the plan.

## Smooth chat take (`rec_chat.cjs`)

One continuous conversation, filmed so replies stream smoothly. Record at 390x800 (the edit adds the status bar above).
It pauses filming while the real server answers, then releases the real reply to the app on the slowed page clock;
see `../../motion/README.md` (chat2). Restart the stack with the port freed (`fuser -k 3000/tcp`): a leftover `next-server`
keeps the old clock offset. The lock screen uses `appicon.png` (public/brand/lifeflow-apple-touch.png), the current app icon.
