# ADHD-first video concepts: shot list and costs (draft for the COO)

Date: 2026-11-22. Written by LF Main overnight while the owner slept. The COO approved the list on 2026-11-22. **What was actually spent is in the log at the end.** The playbook
(section 6, 2026-11-08) says the COO writes the shot list with each shot's cost before any credits are used. This is a
draft of that list for the COO to approve, change or drop.

The owner's budget for this work is **$25** (owner, 2026-11-22). The account has 791 credits on the Ultra plan. The prices
below are Higgsfield's own quotes from tonight. How many credits $25 buys isn't recorded anywhere I can see, so the COO
should check that before approving.

## Rules every concept follows

- From the research (`docs/research/2026-11-22-adhd-first.md`, part 3 and proposal 3):
  - Never asks or says whether the viewer has ADHD ("Do you have ADHD?", "your ADHD brain" are out).
  - No claim to treat, manage, improve or reduce anything.
  - No "superpower".
  - No test, quiz or symptom list.
  - No targeting by health.
  - A skyling recommending the app is our own endorsement.
- From the playbook (section 5b):
  - The hook is in the first frame.
  - Every cut can be seen.
  - App moments are real screen recordings from the demo account (free), never invented screens.
  - Higgsfield is used only for raw footage of the character and the room.
  - Delivered silent; the owner adds the music.
- Only helps that really exist are shown: Start it, the heads-up, Back on track, and stars. They ship only together with
  the app branch `claude/adhd-six` after the owner's yes.

## The three concepts (9:16, 15 to 20 seconds each)

1. **"11:48 PM. Blank page."**
   - Hook frame: a dark dorm desk, a laptop with an empty document and a blinking cursor, a phone face up.
   - The phone lights with Today's "Start it".
   - Real screen recording of the focus screen: "Open a doc and type the title." and a 5 minute timer, with the skyling reading.
   - Cut to the doc with a title typed. Then "Keep going", then the star.
   - End card: "For when starting is the hardest part."
2. **"Back after a rough week."**
   - Hook frame: a phone face down on a messy bed, a hand reaching for it.
   - Real screen recording: Today says "3 to-dos can find new times." One tap. They spread across the week ("Laundry today at 4:00 PM...").
   - No red badges, no counting days.
   - End card: "No pile. Just the next thing."
3. **"Deep in it."**
   - Hook frame: someone deep in drawing, headphones on, the light changing (time passing).
   - The real heads-up push: "Bio 101 at 10:00 AM. In 15 minutes, Hall 201. Time to wrap up."
   - They save, stand up, and leave on time.
   - End card: "A heads-up, at the minutes you pick."

## Shots that need Higgsfield (the rest is free screen recording and local editing)

| Shot | Concept | What | Model | Quoted cost |
|---|---|---|---|---|
| 1a | 1 | Still: dark dorm desk, empty doc, blinking cursor, phone face up (no faces, no brands) | gpt_image_2_6, 9:16 | 0.75 credits |
| 1b | 1 | Still: the same desk, the doc now has a title, warm lamp on | gpt_image_2_6, 9:16 | 0.75 credits |
| 2a | 2 | Still: phone face down on an unmade bed, hand reaching in | gpt_image_2_6, 9:16 | 0.75 credits |
| 3a | 3 | Still: a drawing desk, headphones, late-afternoon light | gpt_image_2_6, 9:16 | 0.75 credits |
| 3b | 3 | Still: the same desk with evening light (for the time-passing cut) | gpt_image_2_6, 9:16 | 0.75 credits |
| M1 | 1 | Motion: shot 1a, a slow push-in, 5 s (only if the still passes the check) | Kling 3.0 pro 5 s, no sound | 7.5 credits (playbook price, re-quote first) |
| M3 | 3 | Motion: shot 3a to 3b, light shifting, 5 s (only if the stills pass) | Kling 3.0 pro 5 s, no sound | 7.5 credits (playbook price, re-quote first) |

- **Stills only: 3.75 credits.**
- **With both motion shots: 18.75 credits.**
- One take per shot, as the playbook says. The skylings in the end cards are drawn in code from the app (free), not
  generated.

## What the COO decides

- Approve the shot list as is, change it, or drop it.
- Confirm that 18.75 credits fits the $25.
- Whether concept 2 waits until the owner says yes to Back on track in the app.

## Log (actual spend)

- **2026-11-22, stills 1a, 1b, 2a, 3a, 3b:**
  - Model `gpt_image_2_6`, 9:16, one take each.
  - Cost: **3.75 credits** (balance 791.28 to 787.53), the same as the quote.
  - Saved in `docs/marketing/adhd-concepts/`.
  - Higgsfield jobs:
    - 1a: 99b12da6-a355-460d-a7cc-19c7f9de0267
    - 1b: 757efc59-9693-49f3-81b2-11df677a4c22
    - 2a: 7aa1cf3f-1f28-4faf-9bc3-757e8d97f68e
    - 3a: 93e324dc-b1e4-438f-b81d-db596c3ace2e
    - 3b: 458ba39b-c9af-432b-8dcc-0da8642e5e8b
  - Check:
    - All five pass: no faces, no logos, no readable text.
    - 3a and 3b show different drawings, so they work as two cut shots ("time passed") but not as one morph.
- **Motion shots M1 and M3: held, not run.**
  - Re-quoted at **8.75 credits each** (Kling v3.0 pro, 5 s, sound off), above the 7.5 in the list.
  - The COO's rule is to stop and report anything over quote.
  - If approved, the most it could reach is 3.75 + 17.5 = **21.25 credits**.
  - M3 would animate 3a alone with the light moving toward dusk, not 3a to 3b.
- **2026-11-22, motion shots M1 and M3:**
  - Run after the COO approved 8.75 credits each. One take each.
  - Cost: **17.5 credits** (balance 787.53 to 770.03).
  - Higgsfield jobs:
    - M1: 9ecc1ebf-0bfb-4279-8a7e-6ad983d1107b
    - M3: 8e0a27c9-eea9-4912-8ae6-6caf6103e784
  - Files: `adhd-concepts/m1.mp4` and `m3.mp4` (1076 x 1924, 5 s, silent).
  - Check:
    - M1 passes: a slow push-in on the blank page in moonlight.
    - M3 only half passes: the sunlight shimmers but never fades toward dusk. It works as a short living shot before the cut to the dusk still 3b, which carries "time passed".
    - Not re-run (one take per shot).
- **Total spent: 21.25 credits**, the approved maximum. Drafts only. Nothing posted or scheduled.

## Draft cuts (2026-11-22, the COO's go)

The cuts are in `adhd-concepts/drafts/`. Each is 1080 x 1920, 30 fps, silent, and made only from real app screens and
the approved footage. No new credits were used.

- **`reel-1-blank-page.mp4` (21 s):**
  - Starts on M1 with "11:48 PM. Blank page." in the first frame.
  - Then Today's "Start it", the focus screen ("Open a doc and type the title."), the 5 minute timer, "5 minutes done. You started.", and "Done. That counts."
  - Ends on still 1b and the end card "For when starting / is the hardest part."
- **`reel-2-back-on-track.mp4` (14 s):**
  - Starts on still 2a with "Back after a rough week."
  - Then Today's "3 to-dos can find new times.", the tap, and where each one went.
  - Ends on the end card "No pile. / Just the next thing."
- **`reel-3-deep-in-it.mp4` (15 s):**
  - Starts on M3 with "Deep in it.", then the dusk still 3b.
  - Then the focus check-in "Bio 101 is at ... Want to wrap up?" and the "Heads-up before things start" choice in Settings › Notifications.
  - Ends on the end card "A heads-up, at the / minutes you pick."
  - The heads-up push itself isn't shown: a real notification can't be recorded in the test browser, and a made-up one is against the playbook. The on-screen check-in and the real setting stand in for it.

How they were made:
- **Screen recordings:** Playwright video of the local build at 405 x 720, with the same made-up data the tests use. Never production, never a real person's data.
- **Edit:** done locally with ffmpeg (`drafts/make.sh`). Every cut is a hard cut with a short punch-in; the stills have a slow push.
- **Music and voice:** none. The owner adds the music.

Nothing is posted or scheduled. The COO puts these in front of the owner with the ADHD-help pictures.
