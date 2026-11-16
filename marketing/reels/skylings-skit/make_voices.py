"""The skylings' voices, made free with Kokoro (open model, Apache-2.0, kokoro-onnx). v3 (Ali: the names came too fast, "it isn't
obvious he's introduced himself"): every skyling says "I'm <name>" on its own, a little slower, then a beat, then the rest.
Each part is lifted a few semitones (formants too) so they sound small; <name>.json says where the introduction ends."""
import sys, subprocess, json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
D = sys.argv[1]; OUT = sys.argv[2]; SR = 48000
k = Kokoro(f"{D}/kokoro-v1.0.onnx", f"{D}/voices-v1.0.bin")
LINES = [  # name, voice, semitones up, (intro, speed), (rest, speed)
    ("dawn", "af_nova", 2.0, ("Good morning! I'm Dawn.", 0.92), ("Your whole day's planned before you even wake up.", 1.0)),
    ("ray", "af_heart", 3.0, ("Hi, I'm Ray!", 0.85), ("Classes, shifts, that quiz you forgot... I've got your daytime.", 1.08)),
    ("goldie", "af_bella", 2.0, ("I'm Goldie.", 0.88), ("Before you go out, I check what you've actually got.", 1.03)),
    ("twinkle", "bf_emma", 3.0, ("I'm Twinkle!", 0.88), ("I'm the one who asks if you studied.", 1.05)),
    ("dreamy", "am_michael", 0.5, ("Hello. I'm Dreamy.", 0.8), ("Go to sleep. Tomorrow's handled.", 0.9)),
    ("ray_pick", "af_heart", 3.0, None, ("Pick one.", 1.0)),
    ("dreamy_sky", "am_michael", 0.5, None, ("Or let the sky pick.", 0.9)),
]
def part(text, voice, speed, st, path):
    s, sr = k.create(text, voice=voice, speed=speed, lang="en-gb" if voice.startswith("b") else "en-us"); sf.write(path + "_raw.wav", s, sr); r = 2 ** (st / 12)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path + "_raw.wav", "-af", f"asetrate={int(sr * r)},aresample={SR},atempo={1 / r:.5f},silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                    "-ac", "1", "-ar", str(SR), "-f", "f32le", path + ".f32"], check=True)
    return np.fromfile(path + ".f32", np.float32)
for name, voice, st, intro, rest in LINES:
    a = part(rest[0], voice, rest[1], st, f"{OUT}/{name}_b"); intro_end = 0.0
    if intro:
        i = part(intro[0], voice, intro[1], st, f"{OUT}/{name}_a"); intro_end = len(i) / SR
        a = np.concatenate([i, np.zeros(int(0.26 * SR), np.float32), a])
    sf.write(f"{OUT}/{name}_cat.wav", a, SR)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{OUT}/{name}_cat.wav", "-af", "loudnorm=I=-16:TP=-2", "-ar", str(SR), f"{OUT}/{name}.wav"], check=True)
    json.dump(dict(intro=intro[0] if intro else "", rest=rest[0], intro_end=intro_end, rest_start=intro_end + (0.26 if intro else 0), dur=len(a) / SR), open(f"{OUT}/{name}.json", "w"))
    print(f"{name:11s} {voice:11s} intro {intro_end:4.2f} s, total {len(a) / SR:4.2f} s")
