# "Five of you?" (the skylings skit, 2026-11-16)

Ali's ask: an ad like the "why are there so many versions of you?" AI-mascot reels (a person asks, each character introduces
itself), made from the campfire footage. The campfire footage now makes two videos: this skit and the Q&A (v7, which gave
up the character question and the skylings answer).

## The skit (about 36 s)
1. Tyler, real: "And what exactly is the little, like, character kind of thing on top?" The five sit on the fire-pit rim, so
   it reads literally.
2. Ali, real: "Oh, the skylings." Dawn hops up and takes over.
3. Each one up close on the rim (a macro look: the rim sharp, the people and fire soft behind), in its own voice:
   - Dawn: "Mmm. Hi... I'm Dawn. I wake you up with today already planned."
   - Ray: "Ray! Classes, shifts, the quiz you forgot. I've got the daytime."
   - (Tyler listening)
   - Goldie: "Goldie. Before you go out, I check what you've actually got."
   - Twinkle: "Twinkle. I'm the one who asks if you studied."
   - Dreamy: "Dreamy. Go to sleep. Tomorrow's handled."
4. Ali, real, deadpan: "Those are just five different characters that represent each different time of day."
5. All five on the rim: Ray "Pick one." Dreamy "Or let the sky pick."
6. They rise into the sky over the fire; the sky runs from dawn to night in the app's colours and each one lights up in its
   own hour (what "Changes with the sky" does). The logo: "Changes with the sky." and lifeflowweb.com.

Every line is something the app does (the morning plan, classes and shifts, the affordability check, the promise check-in at
night, picking a skyling or "Changes with the sky"). The skylings are the app's own pixel art (kit frames); no AI-made
characters or sets.

## How it's made
- `skit_plates.py` (stage 1): each shot from the 4K campfire clips with the Q&A's decode, grade and matte, framed; the rim
  close-ups get the macro look. Plates are kept so stage 2 can change without decoding 4K again.
- `make_voices.py`: the skylings' voices, free, with Kokoro (open model, Apache-2.0, `kokoro-onnx`; model files from its
  GitHub release). Cast: Dawn af_sky, Ray af_heart, Goldie af_bella, Twinkle bf_emma, Dreamy am_michael; each lifted a few
  semitones so they sound small, then checked by transcribing them back (faster-whisper small.en). Higgsfield couldn't
  be topped up (the account offers only the $50 annual plan); one paid test line (Dawn, Luna, 0.3 credits) wasn't used.
- `skit_compose.py` (stage 2): the five on the rim (talking = a squash and bob from each voice's loudness, firelit, a shadow),
  the launch captions for every line, the sky wash for the ending, the logo; the sound is Tyler and Ali's real lines, the
  skylings' voices with a little of the fire's air, a fire bed, the launch score under it ending on the logo, the app's
  sounds. Final: `LifeFlow_Skylings_Skit.mp4`.

## v2 (Ali: Dawn's first words weren't understandable; "Ray says his name way too fast and it isn't obvious he's introduced himself")
- Every skyling now says its name on its own, a little slower, then a beat, then the rest, and its name pops up over its head in
  the launch letters (gold, navy rim) as it says it:
  - Dawn: "Good morning! I'm Dawn. Your whole day's planned before you even wake up." (voice af_nova; she waves, and a soft
    sunrise glow comes up behind her)
  - Ray: "Hi, I'm Ray! Classes, shifts, that quiz you forgot... I've got your daytime."
  - Goldie: "I'm Goldie. Before you go out, I check what you've actually got."
  - Twinkle: "I'm Twinkle! I'm the one who asks if you studied."
  - Dreamy: "Hello. I'm Dreamy. Go to sleep. Tomorrow's handled."
- Each introduction was chosen by transcribing the candidates back (faster-whisper, with the names as a hint) and keeping the
  clearest; in the final mix every line reads back exactly as written. 40.8 s.

## v3, a new cut (Ali: "same footage, same idea, your touch"; then "those voices aren't good", "find the best free resource")
Files in `v3/`. 44.6 s. Final: `LifeFlow_Skylings_Skit_v3.mp4`.

### What changed in the film
- **Cold open on the rim:** the five warm themselves at the fire while Tyler starts his question; one by one they notice they
  are being talked about and look over.
- **They belong in the shot:** each close-up is lit by the real fire (a warm rim light on the pixels that flickers with the
  plate, a contact shadow and a cast shadow, light wrap), with a deeper macro focus and a soft haze of that skyling's own hour
  behind it (the app's sky colours).
- **They talk:** mouths open and close on their own voices (the app's open-mouth pixels from the celebrate frame on the idle
  frame), and the skeptical face (the app's "think" frame) lands the jokes.
- **A new beat on Ali's real line:** "Those are JUST five different characters..." All five turn. Ray: "Just?" The music
  stops for it. Ali's real silent smile answers.
- **Name tags:** the name in the launch pixel letters with its hour under it (FIRST LIGHT, THE DAY, GOLDEN HOUR, EVENING,
  NIGHT), appearing on the word it says its name.
- **Captions:** the launch style, timed word by word from the audio, broken into balanced lines.
- **Ending:** Dawn "Pick one of us." Dreamy "Or let the sky pick." The sky runs through the day, then the logo with
  "Which one's yours?" and "Get on the waitlist · lifeflowweb.com".

### The lines
- Dawn: "Good morning! I'm Dawn. I planned your whole day before you woke up. Somebody had to."
- Ray: "I'm Ray. Your classes, your shifts, and that quiz you forgot about. Yeah. That one."
- Goldie: "I'm Goldie. Before you go out tonight, I check if you can actually afford it."
- Twinkle: "I'm Twinkle. You said you'd study tonight. Did you?"
- Dreamy: "I'm Dreamy. Go to bed. Tomorrow's handled."

### The voices (free, and why these)
Ali rejected the Kokoro voices, then a first casting made by pitch-shifting them. What worked:
- **Engine:** Chatterbox (Resemble AI, MIT), run from its ONNX export (`onnx-community/chatterbox-ONNX`) with onnxruntime
  on CPU (`cb.py`). It speaks a line in the voice of a short reference clip.
- **Reference voices:** real people who gave their voices away, from `kyutai/tts-voices` on Hugging Face. No pitch shifting.
- **The cast (Ali chose by ear from an A/B casting tape, `cast2.py`):**
  | Skyling | Reference | Licence |
  |---|---|---|
  | Dawn | the Kokoro af_heart sample, through Chatterbox, 1.5 semitones up (the one voice he kept from the first tape) | Apache-2.0 model output |
  | Ray | voice-donations/ClassicWizard | CC0 |
  | Goldie | voice-donations/3973 | CC0 |
  | Twinkle | voice-donations/Hannah | CC0 |
  | Dreamy | voice-zero/peter_yearsley (LibriVox) | CC0 |
  No credit line is needed for any of them. (The Alba MacKenna voices in the same set are CC BY 4.0 and would need one.)
- **Clarity rules that came out of his notes:** 2.5 to 3.2 words a second; the name is its own sentence; a line is made in
  segments joined with our own pauses; every take is transcribed back (faster-whisper small.en) and the clearest kept;
  the finished mix is transcribed again and must read back exactly as written (it does).
- One-word lines are the engine's weak spot: of 14 takes of "Just?", 9 had the word and 1 sounded like a question (`just_takes.py`).
- Not used: OpenAI's voices (reachable from here but paid, and the owner's rule is no OpenAI calls), Higgsfield (0.10 credits).

### How to rebuild
1. `python3 plates3.py` (the four new plates; the others are v1's).
2. `python3 voices3.py <chatterbox_dir>` (reads `picks.json`; writes `vo/<key>.wav` and word timings).
3. `python3 skit3_compose.py` (`--preview 3.0,9.5` for stills; `python3 sheet.py 1,2,3 out.jpg` for a contact sheet).
The footage, the reference clips and the model files are not in the repo.
