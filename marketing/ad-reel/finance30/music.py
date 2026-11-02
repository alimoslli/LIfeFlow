"""Synthesised music bed + sound design for the 30 s LifeFlow finance reel.

The beat (92.3 BPM, 0.65 s per beat) starts at the drop (7.15 s); every scene cut after it lands on a beat.
Writes music.wav (48 kHz stereo). Usage: python3 music.py
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)

BAR = 2.6
BEAT = BAR / 4
DROP = 7.15
SEG_BEATS = [4, 5, 6, 5, 4, 4, 2]  # tutorial scenes + campus shot
CUTS = [DROP + BEAT * sum(SEG_BEATS[:i]) for i in range(1, len(SEG_BEATS))]
END_T = DROP + BEAT * sum(SEG_BEATS)


def t_arr(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    s = sig[: N - i] * gain
    L[i : i + len(s)] += s * (1 - max(0, pan))
    R[i : i + len(s)] += s * (1 + min(0, pan))


def filt(x, kind, f):
    sos = butter(2, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


def env(d, a=0.005, decay=0.2):
    t = t_arr(d)
    e = np.exp(-t / decay)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def mixp(*sigs):
    """Sum signals of different lengths (zero-padded)."""
    n = max(len(x) for x in sigs)
    out = np.zeros(n)
    for x in sigs:
        out[: len(x)] += x
    return out


def kick(hard=1.0):
    t = t_arr(0.45)
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.22)
    click = filt(rng.standard_normal(len(t)), "highpass", 2500) * np.exp(-t / 0.004) * 0.25
    return np.tanh((s + click) * 1.6 * hard) * 0.9


def clap():
    d = 0.3
    n = rng.standard_normal(int(d * SR))
    n = filt(n, "bandpass", [900, 4500])
    e = np.zeros(len(n))
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        e[i:] += np.exp(-np.arange(len(n) - i) / SR / (0.012 if k < 2 else 0.11))
    return n * e * 0.55


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    n = filt(rng.standard_normal(int(d * SR)), "highpass", 7000)
    return n * env(d, 0.001, 0.06 if open_ else 0.015) * 0.22


def note(freq, d, kind="saw", detune=0.0):
    t = t_arr(d)
    out = np.zeros(len(t))
    for dt in ([-detune, detune] if detune else [0]):
        f = freq * (1 + dt)
        ph = (t * f) % 1.0
        out += (2 * ph - 1) if kind == "saw" else np.sin(2 * np.pi * f * t)
    return out / (2 if detune else 1)


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- hook (0 - 7.8)
# store room tone
room = filt(rng.standard_normal(int(DROP * SR)), "lowpass", 900) * 0.025
hum = np.sin(2 * np.pi * 120 * t_arr(DROP)) * 0.006
add((room + hum) * np.minimum(1, t_arr(DROP) / 0.3), 0)
# card tap + terminal chirp, then decline tones at TAP + 0.3 s
TAP = 0.62
add(filt(rng.standard_normal(int(0.03 * SR)), "highpass", 3000) * env(0.03, 0.001, 0.006) * 0.4, TAP)
add(note(2093, 0.07, "sine") * env(0.07, 0.002, 0.05) * 0.18, TAP + 0.06)
for i, (f, d) in enumerate([(392, 0.16), (392, 0.16), (262, 0.42)]):
    s = np.sign(np.sin(2 * np.pi * f * t_arr(d))) * 0.5 + np.sin(2 * np.pi * f * t_arr(d)) * 0.5
    s = filt(s, "lowpass", 2500) * np.minimum(1, (d - t_arr(d)) / 0.02) * 0.16
    add(s, TAP + 0.33 + i * 0.2)
# dread drone from 2.0 (realisation) to the drop
dd = DROP - 1.6
t = t_arr(dd)
drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.4 * t)) * np.minimum(1, t / 1.0) * 0.16
add(drone, 1.6)
# heartbeat thumps
for k, at in enumerate(np.arange(1.65, DROP - 0.6, 0.85)):
    add(filt(kick(0.7), "lowpass", 180) * 0.55, at)
    add(filt(kick(0.5), "lowpass", 160) * 0.35, at + 0.22)
# whooshes into each memory flash and out
for at in [1.6, 2.4, 3.05, 3.7, 4.35, 5.3]:
    d = 0.42
    n = rng.standard_normal(int(d * SR))
    sweep = np.zeros(len(n))
    lo = filt(n, "bandpass", [300, 1200])
    hi = filt(n, "bandpass", [1500, 6000])
    k = np.linspace(0, 1, len(n))
    sweep = (lo * (1 - k) + hi * k) * np.sin(np.pi * k) ** 2 * 0.35
    add(sweep, at - 0.3, pan=0.3)
# riser into the drop
rd = 1.5
n = rng.standard_normal(int(rd * SR))
k = np.linspace(0, 1, len(n))
riser = (filt(n, "highpass", 1200) * k ** 2.5) * 0.3 + note(110, rd, "saw", 0.01) * k ** 3 * 0.05
add(riser, DROP - rd)

# ---------------------------------------------------------------- beat (7.8 - 26.0)
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
roots = [33, 29, 36, 31]
def addb(sig, at, gain=1.0, pan=0.0):
    """add() for the beat: nothing plays past the outro hit."""
    if at >= END_T - 0.01:
        return
    n = int((END_T - at) * SR)
    s = sig[:n].copy()
    tail = min(len(s), int(0.03 * SR))
    if tail:
        s[-tail:] *= np.linspace(1, 0, tail)
    add(s, at, gain, pan)


nbars = int(np.ceil((END_T - DROP) / BAR))
for b in range(nbars):
    t0 = DROP + b * BAR
    ch = chords[b % 4]
    # pad
    pad = sum(note(midi(m), BAR, "saw", 0.004) for m in ch) / 3
    pad = filt(pad, "lowpass", 1400 + 400 * (b % 2)) * np.minimum(1, t_arr(BAR) / 0.25) * np.minimum(1, (BAR - t_arr(BAR)) / 0.2) * 0.07
    addb(pad, t0, pan=-0.15)
    addb(pad, t0 + 0.012, pan=0.15)
    # sub bass: root on 1 and the "and" of 2
    for off, d in [(0, BEAT * 1.4), (BEAT * 1.5, BEAT * 0.5), (BEAT * 2.5, BEAT * 1.4)]:
        s = note(midi(roots[b % 4]), d, "sine") + 0.3 * note(midi(roots[b % 4] + 12), d, "sine")
        addb(s * env(d, 0.004, d * 0.8) * 0.32, t0 + off)
    # drums (half-time: kick 1 + 3&, clap on 3)
    addb(kick(1.15 if b == 0 else 1.0), t0)
    addb(kick(0.8), t0 + BEAT * 2.5)
    addb(kick(0.6), t0 + BEAT * 3.5) if b % 2 else None
    addb(clap(), t0 + BEAT * 2)
    for h in range(8):
        addb(hat(open_=(h == 7 and b % 2 == 1)), t0 + h * BEAT / 2 + (0.02 if h % 2 else 0), pan=0.25)
    # pluck arp on top
    for h, m in enumerate([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]):
        s = filt(note(midi(m), 0.3, "saw"), "lowpass", 3200) * env(0.3, 0.002, 0.09) * 0.045
        addb(s, t0 + h * BEAT + BEAT / 2, pan=-0.3 + 0.2 * h)
# transition whoosh into each scene cut
for c in CUTS:
    n = filt(rng.standard_normal(int(0.35 * SR)), "bandpass", [800, 7000])
    k = np.linspace(0, 1, len(n))
    add(n * k ** 2 * 0.18, c - 0.35, pan=-0.2)
# drop impact
imp = mixp(kick(1.4) * 1.1, filt(rng.standard_normal(int(0.8 * SR)), "lowpass", 6000) * env(0.8, 0.001, 0.25) * 0.25)
add(imp, DROP)
sub = note(55, 1.2, "sine") * env(1.2, 0.003, 0.6) * 0.5
add(sub, DROP)

# ---------------------------------------------------------------- outro (26.0 - 30)
END = END_T
add(mixp(kick(1.2), filt(rng.standard_normal(int(1.2 * SR)), "lowpass", 5000) * env(1.2, 0.001, 0.5) * 0.2), END)
final = sum(note(midi(m), 4.0, "saw", 0.005) for m in [57, 64, 69, 72]) / 4
final = filt(final, "lowpass", 1800) * np.minimum(1, t_arr(4.0) / 0.05) * np.exp(-t_arr(4.0) / 2.2) * 0.12
add(final, END, pan=-0.1)
add(final, END + 0.015, pan=0.1)
add(note(55, 3.5, "sine") * env(3.5, 0.003, 1.4) * 0.35, END)
# shimmer for the logo
for i, m in enumerate([81, 84, 88, 93]):
    add(note(midi(m), 1.2, "sine") * env(1.2, 0.003, 0.4) * 0.05, END + 0.3 + i * 0.09, pan=-0.4 + 0.25 * i)

# ---------------------------------------------------------------- master
mix = np.stack([L, R], axis=1)
fade = np.ones(N)
fade[int(29.3 * SR) :] = np.linspace(1, 0, N - int(29.3 * SR))
mix *= fade[:, None]
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write("music.wav", SR, (mix * 32767).astype(np.int16))
print("music.wav", DUR, "s")
