# Motion graphics (HTML, rendered frame by frame)

`mg.html` is a 1080x1920 composition: every element is positioned by `seek(t)`, a pure function of time, so
`render.cjs` can step it frame by frame with Playwright (deterministic, no dropped frames) and ffmpeg encodes the
frames. Content is real: the lock-screen recording frames (`lockf/`, from `../launch/rec/act_lock.mp4`), the
notification cards (`jl_n*.png` from `../launch/cards/`), and the numbers from Jordan's sample account.

Setup next to `mg.html`: Geist and Newsreader woff2 fonts, `icon.png` (public/icons/icon-192.png), the `jl_n*.png`
cards, and `lockf/` frames (`ffmpeg -i act_lock.mp4 -vf fps=30,scale=510:1104 lockf/%04d.jpg`).
Render: `node render.cjs 10.4`, then mux with the music from `../launch/music_launch.py plan_mg.json music.wav`.
