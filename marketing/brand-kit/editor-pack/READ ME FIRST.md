# LifeFlow Editor Pack

Everything you need so your videos look exactly like LifeFlow's, in CapCut, Premiere, Final Cut or anything else.
All of it is real: the skylings and app screens come from the app's own code and real recordings, not AI.

## What's here
| Folder | What it is | How to use it |
|---|---|---|
| `app_footage/` | Clean recordings of the real app (no captions), 1080 x 1920 | Drop them in as full-screen shots. Add your own captions in our style. |
| `skylings_greenscreen/` | The five skylings moving: idle (with a blink), wave, celebrate (jump for joy), think. Night versions of Twinkle and Dreamy. | Put on top of your shot, then use Chroma Key (CapCut: Remove BG, Chroma key) on the green. Pixel art keys perfectly. |
| `skylings_transparent_frames/` | The same animations as transparent PNG frames | For Premiere, After Effects or Final Cut: import as a sequence, one frame every 0.18 s (about 5 or 6 frames at 30 fps), and loop. |
| `logo/` | Logo intro (3 s), logo ending (3.5 s, "Let's clear your sky." with sound), animated logo loop | Every video ends on `LifeFlow_Logo_Ending.mp4`. |
| `overlays/` | Logo lockups (white or navy text), app icon, "Let's clear your sky." text, blank caption box, end card still | Transparent PNGs, ready to drop on top. |
| `sfx/` | Our pixel sounds: tap, typing, send, answer lands, added to your day, star, sun, night stars, whoosh, sky turns, skylings pop up, logo ending | Put them on the matching moments, a little under the voices. |
| `fonts/` | Fraunces and Geist | Install both. Fraunces for captions and headlines, Geist for small text. |

## The style in one minute
- Captions: Fraunces SemiBold, white, on the rounded navy caption box, at most 2 lines. The word "sky" in gold (#FFD27A).
- Colors: night navy #142451, gold #FFD27A, dawn peach #E39568, soft white #F3F5FA.
- Skylings: scale them up only in whole steps with no smoothing ("nearest neighbor"), so the pixels stay sharp. Never redraw them or make new ones with AI.
- Five skylings only: Dawn, Ray, Goldie, Twinkle, Dreamy.
- Words: it's a "skyling", never an "assistant". Don't lead with AI. No em dashes on screen. End line: "Let's clear your sky."
- Sound: music about 10 dB under voices, final mix around -14 LUFS.
- Always end on the logo ending.

The full rules are in the LifeFlow brand skill (`lifeflow-brand.zip`) for Claude.

## Editor Pack (2026-11-13)
For Tyler (CMO) so his videos match ours in any editor. `LifeFlow_Editor_Pack.zip` in the Drive folder "Lifeflow media": real app clips (from the What's new and A day captures), skylings moving on green screen and as transparent frames (`anim.cjs`, the app's drawCompanion, 180 ms a frame like the app), overlays (`overlay.cjs`), pixel sound effects (`sfx.py`), fonts and logo videos. The clips and renders themselves live in Drive, not git.
