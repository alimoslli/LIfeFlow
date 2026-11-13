# LifeFlow launch video, from the pier (2026-11-13)

**The standard from now on (Ali, 2026-11-13):**
- Ali and Tyler stay on camera almost the whole time, talking to the camera.
- The app comes in as overlays on top of them while they talk:
  - the skylings in the real sky behind them, tracked to the shot;
  - the app's pixel clouds carrying real details from Today;
  - a small floating phone with the front page (Today).
- No back pages and very few full-screen recordings.
- Nothing from the old LifeFlow.

Final: `LifeFlow_Launch_Pier.mp4`, 36.4 s, 1080 x 1920, 30 fps, -14 LUFS. Footage is not committed.

## The cut
| Time | What |
|---|---|
| 0 to 11.7 s | **Tyler (IMG_4105, Ferry Building behind him).**<br>• Dreamy pops into the real night sky on the first frame and stays locked to it.<br>• "Tyler Kardy, CMO" appears as a pixel cloud over his head.<br>• The LifeFlow logo shows at the top from "LifeFlow".<br>• "Early January 2027" appears as a cloud with sparkles.<br>• On "Let's go" the camera whips up into the sky. |
| 11.7 to 26.7 s | **Ali (IMG_4127, sitting, Bay Bridge behind him)**, whipped in from the sky.<br>• His name appears as a cloud.<br>• On "skylings", all five pop up over the bridge.<br>• On "a simple, easy sky", they hop into a small phone with the real Today page. The sky in the phone moves through the day: 7:10 AM Dawn, 1:40 PM Ray, 4:20 PM Goldie, 10:40 PM Dreamy.<br>• On "classes, work shifts, schedules, finances", the page's real details come out as the app's clouds: "Chapter 6 reading due 11:59 PM", "Thu: 12:30 to 3 PM shift", "12 PM Lunch with Sam", "Spotify $11.99 tomorrow, you have $1,842". |
| 26.7 to 31 s | **Jump cut over "in one place"** (a 6% punch-in hides it).<br>• On "with a very smart skyling", Dreamy floats down beside his head and waves.<br>• On "all day", it runs through all five. |
| 31 to 32.9 s | **Slow motion (from the 120 fps original).** The other four come back into the sky. Then the frame pixels out into the logo. |
| 32.9 to 36.4 s | **The logo ending**, plus "Early January 2027" and lifeflowweb.com. |

## How it was made
1. **Grade.** `decode.sh` tone-maps the iPhone HDR (HLG, BT.2020) to normal video (zscale, mobius, npl 203). Then it applies a small curve lift with a cool shadow and a light denoise, and outputs 1080 x 1920 frames at 30 fps. The tail is also kept at 120 fps for the slow motion.
2. **Camera track.** `track.py` follows the background only, with the person masked out (LK flow plus a RANSAC similarity per frame), so the overlays stay locked to the sky.
3. **App capture.**
   - Main 3824a76c, production build, film database `budgetflow_film2` migrated.
   - `cap_front.cjs` records Today only, at four times (`cap_front_all.sh`, with the film account on "Changes with the sky", put back to Ray afterwards). It uses the "What's new" `lib.cjs` and its saved sign-in.
   - No AI calls.
4. **Render.** `render.py` draws everything from the brand kit:
   - skyling frames at 7, 9 or 11 screen pixels per art pixel, never smoothed;
   - clouds from `make_cloud.py` (the night tiles);
   - captions in Fraunces SemiBold on the navy box, with "sky" words in gold;
   - the logo ending.
   
   Run `--preview 1.0,2.0` to save stills.
5. **Sound.** `mix.py`:
   - cleans the real voices (high-pass, denoise, a little presence, compression);
   - puts the kit's pixel sounds on every overlay beat;
   - adds a soft local pad as a placeholder bed (no generated music) and the logo's own ending sound;
   - normalises to -14 LUFS.

   Then mux with ffmpeg.

## Words
- Ali's and Tyler's voices are kept as they spoke. The captions are their exact words, including Ali's "manage your life".
- "in one place" is cut for pace.
- "Early January 2027" is said on camera by Tyler; nothing else is promised.
