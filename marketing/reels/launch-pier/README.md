# LifeFlow launch video, from the pier (2026-11-13)

**The standard from now on (Ali, 2026-11-13):**
- Ali and Tyler stay on camera almost the whole time, talking to the camera.
- The app comes in as overlays on top of them while they talk:
  - the skylings in the real sky behind them, tracked to the shot;
  - the app's pixel clouds carrying real details from Today;
  - a small floating phone with the front page (Today).
- No back pages and very few full-screen recordings.
- Nothing from the old LifeFlow.

Final: `LifeFlow_Launch_Pier_v8.mp4` (36.7 s) and the 15 s cut `LifeFlow_Launch_15s_v8.mp4` (14.2 s), plus covers `LifeFlow_Launch_Cover_9x16.jpg` / `_4x5.jpg`, 1080 x 1920, 30 fps, -14 LUFS. Footage is not committed.

## v8 (Ali: the title should stay into the logo; "I did not see any enhancements" in the captions or the lighting)
- **The title stays.** "Your day, drawn as the sky." (and "LifeFlow · Early January 2027") is drawn on top of the dissolve and stays, untouched, as Ali's scene turns into the logo.
  - The logo ending sits 250 px higher, with the bottom filled by its own stars mirrored, so the title is part of the final frame.
  - lifeflowweb.com sits under it.
- **Changes you can see.** v6's tweaks were too subtle to notice on a phone.
  - **Captions:** in the title's style (Fraunces Bold 66, dark outline and shadow, no box). Words pop in as they're said, and the word being said is gold.
  - **Grade:** a cinematic night grade on the footage only: curves with cool shadows and warm highlights, a little more colour, bloom on the lights, a soft vignette.
  - **Faces:** a key light inside each person's matte (head and chest).
  - **The app's colours** wash over Ali's head and shoulders while the wheel or timeline is behind him.
  - **The skylings'** glow on the scene is about twice as strong.
- **Supporting changes.**
  - One matte set for all of IMG_4127 (`fr2/am`).
  - `render5.py main|short`, with `--plain` for the v7 look as a before/after.
  - The sound is unchanged from v7 (`mix4.py`, same timeline).

## v7 (Ali: the "Skylings" hook "is not even a hook"; he loves the cover's "Your day, drawn as the sky.")
- **Hook.** IMG_4127 0.2 to 2.3 s: Ali sits silently before he speaks.
  - From the first frame, the wheel rises behind him and spins from Dawn to Dreamy.
  - The cover-style title comes up under him: "What if your day / looked like **this?**".
  - Then the whip to Tyler. A burst of the score (its 22.5 to 24.6 s) plays under it.
- **Ending.** IMG_4126 "Be ready by January, 2027.": the cover comes alive.
  - The wheel rises behind him and settles from Ray on Goldie.
  - "Your day, / drawn as the **sky.**" comes up under him, then "LifeFlow · Early January 2027" with a few twinkles.
  - It dissolves into the logo ending. No caption there: the title is the words.
- **15 s cut:** the hook, then the answer, "showing all your classes, your work shifts, your schedules and all your finances" (the timeline), "with a very smart skyling by your side all day", then the ending and the logo.
- **Scripts:** `render4.py main|short` (on top of `render3.py`) and `mix4.py main|short`.

## v6 (Ali: "enhance it more", "we have no hook")
- **The hook (first 2 s, nothing new filmed).** Ali's "Skylings. Skylings." from the start of IMG_4126 (0.84 to 2.9 s).
  - On the first "Skylings", all five pop into the sky around his head.
  - On the second, the wheel rises behind him (person matte) and spins from morning to night while they fly into it.
  - Then the whip down to Tyler. The 15 s cut keeps the hook without the wheel (they celebrate instead), since the wheel follows right after.
- **Cinematic picture.** `decode2.sh` re-made every frame from the 120 fps originals: each frame blends three neighbouring frames (1-2-1), which gives film-like motion and roughly half the grain, then a light denoise and sharpen. Tyler's face and upper body are lifted a little (gamma 0.78, inside his matte, top part only).
- **Light from the app.** The wheel and timeline add a faint edge light on Ali's hair and collar, from what they add as light. A first, stronger try looked like a grey cap and was dropped. Every skyling spills a faint wide glow on the scene.
- **Captions** light up word by word (said: full, still to come: dim) and sit at y 1420, clear of Instagram's own text.
- **Extras.**
  - `LifeFlow_Launch_15s.mp4`: hook, "in a simple, easy sky that goes by with your day" (the wheel), "with a very smart skyling by your side all day", "Be ready by January, 2027.", the logo. It skips "manage", and its music is the score's last 15 s.
  - Covers from the golden-hour wheel frame, titled "Your day, drawn as the sky." with "LifeFlow · Early January 2027".
- **Scripts.**
  - `render3.py main|short` (builds on `render.py`, writes `timeline_<cut>.json`), then `mix3.py main|short` (cues follow each clip's own time, so they move with the cut), then mux.
  - The mattes (`matte.py`) and tracks (`track.py`, now with `track_k` for all of IMG_4126) come from the fr2 frames.

## v5 (Ali: "not black")
- **No black anywhere.** Ali's last 12 frames (23.33 to 23.73 s, as he leans forward to get up) dissolve straight into the logo ending.
- **The logo ending stops on its fullest frame and holds there to the end.** That's frame 93: sun up, "Let's clear your sky.", LifeFlow, lifeflowweb.com, plus "Early January 2027" on top. The file's own fade to black after it isn't used.
- **The ending's sound** comes in softly under Ali's "2027".

## v4 (Ali's notes on v3)
- **Quieter music while Ali talks.** From the cut into Ali's part the score sits 5 dB lower, and it dips a little more while he speaks. Tyler's intro is unchanged.
- **No slow motion.** IMG_4126 plays at normal speed. It fades to black from 23.55 to 23.73 s, as Ali leans forward to get up, so he's never seen standing. His "2027" finishes over 4 frames of black. The logo ending ("Early January 2027", the logo, "Let's clear your sky.", lifeflowweb.com) fades up from black and ends on black.

## v2 (Ali's notes on v1)
- **No whole-app screen.** Two pieces of the app are pulled out with no background and shown in 3D behind Ali:
  - **the wheel:** Today's sky dome, turned from 7:10 AM to night, so Dawn, Ray, Goldie, Twinkle and Dreamy each take the top;
  - **the timeline:** the day's track, flowing along the real horizon behind him, landing on MATH 152, Work 4 PM, Groceries and Spotify as he names classes, shifts, schedules and finances.

  A person matte (MediaPipe selfie segmenter) keeps him in front of both.
- **The words.** "and all your finances" is kept whole; the cut goes after its last "s" (17.11 s). "In one place, that's very easy to understand" is gone.
- **His name:** "Ali Moslli, CEO and Developer".
- **The ending is Ali's "Be ready by January, 2027."** from his other sitting take (IMG_4126). All five skylings celebrate, a "January 2027" cloud lands, and he gets up in slow motion in front of it, with a matte so he stands in front of the cloud. Tyler still says "early January of 2027" at the start.

## The cut
| Time | What |
|---|---|
| 0 to 11.7 s | **Tyler (IMG_4105).**<br>• Dreamy pops into the real sky, tracked to it.<br>• His name appears as a cloud.<br>• The logo shows at the top.<br>• "Early January 2027" appears as a cloud.<br>• A whip up into the sky takes us to Ali. |
| 11.7 to 26.9 s | **Ali (IMG_4127, 1.9 to 17.11 s).**<br>• His name appears as a cloud.<br>• The five skylings pop over the Bay Bridge.<br>• The skylings hop into the wheel as it rises behind him and turns through the day.<br>• The wheel flips away and the timeline flows behind him.<br>• Today's real details rise as clouds: "Chapter 6 reading due 11:59 PM", "Thu: 12:30 to 3 PM shift", "12 PM Lunch with Sam", "Spotify $11.99 tomorrow, you have $1,842". |
| 26.9 to 29.8 s | **IMG_4127 19.5 to 22.4 s**, with a 6% punch-in.<br>• Dreamy floats down beside his head.<br>• On "all day", it runs through all five. |
| 29.8 to 32.4 s | **IMG_4126 21.97 to 24.0 s:** "Be ready by January, 2027."<br>• The last 0.17 s is at quarter speed from the 120 fps original.<br>• The frame pixels out. |
| 32.4 to 35.9 s | **The logo ending**, with "Early January 2027" and lifeflowweb.com. |

## How it was made
1. **Grade.** `decode.sh` handles the iPhone HDR the same way for IMG_4126, from 21 s.
2. **Track.** `track.py` follows the background of each clip; `matte.py` makes the person matte.
3. **App capture.**
   - Main 3824a76c, production build, film database `budgetflow_film2`, the film account on "Changes with the sky" (put back to Ray afterwards). No AI calls.
   - `cap_wheel.cjs` runs at 7:10 AM: everything but the dome is see-through, and two slow drags turn the wheel to night.
   - `cap_timeline.cjs` runs at 10:40 PM: the day opened as a timeline, with the strip's sky, stars and water hidden so only the line, its stops and labels stay. Scroll 1300 to 2160, 2.5 px a frame.
   - Both use `lib2.cjs` (the "What's new" `lib.cjs` plus see-through PNG shots).
4. **Render and sound.** `render.py` (the wheel gets `wheel_mask.png` for a soft dome edge), then `mix.py`, then mux.
5. **Music (v3).** ElevenLabs Music v2.5 through Higgsfield, instrumental, 36 s, 5.24 credits, approved by Ali on 2026-11-13. The prompt is in `mix.py`'s notes and in the playbook. The file goes in as `music_el.mp3`, 0.5 s after the picture so its build lands on the whip, about 12 dB under the voices and 4 dB lower while someone talks.

## Words
- Ali's and Tyler's voices are kept as they spoke. The captions are their exact words, including Ali's "manage your life".
- "in one place" is cut for pace.
- "Early January 2027" is said on camera by Tyler; nothing else is promised.
