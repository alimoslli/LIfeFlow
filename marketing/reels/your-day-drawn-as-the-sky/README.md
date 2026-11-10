# "Your day, drawn as the sky" (2026-11-10)

Ali: the video is about the new way LifeFlow shows your day (the sky, things on it, opening your day) and the skylings, so people
understand it; the app full screen, no phone. 36 s, 1080 x 1920, no credits.

- Film day: a local test database (`budgetflow_capture`) with the demo seed plus `film_day.ts.txt` (run as `scripts/_film/day.ts`,
  local only, never committed to app code), so everything on Today is on one day (Nov 10). The demo birthday is set so the
  birthday prompt doesn't sit under the sky.
- `capture_full.cjs today|settings`: the real app at 432 x 768 at 2.5x (exactly 1080 x 1920), "Sample data" chip and dev badge
  hidden, fake clock at 2:30 PM New York: 8 s to explain, a turn to 9:30 PM and back, the tap that opens the day, slide back,
  glide ahead, then Settings › Your skyling and the tap on "Changes with the sky". Logs the finger and the label anchors.
- `film_full.html` composes it (spotlight labels, finger, captions in a navy box), `render_full.cjs` renders 1083 frames,
  `mix_full.py` makes the sound; the ending is `../../logo/sting`.
- To refilm on a newer app: `node capture_full.cjs today`, reset the demo skyling to Ray, `node capture_full.cjs settings`,
  check the anchors in the log, render, mix, encode (crf 17, -14.5 LUFS, limiter at -2.6 dB).
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/47142692-4864-4468-84f2-f9d6eb506417.zip

v2 (2026-11-10): refilmed on main e529273 (the new look: three tabs and More, pixel tab icons and clouds, the skyling bar on
every page, Settings from below, the round pixel back button, the opened day's labels never cut off). Same edit, same anchors.
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/26b600c4-b1a6-4264-9c0e-4c8384502067.zip
Note: Metricool's Instagram numbers stopped updating around Nov 5-6 (Ali caught it: Flow Room Ep 02 shows 3,782 views on
Instagram, Metricool had 956). Check numbers against Instagram before quoting them; reconnect Instagram in Metricool.

v3 (2026-11-10): Ali said "continue" to the celebrations shot. Refilmed everything on main a5c14a8, and added ticking something
off (24.1 to 28.5 s): slide ahead to tonight's Groceries, open its card, tap Done; a star pops up with "+1", Ray hops, and
Groceries lands with a tick beside the skyling. Captions: "Done with something? Tick it off right there." / "Your skyling
cheers you on." (top of the frame, so the card, the star and the toast stay clear). 40.5 s.
- `capture_full.cjs done` films it. The page's own Web Animations (star, sparks, hop, card) are paused and stepped 1/30 s a
  frame like the fake clock, and a finished one runs its `onfinish` so the star is cleared as the app does.
- The app places a finished to-do at the server's "now", so for this shot the local server runs on the film's clock:
  `TZ=UTC FAKETIME_DONT_FAKE_MONOTONIC=1 faketime -f "@2026-11-10 19:29:00" npx next dev -p 3100` (local only, the capture
  database only), started about a minute before the take; then set Groceries back to "todo".
- Set the demo skyling to Ray before `today` and `done` (v2's Today showed Noon under the name Ray); `settings` taps
  "Changes with the sky", so reset to Ray after.
- Seen in the real app while filming (sent to the COO): when the finished to-do lands beside the skyling, the open line
  slides about 100 px sideways (the line is rebuilt wider and keeps its scroll position).
Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/d1ff976f-4e3b-47fa-a2a6-fa18943b196e.zip
