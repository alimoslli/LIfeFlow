"""Soft lo-fi bed + pop/whoosh sound design for the Sage reel, timed from plan.json. Writes music.wav."""
import json
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

P = json.load(open("plan.json"))
SR, DUR = 48000, P["duration"]
N = int(SR * DUR)
rng = np.random.default_rng(5)
L, R = np.zeros(N), np.zeros(N)


def ta(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i < 0:
        return
    s = sig[: N - i] * g
    L[i : i + len(s)] += s * (1 - max(0, pan))
    R[i : i + len(s)] += s * (1 + min(0, pan))


def filt(x, k, f):
    return sosfilt(butter(2, f, btype=k, fs=SR, output="sos"), x)


def env(d, a=0.005, dec=0.2):
    t = ta(d)
    e = np.exp(-t / dec)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def tone(f, d, saw=False, det=0.0):
    t = ta(d)
    o = 0
    for dt in ([-det, det] if det else [0.0]):
        ff = f * (1 + dt)
        o = o + ((2 * ((t * ff) % 1) - 1) if saw else np.sin(2 * np.pi * ff * t))
    return o / (2 if det else 1)


def mid(m):
    return 440 * 2 ** ((m - 69) / 12)


def kick(h=1.0):
    t = ta(0.35)
    f = 50 + 80 * np.exp(-t / 0.03)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.15) * 1.4 * h) * 0.8


def snap():
    n = filt(rng.standard_normal(int(0.15 * SR)), "bandpass", [1500, 6000])
    return n * env(0.15, 0.001, 0.03) * 0.35


def hat():
    return filt(rng.standard_normal(int(0.04 * SR)), "highpass", 7000) * env(0.04, 0.001, 0.012) * 0.12


END = P["end"]
BEAT = 60 / 86
chords = [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71], [57, 60, 64, 67]]  # Dm7 G7 Cmaj7 Am7
t, i = 0.0, 0
while t < END:
    ch = chords[i % 4]
    d = BEAT * 4
    pad = sum(tone(mid(m), d + 0.3, True, 0.004) for m in ch) / 4
    pad = filt(pad, "lowpass", 1200) * np.minimum(1, ta(d + 0.3) / 0.2) * np.minimum(1, (d + 0.3 - ta(d + 0.3)) / 0.3) * 0.05
    add(pad, t, pan=-0.1)
    add(pad, t + 0.01, pan=0.1)
    for k in range(4):
        m = ch[(k * 2) % 4] + 12
        add((tone(mid(m), 0.6) + 0.25 * tone(mid(m) * 2, 0.6)) * env(0.6, 0.003, 0.2), t + k * BEAT + 0.04, 0.03, pan=-0.3 + 0.2 * k)
    add(tone(mid(ch[0] - 24), d) * env(d, 0.01, d * 0.6), t, 0.15)
    for b in range(4):
        add(kick(0.7 if b % 2 else 0.9), t + b * BEAT) if b in (0, 2) else None
        add(snap(), t + b * BEAT) if b in (1, 3) else None
        add(hat(), t + b * BEAT + BEAT / 2, pan=0.3)
    t += d
    i += 1
crackle = (rng.random(N) > 0.9994) * rng.standard_normal(N) * 0.12
L += filt(crackle, "highpass", 2000)
R += filt(crackle, "highpass", 2000)


def whoosh(at, g=0.22):
    n = rng.standard_normal(int(0.4 * SR))
    k = np.linspace(0, 1, len(n))
    s = (filt(n, "bandpass", [400, 1500]) * (1 - k) + filt(n, "bandpass", [1500, 7000]) * k) * np.sin(np.pi * k) ** 2
    add(s, at - 0.25, g, pan=0.2)


def pop(at):
    t = ta(0.18)
    f = 300 + 900 * np.exp(-t / 0.02)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    add(s, at, 0.22)
    for k, m in enumerate([84, 91]):
        add((tone(mid(m), 0.5) + 0.3 * tone(mid(m) * 2, 0.5)) * env(0.5, 0.002, 0.15), at + 0.05 + k * 0.07, 0.06)


for ph in P["phones"]:
    whoosh(ph["t0"] + 0.15)
    whoosh(ph["t1"] - 0.1, 0.12)
for pc in P["pops"]:
    pop(pc["t0"] + 0.08)
for ch in P.get("chips", []):
    pop(ch["t0"] + 0.05)
# end: zoom whoosh + hit + chord
whoosh(END, 0.3)
add(kick(1.3), END)
fin = sum(tone(mid(m), 3.5, True, 0.005) for m in [62, 69, 72, 77]) / 4
add(filt(fin, "lowpass", 1700) * np.exp(-ta(3.5) / 1.8) * 0.1, END)
for k, m in enumerate([81, 86, 89, 93]):
    add(tone(mid(m), 1.0) * env(1.0, 0.003, 0.35), END + 0.25 + k * 0.08, 0.05, pan=-0.4 + 0.25 * k)

mix = np.stack([L, R], axis=1)
f = np.ones(N)
f[int((DUR - 0.6) * SR) :] = np.linspace(1, 0, N - int((DUR - 0.6) * SR))
mix *= f[:, None]
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write("music.wav", SR, (mix * 32767).astype(np.int16))
print("music.wav ok")
