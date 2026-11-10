# Sound for "Your day, drawn as the sky" (full screen): pixel sound effects and a soft bed; no voice, no music.
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 36.1; N = int(DUR * SR); rng = np.random.default_rng(8)
fx = np.zeros(N, np.float32)
def put(x, t, a=1.0):
    i = int(t * SR); j = min(N, i + len(x))
    if 0 <= i < N: fx[i:j] += a * x[: j - i]
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR; return (np.sign(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def tri(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR; return ((2 / np.pi) * np.arcsin(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def sweep(d, f0, f1, amp):
    L = int(d * SR); n = rng.uniform(-1, 1, L).astype(np.float32); out = np.zeros(L, np.float32)
    for k in range(0, L, 2400):
        f = f0 + (f1 - f0) * (k / L); out[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
    return out * np.sin(np.linspace(0, np.pi, L)) ** 2 * amp
def click(t): put(sweep(0.04, 3000, 6000, 0.45), t); put(sq(1568, 0.05, 60, 0.05), t)
def pad(t0, d, freqs, amp):
    t = tt(d); x = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs) * amp
    put((x * np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.5)).astype(np.float32), t0)
# hook
put(tri(880, 0.18, 20, 0.07, 0.3), 0.1); put(tri(1046, 0.2, 18, 0.07, 0.3), 0.4); put(sweep(0.6, 3000, 800, 0.2), 2.4)
# the five labels
for i, t in enumerate([2.9, 4.5, 6.1, 7.7, 9.3]): put(tri([659, 740, 784, 880, 988][i], 0.22, 16, 0.07, 0.25), t)
# turn it, back to now
put(sweep(1.7, 2600, 500, 0.28), 10.85); put(tri(392, 0.6, 4, 0.04), 12.6); put(tri(330, 0.6, 4, 0.03), 12.75)
click(14.3); put(sweep(0.9, 600, 2600, 0.22), 14.35)
# open the day, slide back, glide ahead
click(15.53); put(sweep(0.6, 900, 3200, 0.25), 15.56)
put(sweep(1.4, 2200, 700, 0.18), 17.25); put(sweep(1.0, 700, 2200, 0.18), 20.1); put(sweep(0.35, 3500, 1200, 0.3), 21.9)
for k, f in enumerate([1046, 1175, 1318]): put(sq(f, 0.05, 50, 0.025), 22.4 + k * 0.06)
# captions
for t in [10.8, 14.25, 15.5, 17.2, 20.1, 22.4]: put(tri(1318, 0.08, 40, 0.035), t)
# it notices
put(sweep(0.4, 3000, 900, 0.2), 24.1); put(tri(988, 0.35, 8, 0.07), 24.45); put(tri(1318, 0.45, 7, 0.07), 24.6)
# the skylings and the pick
put(sweep(0.5, 900, 3000, 0.22), 26.85)
for i, f in enumerate([523, 587, 659, 784, 880, 988]): put(sq(f, 0.12, 20, 0.04, 0.5), 27.4 + i * 0.12)
click(29.5)
for k, f in enumerate([784, 988, 1175, 1568, 2093]): put(tri(f, 0.3, 10, 0.06), 29.62 + k * 0.06)
# bed under the day (darker while it's night)
pad(0.0, 11.4, (262, 330, 392), 0.011); pad(11.0, 3.6, (220, 262, 330), 0.011); pad(14.2, 18.6, (262, 330, 392), 0.011)
# the ending (the logo's own sound)
sr, end = wavfile.read("../sting/outro.wav"); put(end.astype(np.float32) / 32768.0, 32.6)
fx += sosfilt(butter(2, [200, 3000], "bandpass", fs=SR, output="sos"), rng.normal(0, 0.004, N)).astype(np.float32)
wavfile.write("mix_full.wav", SR, (np.clip(fx, -1, 1) * 32767).astype(np.int16)); print("ok", float(np.abs(fx).max()))
