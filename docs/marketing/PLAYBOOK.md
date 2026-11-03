# LifeFlow marketing playbook

The single source of truth for LifeFlow's social media and ads. Any Claude chat, on any account, starts here.

**Starting a new chat:** say "Read `docs/marketing/PLAYBOOK.md` in the LifeFlow repo and continue the marketing work." Claude must read this whole file before writing a script or touching footage, and must update the **Video log** and **Decisions** sections before a chat ends or compacts.

---

## 1. The brand

- **Name:** _not picked yet_. Decided 2026-11-03: it is NOT the owner's name (not Ali) and must not be the assistant's name. Until picked, scripts say "the face of LifeFlow" and use no name.
- **What it is:** a personal assistant app that brings your schedule, school, work, money and goals into one place, and helps on its own, even when you don't open it.
- **Audience:** LifeFlow is for everyone. Ads target students first (college, 18 to 24).
- **The assistant:** inside the app he's called Jarvis by default (users can rename him). In ads and on the landing page hero, say **"your personal assistant"**, not "Jarvis".
- **Look:** deep green hero colour on cream, the green wave logo mark. Brand guide: https://claude.ai/artifact/Xngzg4E3JKBE6fEvVrTpA8
- **Price:** free while in testing. At App Store launch it becomes paid through Apple in-app purchase. Don't show an App Store badge until the app is live there.

### Words and tone
- Calm, confident, a little dry. Short sentences. Talks like a friend who has it handled.
- **Never** use em dashes in any text the viewer sees.
- **Never** say "calm place" (the owner dislikes it).
- Lowercase, casual captions are fine on TikTok and Reels ("i didn't open it once 💀").

### Truth rules (non-negotiable)
- Only show features the app really has (list in section 2). No mock-up notifications made in an editor; screen-record the real app, using the demo account with real-looking data.
- Never claim LifeFlow moves money, trades, or sends messages for you without approval. It suggests; you approve.
- Never show a real person's private data. Use the demo account.

---

## 2. Real features you can show

**Proactive notifications** (things the assistant sends on its own):
- Morning brief ("Good morning, Ali. 3 things on your calendar, free after 4. Bio lab report is due tonight.")
- Schedule clash ("Bio exam Thursday overlaps your shift Wednesday") with a **Block it** button that adds study time
- Low balance warning ("Checking could go below $0 around Friday")
- Bill due ("Phone bill ($45) is due Friday") with a **Remind me** button
- Payday split suggestion ("Payday: set aside $60 for rent, $25 for savings")
- Double charge, free trial ending, subscription price going up, new subscription, unusual spending, bank fees
- Overdue tasks, goal check-ins, task streaks, Sunday "week ahead" message

**In the app:**
- Today page (the whole day at a glance)
- Chat and live voice with the assistant
- Canvas and school syncing, syllabus and schedule photos
- Work shifts and pay
- Money: available now, spending, bills, subscriptions, goals
- Life milestones and goals
- Import what ChatGPT knows about you
- Updates inbox: forward a bill or photo and it gets filed
- Google and Outlook/Teams calendar connections

---

## 3. How we make a video (the workflow)

The owner films on their phone and sends the clips into the chat. There are two kinds of clip:

| Kind | What it's for | How the owner marks it |
|---|---|---|
| **Reference** | The owner talking to camera about the idea: what they want, how a shot should look, the vibe, lines they like. Used as direction, not copied shot for shot. | Say "reference" at the start of the clip |
| **Use this** | Real footage meant for the final video (e.g. the snap, a reaction, a hook line to camera). | Say "use this" at the start, or name it in the message |

### What Claude does with clips
1. **Reads each clip:** transcribes what's said and pulls frames to see the shots, the framing and any actions shown. (Claude doesn't watch video like a person: it reads the words and looks at stills about every half second. Instructions said out loud are never missed; a quick gesture with no words can be.)
2. **Writes the brief back** in a few lines: the idea, the hook, the shot list, which clips are used where. The owner confirms or corrects.
3. **Writes the script**, using the owner's own words and ideas from the reference clips, tightened.
4. **Edits:** cuts the "use this" footage tight (no dead air or "um"s), adds screen recordings of the real app, captions, zooms, music, and exports **vertical 9:16, 1080×1920**.
5. **Sends the draft**, takes notes, sends the fix.
6. **Updates this file** (video log, decisions) before finishing.

### Tips for the owner when filming
- Vertical, near a window, phone at eye level.
- One second of silence before and after each take.
- Say the hook 2 or 3 different ways.
- 2 or 3 takes of any action shot (like the snap).
- Say direction out loud in reference clips: "here cut to the lock screen", "this part slow", "zoom on my face".

## 3b. The LifeFlow character (same in every video)

- **Who:** a stylized 3D animated version of the owner himself (decided 2026-11-03, replacing the generic guy in sheets A and B): a smart, friendly college-age guy in feature-animation style, not photoreal. It is a flattering likeness made from the owner's own photos with his approval, not an exact copy. The photos were uploaded to Higgsfield as references (media ids below) and are not stored in this repo.
- **Look (face, hair, glasses and build never change unless the owner asks):** messy textured curly brown hair with volume on top, soft curls over the forehead and a short taper on the sides; light blue-gray eyes; thick natural dark brows; fair skin with a slight warm flush; black browline (clubmaster-style) glasses in every shot; sturdy strong build; mature jaw, not a babyface. **Clothing changes from video to video, even from clip to clip (owner's decision).** Starter outfit on the sheet: deep forest green (#1F4D3A) quarter-zip sweater, cream tee, light-wash straight jeans, white low-top sneakers with a thin green stripe, slim black smartwatch on the left wrist. Every video brief names that video's outfit; new outfits are made by editing the chosen sheet, keeping the face fixed.
- **Character sheet:** Higgsfield, model `gpt_image_2_5` (high quality, 2k, 16:9), turnaround (front, 3/4, side, back) plus 4 expressions on cream (#F4F0E8). Two versions made 2026-11-03:
  - A: job `4f7ae757-36dd-4046-95ab-89a025d140e2`
  - B: job `7986c912-569a-4f8b-8350-b39920984dbc`
  - C (the owner's own character, made 2026-11-03, 2.75 credits, model `gpt_image_2_5`, high, 2k, 16:9): job `f3303846-c6d9-4722-a577-ad1c326fae0f`. Result: smart, friendly, clean jaw, glasses and curly hair, consistent across all 8 views; it reads slightly slimmer and a little more auburn than the owner's photos, so ask the owner if he wants the face closer to his real one. Reference photos (Higgsfield media ids): `a78ae4bb-5353-41d3-b79d-ee6d84dc9d5c`, `3f6bbd52-614a-4623-a072-4991a1bab26d`, `e91883bb-0ac0-45a5-a13d-aaa72cf2acec`.
  - **Chosen:** **C is the confirmed pick** (owner said yes on 2026-11-03, after seeing the desk frame; the face may still be refined); A and B are superseded. Every video uses the chosen sheet's job id as the image reference.
  - (Earlier note, superseded by C) Claude's recommendation between A and B: **A.** A has the more defined jaw and the older, more confident face the look rules ask for; B's face is rounder and reads younger. Both have the same outfit and all four expressions (smile, surprised, thinking, laughing).
- **Name:** Ali (the owner's own name, decided 2026-11-03; can change later, only appears in scripts for now). It must not be the assistant's name.
- **Voice (decided 2026-11-03):** NOT the owner's voice. One ElevenLabs male voice, the same in every video. Claude plays 2 or 3 short samples of the same line, the owner picks, and the voice name and id are recorded here. Voice: _not picked yet_. Disclose the character as AI-animated on every post.
- **Every video brief includes:** the character, location references, the owner's reference clips, the full script, and an action script (shots, camera moves, lighting changes, motion), plus music and clean captions.
- **Credits:** an image is about 3 credits; video costs more, so Claude checks the price before every generation and asks before going over the agreed budget.

## 3c. Character videos: performance capture, plus the "snap" reveal (decided 2026-11-03)

The owner does not want to be the public face, so the character is the face of LifeFlow. The owner performs and the character copies the performance.

**How a character clip is made (two Higgsfield tools):**
1. **Motion Control** (`motion_control`, Kling 3.0): inputs are `image_id` (a still of the character) and `motion_video_id` (the owner's filmed take). The character copies the owner's head, face, mouth and gestures. `scene_control: image` keeps the background from the still, so the still must already show the character in the set. `resolution`: 720p (cheaper) or 1080p.
2. **Voice Change** (`voice_change`): swaps the voice in a video for another voice and keeps the timing. Voice is ElevenLabs (section 3b).
- Output length equals the length of the filmed take. Long videos are cut from several short takes (5 to 8 seconds each, one idea per take), mixed with real app screen recordings.
- **Still to confirm with one 5-second test at 720p:** the maximum take length, the credit cost, and whether the voice carries through correctly. Do not film a full shoot before the test passes.

**The "snap" reveal video (first video with the character, about 40 seconds):**

| Time | Who | What |
|---|---|---|
| 0 to 6 s | Character (made from the owner's take) | "Hey, I'm the face of LifeFlow..." |
| snap | | Hard cut with a snap sound, quick flash or zoom |
| 6 to 18 s | **The owner, real footage, no AI** (bedroom or desk) | Says who he is: the developer, and that he built the character to speak on his behalf, not to impersonate him |
| snap | | Hard cut back |
| 18 to 38 s | Character at his desk, cutting to real app screens | Explains the app |
| 38 to 42 s | Character | Call to action, link in bio |

- Film the character takes and the reveal take at the same distance, camera height and head position so the cut feels like a transformation. End the character's last line looking at the camera.
- Later videos can drop the reveal and use a one-line disclosure ("LifeFlow's AI host") plus the platform's AI label.

**Locations (references saved in `docs/marketing/refs/office-sets.png`):** six AI-generated office views (logo wall, desk, meeting room, kitchen, lounge, open plan). They are references, not backdrops: each set is a 9:16 still of the character already placed in the room.
- First three sets: **desk** (explainers, build diary), **logo wall** (intros, announcements, call to action), **lounge** (casual updates, Q&A).
- Shot library per set: medium, close-up, wide, and a side view looking at the laptop. Each angle is its own still and its own short clip, and each take can use a different angle so the cuts are free. Build only the angles we have tested.
- Higgsfield can make new camera views of the same location, and the face stays the same by always using the chosen character sheet as the reference.
- Check the logo wall: AI redraws logos slightly wrong. If it is off, paste the real logo (`marketing/launch/shots/logo.png` on the marketing branch) in the edit.

**Honesty rules for the character:**
- He is a stylized 3D animated character, so nobody mistakes him for a real person. Still use the platform's AI label on every post.
- He says "I'm the face of LifeFlow". He never says he built the app or that he is the developer. Only the owner's real footage says that.
- No implied office or team that does not exist. Call the setting "his desk". Avoid the open-plan view as a main set.
- No fake testimonials, user counts or results. Only features in section 2.

**Open items before the first character video:** pick sheet A or B; pick the name; pick the ElevenLabs voice (audition 2 or 3 male voices on one test line); the owner writes or approves the reveal line; run the 5-second test.

---

## 4. Scripts

### Reel 1: "I didn't open LifeFlow for 7 days" (proactive assistant)
Chosen from 10 concepts. Shows the assistant helping without being opened. 28 to 32 seconds, 9:16, lo-fi beat, notification "ding" on each beat, beat drops on day 4.

| Time | On screen | Text on screen | Voiceover |
|---|---|---|---|
| 0.0–2.0 | Hand drops phone face down; app closed | "I didn't open this app for 7 days." | "I didn't open this app for a week." |
| 2.0–3.0 | Black, lock screen lights up | "Here's what it did anyway." | "Here's what it did anyway." |
| 3.0–6.0 | MON 7:02 AM: morning brief on lock screen | MON | "Monday, it planned my day before I woke up." |
| 6.0–9.5 | TUE: clash alert, tap **Block it**, study block appears | TUE | "Tuesday, it caught a clash I didn't see." |
| 9.5–13.5 | WED: music cuts, "Checking could go below $0 around Friday" | WED | "Wednesday... this one." |
| 13.5–16.0 | Beat drops: bill due Friday, tap **Remind me** | | "Then it told me how to fix it." |
| 16.0–19.0 | THU: payday split | THU | "Thursday, payday. It split it for me." |
| 19.0–24.0 | FRI/SAT/SUN quick cuts: double charge, trial ending, price going up | FRI / SAT / SUN | (beats only) |
| 24.0–27.0 | Full stacked lock screen, phone flips | "I opened it 0 times. It never stopped helping." | "Zero times. It never stopped." |
| 27.0–30.0 | Logo on cream | "Your personal assistant for school, work and money." + lifeflowweb.com | "LifeFlow. It's already on it." |

Caption: "it planned my week, caught a double charge and stopped an overdraft. i didn't open it once 💀 link in bio"
Hashtags: #studenttok #collegelife #moneytips #productivity #lifeflow

Alternate hooks to test:
1. "My phone stopped me from overdrafting. I didn't even ask it to."
2. "This app texted me 9 times last week and every one saved me."
3. "Nobody tells you about the assistant that works while you sleep."
4. "Bro my app caught a double charge before my bank did."
5. "Stop opening apps. Let the app come to you."

Runner-up ideas kept for later: "The overdraft that didn't happen" (one money story), "It caught this" (fast list of saves), "Exam week survival" (clash spotted, study time blocked), "Lock screen at 7 AM" (morning only).

---

## 5. Video log

Update after every video. Newest at the top.

| # | Video | Status | Notes |
|---|---|---|---|
| 0 | Marketing set made with the app's own screen recordings (not the character) | Delivered 2026-11-02 | 6 videos + 2 images: "Too lazy to budget?" reel; four 15-second problem videos (quiz and shift clash, forgotten subscriptions, how much can I spare, live chat with the assistant); the sign-up and onboarding ad; the "connects and uses" logo wall and story. Download: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/087f2269-b8d3-479a-b561-24b9035886a6.zip . Plans, recordings and render code are in `marketing/launch/` on branch `claude/lifeflow-ad-reel-higgsfield-s3r3v1`. The live-chat video used the app's real chat screen and real calendar actions, but the assistant's wording was written by a local stand-in because no OpenAI key was available; say so if asked. |
| 1 | "I didn't open LifeFlow for 7 days" | Script done, not filmed | Needs demo account loaded with matching data (bio exam, Wednesday shift, $45 bill, low balance, double Spotify charge). Check the morning brief arrives as a real lock-screen notification before filming. |

---

## 6. Decisions and preferences (keep adding)

- Owner wants short replies and quick recaps, especially during work hours.
- Don't change the app while doing marketing work unless asked.
- The owner's clips are direction, not a template: the final video doesn't have to copy their exact movements.
- Final videos are made with Higgsfield using the one LifeFlow character (section 3b); the owner provides credits. Check the price first and ask before spending past the agreed budget.
- 2026-11-03: owner confirmed he wants the animated character (sheet C) as the face of LifeFlow, with a different name and a different voice from his own. He was losing interest until he saw a concrete frame and mock reel, so always show a concrete example before asking him to spend more time.
- 2026-11-03: the character is performance-captured from the owner's own takes (section 3c), with a "snap" reveal in the first video. He does not claim to be the developer.
- 2026-11-03: open conflicts to settle before posting: (1) price: this file says free while in testing, but the poster and the LinkedIn draft offer 15% off with code LifeFlowLaspo (the code must exist in Stripe); (2) the sign-up and onboarding ad briefly shows the app's intro line that contains "calm place", which the owner dislikes: re-cut the ad or change the app copy; (3) the Microsoft/Outlook connection exists on `main` but is not on the connectors images: add it once it is deployed and working.
- 2026-11-03: branch `claude/lifeflow-ad-reel-higgsfield-s3r3v1` is well behind `main` (about 330 files differ). This file was copied from `main` onto that branch so it can be kept updated there; merge or cherry-pick it back to `main`.
