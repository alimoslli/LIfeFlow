import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 23.4; N = int(DUR * SR)
rng = np.random.default_rng(5)
A = "../build/aud/"
def rd(p): sr, x = wavfile.read(p); return x.astype(np.float32) / 32768.0
def fade(x, a=0.02, b=0.06):
    n1, n2 = int(a * SR), int(b * SR); x = x.copy(); x[:n1] *= np.linspace(0, 1, n1); x[-n2:] *= np.linspace(1, 0, n2); return x
hp = butter(2, 90, "highpass", fs=SR, output="sos"); pres = butter(2, [2500, 6000], "bandpass", fs=SR, output="sos")
def vchain(x):
    x = sosfilt(hp, x); x = x + 0.3 * sosfilt(pres, x)
    env = np.sqrt(np.convolve(x * x, np.ones(480) / 480, mode="same")) + 1e-6
    g = np.where(env > 0.05, (0.05 + (env - 0.05) / 3) / env, 1.0); return x * np.convolve(g, np.ones(240) / 240, mode="same")
voice = np.zeros(N, np.float32); fx = np.zeros(N, np.float32)
def put(buf, x, t):
    i = int(t * SR); j = min(N, i + len(x));
    if i < N: buf[i:j] += x[: j - i]
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):      # a square-wave blip, optional pitch bend
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR
    return (np.sign(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def tri(f, d, decay, amp):
    t = tt(d); return ((2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f * t)) * np.exp(-t * decay) * amp).astype(np.float32)
for name, t in [("A", 0.6), ("D", 17.01)]:
    put(voice, fade(vchain(rd(A + name + ".wav"))), t)
voice /= np.abs(voice).max() + 1e-9
# title pop
put(fx, sq(660, 0.12, 30, 0.08, 0.5), 0.15)
# the old logo breaks into stars: a sparkle of tiny blips, and a soft whoosh with the wipe
for k in range(26):
    put(fx, sq(rng.choice([1568, 1760, 2093, 2349, 2637]), 0.05, 70, 0.03), 1.55 + k * 0.045 + rng.uniform(0, 0.02))
L = int(0.9 * SR); n = rng.uniform(-1, 1, L).astype(np.float32); w = np.zeros(L, np.float32)
for k in range(0, L, 2400):
    f = 2400 - 1900 * (k / L); w[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
put(fx, w * np.sin(np.linspace(0, np.pi, L)) ** 2 * 0.5, 1.45)
# the pieces of a day land: little thuds
for i in range(8):
    put(fx, tri(rng.choice([220, 247, 262, 294]), 0.15, 25, 0.22), 2.6 + i * 0.12 + 0.45)
# they fly into one sky: a rising run of pips
for i, f in enumerate([523, 587, 659, 784, 880, 988, 1047, 1175]):
    put(fx, sq(f, 0.09, 35, 0.045), 6.15 + i * 0.065 + 0.5)
# the hills rise: a low warm swell
t_ = tt(2.0); sw = (np.sin(2 * np.pi * 98 * t_) + 0.6 * np.sin(2 * np.pi * 147 * t_)) * 0.07 * np.sin(np.linspace(0, np.pi, len(t_))); put(fx, sw.astype(np.float32), 7.0)
# each skyling pops in: a cute boing
for i in range(6):
    put(fx, sq([392, 440, 494, 523, 587, 659][i], 0.16, 18, 0.07, 0.8), 9.65 + i * 0.32)
# the sun and the new name: a warm chord and a chime
t_ = tt(3.0); ch = sum(np.sin(2 * np.pi * f * t_) for f in (262, 330, 392, 523)) * 0.045 * np.minimum(1, t_ / 0.8) * np.minimum(1, (3.0 - t_) / 0.8); put(fx, ch.astype(np.float32), 13.4)
for i, f in enumerate([1047, 1319, 1568, 2093]): put(fx, tri(f, 0.6, 6, 0.06), 14.1 + i * 0.08)
# celebrate twinkles while the cast cheers
for k in range(8): put(fx, sq(rng.choice([1760, 2093, 2349]), 0.05, 60, 0.025), 14.3 + k * 0.28)
# into Ali's window and out to the ending
put(fx, w[: int(0.6 * SR)] * np.sin(np.linspace(0, np.pi, int(0.6 * SR))) ** 2 * 0.35, 16.6)
for i, f in enumerate([784, 988, 1175, 1568]): put(fx, tri(f, 0.7, 5, 0.07), 20.45 + i * 0.09)
for k in range(10): put(fx, sq(rng.choice([1568, 1760, 2093]), 0.05, 60, 0.022), 20.6 + k * 0.22)
room = sosfilt(butter(2, [80, 900], "bandpass", fs=SR, output="sos"), rng.uniform(-1, 1, N)).astype(np.float32) * 0.004
mix = voice * 0.9 + fx + room
mix[int(23.0 * SR):] *= np.linspace(1, 0, N - int(23.0 * SR))
mix /= max(1.0, np.abs(mix).max() / 0.95)
wavfile.write("story_mix.wav", SR, (mix * 32767).astype(np.int16)); print("ok")
