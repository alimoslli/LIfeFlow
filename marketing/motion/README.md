# Motion graphics (HTML, rendered frame by frame)

`mg.html` is a 1080x1920 composition: every element is positioned by `seek(t)`, a pure function of time, so
`render.cjs` can step it frame by frame with Playwright (deterministic, no dropped frames) and ffmpeg encodes the
frames. Content is real: the lock-screen recording frames (`lockf/`, from `../launch/rec/act_lock.mp4`), the
notification cards (`jl_n*.png` from `../launch/cards/`), and the numbers from Jordan's sample account.

Setup next to `mg.html`: Geist and Newsreader woff2 fonts, `icon.png` (public/icons/icon-192.png), the `jl_n*.png`
cards, and `lockf/` frames (`ffmpeg -i act_lock.mp4 -vf fps=30,scale=510:1104 lockf/%04d.jpg`).
Render: `node render.cjs 10.4`, then mux with the music from `../launch/music_launch.py plan_mg.json music.wav`.

## Chat-first edit (`chat.html`): mostly the real chat

The real chat recording fills the frame (phone screen 722 px wide), one continuous conversation with speed ramps
(typing about 2x, each wait for a reply squeezed to about a second, then a hold on the answer). Motion graphics only
decorate the real app: animated captions that fit themselves, a camera push-in on each answer, a glow around the reply,
marker sweeps on the assistant's own bold phrases (their on-screen positions are logged while filming), finger taps,
and the real lock-screen notification at the start. No invented screens.
`python3 build_chat.py chat_log.json <frames dir> captions.json` writes `chat_data.json`; `node render_chat.cjs` renders.
The renderer reads the raw 3x frames listed in `chat_log.json` (about 3,000 JPEGs from `rec_act.cjs convo`, kept out of git).
