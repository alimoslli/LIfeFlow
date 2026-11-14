"""Sound for a cut made by render6.py (v9) (reads timeline_<cut>.json): the real voices (cleaned), the kit's pixel sounds on
every overlay beat (placed by each clip's own time, so they follow the cut), the score (ElevenLabs Music via Higgsfield,
owner approved), the logo ending's sound.   python3 mix3.py main|short"""
import json, subprocess, wave, sys, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); L = os.path.dirname(HERE); SP = os.path.dirname(L)
cut = sys.argv[1]; TL = json.load(open(f"{L}/timeline_{cut}.json")); SR = 48000; N = int(SR * TL["n"] / 30)
def load(path, filt=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-af", filt] if filt else []) + ["-ac", "2", "-ar", str(SR), "-f", "s16le", "-"]
    return (np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.int16).reshape(-1, 2) / 32768.).astype(np.float32)
def db(x): return 10 ** (x / 20)
voice = np.zeros((N, 2), np.float32); fx = np.zeros((N, 2), np.float32); bed = np.zeros((N, 2), np.float32)
def put(buf, a, t, g=0., fi=0.004, fo=0.004):
    if t < 0: a = a[int(-t * SR):]; t = 0
    a = a.copy() * db(g); n = len(a); i0, i1 = int(fi * SR), int(fo * SR)
    if i0: a[:i0] *= np.linspace(0, 1, i0)[:, None]
    if i1: a[-i1:] *= np.linspace(1, 0, i1)[:, None]
    i = int(round(t * SR)); j = min(N, i + n)
    if j > i: buf[i:j] += a[: j - i]
VOICE = "highpass=f=85,afftdn=nr=10:nf=-42,equalizer=f=3200:t=q:w=1.2:g=2,acompressor=threshold=-24dB:ratio=2.6:attack=6:release=140:makeup=2,loudnorm=I=-16:TP=-2:LRA=8"
RAW = {c: load(f"{HERE}/raw_{f}.wav", VOICE) for c, f in [("t", "4105"), ("a", "4127"), ("k", "4126")]}
segs = TL["segs"]
for s in segs:
    a, b = s["a"] / 30, s["b"] / 30
    if s["clip"] == "a" and s["b"] == 513: b = 17.11          # "finances" ends at 17.11 s
    if s["clip"] == "k" and s["b"] == 712: b = 23.87          # "2027" finishes over the dissolve
    if s["clip"] == "t": b = min(b, 11.70)
    put(voice, RAW[s["clip"]][int(a * SR): int(b * SR)], s["out"] / 30, 0, 0.02, 0.03)
def at(clip, t):
    for s in segs:
        if s["clip"] == clip and s["a"] / 30 - 0.25 <= t < s["b"] / 30 + 0.1: return s["out"] / 30 + t - s["a"] / 30
    return None
F = {n: load(f"{SP}/editorpack/sfx/{n}.wav") for n in ["skylings_pop_up", "added_to_your_day", "answer_lands", "send", "sky_turns", "tap",
     "star_tick_it_off", "sun_goal_reached", "whoosh_scene_change", "night_stars_twinkle"]}
F["pop"] = F["skylings_pop_up"][: int(0.11 * SR)]
CUES = [("t", 0.0, "sky_turns", -6), ("t", 0.03, "whoosh_scene_change", -11), ("t", 0.3, "answer_lands", -11),             # the hook on Tyler
        ("t", 1.95, "whoosh_scene_change", -10), ("t", 2.0, "night_stars_twinkle", -12), ("t", 2.25, "pop", -5),             # the wheel goes, Dreamy floats out
        ("t", 2.25, "answer_lands", -8), ("t", 3.92, "added_to_your_day", -10),
        ("t", 9.0, "sun_goal_reached", -6),
        ("a", 3.3, "answer_lands", -8), ("a", 6.62, "skylings_pop_up", -3), ("a", 8.2, "whoosh_scene_change", -10), ("a", 8.42, "send", -7),
        ("a", 9.0, "sky_turns", -8), ("a", 10.5, "sky_turns", -11), ("a", 12.15, "whoosh_scene_change", -9), ("a", 12.25, "whoosh_scene_change", -13)]
CUES += [("a", t - 0.12, "added_to_your_day", -7) for t in [13.36, 14.04, 14.82, 16.4]] + [("a", t, "tap", -14) for t in [13.42, 14.12, 14.86, 16.45]]
CUES += [("a", 19.5, "whoosh_scene_change", -12), ("a", 19.6, "night_stars_twinkle", -9), ("a", 20.3, "star_tick_it_off", -9)]
CUES += [("a", t, "tap", -6) for t in [21.76, 21.86, 21.96, 22.06, 22.16]]
CUES += [("k", 21.95, "sky_turns", -8), ("k", 22.02, "answer_lands", -10), ("k", 22.78, "star_tick_it_off", -10)]   # the cover comes alive
for clip, t, name, g in CUES:
    o = at(clip, t)
    if o is not None: put(fx, F[name], o, g)
for k, tr in enumerate(TL["trans"]):                             # the whips
    if tr == "whip": B = segs[k + 1]["out"] / 30; put(fx, F["whoosh_scene_change"], B - 0.43, -2); put(fx, F["whoosh_scene_change"], B - 0.11, -7)
E = TL["end_out"] / 30
end = load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"); end[: int(0.6 * SR)] *= np.linspace(0.35, 1, int(0.6 * SR))[:, None]
put(fx, end, E, -2, 0.01, 0.2)
# the score: its build lands on the whip into Ali (main) / its last 15 s carry the short; 5 dB lower under Ali; 4 dB more under any voice
music = load(f"{L}/music_el.mp3")
a1 = next(s["out"] for s in segs if s["clip"] == "a" and s["a"] >= 57) / 30
off = (a1 - 11.233) if cut == "main" else (E - 30.7)
put(bed, music, off, -12, 0.01, 0.8)
if cut == "main": put(bed, music[int(22.5 * SR): int(24.6 * SR)], 0.0, -15, 0.03, 0.35)   # a burst of the score under the hook
tt = np.arange(N) / SR
lvl = np.where(tt < a1 - 0.3, 0, np.where(tt < a1 + 0.3, -5 * (tt - (a1 - 0.3)) / 0.6, np.where(tt < E, -5, -5 + 2 * np.clip((tt - E) / 0.6, 0, 1))))
env = np.convolve(np.abs(voice[:, 0]), np.ones(4800) / 4800, mode="same"); duck = 1 - 0.42 * np.clip(env / 0.04, 0, 1)
bed *= (duck * 10 ** (lvl / 20))[:, None]
out = voice + fx + bed; out[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))[:, None] ** 2
with wave.open(f"{L}/{cut}_mix_pre.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{L}/{cut}_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{L}/{cut}_mix.wav"], check=True)
print(cut, "mix done", round(N / SR, 2), "s; music offset", round(off, 2))
