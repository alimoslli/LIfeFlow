"""The skylings' voices, made free with Kokoro (open model, Apache-2.0, kokoro-onnx). Each line is generated in its voice, then
lifted a few semitones (formants too) so the skylings sound small, and trimmed of silence."""
import sys, subprocess, os, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
D = sys.argv[1]; OUT = sys.argv[2]
k = Kokoro(f"{D}/kokoro-v1.0.onnx", f"{D}/voices-v1.0.bin")
LINES = [  # name, voice, speed, semitones up, text
    ("dawn", "af_sky", 0.95, 2.0, "Mmm. Hi... I'm Dawn. I wake you up with today already planned."),
    ("ray", "af_heart", 1.12, 3.0, "Ray! Classes, shifts, the quiz you forgot. I've got the daytime."),
    ("goldie", "af_bella", 1.05, 2.0, "Goldie. Before you go out, I check what you've actually got."),
    ("twinkle", "bf_emma", 1.08, 3.0, "Twinkle. I'm the one who asks if you studied."),
    ("dreamy", "am_michael", 0.9, 0.5, "Dreamy. Go to sleep. Tomorrow's handled."),
    ("ray_pick", "af_heart", 1.1, 3.0, "Pick one."),
    ("dreamy_sky", "am_michael", 0.9, 0.5, "Or let the sky pick."),
]
for name, voice, speed, st, text in LINES:
    samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us" if not voice.startswith("b") else "en-gb")
    raw = f"{OUT}/{name}_raw.wav"; sf.write(raw, samples, sr)
    r = 2 ** (st / 12)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", f"asetrate={int(sr * r)},aresample=48000,atempo={1 / r:.5f},silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-2",
                    "-ar", "48000", f"{OUT}/{name}.wav"], check=True)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{OUT}/{name}.wav"], capture_output=True, text=True).stdout)
    print(f"{name:11s} {voice:11s} {d:4.2f} s  {text}")
