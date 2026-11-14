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

## v2: new effects (Ali, 2026-11-14: "why are they the same exact effects from last video")
Same cut, grade, voices, score and fire bed. Every effect is new and made for a fire at night. Nothing is reused from the launch video:
no wheel, no word clouds, no skylings popping in, and no "Your day, drawn as the sky." title. The date is on screen once, at the end.
Picture: `fire_render2.py` (imports `fire_render.py` for the decode, shots, matte and grade). Sound: `fire_mix2.py`.

| # | Line | v2 on screen |
|---|---|---|
| 1 | Tyler: "So what does it actually do for me...?" | "CAMPFIRE Q&A" in ember pixels; sparks swirl out of the fire into a glowing pixel "?" over him, which bursts on the cut to Ali |
| 2 | Ali: "wake up... plan your whole day and week... study time... a whole week" | "Ali Moslli" written in the air like a sparkler (long-exposure trail, a spitting head, then smoke), "CEO & DEVELOPER" under it; the real sky above the roof turns through a whole day in the app's sky colours (`src/lib/sky.ts` keys), the app's pixel sun crosses and sets behind the roof, the moon comes up; the books icon rises for "study time"; "a whole week" = seven little suns coming up in a row, M T W ... |
| 3 | Tyler: "So Ali, why did you build LifeFlow?" | "Tyler Kardy" in sparkler light, "CMO" |
| 4 | Ali: "seven classes, my work shifts, personal finance... in one place" | cut to the two-shot; the fire throws sparks that land as ember letters with the app's own icons: 7 CLASSES (books), WORK SHIFTS (briefcase), FINANCE (cash). On "in one place" every spark is pulled into one pixel sun |
| 5 | Tyler: "what's the little character on top?" | the sun settles into a star and the stars come out |
| 6 | Ali: "the skylings... each different time of day" | the stars join into five constellations (each skyling's outline) that ignite into Dawn, Ray, Goldie, Twinkle and Dreamy; the sky behind them runs dawn to night, left to right, each one under its own time |
| 7 | Ali: "Tyler... how your skyling's helping you" | a shooting star falls to the fire-pit rim by Tyler and lands as Dreamy |
| 8 | Tyler's food story | Dreamy sits on the rim, lit by the fire; on "food after work" the app's coin with wings flies off; on "home-cooked meals" a pixel speech bubble with the app's bowl (its steam drifts); Dreamy cheers and floats off on "works a long way" |
| 9 | Tyler: health and Apple Health | a heartbeat drawn in light across the sky, the app's heart on the middle beat; a light thread to the app's sun, and "into LifeFlow" the heart goes into it |
| 10 | Ali's new line | the sky turns the app's night blue while sparks spell JANUARY 2027; the camera whips down into the fire's biggest flames (clip 11 at 14.2 s), they flash gold, and the logo opens out of the gold from its icon; its rising sun throws GET ON THE WAITLIST, then lifeflowweb.com |

- Captions: warm white (Geist Bold), the spoken word lit ember-orange with a glow.
- Every icon is the app's own 12 x 12 pixel art, read from `src/components/day-clock/pixel-icons.ts` at render time; the sky colours are the app's.
- The sparkler names use Sacramento (SIL Open Font License, from google/fonts; download it to `fonts_dl/` next to the script).
- Sound: a sparkler sizzle on the names, ember whooshes on the letters, the app's own sounds on its pieces, a heart-monitor beep on each drawn beat, a whip and a flame roar into the flash. Made in code; no credits.

## v3 (Ali, 2026-11-14: keep my original last shot, cover my mouth; there's no music; an intro we can reuse)
- **Order:** the hook (Tyler's question, the ember "?"), then **the intro**, then the body as in v2, then the new ending. About 72.7 s.
  The hook stays in the first second (the playbook's rule), and the intro is the show's open right after it.
- **The intro** (`fire_intro.py`, reusable: `python3 fire_intro.py "CAMPFIRE Q&A"` makes `intro.mp4`, 3.1 s with its own sound).
  It is a pixel scene drawn in code, not the logo or a name card:
  - the question's sparks gather into one spark that shoots up, and the sky opens around it;
  - a whole day in a second: the sky runs dawn to night in the app's sky colours, ridden by the skyling of each moment (Dawn, Ray, Goldie, Twinkle, Dreamy), each handing over with a rising chime;
  - at night a pixel campfire lights on a hill, four skylings land around it like shooting stars, and Dreamy floats above as the moon;
  - the fire throws the show's name in ember letters;
  - the camera falls into the fire, and the video opens out of the gold.
  - Change the title for other talk videos.
- **The ending** (`fire_end.py`): Ali's original last shot. It exists only in his rough edit (720p, same framing as the 4K camera; the 4K clips don't contain it), so it's scaled to the camera frame and run through the same shot, matte, grade and a sharpen.
  - His re-recorded line plays over it.
  - His words leave his mouth as a puff of pixel embers that covers his lips the whole time, tracked with the matte model's face-skin class (`fx/end/mouth_raw.json`), breathing with his voice.
  - They stream into the app's pixel speech bubble: YOU HEARD HIM, / JANUARY 2027 / GET ON THE WAITLIST / RIGHT NOW!
  - The bubble pops, the picture flashes gold, and the logo opens out of the gold; its sun throws GET ON THE WAITLIST and lifeflowweb.com.
  - If Ali uploads the 4K original of that shot, swap it in (`RoughReader`).
- **Music** (`fire_mix3.py`): the score was -15 dB and ducked again, so it was nearly inaudible. Now it plays from the first frame, about 6 to 8 dB under the voices and full in the intro (+3 dB). The whole mix is -14 LUFS.
- **Build:**
  - `fire_render2.py --range 0 104 hook3.mp4` (hook without the old label);
  - the v2 parts for the body;
  - `fire_intro.py`, `fire_end.py`, `fire_mix3.py`;
  - then `assemble3.py`, which joins hook + intro + body + ending in one encode and checks the frame count against `timeline3.json`.

## v4 (Ali's notes on v3)
| Note | Fix |
|---|---|
| "intro is too fast ... how they move" | `fire_intro.py` v2: every beat about 1.6x calmer, 5.35 s (the day rides for 2.1 s, the four land one by one, the name forms over 0.9 s and holds) |
| "when Tyler says what his skyling suggested, show it ... from the skyling next to him as a notification" | Dreamy pings and a notification card comes out of it in the app's pixel style, on "remind me about home-cooked meals": DREAMY · NOW / "Food is running high" / "Want to see where it went?" (the app's real words for this note, `spending_pace` in `src/lib/jarvis-voice.ts`; no amounts) |
| "the music is wrong and changed the whole vibe" | a new warm acoustic campfire track (ElevenLabs Music v2.5 via Higgsfield, 30 s, 4.36 credits, approved; `music_dl/`), its 6-bar section 3.39 to 20.65 s looped on the beat under the whole video, fading on the logo; about 8 dB under the voices, full in the intro |
| "some of the cuts aren't right after Tyler asks what the characters are ... silenced frames" | measured: half a second of silence before "day" in his answer, and 0.46 s of dead air after "Tyler," in the next line. Both closed with a punch-in jump cut (`_split` in `fire_render2.py`); their effects keep the line's timing (`fx_tag`, `fx_t0`) |
| "i don't like the cursive names" | the names are burned into the pixel letters by a fuse (bright head, sparks), glow, then lift off as embers (`FuseName`) |
| "Tyler's last clip on health ... how long it is" | 10.6 s to 5.9 s: "So as of January next year, 2027, LifeFlow will actually be able to connect all your health data." (the pause after "2027," and the Apple Health half are cut); the heartbeat in light and the heart stay |
| "my new voice ... not blending in ... maybe a bit low" | v3's echo halved its level. Now it is matched to his camera voice: a smooth EQ from the two spectra (within 9 dB), the same speech level plus 1.5 dB, two faint early reflections for the camera's distance (`match_line` in `fire_mix4.py`) |

Build: `fire_render2.py --segs wheel,arc_1,ask_tyler,health_1` (and `food,health`, `tyler_name,ask_tyler_1`) renders only the changed pieces; `assemble4.py` takes the unchanged ones (clouds, question, the first part of the skylings answer, long_way) straight from the v2 render, adds hook3, the intro and end3, and checks every count against `timeline4.json`; `fire_mix4.py` is the sound. About 69.4 s.

## v5 (Ali's notes on v4)
| Note | Fix |
|---|---|
| "those orange texts ... aren't showing ... why are we even using those colours even for the subtitles, they don't look like the last video" | captions are the launch video's again (Fraunces Bold, soft white, the spoken word in gold, a navy edge; `fire_render.caption`). Every pixel letter (names, the "?", the connections, the intro's title) is soft white (gold for accents) with a navy rim and a soft gold glow (`draw_cells`), readable on any background |
| "i also hate this music ... just use last video's music (the pier one)" | the launch score again, its last chord on the logo, about 7 dB under the voices and full in the intro (`fire_mix5.py`) |
| "the sun that's collecting the 7 classes ... doesn't look good, maybe have it as a styling" | no sun: on "in one place" a gold pixel frame draws itself around everything |
| "the one on top that shows the connections is a good idea but ... show all of the connections even the ones we don't talk about, like mail, goals, to dos, milestones, health" | eight connections with the app's own 16 x 16 icons (`components/pixel/art.ts`): 7 CLASSES, WORK SHIFTS, FINANCE land on his words, then MAIL, GOALS, TO-DOS, MILESTONES, HEALTH, two columns, all inside the frame |
| "the animations for the first answer don't really make sense" | they now follow his words: "wake up to a notification from your skyling" = Dawn rings the app's bell beside him; "planning out your whole day" = the day as a line in their sky with the app's icons as its stops (bell, class, work, dinner, moon); "block times for study time" = a gold study block drops into a gap; "overview a whole week" = the app's real timeline (next row) |
| "just show the timeline from the app for that week one" | the app's own Today timeline (the see-through capture in `whatsnew/cap/timeline2`, sample data) scrolls through the week in the sky above them |
| "the notification ... looks very very bad and unlike our app" / "he doesn't say food is running high" | Dreamy's little "!" and the app's pixel speech bubble with the app's house and bowl icons (home-cooked meals, what Tyler says), no words |
| "with the ending you changed too much and now there's too much different color" | the puff over his mouth and its sparks are white and gold, no gold flash: a soft dissolve into the logo with the launch title style, "Get on the waitlist." ("waitlist." in gold) and lifeflowweb.com |

Build: `fire_render2.py --range 0 570 v5r0.mp4` (and 570..1140, 1140..1708), `fire_end.py`, `fire_intro.py`, `fire_mix5.py`, `assemble5.py`.

## v6 (Ali: "have the moon's notification be a small cloud saying something like Hey Ty, try out this high protein recipe after work today!")
Dreamy (the moon) sends Tyler a small cloud in the app's own cloud style (the kit's `make_cloud` tiles, grown to two lines by
`cloud_lines`): "Hey Ty, try out this high protein / recipe after work today!", after a little "!" over Dreamy. The owner's
words; note that today the skyling suggests recipes when asked in chat, it doesn't send recipe ideas on its own yet.
Only those seconds were re-rendered (`--range 1384 1468 v6patch_food.mp4`) and `assemble5.py` splices them in (`PATCHES`).
