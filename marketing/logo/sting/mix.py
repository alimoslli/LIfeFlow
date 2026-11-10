import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; rng = np.random.default_rng(3)
tt = lambda d: np.arange(int(d * SR)) / SR
def tri(f, d, decay, amp): t = tt(d); return ((2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f * t)) * np.exp(-t * decay) * amp).astype(np.float32)
def sq(f, d, decay, amp): t = tt(d); return (np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t * decay) * amp).astype(np.float32)
def make(dur, name, words_at):
    N = int(dur * SR); fx = np.zeros(N, np.float32)
    def put(x, t):
        i = int(t * SR); j = min(N, i + len(x))
        if 0 <= i < N: fx[i:j] += x[: j - i]
    put((np.sin(2 * np.pi * 58 * tt(0.6)) * np.exp(-tt(0.6) * 7) * 0.45).astype(np.float32), 0.05)
    for k, f in enumerate([523, 659, 784, 1046, 1318]): put(tri(f, 0.7, 5, 0.06), 0.1 + k * 0.07)
    for k in range(8): put(sq(rng.choice([1568, 1760, 2093, 2349]), 0.05, 60, 0.02), words_at + k * 0.035)
    t = tt(dur); pad = sum(np.sin(2 * np.pi * f * t) for f in (262, 330, 392, 523)) * 0.012 * np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.5)
    fx += pad.astype(np.float32)
    fx += sosfilt(butter(2, [200, 3000], "bandpass", fs=SR, output="sos"), rng.normal(0, 0.004, N)).astype(np.float32)
    wavfile.write(name, SR, (np.clip(fx, -1, 1) * 32767).astype(np.int16))
make(3.0, "intro.wav", 0.55); make(3.5, "outro.wav", 0.6)
