# LifeFlow's pixel sound effects, made in code the same way the reels' sound is (mix.py): one WAV each.
import sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
OUT = sys.argv[1]; SR = 48000; rng = np.random.default_rng(11)
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR; return np.sign(np.sin(ph)) * np.exp(-t * decay) * amp
def tri(f, d, decay, amp, bend=0.0, vib=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d) * (1 + vib * np.sin(2 * np.pi * 9 * t))) / SR
    return (2 / np.pi) * np.arcsin(np.sin(ph)) * np.exp(-t * decay) * amp
def sweep(d, f0, f1, amp):
    L = int(d * SR); n = rng.uniform(-1, 1, L); out = np.zeros(L)
    for k in range(0, L, 2400):
        f = f0 + (f1 - f0) * (k / L); out[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
    return out * np.sin(np.linspace(0, np.pi, L)) ** 2 * amp
def mk(dur, parts, name):
    x = np.zeros(int(dur * SR))
    for sig, t in parts:
        i = int(t * SR); j = min(len(x), i + len(sig)); x[i:j] += sig[: j - i]
    x = x / max(1e-6, np.abs(x).max()) * 0.7
    wavfile.write(f"{OUT}/{name}.wav", SR, (np.stack([x, x], 1) * 32767).astype(np.int16)); print(name)
mk(0.15, [(sweep(0.04, 3000, 6000, 0.45), 0), (sq(1568, 0.05, 60, 0.05), 0)], "tap")
mk(1.0, [(tri(523, 0.16, 14, 0.09, 1.2), 0.02)] + [(sq(f, 0.09, 26, 0.03), 0.1 + k * 0.065) for k, f in enumerate([1046, 1318, 1568, 2093])] + [(tri(f, 0.25, 12, 0.03), 0.42 + k * 0.08) for k, f in enumerate([2637, 3136])], "star_tick_it_off")
mk(0.7, [(tri(988, 0.3, 9, 0.06), 0), (tri(1318, 0.4, 8, 0.06), 0.12)], "answer_lands")
mk(0.8, [(tri(f, 0.3, 10, 0.055), k * 0.06) for k, f in enumerate([784, 988, 1175, 1568])], "added_to_your_day")
mk(1.8, [(tri(392, 0.2, 10, 0.1, 1.6), 0.08), (sweep(0.3, 800, 3500, 0.2), 0.05)] + [(tri(f, 0.35, 8, 0.055), 0.18 + k * 0.07) for k, f in enumerate([784, 988, 1175, 1568, 1976, 2349])] + [(tri(660, 0.9, 3, 0.045, 0.0, 0.08), 0.7)], "sun_goal_reached")
mk(2.0, [(tri(f, 0.35, 9, 0.022), 0.15 + k * 0.28) for k, f in enumerate([2093, 2637, 3136, 2349, 2794, 3520])], "night_stars_twinkle")
mk(0.45, [(sweep(0.35, 3200, 1200, 0.16), 0)], "whoosh_scene_change")
mk(1.7, [(sweep(1.6, 2600, 500, 0.24), 0)], "sky_turns")
mk(0.5, [(sweep(0.45, 900, 2800, 0.18), 0)], "send")
mk(0.6, [(sq(2200 + (k % 3) * 180, 0.018, 120, 0.018), k / 30) for k in range(0, 16, 2)], "typing")
mk(1.0, [(sq(f, 0.12, 20, 0.04, 0.5), i * 0.12) for i, f in enumerate([523, 587, 659, 784, 880, 988])], "skylings_pop_up")
