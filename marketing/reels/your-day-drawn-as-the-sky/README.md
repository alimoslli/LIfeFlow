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
