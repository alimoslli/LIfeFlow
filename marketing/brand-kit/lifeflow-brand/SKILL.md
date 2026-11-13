---
name: lifeflow-brand
description: LifeFlow's official brand and video style. Use for ANY LifeFlow marketing work (ads, Reels, TikToks, captions, posts, thumbnails, end cards, scripts, pitch slides) so it matches the look, words and rules the LifeFlow team uses. Includes the real logo, logo animations, fonts, colors, the five skylings and the app's pixel clouds.
---

# LifeFlow brand and video style

Everything LifeFlow puts out should look like one company made it. Follow this file for every piece of marketing,
then check the details in `references/` and use the real files in `assets/`. When something here conflicts with a
request, say so and ask before going against it.

## What LifeFlow is (say it this way)
LifeFlow puts your whole life on one screen, drawn as the sky: classes, work, money, plans and health. On top of your
day lives your **skyling**, a little pixel character that sees what's coming, helps fix it before it becomes a problem,
and acts only when you say yes. The point is your time back, for the life you actually want to live.
Students first, then everyone with a full life, however they earn.

## The 12 rules
1. **It's a skyling.** Never write or say "assistant", "AI assistant", "personal assistant", "companion", "Jarvis" or "Dev".
2. **Don't lead with AI.** Talk about the person's life and time, not the technology.
3. **Five skylings only:** Dawn (first light), Ray (through the day), Goldie (golden hour), Twinkle (into the evening),
   Dreamy (late at night). Never "six", never Noon or Dusk.
4. **Skylings and app screens are never AI-made.** Use the PNGs in `assets/skylings/` or real screen recordings of the
   app. Never redraw, restyle or generate a skyling, the logo or an app screen with an image or video model.
5. **The logo is the app icon** (the pixel sun rising over the water) in `assets/logo/`, plus the animated logo videos.
   Never the old blue sparkle logo, never the old name BudgetFlow, never a typed-out or redrawn logo.
6. **End every video with `assets/logo/LifeFlow_Logo_Ending.mp4`** (3.5 s, "Let's clear your sky.", with its sound).
   You may open with `LifeFlow_Logo_Intro.mp4`.
7. **Fonts:** Fraunces for headlines and captions, Geist for small text and UI-style labels (files in `assets/fonts/`).
8. **Colors:** night navy `#142451`, gold `#FFD27A`, dawn peach `#E39568`, soft white `#F3F5FA` (full palette in
   `references/look.md`). Never pure black and white cards, never green or purple brand colors.
9. **No em dashes** in anything a viewer sees. Use a period, a comma or a colon.
10. **Real people, real voices, real app.** No fake numbers, testimonials, reviews or users. No AI voices pretending to be
    someone real. Show the app with a test account and sample data, never anyone's personal information.
11. **Never claim what isn't built** (see `references/app-facts.md`): no watch app, widget, calorie tracking or "Tonight"
    card. Never state a trial length, discount amount or launch date.
12. **Banned words:** productivity, planner, manage, organize, budget, all in one place, calm place, safe to spend,
    "Your life, connected." as a tagline, "What can I take off your plate?", and "Rent" in ads. No guilt words.

## Lines that are ours
- "Let's clear your sky." (the catchphrase: end cards, captions, sign-offs)
- "Your whole life, on one sky."
- "Every app sees one slice. LifeFlow sees all of it."
- "You were never built to choose."
- "So the time you get back goes to everything you were never going to give up."

## Making a video
Read `references/video.md` before cutting anything. In short: vertical 1080 x 1920; captions in the LifeFlow caption box
(see `assets/examples/caption-style.jpg`); film each moment at the time of day it really happens, so the phone's sky
matches the real sky; music about 10 dB under voices; master to -14 LUFS; end on the logo ending.

## The files (always use these, never make your own versions)
| Need | Use |
|---|---|
| Logo | `assets/logo/lifeflow-app-icon.png`, `assets/overlays/logo_lockup_white_text.png` or `_navy_text.png` |
| Logo animation | `assets/logo/LifeFlow_Logo_Intro.mp4`, `LifeFlow_Logo_Ending.mp4` (end every video on this), `LifeFlow_Logo_Loop_WhoeversUp.mp4` |
| A skyling standing still | `assets/skylings/<Name>.png` (night versions for Twinkle and Dreamy) |
| A skyling moving | `assets/skylings_animated/<Name>_<pose>/` frames: idle, wave, celebrate, think. One frame every 0.18 s, looped |
| The app's pixel clouds | `assets/clouds/` |
| Captions | `assets/overlays/caption_box_blank.png` with Fraunces text, see `assets/examples/caption-style.jpg` |
| End line | `assets/overlays/lets_clear_your_sky_white.png` / `_navy.png`, end card `end_card_lets_clear_your_sky.jpg` |
| Sound effects | `assets/sfx/`: tap, typing, send, answer_lands, added_to_your_day, star_tick_it_off, sun_goal_reached, night_stars_twinkle, whoosh_scene_change, sky_turns, skylings_pop_up, logo_ending_sound |
| Real app footage | Not in this skill (too big). It's in the **LifeFlow Editor Pack** (`LifeFlow_Editor_Pack.zip`, `app_footage/`), with green-screen skyling clips. Ask the person to upload the clips you need. |

Scale pixel art (skylings, clouds) only in whole steps with no smoothing ("nearest neighbor").

## Before you hand anything over, check
- [ ] Every word passes rules 1, 2, 9 and 12
- [ ] Logo, skylings and screens are the real files or real captures
- [ ] Fonts and colors are LifeFlow's
- [ ] Ends on the logo ending (videos) or carries the app icon (images)
- [ ] No numbers, features or dates that aren't true today
