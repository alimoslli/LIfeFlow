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
- **Voice (decided 2026-11-03):** NOT the owner's voice. Higgsfield preset **Mark** (`voice_id` `27c04473-84a9-4b60-a41f-c8e8458bd4f1`, `voice_type` `preset`), male, owner approved. Wants him more excited at times: the owner performs the character takes with more energy (Voice Change follows the performance's pacing and emphasis), and any generated lines use a more expressive setting, checked with the owner first. Disclose the character as AI-animated on every post.
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

**Name shortlist (2026-11-03, owner has not picked):** Dev (recommended, pun on "developer", fits the reveal), Theo (backup), Kai, Milo, Finn, Cole, Ezra, Rio, Jules, Ollie. Not allowed: Ali, Jarvis, Nova, Sage, Atlas, Max, Remy.

**Voice previews (free, male, Higgsfield presets):** Benji, Cody, Evan, Dylan, Miles, Jasper (ids in `list_voices`). Next step: owner picks 2 or 3, Claude generates the same line in each for a fair comparison.

**Test take (5 seconds, owner films):** vertical, eye level, window light, plain background, head and shoulders, glasses on. Line: "Hey, I'm Dev, the face of LifeFlow." with a small nod and a quick wave; one second of silence before and after; two takes. 5 seconds is only the cheap test length, not a limit; real takes are 5 to 10 seconds, one per beat.

**How the first video is filmed (decided 2026-11-03):** the owner films the whole video in ONE continuous take, all three parts back to back (character lines, the real reveal, character lines), same camera spot, framing and lighting, glasses on, with a big visible finger snap and half a second of stillness at each switch. Claude cuts on the snaps. Only the two character parts go through Motion Control (and a voice change for his voice); the real part stays untouched. The character's part ends on his own snap (copied from the owner's hand), then cuts to the real owner. Character parts are performed bigger. If a part is longer than the tool allows, split it at a natural pause. The 5-second test take includes the snap: "Hey, I'm Dev, the face of LifeFlow." then a snap.

**First video: how the final script gets made (decided 2026-11-03).** The owner films a bunch of related clips in his own words and sends them. Claude transcribes them, picks the best lines, writes a tight script of about 20 to 25 seconds, shows it to the owner for an OK, and only then generates. Structure: (1) the character claims to be the developer (funny, confident); snap; (2) the real owner says who he is, what LifeFlow is, and why he made the character; snap; (3) the character greets everyone, tells the honest truth that he is Ali's AI character, says more videos are coming (or "for now, go download it"), with a personal touch from the owner if he wants one, then "link in the bio". After this video, the following videos are only the character. Only the character parts (about 12 to 14 seconds) cost generation credits.

**First video, updated to four scenes (2026-11-03):** (1) the character, standing in the office, claims to be the developer; snap; (2) the raw owner in pajamas in his bedroom, own voice, "Shut... wait, that's not what you're meant to see"; snap; (3) the owner in a smart outfit at a desk, "Hi, I'm Ali, I'm the actual developer"; snap; (4) the character again in a different set: "I was joking", the honest truth that he is Ali's AI character, more videos are coming or "for now go download it", a personal touch from the owner, link in the bio. Because outfit and place change between scenes, each scene is filmed separately (this replaces the one-continuous-take rule). Scene 3 must not pretend a real office exists: either film it for real somewhere tidy with a smart outfit and a color grade (cheapest, honest), or make it an AI-generated realistic version of the owner and let the character admit in scene 4 that the office is AI and Ali works from his bedroom. Always label the post as AI-altered.

**Audio pack (promise to the owner):** every video is delivered with an audio pack so he can fix the sound in ElevenLabs: a dialogue-only WAV of the character parts, per-line files, a silent version of the video, and a music-only track. He runs the dialogue through ElevenLabs (voice changer) and sends the result back; Claude re-syncs it to the video and re-mixes.

**What the character is (owner's answer, 2026-11-03):** the face of the developer. He is NOT the app's personal assistant and not a separate product character. Whatever the owner would say to users, the character says instead, in the first person (for example the origin story: it started as a personal finance tool for himself, then he connected more things, then he wanted to share it, then he built the AI assistant). Rules: (1) only true things, and only facts the owner told us, so scripts are built from the owner's own words and Claude never invents anecdotes (no made-up late nights, numbers or events); (2) the first video must state that he speaks on Ali's behalf, and every post carries the AI label and a caption line like "Ali's AI avatar"; (3) the in-app assistant is spoken about as "your personal assistant" and stays a separate thing.

**First video, final flow (owner confirmed 2026-11-03), name written as X until chosen:** 0) LifeFlow branding (glass logo, about 2 s, made in our render engine); 1) character X standing in the HQ, waist-up, welcomes everyone, "I'm the developer of LifeFlow, I'm so smart", awkward head scratch (Mark's voice); snap; 2) the owner raw in his room (own voice); snap; 3) the owner at a desk in a cleaner outfit, AI-altered into the HQ (own voice); snap; 4) character X on a sofa or chair in the HQ, a different angle and pose, leaning forward, relaxed: "I was joking", he is Ali's AI character, the office is AI, more videos coming or "for now go download it", link in the bio, and an engagement idea: "I don't have a name yet, comment one" (this also lets video 1 avoid saying any name). About 30 seconds. Filming rule: the owner films in the same pose the character will have (still sets place, pose and angle; the clip supplies movement and camera movement). Clip 1 standing waist-up with the head scratch; clip 3 seated at a desk; clip 4 seated on a chair, leaning forward. Steady phone, eye level. Estimated cost: three character stills at about 2.75 credits each plus Motion Control (price to be quoted before running); owner had 47 credits.

**Video 1 owner clips (uploaded 2026-11-03, Higgsfield media ids):**

| Clip | Media id | Length | What it is |
|---|---|---|---|
| c1 | `c50627eb-cb3c-47c8-a871-003fa7ca2c87` | 56 s | Reference for scene 1, standing in the bedroom, full body. Contains a usable performance at about 17 to 28.5 s ("Hey, what's up guys. This is Dev. I'm the developer behind LifeFlow. And yes, I built everything. It was all me. I'm a genius.") with the head scratch at about 27 s. Face is small in frame. |
| c2 | `26877b3f-e097-40b4-b520-e2309b352351` | 94 s | Reference for scenes 2 and 3 (direction plus the story: personal finance tool for himself, then Gmail, calendar, classes, work shifts, then sharing it). |
| c3 | `daec9a15-8556-46e5-a7d4-b81bea6bb717` | 14 s | **USE THIS for scene 2** (owner said so). Owner at his laptop in a cream hoodie in his bedroom, looks up: "You said you built what now?" Usable cut about 7.8 to 11.2 s; 0 to 6.7 s is direction. |
| c4 | `b4d74e37-e00b-4808-9c84-e7be70195224` | 178 s | Script context for scene 3 (facts below). Owner says scene 3 should use the AI voice (to confirm). |
| c5 | `af6575d1-ea8a-47bc-97a6-5a4556e2e420` | 78 s | Reference for scene 4, seated on a chair at an angle: "Yep, you caught me, I'm Ali's AI character... showcasing the app, new features, updates, the journey... you'll be seeing a lot more of me... for now sign up, connect everything in your life and flow", then LifeFlow branding and link. |

**Facts from the owner for scripts (c4):** full-time student with a part-time job; assignments, work, side projects, transfer applications and email made life complicated; personal finance has mattered to him since growing up; he first built a personal finance tool that connects to his banks to track what he spent and what came in; step by step he learned more and connected his calendar, Canvas, work schedule and more; it became LifeFlow, with an AI assistant connected to all of it that helps organize life, stay on top of tasks, budget and reach goals; he sees it as a long journey of learning and improving every day.

**Video 1 script v1 (about 35 to 40 s, waiting for owner approval):**
0. LifeFlow glass logo opens, calm music, its light becomes the dusk skyline of the HQ.
1. Dev, standing by the HQ logo wall (slow push-in): "Hey, what's up guys. This is Dev. I'm the developer behind LifeFlow. And yes, I built everything. It was all me. I'm a genius." Awkward head scratch. Snap.
2. Raw owner at his laptop (c3, music cuts to silence): "You said you built what now?" Snap.
3. Owner, polished, at the HQ desk, music back: "Much better. I'm Ali. Full-time student, part-time job. LifeFlow started as a money app I built for myself. Then I plugged in my calendar, my classes, my shifts, my email... and it turned into an assistant for my whole life." Snap.
4. Dev on the lounge sofa at an angle, relaxed: "Yep, you caught me. I'm Ali's AI character. That office? Also AI. Ali works from his bedroom." (half-second flash back to the bedroom) "I'll be the one showing you the app, the updates, and the whole journey. For now, sign up, connect your life, and flow."
5. End card: LifeFlow logo, lifeflowweb.com, Link in bio, "AI-animated character".

**Still needed for video 1:** a clean take of scene 3 (seated at a desk, final words), a clean take of scene 4 (seated at an angle, final words), optionally a closer retake of scene 1 (waist-up) for better lip-sync; the location images uploaded to Higgsfield Assets as images; decisions on the name (Dev or not) and on scene 3's voice.

**Video 1 production log (2026-11-03):**
- Stills (gpt_image_2_5, high, 2k, 9:16, 2.75 credits each): scene 1 Dev at the logo wall `d08541e0-0521-40b0-9fd2-d43397daf3b2`; scene 3 photoreal polished owner at the desk `8cebb6e1-b611-4b1b-9a23-b0ed13f95331`; scene 4 Dev in the green armchair `33cc9f60-1510-40f6-9dd1-fe844f8f733f`. Office reference uploaded as media `52bf6e63-2137-4902-9fcc-5a50e2c52e8d`.
- Source cuts uploaded (owner's own takes, restarts removed): scene 1 `2757ae70-6b55-4c50-9a6e-8ef7fcefe59a` (11.9 s, from c1 15.70 to 27.58), scene 3 `d9b508d8-8eeb-40cf-90b7-4760080067e0` (17.2 s, from c2), scene 4 `36344155-31ac-4ecb-af10-b36cbdcd82a1` (13.5 s, from c5). Scene 2 is c3 7.9 to 10.9 s, used as is.
- **Motion Control price (measured): 20 credits for 11.9 s at 720p** (about 1.7 credits per second). Scene 1 result: job `33528755-cc82-428f-b53c-ca7ceaeebde2` (720x1280, keeps the owner's original audio, so the voice still needs changing). The character copies the gestures and the head scratch well.
- Credits: 47.59 at the start, 19.34 after scene 1. Not enough for scenes 3 and 4 as planned (about 50 credits more); waiting for the owner's decision.

**Owner feedback on scene 1 (2026-11-03):** the movement and look are "amazing", but he does not want his own voice or his raw wording. Motion Control copies the take's words and audio, so the fix is: the owner re-films short takes saying the polished script exactly, then Motion Control plus Voice Change (Mark for Dev). Re-syncing lips to new audio was priced and rejected: Seedance 2.0 with references 54 credits for 12 s, Genjutsu motion control 84 credits, versus about 20 credits for 12 s with Motion Control.

**Video 1 script v2 (polished, the owner films these exact lines):**
1. Dev, standing (about 7 s): "Hey guys, I'm Dev. The developer behind LifeFlow. Built the whole thing myself. Honestly... I'm a genius." Head scratch on "genius", then snap.
2. Real owner (existing clip c3, his real voice): "You said you built what now?" Snap.
3. Polished owner at the HQ desk (about 12 s, AI voice, not Dev's voice): "Okay. Much better. I'm Ali. Full-time student, part-time job. I built LifeFlow to keep my money in check. Then I plugged in my classes, my shifts, my calendar and my email. Now it helps me run my whole life." Snap.
4. Dev in the armchair (about 12 s): "Yep. You caught me. I'm Ali's AI character. The office, the voice, all AI. Real Ali is still in his hoodie. Stick around, I'll show you everything LifeFlow can do. For now, sign up, connect your life, and flow."
5. End card: LifeFlow logo, Link in bio, AI-animated character.
Estimated cost from 19.34 credits: about 52 credits of Motion Control at 720p for scenes 1, 3 and 4 plus voice changes, so the owner is recharging.

**Video 1, version 1 delivered (2026-11-03): the "dubbing" method (no re-filming).** The owner refused to re-film and to spend about 160 credits on re-syncing lips. Method used instead:
- Keep the owner's existing takes as the movement source (Motion Control at 720p): scene 1 Dev `33528755-cc82-428f-b53c-ca7ceaeebde2`, scene 3 polished owner (first 3 s only) `43528733-c05c-44f7-a5ab-4c1a8a1fe294`, scene 4 Dev `7d0f012d-fd93-4b27-9fc4-56fad3009203`.
- New lines are generated (Dev: `elevenlabs_v4`, Mark preset, stability 0.35) and placed word by word with faster-whisper timings, so each new word lands where his mouth says the same or a similar word. Lines are written to follow the rhythm of what he said on camera.
- Where the mouth would not match, cut away: scene 3 after "Oh, much better. I'm Ali" goes to app screen recordings (tour, m_over, g_conn, chat) while the voice continues; scene 4's "The office, the voice... all AI" plays over a 2.6 s cutaway of the polished-owner still with an "AI" stamp.
- Editor: `compose.py` in the Higgsfield sandbox (`/home/user/v1/`), with a snap sound and white flash on each switch, music silent during the raw moment and ducked under speech, burned captions (Geist), loudness about -14 LUFS. Scene 3's voice is a stand-in (preset Leo) until the owner sends his ElevenLabs file (his cloned voice); `python3 compose.py his_file.mp3` swaps it after updating `s3_marks.json` with the new word timings.
- Higgsfield's own voice clone of the owner was created (`1c73c77c-23e2-4a2a-bf2e-29990d94da88`, from 23 s of his c4 audio) but every speech engine failed with it, so ElevenLabs is the route for his voice.
- Cost of the whole video: stills 8.25 credits, Motion Control about 20 (scene 1) + about 23 (scene 4) + about 5 (scene 3), voices under 2 credits.

**Video 1 rebuilt as a trailer (2026-11-03), the method to reuse for every character video.** Owner feedback on the dubbed version: flow too choppy, voice not matching the mouth, no polished-owner scene, no app phone previews. New rules from the owner: only Dev plus the one real clip of the owner; change location every shot; feel like an official trailer (without saying "official trailer"); interactive pop-ups and creative transitions.
- **Lip-sync method (works, cheap):** Kling 3.0 (`kling3_0`, std, `sound: on`, 9:16, 3 to 15 s) with the location still as `start_image` and the exact line in the prompt (`saying in English: "..."`; write the owner's name as "Ah-lee" for pronunciation). Kling makes Dev say the line with matching lips (8.75 credits per 5 s, 1.75 per second). Then `voice_change` to Mark (`27c04473-84a9-4b60-a41f-c8e8458bd4f1`, preset), 1 credit per clip, keeps the timing. Pass `declined_preset_id` if a preset recommendation appears. Lip re-sync tools were priced and rejected (Seedance 2.0 / Grok 22.5 credits per 5 s).
- **Location stills (9:16, 2.75 each):** logo wall standing `d08541e0-0521-40b0-9fd2-d43397daf3b2`, desk `9b5471b2-6991-4727-b482-79459897e317`, window `66f816a4-e0d3-4760-8eb1-18700278ef4b`, armchair `33cc9f60-1510-40f6-9dd1-fe844f8f733f`, sofa `b8f4eacf-c169-4f55-8534-f13d7a1cc046`, hallway `5265193b-4b3f-425d-82d4-4a6ab7fdd0b4`, close-up `8783e15d-efe2-4115-b981-9175f0759c90`.
- **Trailer script (as generated):** s1 logo wall "Hey, I'm Dev, the developer behind LifeFlow." / s2 desk "I built the whole thing. Every feature. Every line." / s3 window "Honestly? I'm kind of a genius." (head scratch, snap) / REAL owner clip c3 "You said you built what now?" / s5 armchair "Okay, okay. You caught me. I'm Ali's AI character." / s6 sofa "Ali is a full-time student with a part-time job. Classes. Shifts. Deadlines. Bills. His life was chaos." / s7 hallway "So he built LifeFlow. It started as a money app, just for him. Then he plugged in everything else." / s8 close-up "Now his whole life is in one place. And he's not big on cameras... so that's my job." / s9 logo wall "Stick around. This is just the start." / end card LINK IN BIO.
- **Editor:** `/home/user/tr/tr_compose.py` in the Higgsfield sandbox: zoom-punch plus directional-blur cuts with whooshes between Dev shots; freeze, record scratch, snap and white flash into the real clip; RGB glitch on the snap back; word-synced pop-ups (DEV name tag that later becomes "~~Developer~~ AI character", ALI tag on the real clip, GENIUS? sticker, chaos chips for Classes/Shifts/Deadlines/Bills, "Started as: a money app", real connector logos snapping into a row, tagline pill, "AI spokesperson" sticker); music silent during the real clip; captions with key words in green; about -14 LUFS.
- **Cost of the trailer:** about 84 credits (7 Kling shots totalling 36 s, 8 voice changes, 5 stills).
- **Music level (owner: "music too high"):** music sits at 0.075 under speech and 0.24 in the gaps (was 0.2 / 0.5), about 10 dB under the voice. Use these levels by default. A sound-only re-mix runs with `AUDIO_ONLY=1 python3 tr_compose.py shots.json` (keeps the picture, no credits). Final v2: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/2d8dcb2a-58f5-4afe-9272-dbfc7f811120.mp4

**Video 2: the podcast ad (planned 2026-11-04; timings approved by the owner, he is rewriting the lines himself).** Dev is a guest on a podcast and talks about Ali in the third person. About 37 seconds.
- **No real people.** The owner first asked for Joe Rogan as the host. Not allowed: using a real person's face or voice to sell something needs their permission (right of publicity), an "AI-generated" note doesn't fix it, ad platforms remove fake-celebrity ads and can ban the account, and it would be a fake endorsement. The host is an original character in the same 3D animated style as Dev, and must not look like any real host. The studio must not copy a real show's set.
- **Long takes (owner's new standard, 2026-11-04).** The trailer's many short clips each had a different delivery, so Dev's sentences didn't flow. From now on, each of Dev's answers is **one continuous Kling clip** (up to 15 s), so his voice, energy and pace stay the same through the whole thought. Keep each line under about 2.5 words per second (36 words for 15 s, 25 for 10 s) so he doesn't rush. Variety comes from inside the take, not from new clips: a slow camera push-in in the prompt, punch-in crops on key words in the edit (feels like a second camera, the voice never cuts), and word-synced pop-ups. All shots start from stills made from one studio image so lights and colors match. Light room tone under both voices so they sound like the same room; music at the trailer v2 levels.
- **Timings (approved, never shorter):** open card 2 s / host 5 s / Dev 15 s / host 5 s / Dev 10 s.
- **First script draft (rejected by the owner, kept for reference only):** opening card over the wide studio still "Everything in this video is AI-generated. The app is real." (2 s, free) / clip 1, host close-up, 5 s: "So. You're the guy who built LifeFlow?" / clip 2, Dev, one take, 15 s: "Nah, Ali built it. I'm just his AI. He's in class. But here's why he made it. Your exam lands on a work shift. A free trial you forgot becomes a charge. LifeFlow catches both early." (pop-ups: the exam and shift clash, the free trial ending) / clip 3, host reaction, 5 s: "Hold on. It catches that for you?" / clip 4, Dev, one take, 10 s: "Yep. Classes, shifts and money in one app, with a personal assistant that actually knows your week. Link's in bio. Tell Ali I said hi." / end card LINK IN BIO, AI-animated label. Both features shown are real (schedule clash and free trial ending notifications, section 2).
- **Cost estimate:** 3 stills (wide studio, Dev's seat, host's seat) 8.25 credits; 35 s of Kling 61.25; 4 voice changes (Dev to Mark, host to a second preset) 4. About 74 credits. Balance 92.47 on 2026-11-04, which leaves room for one 10-second retake only (a 15-second retake is about 26 credits).
- **Order:** owner approves the script, then the three stills (show them before any video), then the clips.
- **Owner's quality bar (2026-11-04):** "It has to look like the Higgsfield team made it", like Higgsfield's own Instagram posts. He will add credits for it. Upgrades agreed in the plan: Kling 3.0 **Pro** (1080p, 2 credits per second, 30 for 15 s) instead of std; stills at `gpt_image_2_5` **xhigh 2k** (4.5 credits; max 2k is 9); a cinematic camera fly-in through the studio for the opening instead of a still; slow dolly push-ins and orbits inside the long takes; colour grade, light film grain, sound design. Priced and rejected: Higgsfield Intone (two-person talking model) 240 credits for 15 s at 1080p (105 at 720p); Seedance 2.5 1080p 240 for 15 s; FLUX 3 Video 1080p 120 for 15 s; Kling 3.0 4K mode 90 for 15 s.
- **Look-test frame (approved style pending):** `10e8b17f-e82a-4167-8b0b-e3d62bab1518` (Dev in a green zip, original host in a rust overshirt, dark studio with amber lamps and an emerald accent light). References used for Dev: `8783e15d-efe2-4115-b981-9175f0759c90`, `33cc9f60-1510-40f6-9dd1-fe844f8f733f`.
- **Second script draft (friend-style, sent 2026-11-04, waiting for the owner):** host "Okay, so what actually is LifeFlow? Break it down for me." / Dev 15 s "So basically, Ali's a full-time student with a job. Classes, shifts, bills, all over the place. So he built one app that puts it all together, with a personal assistant that plans your week with you." / host "Bro, that's actually genius. Okay, and the money side?" / Dev 10 s "It shows the money you really have, tells you how much to save on payday, and catches subscriptions you forgot. Link's in bio."

**Video 2 creative treatment v1 (proposed 2026-11-04, waiting for the owner's picks):**
- **Make it LifeFlow's own show** ("The Flow Room", Ep. 01), not a fake independent podcast, so the host liking the app is never a fake third-party endorsement. The show can carry the Dev series.
- **Hook text on the first frame:** "I sent my AI on a podcast to explain my app." (first person if posted from the owner's account; "Ali sent his AI..." from the brand account). Small line: "Everything here is AI-generated. The app is real."
- **Shot list:** 0:00 fly-in (Kling Pro with a hallway still as start frame and the wide studio still as end frame, so it lands exactly on our set; red ON AIR sign flicks on; whoosh and sub hit) / 0:02 host, over Dev's shoulder, slow push-in: "So Ali built the app... and sent his AI to explain it?" / 0:07 Dev, one 15 s take over the host's shoulder so the host nods and reacts live in the foreground (host mouth closed in the prompt), slow dolly in: "Yeah, Ali's busy. He's a full-time student with a job. Classes, shifts, bills, all over the place. So he built one app that puts it all together, with a personal assistant that plans your week with you." / 0:22 host leans back laughing, taps the table: "Bro, that's actually genius. Okay, and the money side?" ("GENIUS." sticker, a callback to the trailer's "GENIUS?") / 0:27 Dev, one 10 s take, slow orbit, turns to the lens on the last line: "It shows the money you really have, tells you what to save on payday, and catches subscriptions you forgot. Link's in bio." / 0:37 end: ON AIR light switches off, logo, Link in bio and Comment FLOW, cut so it loops into the opening. Optional stinger: host "So when's Ali coming on the show?" Dev "When he finishes his homework."
- **Graphics:** show bug (The Flow Room, EP 01, red REC dot); name lower thirds the first time each speaks; glass cards in LifeFlow green: Classes / Shifts / Bills fly in shaking at "all over the place" and snap into one LifeFlow card at "together" with a click; "Your personal assistant" pill; "Available now", "Save on payday", "Subscription caught" in clip 4; word-by-word podcast captions, a different colour per speaker, kept out of Instagram's bottom and right button zones. Optional: glass cards showing real LifeFlow screens (from our real recordings, never mock-ups).
- **Sound:** broadcast-mic voice treatment (EQ, compression, shared room tone), lo-fi beat low with a beat switch on "genius", host laugh, soft tick on each card, light switch on the ON AIR sign.
- **Quality control:** all stills cut from one look (same lights, Dev in the same green zip every shot); audition 2 or 3 preset voices for the host on his line first (under 1 credit); check every take frame by frame (mouth drift, hands, mics melting) before the voice change; one signature move per clip, nothing more.
- **Cost of one pass:** 4 stills 18 + Kling Pro 38 s 76 + voice changes about 5 = about 99 credits; stinger about 12 more; keep about 60 for retakes.

**Video 2 character sheets (2026-11-04, xhigh 2k 16:9, 4.5 credits each).** Every still and clip for this video must use these as references so nobody drifts.
- **Host** (original character, never a real person): `3024649f-bac9-4d87-a44e-5e1f56357277`. Late 30s, light olive skin, dark brown tight curls, short trimmed full beard, warm brown eyes; rust-orange overshirt open over a cream tee, charcoal chinos, brown chelsea boots, brown strap watch, black over-ear headphones around his neck.
- **Dev, new outfit for this video** (owner: change the clothes every video, same idea): `9e320402-4baa-4ce1-9ae0-e1cd75cf1c57`. Same face, curly light-brown hair, blue-grey eyes and browline glasses; sand-beige suede-look trucker jacket open over a black tee, dark indigo jeans, white sneakers, black watch. Video 1 was the green zip; don't repeat outfits.
- Credits after the sheets: 78.97.

**Video 2 owner decisions (2026-11-04), these replace the treatment v1 where they differ:**
- Keep: The Flow Room as LifeFlow's own show; the hook text; the host reacting live in Dev's takes; Dev looking into the lens on "Link's in bio"; the loop ending.
- **No word "genius".** The trailer callback is now a line, not a sticker: host "So, uh... you're the guy who built LifeFlow?" / Dev "Heh. Yeah, I tried saying that once. Didn't go great." (Dev claimed to build it in Video 1 and got caught.)
- **No flying cards, no pop-ups, no real-app-screen cards, no stickers, no text that describes what is happening** (the owner disliked Video 1's struck-through and "X" text). It must look like a real podcast set. Graphics allowed: small "THE FLOW ROOM" + red dot "EP 01" top left, a small mint "AI VIDEO" pill top right (Higgsfield-style label, also our AI disclosure), the hook text during the fly-in only, clean captions that match the spoken words exactly. Mock-up: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/e686cd10-56f8-42c7-883d-ce5ddf41091e.jpg
- **No bonus ending.**
- **Posted on the LifeFlow account**, reposted to the owner's personal story. Hook text in third person: "Ali built an app. Then sent his AI to explain it."
- **Voices:** Dev stays Mark (`27c04473-84a9-4b60-a41f-c8e8458bd4f1`), the same voice as Video 1. The host needs a reliable preset distinct from Mark (Mark's median pitch measures about 115 Hz). Auditions sent (ElevenLabs engine, `text2speech_v2` with `variant: elevenlabs`): Brooks `c2acff45-84b2-4974-892d-89fa2d4e5598` (about 98 Hz, warm), Barrett `d603a8cd-3fe1-55e0-9245-617a2589131e` (about 107 Hz), Landon `dc1c0a41-53cd-53af-aec5-ab637840505f` (about 85 Hz, deepest). Both must sound human: write the "uh", "um", small laughs and trailing-off pauses into the lines so Kling animates them too, and keep the emotion low-key and natural, not hype.
- **Script v3 (natural podcast talk):** host 5 s "So, uh... you're the guy who built LifeFlow?" / Dev 15 s "Heh. Yeah, I tried saying that once. Didn't go great. No, Ali built it, I'm just his AI. He's a full-time student with a job, so his classes, shifts, bills... all over the place." / host 5 s "Oh man, I know that feeling. So what does the app actually do?" / Dev 10 s "Um, it puts it all in one place. Your real money, your week, and a personal assistant that, uh, plans it with you. Link's in bio." Dev's two lines measured 21.5 s spoken by Mark, so they fit 15 + 10 s with natural pauses.

**Video 2 screen and framing changes (2026-11-04):** no "AI VIDEO" label (the opening line already says it is AI); smaller captions (Montserrat ExtraBold about 40 px on 1080x1920, sitting low around y 1400, out of Instagram's bottom buttons) and a smaller hook (about 50 px); **wider camera angles**. Wide master shot with both characters in their final outfits: `f29c6560-7d33-4c93-9ece-d6405bbdf6b7` (host left, Dev right, full table, shelves, lamps and the green accent wall). Use it as the base and end frame for the fly-in and as the look for every other shot. Mock-up v2: https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/2aaa05df-36ea-4ec3-bf51-2e4d082c2e43.jpg . Staying on Higgsfield (owner asked about NVIDIA: its video models are world/robotics models and its LipSync only re-syncs lips on an existing video, so it can't make these scenes).

**Video 2 script v4 (2026-11-04, owner: don't introduce Ali again, go straight to the app; the reason Dev is there is that Ali noticed people miss the app's main idea):** host 5 s "So, uh... you're the guy who built LifeFlow?" / Dev 15 s "Heh. I tried saying that once. Didn't go great. Ali sent me 'cause people keep missing the main idea. It's your classes, your shifts, your money... in one place, all talking to each other." / host 5 s "Wait... talking to each other how?" / Dev 10 s "Like, um, your exam's right after a double shift? It catches that. Rent's due and you're low? It warns you early. Link's in bio." Both examples are real notifications (schedule clash; bill due and low balance). Wide framing applies to the shots inside the vertical video.

**Video 2 script v5, FINAL lines (2026-11-04). The owner's name is never said or shown in this video: only Dev and the host.** Hook text (LifeFlow account, "we"): "We sent our AI on a podcast to explain our app." / host 5 s "So, uh... you're the guy who built LifeFlow?" / Dev 15 s "Heh. I tried saying that once. Didn't go great. I'm the AI. I'm here 'cause people keep missing the main idea. It's your classes, your shifts, your money... in one place, all talking to each other." / host 5 s "Wait... talking to each other how?" / Dev 10 s "Like, um, your exam's right after a double shift? It catches that. Rent's due and you're low? It warns you early. Link's in bio." Timing check with Mark (ElevenLabs): first part ends at 11.9 s, second part takes 7.9 s, so both fit with natural pauses.
- Host auditions on these lines (ElevenLabs engine): Brooks `3e45a92c-1b4b-499a-b576-99d5e9a30d49`, Barrett `704de8e1-2ff5-45d4-a6e1-ef83b8068155`, Landon `609ef874-4c65-4db8-b8e2-9c3efb580d99`, Harrison (`573e5163-59b3-4926-aab1-951ef2985f81`) `902772d2-e366-43bd-833a-bf3382b3119c`. Dev timing take `d38de2b7-1964-4ae0-9f7d-23012ab9e451`.
- The owner may post this on his personal account too if it's good enough, so it must be portfolio quality.

**Video 2 production log (2026-11-04).** Owner added credits (269.82 before shooting).
- Stills (gpt_image_2_5 xhigh 2k 9:16): hallway with ON AIR sign `8ff432f5-320c-48dd-a556-889ad76db5e5`, Dev's angle over the host's shoulder `08f81181-373b-4edc-a1a2-08a33635ab58`, host's angle over Dev's shoulder `6f080cbd-657f-461f-9a31-b356c663dcbc`, wide master `f29c6560-7d33-4c93-9ece-d6405bbdf6b7`. Ask for the mic to sit to the side of the face, below the chin, so lips stay visible.
- Kling 3.0 Pro clips (1080x1912, 24 fps): fly-in 3 s, sound off, start = hallway, end = wide master `6f451437-4f96-4d71-ac68-1c42ca3cfb20`; host 1 `448ee25a-54f1-424c-930f-41c9577c194c`; Dev 15 s `a4613756-2cb0-4898-9082-de41d65e7ee5`; host 2 `c7b7e918-8bea-48d2-beed-60f45d1ceada` (Kling added "That's right." at 0 to 0.6 s, trimmed from 0.8 s); Dev 10 s `381d9d2e-cb75-49e6-9403-4e5561608223` (looks into the lens on "Link's in bio"). All words came out right first time with the lines written into the prompt.
- Voice changes (1 credit each): Dev takes to Mark `b9a75573-2960-4db6-8937-689fa9e19e80`, `6214d02b-0570-4512-9d6a-7a3a35bedc8a`. Host 1 in four voices for the owner to pick: Brooks `4893a30b-de0e-465c-965b-de78be130acc`, Barrett `054f6b32-2c70-4cf0-90f3-5af7d80cada4`, Landon `ae4fbbe6-e6c3-4d67-b065-99c08dbbd429`, Harrison `7032356f-b874-47c1-a800-8f7826119d12`. Host 2 in Brooks `b644ee77-39bd-4e4f-9e57-1551bded16ed` (first cut uses Brooks until the owner picks).
- Editor: `/home/user/pod/pod_compose.py` + `shots.json` in the Higgsfield sandbox. Hard cuts, slow push, one punch-in per Dev take (second-camera feel), warm grade, light grain (`noise=alls=4`, heavier grain smears on Instagram), show bug, hook on the fly-in, small Montserrat ExtraBold captions without fillers ("uh", "um", "heh" are left out of captions so they never show a word that wasn't clearly said), broadcast voice EQ and compression, room tone, felt-piano bed at 0.06 under speech and 0.2 in gaps, ON AIR click on and off, landing boom, -14 LUFS, 16 Mbps delivery encode. End card: hallway with the sign lit plus logo and "Link in bio", then the sign switches off on the last 0.7 s, so the loop restarts as it switches on. `REUSE_SEGS=1` re-runs overlays and sound without re-rendering shots. Total 38.8 s.
- Cost of video 2 so far: stills 13.5 + look tests 18 + Kling Pro 76 + voice changes 7 + voice auditions about 5.

**Video 2 first cut delivered (2026-11-04):** "The Flow Room, Ep 01", 38.8 s, 1080x1920, 16 Mbps, -14 LUFS, host voice Brooks (swap pending the owner's pick). https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/054260b7-70e1-420a-9269-ae7ac546ee91.mp4 . Spent 97 credits from 269.82 (172.82 left), retakes not needed. To swap the host voice: voice_change both host clips (`448ee25a...`, `c7b7e918...`) to the chosen preset, point `host1`/`host2` in `shots.json` at the new files, then `REUSE_SEGS=1 python3 pod_compose.py /home/user/pod/shots.json` (about 4 minutes, no new video credits).

**Video 2 v2 (2026-11-04), fixed in the edit with no new credits.** Owner: "audio is low and kind of slow sometimes... speed some parts but make it perfect so it's not noticeable", and he couldn't download the mp4 link on his phone (send zips).
- `tighten.py` (Higgsfield sandbox `/home/user/pod/`): finds pauses in a talking clip from the audio level, shrinks pauses longer than about 0.6 to 0.7 s down to about 0.32 to 0.4 s, never leaves a shot shorter than 1.2 s, and plays the clip 5 to 6% faster with pitch kept (`atempo`). Every cut sits inside a silence and alternates the framing (wide / 1.08 to 1.12 punch-in), so it reads as a two-camera podcast edit, not a jump cut. Lips stay in sync because picture and sound are cut and sped together.
- Master raised from -14 to **-10.5 LUFS** (true peak -1 dB) with firmer voice compression; music under speech 0.055. Use -10.5 for reels from now on.
- Result: 32.8 s (was 38.8). Download (zip): https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/b1509eda-5144-4d1d-8b0f-d66eb0c2a6fc.zip
- Script upgrade proposed for a reshoot (about 73 credits, only Dev's two takes and host 2): host 2 becomes a skeptic ("Okay, but... a calendar can do that. What makes it different?") and Dev answers with the difference ("Your calendar doesn't know rent's due Friday and you're low. This does.").

**The Flow Room host is now a real person: Tyler Cardi (2026-11-04).** The owner's friend, joining LifeFlow development, agreed to be in the ads as the interviewer face of the LifeFlow podcast (the owner confirmed his consent). He replaces the original made-up host from Ep 01. Dev stays the AI character. Tyler's real voice will be used (he records a clean 1 to 2 minute sample; test it with `voice_change` using his voice as an element; backup: his ElevenLabs clone through ElevenLabs' voice changer on the host audio). Tyler may be named on screen ("TYLER CARDI · Host"). His photos are personal and are not committed to the repo.
- First character sheets, made from a written description of his photos because the photos had not reached Higgsfield yet (redo with his photos as references once uploaded): `d0f35ac3-f4df-4f64-b03e-2e86fbfbbb92`, `d8137d28-600b-47a8-9779-b26079c1f378`. Look: golden honey-blond tight curls with a skin fade and a curly mullet, blue-grey eyes, light stubble, small mole on the left cheek, diamond stud earrings, no glasses; navy double-breasted peak-lapel suit, white shirt, slim black tie, black horsebit loafers. Clearly different from Dev (glasses, light-brown curls, casual jacket).

**Series plan.** Video 1 (introduces the character): beat 1 character says he built LifeFlow and is the developer (about 6 s); snap; beat 2 the real owner says "No, I'm Ali, I built it, this is the character I made to speak for me, not pretend to be me" (about 10 s); snap; beat 3 the character continues and says he will explain the app in the next videos (about 10 s). The correction must land within about 6 seconds of the false claim, and the AI-animated label stays on the post. Videos 2 to 4: how and why it was built, a tour of the app one feature at a time, behind the scenes and what is coming.

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
| 2 | The Flow Room, Ep 01 (podcast: Dev and an original host) | First cut delivered 2026-11-04 | 38.8 s, Kling 3.0 Pro long takes, owner's name never mentioned. https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/054260b7-70e1-420a-9269-ae7ac546ee91.mp4 |
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
- 2026-11-04: no real celebrities or lookalikes in any ad (see Video 2). Every character video uses long, continuous takes for each spoken thought instead of many short clips, at the trailer's finish or better.
- 2026-11-03: branch `claude/lifeflow-ad-reel-higgsfield-s3r3v1` is well behind `main` (about 330 files differ). This file was copied from `main` onto that branch so it can be kept updated there; merge or cherry-pick it back to `main`.
