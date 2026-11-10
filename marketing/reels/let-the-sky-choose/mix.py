# Sound for "Let the sky choose": pixel sound effects only (no voice, no music; Ali adds music if he wants).
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 17.6; N = int(DUR * SR); rng = np.random.default_rng(5)
fx = np.zeros(N, np.float32)
def put(x, t, amp=1.0):
    i = int(t * SR); j = min(N, i + len(x))
    if 0 <= i < N: fx[i:j] += amp * x[: j - i]
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR
    return (np.sign(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def tri(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR
    return ((2 / np.pi) * np.arcsin(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def sweep(d, f0, f1, amp):
    L = int(d * SR); n = rng.uniform(-1, 1, L).astype(np.float32); out = np.zeros(L, np.float32)
    for k in range(0, L, 2400):
        f = f0 + (f1 - f0) * (k / L); out[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
    return out * np.sin(np.linspace(0, np.pi, L)) ** 2 * amp
def pad(t0, d, freqs, amp):
    t = tt(d); x = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs) * amp
    x *= np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4); put(x.astype(np.float32), t0)

# 1. hook
put(tri(880, 0.16, 22, 0.07, 0.3), 0.12); put(tri(988, 0.16, 22, 0.07, 0.3), 0.42)
for i, f in enumerate([392, 440, 494, 523, 587, 659]): put(sq(f, 0.18, 16, 0.06, 0.7), 0.75 + i * 0.12)   # the six hop
pad(0.0, 2.2, (262, 330, 392), 0.012)
# 2. Settings
put(sweep(0.45, 900, 3200, 0.25), 1.75)
put(sweep(0.05, 3000, 6000, 0.5), 2.8); put(sq(1568, 0.05, 60, 0.05), 2.8)                               # the tap
for k, f in enumerate([784, 988, 1175, 1568]): put(tri(f, 0.25, 12, 0.07), 2.92 + k * 0.06)              # it's on
put(tri(1046, 0.18, 18, 0.06, 0.2), 3.15)
pad(2.0, 2.9, (262, 330, 392), 0.012)
# 3. the day: a swoosh and a note for each skyling, the bed darkens at night
NOTES = [523, 587, 659, 784, 698, 440]
for i, f in enumerate(NOTES):
    s = 4.8 + i * 1.5
    put(sweep(0.32, 2400, 700, 0.2), s - 0.3)
    put(sq(f, 0.2, 12, 0.055, 0.5), s - 0.02); put(tri(f * 2, 0.3, 10, 0.03), s + 0.04)
    for k in range(3): put(sq(f * 2 + 200 * k, 0.04, 60, 0.02), s + 0.12 + k * 0.05)
put(tri(988, 0.16, 22, 0.06, 0.3), 4.7)
pad(4.8, 6.1, (262, 330, 392), 0.012); pad(10.7, 3.2, (220, 262, 330), 0.012)
# 4. the end: build, hit, the logo, the words
L = int(0.55 * SR); t = np.arange(L) / SR
riser = (np.sin(2 * np.pi * np.cumsum(300 + 900 * (t / 0.55) ** 2) / SR) * (t / 0.55) ** 2 * 0.06).astype(np.float32)
put(riser, 13.25); put(sweep(0.55, 600, 4500, 0.3), 13.25)
thump = (np.sin(2 * np.pi * 58 * tt(0.6)) * np.exp(-tt(0.6) * 7) * 0.5).astype(np.float32); put(thump, 13.82); put(sweep(0.25, 4000, 1500, 0.3), 13.82)
for k, f in enumerate([523, 659, 784, 1046, 1318]): put(tri(f, 0.6, 5, 0.06), 13.9 + k * 0.07)
for k in range(10): put(sq(rng.choice([1568, 1760, 2093, 2349, 2637]), 0.05, 60, 0.025), 14.5 + k * 0.035)
put(tri(784, 0.3, 9, 0.05), 15.05)
pad(13.9, 3.7, (262, 330, 392, 523), 0.014)
room = sosfilt(butter(2, [200, 3000], "bandpass", fs=SR, output="sos"), rng.normal(0, 0.004, N)).astype(np.float32)
mix = fx + room
mix *= np.minimum(1, (DUR - np.arange(N) / SR) / 0.4)
wavfile.write("mix.wav", SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
print("ok", float(np.abs(mix).max()))
