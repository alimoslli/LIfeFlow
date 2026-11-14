"""Sound for "Campfire Q&A": the real voices (cleaned, levelled), a soft fire bed made here (rumble + crackle; the takes were
recorded with almost no background), the launch score (ElevenLabs via Higgsfield, already paid) arranged so its last chord
lands on the logo, and the kit's pixel sounds on every overlay beat."""
import json, subprocess, wave, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
TL = json.load(open(f"{HERE}/timeline.json")); SR = 48000; N = int(SR * TL["n"] / 30); E = TL["end_out"] / 30
def load(path, filt=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-af", filt] if filt else []) + ["-ac", "2", "-ar", str(SR), "-f", "s16le", "-"]
    return (np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.int16).reshape(-1, 2) / 32768.).astype(np.float32)
def db(x): return 10 ** (x / 20)
voice, fx, bed, amb = (np.zeros((N, 2), np.float32) for _ in range(4))
def put(buf, a, t, g=0., fi=0.004, fo=0.004):
    if t < 0: a = a[int(-t * SR):]; t = 0
    a = a.copy() * db(g); n = len(a); i0, i1 = int(fi * SR), int(fo * SR)
    if i0: a[:i0] *= np.linspace(0, 1, i0)[:, None]
    if i1: a[-i1:] *= np.linspace(1, 0, i1)[:, None]
    i = int(round(t * SR)); j = min(N, i + n)
    if j > i: buf[i:j] += a[: j - i]
VOICE = "highpass=f=90,afftdn=nr=8:nf=-50,equalizer=f=220:t=q:w=1:g=-1.5,equalizer=f=3300:t=q:w=1.2:g=2.5,acompressor=threshold=-24dB:ratio=2.8:attack=5:release=130:makeup=2,loudnorm=I=-16:TP=-2:LRA=7"
RAW = {}
for s in TL["segs"]:
    n = s["n"]
    if n not in RAW: RAW[n] = load(f"{HERE}/wav/c{n}.wav", VOICE + (",aecho=0.8:0.5:28:0.12" if n == 4 else ""))   # the new line gets the fire's air
    put(voice, RAW[n][int(s["a"] * SR): int(s["b"] * SR)], s["out"] / 30, 0, 0.012, 0.03)
# the fire: a low rumble and crackles, steady under everything (a touch louder on the sky shot)
rng = np.random.default_rng(3); t = np.arange(N) / SR
br = np.cumsum(rng.normal(0, 1, N)).astype(np.float32); br -= np.convolve(br, np.ones(4800) / 4800, mode="same"); br /= np.abs(br).max() + 1e-9
rumble = np.convolve(br, np.ones(60) / 60, mode="same") * 0.5
crk = np.zeros(N, np.float32)
for tt in np.sort(rng.uniform(0, N / SR, int(N / SR * 9))):
    L = int(SR * rng.uniform(0.004, 0.03)); i = int(tt * SR)
    if i + L >= N: continue
    burst = rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.15, 1.0) ** 2
    crk[i:i + L] += np.diff(np.r_[0, burst]).astype(np.float32)          # bright, snappy
for tt in rng.uniform(0, N / SR, int(N / SR * 0.6)):                    # a few bigger pops
    L = int(SR * 0.05); i = int(tt * SR)
    if i + L < N: crk[i:i + L] += (rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 6)) * 1.6).astype(np.float32)
fire = rumble * db(-30) + crk * db(-36)
vo0 = TL["segs"][-1]["out"] / 30; lift = np.where((t > vo0) & (t < E + 1), db(3), 1.0)
amb[:, 0] = fire * lift; amb[:, 1] = np.roll(fire, 37) * lift
# the score: intro, the groove three times, the ending; its last chord on the logo
M = load(f"{SP}/launch/music_el.mp3"); ms = lambda a, b: M[int(a * SR): int(b * SR)]
parts = [ms(0, 10.5), ms(10.5, 30), ms(12.0, 30), ms(12.0, 30), ms(30, 36.0)]; xf = int(1.0 * SR); mus = parts[0]
for p in parts[1:]:
    fade = np.linspace(0, 1, xf)[:, None]; mus = np.vstack([mus[:-xf], mus[-xf:] * (1 - fade) + p[:xf] * fade, p[xf:]])
end_at = len(mus) / SR - 6.0; off = E - 0.3 - end_at
put(bed, mus, off, -15, 1.2, 0.8)
env = np.convolve(np.abs(voice[:, 0]), np.ones(4800) / 4800, mode="same"); duck = 1 - 0.45 * np.clip(env / 0.04, 0, 1)
bed *= duck[:, None]
# the pixel sounds, placed by each clip's own time
F = {k: load(f"{SP}/editorpack/sfx/{k}.wav") for k in ["skylings_pop_up", "added_to_your_day", "answer_lands", "send", "sky_turns", "tap", "star_tick_it_off", "sun_goal_reached", "whoosh_scene_change", "night_stars_twinkle"]}
F["pop"] = F["skylings_pop_up"][: int(0.11 * SR)]
def at(n, ct):
    for s in TL["segs"]:
        if s["n"] == n and s["a"] - 0.2 <= ct < s["b"] + 0.1: return s["out"] / 30 + ct - s["a"]
def seg_t(tag, st):
    for s in TL["segs"]:
        if s.get("tag") == tag: return s["out"] / 30 + st
CUES = [("wheel", 0.25, "answer_lands", -9), ("wheel", 2.6, "whoosh_scene_change", -10), ("wheel", 2.65, "sky_turns", -7), ("wheel", 5.6, "sky_turns", -11),
        ("tyler_name", 0.3, "answer_lands", -9)]
CUES += [("clouds", ts, "added_to_your_day", -7) for ts in (4.75, 5.75, 6.9)]
CUES += [("arc", 1.6 + j * 0.42, "pop", -4) for j in range(5)] + [("arc", 1.6, "night_stars_twinkle", -14)]
CUES += [("food", 5.6, "pop", -4), ("food", 6.2, "added_to_your_day", -8), ("health", 0.9, "sun_goal_reached", -7), ("health", 7.55, "added_to_your_day", -8)]
CUES += [("vo", 0.5, "skylings_pop_up", -7), ("vo", 2.02, "answer_lands", -9), ("vo", 2.6, "night_stars_twinkle", -12)]
for tag, st, name, g in CUES:
    o = seg_t(tag, st)
    if o is not None: put(fx, F[name], o, g)
end = load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"); end[: int(0.6 * SR)] *= np.linspace(0.35, 1, int(0.6 * SR))[:, None]
put(fx, end, E, -3, 0.01, 0.2)
out = voice + fx + bed + amb
out[: int(0.25 * SR)] *= np.linspace(0, 1, int(0.25 * SR))[:, None]; out[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None] ** 2
with wave.open(f"{HERE}/campfire_mix_pre.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/campfire_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{HERE}/campfire_mix.wav"], check=True)
print("mix done", round(N / SR, 2), "s; music starts at", round(off, 2))
