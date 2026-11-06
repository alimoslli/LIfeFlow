# Voiceovers on finished videos

`mix_vo.py` puts a one-take voiceover on a finished video, line by line on its beats, and mixes it over the video's own music.
- Generate the whole script as ONE take (consistent energy), Mark's voice (Higgsfield preset `27c04473-84a9-4b60-a41f-c8e8458bd4f1`,
  `text2speech_v2`, `variant: elevenlabs`; 1.5 credits for about 60 words). Lines on their own paragraphs, "..." for pauses.
- The take is split only inside real silences (energy at least 32 dB under speech for 0.18 s), never on Whisper word times:
  those were up to 0.4 s off and would have clipped words. Pauses inside a line are capped at 0.30 s. A light 1.07x speed-up
  (pitch kept, `atempo`) fits the lines to their beats.
- The music dips to 0.30 under the voice and 0.62 between lines (0.15 s attack, 0.35 s release, ducks 0.12 s early);
  voice about 11 dB over the music; master -10.5 LUFS, true peak -1 dB.
- Check: transcribe the finished voice-only track and compare with the script before delivering.

Usage: `ffmpeg -i take.mp3 -af atempo=1.07 -ar 48000 -ac 1 vo.wav`, `ffmpeg -i video.mp4 -vn -ar 48000 -ac 2 music.wav`,
edit the `LINES` table (phrase indexes and start times), `python3 mix_vo.py vo.wav music.wav mix.wav`, then loudnorm and mux.
