# Motion graphics (HTML, rendered frame by frame)

`mg.html` is a 1080x1920 composition: every element is positioned by `seek(t)`, a pure function of time, so
`render.cjs` can step it frame by frame with Playwright (deterministic, no dropped frames) and ffmpeg encodes the
frames. Content is real: the lock-screen recording frames (`lockf/`, from `../launch/rec/act_lock.mp4`), the
notification cards (`jl_n*.png` from `../launch/cards/`), and the numbers from Jordan's sample account.

Setup next to `mg.html`: Geist and Newsreader woff2 fonts, `mark.png` (the current logo: public/brand/lifeflow-mark-transparent-512.png;
never the old wave icon in public/icons), the `jl_n*.png`
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

## Smooth chat edit (`chat2.html`): one continuous take, no cuts

Replaces `chat.html`, whose replies looked choppy and whose turns looked like separate clips. The owner's notes: the end card
and the notification used the old logo, and the replies lagged.

- Filmed with `../launch/recorder/rec_chat.cjs` (`TURNS=turns_chat.json OUT=frames_chat2 LOG=log_chat2.json node rec_chat.cjs`).
  The page clock runs at 0.05x while filming, so the app gets about 60 captured frames per second of its own time. Each reply
  is fetched from the real server (real tools, real calendar and reminder changes). While the server works, filming pauses with
  the clock frozen. Then the real reply is handed to the app at a steady pace on the page clock: the status words, the
  streaming text and the auto-scroll all play smoothly. Text is released at word boundaries, never inside a `**bold**` pair.
  The browser's smooth scroll runs on real time, so the recorder swaps in an eased scroll on the page clock. Every frame
  also logs where the assistant's bold phrases are (`window.__probe`), so the highlights follow the real scroll exactly.
- The edit plays the take straight through at 1x. The camera is one steady framing on the conversation, smoothed with a
  Gaussian so it never jumps. The lock screen is live HTML with the real pushed texts (`../launch/recorder/lock/notes.json`)
  and the real app icon (`appicon.png` = public/brand/lifeflow-apple-touch.png). A tap opens the app out of the
  notification, with no white flash. The end card uses `mark.png` (public/brand/lifeflow-mark-transparent-512.png).
- `python3 build_chat2.py chat2_log.json <frames dir> captions2.json notes.json` writes `chat2_data.json` and `plan_chat2.json`
  (music: `../launch/music_launch.py plan_chat2.json music.wav`); `node render_chat2.cjs` renders 60 fps frames.
  Highlights are picked per turn in `captions2.json` (substring, or `=` for an exact bold phrase).

## The reel (`reel.html`): short, hook first, clear cuts (current)

Owner on the 40-second continuous chat: poor quality, no good hook, messy; and if there is a new clip, make the cut visible.
So: 20 seconds, built from the same real take (`chat2_log.json`).
- Hook in the first frame: the real warning notifications, full screen and readable (midterm vs. Wednesday shift; car insurance
  due, checking short), with "MY ASSISTANT CAUGHT THIS / 3 DAYS EARLY." Then a tap.
- One clip per thing the assistant did: study time booked, the car insurance fix, the text to the manager, the reminder. Each clip
  plays the real take continuously; the wait for the reply runs faster on a smooth curve (Hermite keys, never a jump), and long
  replies stream a little faster.
- Every cut is marked on purpose: a punch-in, a short light flash and a whoosh plus tick in the music. Captions are sticker boxes
  that change on each cut: a setup line, then the payoff when the reply lands. One highlight per clip, on the assistant's own bold words.
- Clean frame: no phone mockup; the app is cropped to the conversation, 2.6x, with its top edge faded under the captions.
- `python3 build_reel.py chat2_log.json <frames dir> notes.json` then `node render_reel.cjs`; music from `plan_reel.json`.

### Reel v3: the email to the manager (current)

The manager clip is now an email: "Email my manager Scott ... keep it formal and show me before you send" gives the real
formal draft as a preview ("Draft saved to Gmail, not sent"), then "Looks good, send it." brings up the app's real Confirm card
("Send email to scott@dailygrind.cafe: ...?"), the finger taps Confirm, the card shows "Working..." then "Done". Same design
as every other clip: punch-in cut, sticker captions (three here: the ask, the preview, the approval), one highlight (the
assistant's bold "Confirm"), smooth speed curve inside the clip, plus the finger on the real tap.
- The sample account has no real Gmail, so on the local filming server only, Gmail is a stand-in: the seed saves a Google
  connection with placeholder tokens and `../launch/recorder/gmail_standin.cjs` (preloaded into `next start`) answers Google's
  API calls locally and logs them. The app's own flow (tools, draft, the Confirm card, the send after Confirm) is real code;
  nothing is sent anywhere. Scott (scott@dailygrind.cafe) is a fictional manager in the sample data.
- Take: `rec_chat.cjs` with `turns_chat.json`; `{ "q": ..., "confirm": true }` taps the real Confirm card on that turn.
  `check_jumps.py` lists any instant scroll jump in a take (the reel's clips have none; turn 0 is not used).
- Fixed in the recorder: its smooth scroll now fixes the target per call (it used to chase the bottom every frame, which
  snapped the chat when the thumbs and suggestions appeared), and scroll anchoring is off (as on an iPhone).
- `python3 build_reel.py reel_log.json <frames dir> notes.json`, then `node render_reel.cjs` (FROM/TO/LIST to split across workers).
