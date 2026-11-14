"""Sound for "Campfire Q&A" v3 (the intro after the hook, Ali's original last shot, the score clearly audible from the first frame).
Built on v2: (fire_render2.py): same voices, fire bed and score; new cues for the new effects (a sparkler's
sizzle, ember whooshes, a heartbeat, the whip and the flash), made here, plus the app's own sounds where the app's pieces appear.
Was: the real voices (cleaned, levelled), a soft fire bed made here (rumble + crackle; the takes were
recorded with almost no background), the launch score (ElevenLabs via Higgsfield, already paid) arranged so its last chord
lands on the logo, and the kit's pixel sounds on every overlay beat."""
import json, subprocess, wave, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
TL = json.load(open(f"{HERE}/timeline3.json")); SR = 48000; N = int(SR * TL["n"] / 30); E = TL["end_out"] / 30
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
    if "n" not in s: continue
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
vo0 = TL["segs"][-1]["out"] / 30; lift = np.where((t > vo0) & (t < E + 1), db(1.5), 1.0)
amb[:, 0] = fire * lift; amb[:, 1] = np.roll(fire, 37) * lift
# the score: intro, the groove three times, the ending; its last chord on the logo
M = load(f"{SP}/launch/music_el.mp3"); ms = lambda a, b: M[int(a * SR): int(b * SR)]       # -14.7 LUFS as delivered
xf = int(1.0 * SR)
def arrange(n_groove):
    parts = [ms(0, 10.5), ms(10.5, 30)] + [ms(12.0, 30)] * n_groove + [ms(30, 36.0)]; mus = parts[0]
    for p in parts[1:]:
        fade = np.linspace(0, 1, xf)[:, None]; mus = np.vstack([mus[:-xf], mus[-xf:] * (1 - fade) + p[:xf] * fade, p[xf:]])
    return mus
g_ = 2
while len(arrange(g_)) / SR - 6.0 < E - 0.3: g_ += 1
mus = arrange(g_); end_at = len(mus) / SR - 6.0; off = E - 0.3 - end_at          # its last chord on the logo; it starts before the video and comes in already playing
put(bed, mus, off, -8.0, 0.0, 0.8)
bed[: int(0.4 * SR)] *= np.linspace(0.3, 1, int(0.4 * SR))[:, None]
i0, i1 = int(TL["intro"]["out"] / 30 * SR), int((TL["intro"]["out"] + TL["intro"]["nf"]) / 30 * SR)
lift_m = np.ones(N, np.float32); lift_m[i0:i1] = db(3.0); lift_m = np.convolve(lift_m, np.ones(4800) / 4800, mode="same"); bed *= lift_m[:, None]   # the intro is the music's moment
env = np.convolve(np.abs(voice[:, 0]), np.ones(9600) / 9600, mode="same"); duck = 1 - 0.55 * np.clip(env / 0.035, 0, 1)   # about 8 dB under the voices
bed *= duck[:, None]
# the pixel sounds, placed by each clip's own time
F = {k: load(f"{SP}/editorpack/sfx/{k}.wav") for k in ["skylings_pop_up", "added_to_your_day", "answer_lands", "send", "sky_turns", "tap", "star_tick_it_off", "sun_goal_reached", "whoosh_scene_change", "night_stars_twinkle"]}
F["pop"] = F["skylings_pop_up"][: int(0.11 * SR)]
def at(n, ct):
    for s in TL["segs"]:
        if s.get("n") == n and s["a"] - 0.2 <= ct < s["b"] + 0.1: return s["out"] / 30 + ct - s["a"]
def seg_t(tag, st):
    for s in TL["segs"]:
        if s.get("tag") == tag: return s["out"] / 30 + st
# ---------------------------------------------------------------- sounds made here
def env(n, a, r):
    e = np.ones(n, np.float32); ia, ir = int(a * SR), int(r * SR)
    if ia: e[:ia] = np.linspace(0, 1, ia)
    if ir: e[-ir:] *= np.linspace(1, 0, ir)
    return e
def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x)).astype(np.float32)
def st(x, w=0.35):
    return np.stack([x, np.roll(x, int(SR * 0.0007))], -1) * np.array([1 - w * 0.3, 1], np.float32)
def norm(x): return x / (np.abs(x).max() + 1e-9)
R2 = np.random.default_rng(9)
def sizzle(dur):                                    # a sparkler: bright hiss with spitting crackles
    n = int(dur * SR); hiss = band(R2.normal(0, 1, n), 2500, 9500) * (0.6 + 0.4 * np.abs(np.sin(np.arange(n) / SR * 37)))
    cr = np.zeros(n, np.float32)
    for tt in R2.uniform(0, dur, int(dur * 60)):
        i = int(tt * SR); L = int(SR * R2.uniform(0.002, 0.008))
        if i + L < n: cr[i:i + L] += R2.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 3)) * R2.uniform(0.3, 1.2)
    return st(norm(norm(hiss) * 0.7 + band(cr, 1500, 12000) * 1.2) * env(n, 0.05, 0.25))
def whoosh(dur, lo=250, hi=2600):                   # embers lifting off
    n = int(dur * SR); x = band(R2.normal(0, 1, n), lo, hi); e = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.6
    return st(norm(x) * e)
def crackle(dur, rate=70):                          # a burst of sparks
    n = int(dur * SR); x = np.zeros(n, np.float32)
    for tt in np.sort(R2.exponential(dur / 4, int(dur * rate))):
        i = int(tt * SR); L = int(SR * R2.uniform(0.002, 0.012))
        if i + L < n: x[i:i + L] += R2.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 3)) * np.exp(-tt / (dur * 0.5))
    return st(norm(band(x, 800, 12000)))
def beep(f=960, dur=0.09):                          # the heart monitor
    n = int(dur * SR); tt = np.arange(n) / SR; return st(norm(np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(4 * np.pi * f * tt)) * env(n, 0.004, 0.05))
def roar(dur):                                      # the flames rushing up into the flash
    n = int(dur * SR); x = band(R2.normal(0, 1, n), 60, 1800); e = np.linspace(0, 1, n) ** 2.2; e[-int(0.08 * SR):] *= np.linspace(1, 0, int(0.08 * SR))
    return st(norm(x) * e)
F.update({"sizzle1": sizzle(1.2), "sizzle_end": sizzle(1.4), "whoosh": whoosh(0.9), "whoosh_long": whoosh(1.5, 200, 2200), "crackle": crackle(0.6),
          "beep": beep(), "roar": roar(0.55), "sizzle_line": sizzle(4.0)})
# ---------------------------------------------------------------- cues (segment tag, seconds into it, sound, dB), from fire_render2.py
CUES = [("hook", 0.0, "whoosh_long", -15), ("hook", 1.05, "answer_lands", -12), ("hook", 3.12, "crackle", -9), ("hook", 3.12, "pop", -8),
        ("wheel", 0.32, "sizzle1", -15), ("wheel", 2.75, "sky_turns", -8), ("wheel", 4.05, "night_stars_twinkle", -15), ("wheel", 5.9, "tap", -10),
        ("tyler_name", 0.3, "sizzle1", -15),
        ("clouds", 7.55, "whoosh", -14), ("clouds", 7.93, "sun_goal_reached", -7),
        ("question", 1.3, "night_stars_twinkle", -15),
        ("arc", 0.1, "night_stars_twinkle", -12), ("arc", 2.55, "sky_turns", -9),
        ("ask_tyler", 1.95, "whoosh_scene_change", -11), ("ask_tyler", 2.55, "skylings_pop_up", -9),
        ("food", 2.95, "send", -10), ("food", 6.65, "added_to_your_day", -8),
        ("long_way", 1.35, "whoosh", -15),
        ("health", 5.42, "pop", -6), ("health", 6.45, "answer_lands", -10), ("health", 9.5, "sun_goal_reached", -7),
        ("vo", 0.1, "tap", -12), ("vo", 0.86, "tap", -12), ("vo", 2.52, "tap", -12), ("vo", 3.86, "tap", -11), ("vo", 0.05, "sizzle_line", -23),
        ("vo", 4.05, "crackle", -9), ("vo", 4.05, "pop", -7), ("vo", 3.95, "whoosh", -12)]
CUES += [("wheel", 7.05 + j * 0.16, "pop", -9) for j in range(7)]                              # the week's seven suns
for ts in (4.55, 5.5, 6.6):                                                                       # each ember word: lift-off, landing
    CUES += [("clouds", ts - 0.6, "whoosh", -15), ("clouds", ts - 0.02, "star_tick_it_off", -10)]
CUES += [("arc", 1.22 + j * 0.3, "pop", -5) for j in range(5)]                                  # the five ignite
CUES += [("health", 4.85 + 1.15 * (x - 1030) / 865, "beep", -17) for x in (1210, 1460, 1710)]   # the heartbeat drawn in light
for tag, st_, name, g in CUES:
    o = seg_t(tag, st_)
    if o is not None: put(fx, F[name], o, g)
put(fx, F["sizzle_end"], E + 0.3, -17)
put(fx, load(f"{HERE}/intro.wav"), TL["intro"]["out"] / 30, -2)                                # the intro's own sound (its boom lands on Ali's first frame)                                                            # the sun throws the words
end = load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"); end[: int(0.6 * SR)] *= np.linspace(0.35, 1, int(0.6 * SR))[:, None]
put(fx, end, E, -3, 0.01, 0.2)
out = voice + fx + bed + amb
out[: int(0.25 * SR)] *= np.linspace(0, 1, int(0.25 * SR))[:, None]; out[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None] ** 2
with wave.open(f"{HERE}/campfire3_mix_pre.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/campfire3_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{HERE}/campfire3_mix.wav"], check=True)
print("mix done", round(N / SR, 2), "s; music starts at", round(off, 2))
