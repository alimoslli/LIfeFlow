"""Original score + sound design for the launch videos, timed from a plan (100 BPM, A major, felt piano + warm pad + soft
drums; glass ticks on cuts, glass pops on cards, a riser into the first app shot and a chime on the logo).
Usage: python3 music_launch.py plan.json music.wav"""
import json, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

P = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
SR = 48000
DUR = P["duration"]
N = int(SR * (DUR + 0.1))
BEAT = 60 / P.get("bpm", 100)
BAR = 4 * BEAT
rng = np.random.default_rng(11)
dry = np.zeros((N, 2))
wet = np.zeros((N, 2))


def ta(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, g=1.0, pan=0.0, send=0.0):
    i = int(round(at * SR))
    if i >= N:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    s = sig[: N - i] * g
    l, r = s * np.sqrt(0.5 * (1 - pan)) * 1.414, s * np.sqrt(0.5 * (1 + pan)) * 1.414
    dry[i : i + len(s), 0] += l
    dry[i : i + len(s), 1] += r
    if send:
        wet[i : i + len(s), 0] += l * send
        wet[i : i + len(s), 1] += r * send


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x)


def mid(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- instruments
def piano(m, d=3.0, vel=0.7):
    f, t = mid(m), ta(d)
    s = np.zeros_like(t)
    for k, a in ((1, 1.0), (2, 0.48), (3, 0.22), (4, 0.11), (5, 0.06), (6, 0.03)):
        fk = f * k * np.sqrt(1 + 0.00012 * k * k)
        if fk > 15000:
            break
        s += a * np.sin(2 * np.pi * fk * t + rng.random()) * np.exp(-t * (0.8 + 0.6 * k) * (f / 262) ** 0.35)
    s *= np.minimum(1, t / 0.004) * np.minimum(1, (d - t) / 0.06)
    s += filt(rng.standard_normal(len(t)), "bandpass", [300, 2400]) * np.exp(-t / 0.007) * 0.04  # felt thump
    return filt(s, "lowpass", min(4200, f * 8)) * vel * 0.3


def pad(notes, d):
    t = ta(d)
    s = np.zeros_like(t)
    for m in notes:
        for det in (-0.0045, 0.0, 0.0045):
            s += 2 * ((t * mid(m) * (1 + det) + rng.random()) % 1) - 1
    s = filt(s / (len(notes) * 3), "lowpass", 850)
    return s * np.minimum(1, t / 0.9) * np.minimum(1, (d - t) / 0.9) * 0.085


def sub(m, d):
    t = ta(d)
    pump = 0.3 + 0.7 * np.clip((t % BEAT) / 0.28, 0, 1) ** 1.4
    return np.sin(2 * np.pi * mid(m) * t) * pump * np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.05) * 0.2


def kick(g=1.0):
    t = ta(0.4)
    f = 46 + 90 * np.exp(-t / 0.028)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17) * 1.5) * 0.75 * g


def clap():
    n = rng.standard_normal(int(0.22 * SR))
    e = np.zeros(len(n))
    for k, off in enumerate((0, 0.009, 0.018)):
        i = int(off * SR)
        e[i:] += np.exp(-np.arange(len(n) - i) / SR / (0.012 if k < 2 else 0.06))
    return filt(n, "bandpass", [900, 5200]) * e * 0.16


def shaker(v=1.0):
    n = rng.standard_normal(int(0.07 * SR))
    t = ta(0.07)
    return filt(n, "highpass", 6500) * np.minimum(1, t / 0.006) * np.exp(-t / 0.02) * 0.06 * v


def chime(m, d=1.6):
    t = ta(d)
    f = mid(m)
    s = np.sin(2 * np.pi * f * t) + 0.28 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.15) + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05)
    return s * np.minimum(1, t / 0.002) * np.exp(-t / 0.5) * 0.2


def tick():
    t = ta(0.09)
    return (np.sin(2 * np.pi * 2350 * t) + 0.5 * np.sin(2 * np.pi * 3720 * t)) * np.exp(-t / 0.014) * 0.12


def glass_pop():
    t = ta(0.2)
    f = 260 + 1100 * np.exp(-t / 0.018)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045) * 0.22


def whoosh(d=0.45):
    n = rng.standard_normal(int(d * SR))
    k = np.linspace(0, 1, len(n))
    s = filt(n, "bandpass", [500, 1800]) * (1 - k) + filt(n, "bandpass", [1800, 8000]) * k
    return s * np.sin(np.pi * k) ** 2 * 0.2


def riser(d=1.8):
    n = rng.standard_normal(int(d * SR))
    k = np.linspace(0, 1, len(n))
    lo = filt(n, "bandpass", [300, 1200])
    hi = filt(n, "bandpass", [2000, 9000])
    return (lo * (1 - k) + hi * k) * k ** 2.2 * 0.22


def swell(d=1.2):  # reversed cymbal
    n = filt(rng.standard_normal(int(d * SR)), "highpass", 3000)
    k = np.linspace(0, 1, len(n))
    return n * k ** 3 * 0.16


# ---------------------------------------------------------------- arrangement
CHORDS = [  # (bass midi, right-hand voicing)
    (33, [61, 64, 68, 71]),  # Amaj9
    (42, [57, 61, 64, 68]),  # F#m9
    (38, [57, 61, 64, 66]),  # Dmaj9
    (40, [59, 61, 64, 69]),  # E6sus
]
ARP = [0, 2, 1, 3, 2, 4, 3, 1]
scenes = P["scenes"]
phones = [s for s in scenes if s["kind"] == "phone"]
groove_from = phones[0]["start"] if phones else 0
outro = next((s["start"] for s in scenes if s.get("outro")), DUR)

bar = 0
t0 = 0.0
while t0 < outro - 0.01:
    bass, ch = CHORDS[bar % 4]
    d = min(BAR, outro - t0)
    groove = t0 >= groove_from - 0.01
    add(pad(ch, d + 0.6), t0, 1.0, -0.15, 0.25)
    add(pad([m + 12 for m in ch[1:3]], d + 0.6), t0, 0.5, 0.15, 0.25)
    for k, m in enumerate(ch):  # soft block chord at the top of the bar
        add(piano(m, 2.6, 0.38), t0 + k * 0.012, 1.0, -0.2 + 0.13 * k, 0.35)
    for e in range(8):  # eighth-note arpeggio
        at = t0 + e * BEAT / 2
        if at >= outro - 0.05:
            break
        idx = ARP[e]
        m = ch[idx % 4] + 12 * (idx // 4) + 12
        add(piano(m, 1.4, 0.5 if e % 2 == 0 else 0.36), at, 1.0, 0.25 if e % 2 else -0.1, 0.4)
    if groove:
        add(sub(bass + 12, d), t0)
        for b in range(4):
            at = t0 + b * BEAT
            if at >= outro - 0.05:
                break
            if b in (0, 2):
                add(kick(0.95 if b == 0 else 0.8), at)
            if b in (1, 3):
                add(clap(), at, 1.0, 0.05, 0.3)
            for s16 in range(4):
                add(shaker((1.0, 0.45, 0.75, 0.45)[s16]), at + s16 * BEAT / 4, 1.0, 0.35)
        if bar % 4 == 3:  # tiny fill into the next phrase
            add(kick(0.55), t0 + 3.5 * BEAT)
    else:
        add(sub(bass + 12, d) * 0.4, t0)
    t0 += BAR
    bar += 1

# ---------------------------------------------------------------- sound design from the plan
if phones:
    add(riser(1.8), groove_from - 1.8, 1.0, 0.0, 0.2)
    add(glass_pop(), groove_from + 0.02, 0.8)
for i, s in enumerate(scenes):
    if s["kind"] == "phone" and not s.get("enter"):
        add(whoosh(), s["start"] - 0.22, 0.75, 0.25 if i % 2 else -0.25)
        add(tick(), s["start"], 1.0, 0.2, 0.5)
    for pc in s.get("pops", []):
        at = s["start"] + pc["at"]
        add(glass_pop(), at + 0.03, 0.9, 0.1)
        add(chime(88), at + 0.07, 0.9, 0.3, 0.6)
        add(chime(93), at + 0.15, 0.7, 0.4, 0.6)
        out = at + pc.get("dur", s["end"] - s["start"] - pc["at"]) - 0.3
        if out < s["end"] - 0.15:
            add(whoosh(0.3), out, 0.35, -0.2)
    for pl in s.get("pills", []):
        at = s["start"] + pl["at"]
        add(glass_pop(), at + 0.02, 0.8, -0.1)
        add(chime(85), at + 0.06, 0.8, -0.3, 0.6)
    if s["kind"] == "gloss" and s["start"] > 0 and not s.get("outro"):  # a glossy shot mid-video: air into it
        add(whoosh(0.6), s["start"] - 0.3, 0.6)
        add(chime(88, 2.0), s["start"] + 0.1, 0.6, 0.2, 0.7)
    if s.get("outro"):  # outro: swell into an impact, then the final chord
        add(swell(1.2), s["start"] - 1.2, 1.0, 0.0, 0.3)
        add(kick(1.25), s["start"])
        add(sub(45, 2.2) * np.exp(-ta(2.2) / 0.9), s["start"], 1.2)
        d = s["end"] - s["start"] + 0.2
        for k, m in enumerate([57, 61, 64, 68, 71]):
            add(piano(m, d, 0.5), s["start"] + 0.02 + k * 0.03, 1.0, -0.3 + 0.15 * k, 0.5)
        add(pad([57, 64, 68, 71], d), s["start"], 1.1, 0.0, 0.4)
        wm = s.get("wordmark")
        if wm:
            for k, m in enumerate([81, 85, 88, 93]):
                add(chime(m, 2.4), s["start"] + wm["at"] + k * 0.09, 0.8, -0.35 + 0.23 * k, 0.8)

# ---------------------------------------------------------------- reverb + master
ir_len = int(2.6 * SR)
tt = np.arange(ir_len) / SR
ir = np.stack([filt(rng.standard_normal(ir_len), "lowpass", 6500) * np.exp(-tt / 0.62) for _ in range(2)], axis=1)
ir[: int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=0))
verb = np.stack([fftconvolve(wet[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
mix = dry + verb * 0.55
mix = np.stack([filt(mix[:, c], "highpass", 28) for c in range(2)], axis=1)
fade = np.ones(N)
k = int(0.9 * SR)
fade[-k:] = np.linspace(1, 0, k) ** 1.5
fade[: int(0.03 * SR)] = np.linspace(0, 1, int(0.03 * SR))
mix *= fade[:, None]
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write(OUT, SR, (mix[: int(SR * DUR)] * 32767).astype(np.int16))
print("music ok", OUT)
