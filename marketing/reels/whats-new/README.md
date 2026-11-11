# "What's new in LifeFlow" (2026-11-10)

Ali: "i want us to show more of the app and new features". 36 s, 1080 x 1920, the app full screen (no phone), no credits.
Every shot is the real app (a production build of main 0ea6689 on a local test database with the demo seed and the film
day), with sample data in a test account. Ray's reply is real (one chat turn through the environment's saved OpenAI key, a few
cents, about 18:30 UTC on Nov 10).

**No OpenAI from this environment until the owner says otherwise** (owner via the COO, 2026-11-10: the API bill jumped).
`serve.sh` now leaves the key unset and the test account's AI consent is off, so a refilm can't call it. A refilm of the
cloud shot reuses these frames, or runs on the fake model (`tests/e2e/fake-openai.mjs`); a real reply needs the owner's yes
with the number of messages and the cost (CLAUDE.md "AI spend").

Order: the new opening screen ("We rebuilt LifeFlow. Here's what's new.") → your day as the sky → an idea cloud ("Tell Ray
I'll study tonight at 8") sent, and Ray saves the promise → tick it off (the star) → tonight's stars ("6 stars today") →
a goal reached (the big sun) → Money → School → More ("Everything else") → pick your skyling → "Let's clear your sky."

How it's made
- `serve.sh "<UTC start>" start` runs the production build on the film's clock (`faketime`), with a dummy OpenAI key the
  proxy swaps for the saved one. The opening screen only works in a production build (React's development double-run
  removes it at once). Before going back to `next dev`, `rm -rf .next`.
- `lib.cjs`: 432 x 768 at 2.5x, New York time, the returning person's saved name and zone (the opening screen reads them),
  the clock held while the page loads, and every animation (CSS, transitions, the app's Web Animations) paused and
  stepped 1/30 s a frame with the fake clock. Logs taps and anchors for the compositor.
- Shots: `cap_splash` (2:30 PM), `cap_tour` (Today → Money → School → More), `cap_chat` (the cloud, the real reply),
  `cap_goal` ("Read 12 books" 11 of 12, a local film stand-in row, then +1), `cap_night` (server and page at 8:31 PM).
  The tick-off and the skyling pick reuse `../your-day-drawn-as-the-sky` (main a5c14a8).
- `cap_promise` (the 8 PM check-in card) is not in the video: the app never runs check-ins for the demo account (Today and
  the 30-minute job both skip it), and we don't fake the card. Filming it needs a separate test account.
- `timeline.py` → `timeline.json` (segments, frames, captions); `film.html` composes; `render.cjs` renders; `mix.py`
  makes the sound from the same timeline; encode at crf 17, loudnorm -14.5, limiter at -2.6 dB (came out at -16.0 LUFS).
- After filming, put the film rows back: the goal to 11 of 12, the promise deleted.
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/cd6a6aa4-289e-4e67-bd4d-dff9306911aa.zip

Storyboard (2026-11-10, Ali asked "show me"): `storyboard/` has the planned skyling scene as six real screens from main
5b4909d: the question typed under the sky, the answer card (marked as being built by the app team), the study block on
the timeline (a stand-in row placed by hand, deleted after), ticking the assignment off at 3:50 PM, the star, tonight's
stars. No AI was called. `sb.cjs ask|block|tick` takes the stills; `shot_sb.cjs` renders `storyboard.html`.

## v2 (2026-11-10): the skyling scene, for real
Ali: replace "I'll study tonight at 8" with something useful, typed under the timeline (no chat page), added to the
timeline, then ticked off for the star. Filmed on main 87acda3 (the answer card on Today, built by LF Main for this).
- `cap_ask.cjs`: type under the sky, send, Ray's real answer in the card ("You've got 9:00 to 11:00 PM open after your
  Campus Library shift, and Chapter 6 is due at 11:59 PM"), "Do it", "Event added … 9:00 to 11:00 PM" with Undo.
  `cap_follow.cjs see|tick|night`: the block on the opened day, the tick at 11:05 PM with its star, tonight's 8 stars.
- Real AI: Ali approved up to 5 messages; 3 were used (a first take whose good answer added nothing, then the question
  and its "Do it"). Rehearsals ran on the free stand-in (`serve_ai.sh <time> fake`, key `sk-e2e-test` on :4010).
- The proxy's certificates start about an hour before real time, so a server on a faked clock more than an hour in the
  past can't reach OpenAI (CERT_NOT_YET_VALID; nothing is sent). Real takes run `serve_ai.sh -3300 real` (55 minutes
  behind) with the page on the same clock (`OFFSET_S=3300`); that's why this scene is at about 3:17 PM.
- Filming pauses every animation and steps it; a finished star can come back as a still, so cut before it does.
- After filming: the assignment back to "todo", the event Ray added deleted, the test account's AI consent removed.
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/359271f5-01e4-402f-a872-4b254f42db17.zip

## v3 (2026-11-11): refilmed on the newest app (main dc32257)
Ali: "refilm this video because a lot has changed". The cast is five now (Dawn, Ray, Goldie, Twinkle, Dreamy; Noon and Dusk
retired), Today is one screen with the answer in the middle, the skyling has its own tab, the night is a softer blue.
- A fresh film database `budgetflow_film2`: the demo seed run with faketime on the evening of Nov 16, then the film day
  (`scripts/_film/day.ts`, FILM_TODAY=2026-11-17, local only), birthday and Ray set, the reading goal at 11 of 12. Signed
  in with `login2.cjs` (state2.json, local).
- Why Nov 17: a real skyling answer needs the server's clock no more than an hour behind real time (the proxy's
  certificates); the future is fine. And the chat's "last 12 hours" compares the app's clock with the database's, so for the
  real take Postgres ran on the same offset: `pg_ctl start` with `LD_PRELOAD=libfaketime FAKETIME=+<seconds>`, the app with
  `serve_ai.sh +<seconds> real`, the page with `AT=`. Postgres was put back on real time after.
- Real AI: 1 message for this take (Ray found 2:45 to 4:00 before the 4 PM shift and added it directly). One earlier try
  was refused by OpenAI as empty (the clock mismatch), with no tokens. Total for Ali's 5: 4 used.
- New shots: `cap_sky` (Ray waves, the sky turns), `cap_pick` (the five and "Changes with the sky"). A tap within 350 ms
  of sliding the line is ignored by the app, so `cap_follow tick` waits 18 frames after the slide.
- The ending uses the logo rebuilt for the five (`../../logo/v2`, `../../logo/sting/v2`).
- Seen while filming and sent to the COO: the Undo chip overlaps the answer's text, and create_events once failed on a
  course id ("That course link failed…" shows in the card). Ali's request (2026-11-11): the chat box should grow to show a
  long message; sent to the COO.
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/8a0d2d39-2c78-4547-ae0d-6140145878b3.zip
