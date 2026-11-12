# "A day, at its real time" (rough cut, 2026-11-12)

The new format after Ali dropped AI-built sets (Playbook, Decisions, 2026-11-11 and 2026-11-12): real people in real places,
each moment filmed at the time of day it really happens, cut with the real app filmed at that same minute. The app draws
the sky for the real time, so the phone matches the light around the person.

Rough cut: 30.6 s. Three marked gaps ("YOUR SHOT GOES HERE") for Ali's shots, then the app:
- 7:10 AM: the opening screen ("Rise and shine, Alex", Dawn rising out of the water), then Today with Dawn.
- 2:30 PM: the real answer from "What's new" v4 (Ray fits the Chapter 6 reading response around the 4 to 9 shift).
- 10:40 PM: Today with Dreamy, the line opened, the reading response ticked off, a star, then "6 stars today".
- The logo's ending (sting2).

How it was made
- Main 2ea0619 (80 commits after v4, including the skyling cheering for every good moment), production build, film
  database `budgetflow_film2` migrated to 0064. Morning and night ran with the film account on "Changes with the sky" so
  the time picks the skyling (Dawn from 70 min before sunrise to 45 min after; Dreamy from 9 PM). Afterwards the account
  went back to Ray, the assignment back to open and its star row deleted.
- Servers: `serve_ai.sh "2026-11-17 12:09:30" none` (morning) and `serve_ai.sh "2026-11-18 03:39:30" none` (night).
  No AI calls; the afternoon answer is the recorded v4 take.
- Captures use the "What's new" helpers (`lib.cjs`, in ../whats-new): `node cap_day_morning.cjs`,
  `node cap_day_night.cjs tick`, `node cap_day_night.cjs night` (the night script is `cap_follow.cjs` with the new times).
- Edit: `python3 timeline_day.py`, `python3 mix_day.py`, `node render_day.cjs frames_day`, then the usual ffmpeg encode.
  The stepper side effect (a finished star coming back) is cut: the tick ends at capture frame 124.

Next: Ali films the three shots (vertical, 24 fps, shutter 1/48, exposure and focus locked, at the real times). Each
replaces its gap; the app segments stay. Nothing is posted without "post it".
