# "Campfire Q&A" (filmed 2026-11-13 night, edited 2026-11-14)

Ali and Tyler at a backyard fire pit, one static 4K/120 fps iPhone shot (HDR), answering the questions from the Q&A script.
Ali cut the 16 GB / 15-minute take down at home to 10 good clips (about 108 s), plus his re-recorded closing line
(audio only) and a 1:43 rough edit for the order. Final: `LifeFlow_Campfire_QA.mp4`, about 69 s, 1080 x 1920, 30 fps, -14 LUFS.
Footage is not committed. Clips are in Drive, "Lifeflow media/Campfire vids", and their upload order is in `clips_index.json`.

## The cut (Ali chose the tight version)
| # | Who | Line (clip, in to out s) | On screen |
|---|---|---|---|
| 1 | Tyler | Hook: "So what does it actually do for me, like on a normal day?" (#8, 8.28 to 11.75) | Tyler close-up, "Campfire Q&A" |
| 2 | Ali | "You can wake up to a notification from your skyling planning out your whole day and week... block times for study... overview a whole week." (#7, 1.82 to 10.75) | Ali close-up with his name cloud, then the two-shot: the wheel rises behind them on the fence line (person matte) and turns from morning to night |
| 3 | Tyler | "So Ali, why exactly did you build LifeFlow?" (#5, 0.80 to 4.25) | his name cloud |
| 4 | Ali | "...a tool where I can organize my whole day, have all my seven classes, my work shifts and all my personal finance..." (#11, 0.42 to 8.85) | "7 classes", "Work shifts", "Personal finance" fly out of the fire as the app's clouds |
| 5 | Tyler | "And what exactly is the little character on top?" (#6, 0.94 to 6.95) | two-shot |
| 6 | Ali | "Oh, the skylings... five different characters that represent each different time of day." (#8, 1.10 to 6.32) | wide: the five pop along the sun's arc over them, Dawn to Dreamy |
| 7 | Ali | "Tyler, I think you should tell us how your skyling's helping you with all your personal finance." (#3, 0.24 to 5.02) | two-shot drifting to Tyler |
| 8 | Tyler | The food story (#10, 1.56 to 11.02, then 15.50 to 17.65) | Dreamy beside him and the app's real money note "Food is running high"; the two-shot hides the jump |
| 9 | Tyler | "So as of January next year, 2027, LifeFlow will be able to connect... your Apple Health app into LifeFlow." (#9, 0.56 to 11.12) | "January 2027" and "Apple Health" clouds |
| 10 | Ali | His new line: "You heard him, January 2027, but you can get on the waitlist right now." (#4, audio only) | the night sky and string lights above the fire (clip #11 picture, heads out of frame); the five rise out of the fire; "Your day, / drawn as the sky." and "Join the waitlist · lifeflowweb.com"; it dissolves into the logo with the title held |

Left out:
- the "What's up everybody" intro (a slow start);
- "Why a sky?", which has no answer in the clips;
- "so everything's in order and connected";
- the end of Tyler's story ("recipe plans... calorie deficit"), because the app doesn't track calories (brand kit, app-facts).

The health line stays because Ali's new line says "You heard **him**" (Tyler is the one who says January 2027; checked by eye on the frames).

## How it was made
- **Picture.** `fire_render.py`:
  - **Decode:** each clip is decoded straight from the 4K HEVC. 120 fps frames are blended three at a time (1-2-1, for film-like motion), the HDR colour tags are put back, then it's tone-mapped (HLG to SDR, mobius).
  - **Shots** are crops of the 2160 x 3840 frame: close-ups at 2.5x, two-shot at 1.7x, wide at 1.3x, with slow push-ins.
  - **Person matte:** MediaPipe selfie multiclass on the square around both of them, every frame.
  - **Grade:** warm highlights and cool shadows, a little more colour, bloom only from warm saturated highlights (so the laptop's white glare doesn't bloom), a vignette, and a key light on faces and chests inside the matte.
  - **App pieces:** the see-through wheel from the launch video (`launch/work`), skylings (kit frames), clouds (`make_cloud.py`), and embers rising from the fire, a fifth of which settle as twinkling pixel stars.
  - **Captions:** word by word in the launch video's style; long lines split to fit.
  - **Rendering:** `--part k K` renders in parallel, then `ffmpeg -f concat`.
- **Sound.** `fire_mix.py`:
  - the voices are cleaned and levelled, and the new line gets a little of the fire's air;
  - a fire bed is made here, because the takes have almost no background (low rumble plus crackles and a few pops);
  - the launch score (already paid) is arranged as intro, the groove three times, then the ending, with the last chord on the logo, ducked under the voices;
  - the kit's pixel sounds go on every overlay beat;
  - the whole mix is set to -14 LUFS.
- **Transcripts:** faster-whisper medium.en in the Higgsfield sandbox (`words.py`); cut points were checked on the audio level so every cut sits in silence.
