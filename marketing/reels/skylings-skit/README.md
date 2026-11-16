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
