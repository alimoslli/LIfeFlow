# LifeFlow launch video, from the pier (2026-11-13)

**The standard from now on (Ali, 2026-11-13):**
- Ali and Tyler stay on camera almost the whole time, talking to the camera.
- The app comes in as overlays on top of them while they talk:
  - the skylings in the real sky behind them, tracked to the shot;
  - the app's pixel clouds carrying real details from Today;
  - a small floating phone with the front page (Today).
- No back pages and very few full-screen recordings.
- Nothing from the old LifeFlow.

Final: `LifeFlow_Launch_Pier_v4.mp4`, 35.3 s, 1080 x 1920, 30 fps, -14 LUFS. Footage is not committed.

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
