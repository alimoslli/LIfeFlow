# "What's new in LifeFlow" (2026-11-10)

Ali: "i want us to show more of the app and new features". 36 s, 1080 x 1920, the app full screen (no phone), no credits.
Every shot is the real app (a production build of main 0ea6689 on a local test database with the demo seed and the film
day), with sample data in a test account. Ray's reply is real (the environment's saved OpenAI key, a few cents).

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
