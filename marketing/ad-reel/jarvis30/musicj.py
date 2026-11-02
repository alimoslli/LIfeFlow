"""Music + sound design for the 'texts first' Jarvis reel, timed from timeline.json.

Dreamy lo-fi intro under the 'texts first' setup, a record scratch on the reveal, then a bouncy 100 BPM beat
from the drop, notification dings, success chimes on each tap, and an end hit. Writes music.wav (48 kHz stereo).
"""
import json
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

T = json.load(open("timeline.json"))
SR, DUR = 48000, 30.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
L, R = np.zeros(N), np.zeros(N)
REVEAL, DROP, BEAT = T["reveal"], T["drop"], T["beat"]
END = T["callback"]["end"]


def ta(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, gain=1.0, pan=0.0, stop=None):
    i = int(at * SR)
    if i >= N or i < 0:
        return
    s = sig[: N - i] * gain
    if stop is not None:
        s = s[: max(0, int((stop - at) * SR))]
    L[i : i + len(s)] += s * (1 - max(0, pan))
    R[i : i + len(s)] += s * (1 + min(0, pan))


def filt(x, kind, f):
    return sosfilt(butter(2, f, btype=kind, fs=SR, output="sos"), x)


def env(d, a=0.005, dec=0.2):
    t = ta(d)
    e = np.exp(-t / dec)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def tone(f, d, kind="sine", det=0.0):
    t = ta(d)
    out = 0
    for dt in ([-det, det] if det else [0.0]):
        ff = f * (1 + dt)
        out = out + (np.sin(2 * np.pi * ff * t) if kind == "sine" else 2 * ((t * ff) % 1) - 1)
    return out / (2 if det else 1)


def mid(m):
    return 440 * 2 ** ((m - 69) / 12)


def mixp(*s):
    n = max(len(x) for x in s)
    o = np.zeros(n)
    for x in s:
        o[: len(x)] += x
    return o


def kick(h=1.0, soft=False):
    t = ta(0.4)
    f = 48 + 90 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.16 if soft else 0.22))
    return np.tanh(s * 1.5 * h) * 0.9


def clap():
    n = filt(rng.standard_normal(int(0.25 * SR)), "bandpass", [1000, 5000])
    e = np.zeros(len(n))
    for k, off in enumerate([0, 0.01, 0.02]):
        i = int(off * SR)
        e[i:] += np.exp(-np.arange(len(n) - i) / SR / (0.01 if k < 2 else 0.09))
    return n * e * 0.5


def shaker(acc=1.0):
    return filt(rng.standard_normal(int(0.06 * SR)), "highpass", 6500) * env(0.06, 0.004, 0.018) * 0.16 * acc


def ding(at, gain=1.0):
    for k, m in enumerate([88, 95]):
        s = (tone(mid(m), 0.6) + 0.3 * tone(mid(m) * 2.01, 0.6)) * env(0.6, 0.002, 0.18)
        add(s, at + k * 0.075, 0.09 * gain, pan=0.15)


def success(at):
    for k, m in enumerate([76, 81, 88]):
        s = (tone(mid(m), 0.5) + 0.25 * tone(mid(m) * 3, 0.5)) * env(0.5, 0.002, 0.16)
        add(s, at + k * 0.06, 0.11)


def whoosh(at, g=0.18):
    n = filt(rng.standard_normal(int(0.35 * SR)), "bandpass", [700, 7000])
    k = np.linspace(0, 1, len(n))
    add(n * k ** 2 * g, at - 0.35, pan=-0.2)


# ---------------------------------------------------------------- dreamy intro (0 -> reveal)
IB = 0.8  # 75 BPM feel
chords_i = [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]]  # Fmaj7 Em7 Dm7 Cmaj7
bar = IB * 4 / 2  # two chords per 4 beats
t = 0.0
ci = 0
while t < REVEAL:
    d = min(bar, REVEAL - t)
    ch = chords_i[ci % 4]
    pad = sum(tone(mid(m), d + 0.4, "saw", 0.004) for m in ch) / 4
    pad = filt(pad, "lowpass", 1100) * np.minimum(1, ta(d + 0.4) / 0.3) * np.minimum(1, (d + 0.4 - ta(d + 0.4)) / 0.4) * 0.06
    add(pad, t, pan=-0.1, stop=REVEAL)
    add(pad, t + 0.01, pan=0.1, stop=REVEAL)
    for k in range(4):  # soft keys arpeggio
        m = ch[k % 4] + 12
        s = (tone(mid(m), 0.7) + 0.2 * tone(mid(m) * 2, 0.7)) * env(0.7, 0.004, 0.25)
        add(s, t + k * bar / 4 + 0.05, 0.035, pan=-0.3 + 0.2 * k, stop=REVEAL)
    add(tone(mid(ch[0] - 24), d, "sine") * env(d, 0.01, d * 0.7), t, 0.18, stop=REVEAL)
    t += bar
    ci += 1
b = 0.0
while b < REVEAL - 0.3:  # soft lo-fi drums
    add(filt(kick(0.6, True), "lowpass", 900), b, 0.6, stop=REVEAL)
    add(filt(clap(), "lowpass", 3500), b + IB, 0.35, stop=REVEAL)
    for h in range(4):
        add(shaker(0.6 if h % 2 else 1.0), b + h * IB / 2, stop=REVEAL)
    b += IB * 2
crackle = (rng.random(int(REVEAL * SR)) > 0.9993) * rng.standard_normal(int(REVEAL * SR)) * 0.15
add(filt(crackle, "highpass", 2000), 0)

# record scratch on the reveal: pitch-dive the last moment, then the scratch itself
d = 0.42
n = rng.standard_normal(int(d * SR))
k = np.linspace(0, 1, len(n))
scratch = filt(n, "bandpass", [600, 3000]) * (np.sin(np.pi * k * 3) ** 2) * 0.5
scratch += np.sin(2 * np.pi * np.cumsum(900 - 700 * k) / SR) * 0.15 * np.exp(-k * 2)
add(scratch, REVEAL - 0.05, 0.9)
add(kick(1.2) * 0.8, REVEAL + 0.02)
add(tone(41, 1.6) * env(1.6, 0.005, 0.8), REVEAL + 0.02, 0.35)
# tension ticks + riser into the drop
for i, tt in enumerate(np.arange(REVEAL + 0.6, DROP - 0.1, BEAT / 2)):
    add(filt(rng.standard_normal(int(0.02 * SR)), "highpass", 5000) * env(0.02, 0.001, 0.005), tt, 0.25)
rd = DROP - (REVEAL + 0.6)
n = rng.standard_normal(int(rd * SR))
k = np.linspace(0, 1, len(n))
add(filt(n, "highpass", 1500) * k ** 2.5 * 0.25, REVEAL + 0.6)

# ---------------------------------------------------------------- bouncy beat (drop -> end)
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
roots = [45, 41, 48, 43]
BAR = BEAT * 4
nb = int(np.ceil((END - DROP) / BAR))
for bi in range(nb):
    t0 = DROP + bi * BAR
    ch = chords[bi % 4]
    for st, dur in [(0, BEAT * 0.75), (BEAT * 1.5, BEAT * 0.5), (BEAT * 2, BEAT * 0.75), (BEAT * 3.5, BEAT * 0.5)]:
        s = tone(mid(roots[bi % 4] - 12), dur) + 0.35 * tone(mid(roots[bi % 4]), dur)
        add(s * env(dur, 0.004, dur * 0.6), t0 + st, 0.3, stop=END)
    add(kick(1.15 if bi == 0 else 1.0), t0, stop=END)
    add(kick(0.85), t0 + BEAT * 2, stop=END)
    add(kick(0.6), t0 + BEAT * 2.75, stop=END)
    add(clap(), t0 + BEAT, stop=END)
    add(clap(), t0 + BEAT * 3, stop=END)
    for h in range(8):
        add(shaker(1.0 if h % 2 else 0.6), t0 + h * BEAT / 2 + (0.015 if h % 2 else 0), pan=0.3, stop=END)
    for h, m in enumerate([ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12]):
        s = (tone(mid(m), 0.25) + 0.4 * tone(mid(m) * 4, 0.25)) * env(0.25, 0.002, 0.06)  # marimba-ish
        add(s, t0 + h * BEAT / 2, 0.05, pan=-0.35 + 0.1 * (h % 4), stop=END)
    pad = sum(tone(mid(m), BAR, "saw", 0.004) for m in ch) / 3
    add(filt(pad, "lowpass", 1500) * np.minimum(1, ta(BAR) / 0.2) * 0.035, t0, stop=END)
add(mixp(kick(1.4), filt(rng.standard_normal(int(0.8 * SR)), "lowpass", 6000) * env(0.8, 0.001, 0.25) * 0.25), DROP)
for s in T["segments"][1:]:
    whoosh(s["start"])
whoosh(T["callback"]["start"])

for d_ in T["dings"]:
    ding(d_)
for s_ in T["success"]:
    success(s_)

# ---------------------------------------------------------------- end
add(mixp(kick(1.2), filt(rng.standard_normal(int(1.0 * SR)), "lowpass", 5000) * env(1.0, 0.001, 0.4) * 0.2), END)
fin = sum(tone(mid(m), 3.2, "saw", 0.005) for m in [57, 64, 69, 72]) / 4
fin = filt(fin, "lowpass", 1800) * np.minimum(1, ta(3.2) / 0.05) * np.exp(-ta(3.2) / 1.8) * 0.11
add(fin, END, pan=-0.1)
add(fin, END + 0.012, pan=0.1)
add(tone(55, 3.0) * env(3.0, 0.003, 1.2), END, 0.33)
for i, m in enumerate([81, 84, 88, 93]):
    add(tone(mid(m), 1.0) * env(1.0, 0.003, 0.35), END + 0.25 + i * 0.08, 0.05, pan=-0.4 + 0.25 * i)

mix = np.stack([L, R], axis=1)
f = np.ones(N)
f[int(29.3 * SR) :] = np.linspace(1, 0, N - int(29.3 * SR))
mix *= f[:, None]
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write("music.wav", SR, (mix * 32767).astype(np.int16))
print("music.wav ok")
