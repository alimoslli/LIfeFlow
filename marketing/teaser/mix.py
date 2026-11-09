import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 22.0; N = int(DUR * SR)
rng = np.random.default_rng(3)
def rd(p):
    sr, x = wavfile.read(p); x = x.astype(np.float32) / 32768.0; return x
def fade(x, a=0.02, b=0.06):
    n1, n2 = int(a * SR), int(b * SR); x = x.copy()
    x[:n1] *= np.linspace(0, 1, n1); x[-n2:] *= np.linspace(1, 0, n2); return x
hp = butter(2, 90, "highpass", fs=SR, output="sos")
pres = butter(2, [2500, 6000], "bandpass", fs=SR, output="sos")
def voicechain(x):
    x = sosfilt(hp, x); x = x + 0.3 * sosfilt(pres, x)
    env = np.sqrt(np.convolve(x * x, np.ones(480) / 480, mode="same")) + 1e-6
    thr = 0.05; g = np.where(env > thr, (thr + (env - thr) / 3) / env, 1.0)
    return x * np.convolve(g, np.ones(240) / 240, mode="same")
voice = np.zeros(N, np.float32); fx = np.zeros(N, np.float32)
def put(buf, x, t):
    i = int(t * SR); j = min(N, i + len(x)); buf[i:j] += x[: j - i]
for name, t in [("A", 1.15), ("E", 2.90), ("B", 7.95), ("D", 14.56)]:
    put(voice, fade(voicechain(rd(f"aud/{name}.wav"))), t)
voice /= np.abs(voice).max() + 1e-9
tt = lambda d: np.arange(int(d * SR)) / SR
# glitch on the old logo (0.62 to 1.0): crackle and a buzz, cut hard at 1.0
g = np.zeros(int(0.38 * SR), np.float32)
for k in range(9):
    s = int(rng.uniform(0, 0.34) * SR); L = int(rng.uniform(0.01, 0.04) * SR)
    g[s:s + L] += rng.uniform(-1, 1, L).astype(np.float32) * rng.uniform(0.2, 0.6)
buzz = np.sign(np.sin(2 * np.pi * 110 * tt(0.38))) * 0.12 * np.linspace(0, 1, len(g)); g += buzz.astype(np.float32)
put(fx, g * 0.5, 0.62)
# whoosh into the TV (4.5 to 5.4): noise through a rising band
L = int(0.9 * SR); n = rng.uniform(-1, 1, L).astype(np.float32); out = np.zeros(L, np.float32)
for k in range(0, L, 2400):
    f = 300 + 3500 * (k / L) ** 2; sos = butter(2, [f, f * 1.6], "bandpass", fs=SR, output="sos")
    out[k:k + 2400] = sosfilt(sos, n[k:k + 2400])
out *= np.sin(np.linspace(0, np.pi, L)) ** 2; put(fx, out * 0.9, 4.5)
# low hum under the night (5.0 to 14.4)
d = 9.4; t_ = tt(d); hum = (np.sin(2 * np.pi * 55 * t_) + 0.5 * np.sin(2 * np.pi * 110.4 * t_) + 0.25 * np.sin(2 * np.pi * 164.8 * t_)) * 0.10
hum *= np.minimum(1, t_ / 1.2) * np.minimum(1, (d - t_) / 0.8); put(fx, hum.astype(np.float32), 5.0)
# glass tone when the old logo shows (6.15)
t_ = tt(1.6); gl = (np.sin(2 * np.pi * 880 * t_) + 0.5 * np.sin(2 * np.pi * 1320 * t_)) * np.exp(-t_ * 3) * 0.18; put(fx, gl.astype(np.float32), 6.15)
# the melt lands (7.6): a soft low thump
t_ = tt(0.8); th = np.sin(2 * np.pi * (70 - 30 * t_) * t_) * np.exp(-t_ * 6) * 0.5; put(fx, th.astype(np.float32), 7.6)
# star blips: tiny square-wave pips while the stars come out
for k in range(10):
    t0 = 7.9 + k * 0.42 + rng.uniform(0, 0.15); f = rng.choice([1568, 1760, 2093, 2349])
    t_ = tt(0.05); p = np.sign(np.sin(2 * np.pi * f * t_)) * np.exp(-t_ * 60) * 0.035; put(fx, p.astype(np.float32), t0)
# the sunrise (17.75 to 22): a warm swell, then the pixel chime with the words (19.95)
d = 4.25; t_ = tt(d); sw = sum(np.sin(2 * np.pi * f * t_) for f in (196, 246.9, 293.7, 392)) * 0.05
sw *= np.minimum(1, t_ / 2.0) * np.minimum(1, (d - t_) / 1.0); put(fx, sw.astype(np.float32), 17.75)
for k, f in enumerate((1046.5, 1318.5, 1568, 2093)):
    t_ = tt(0.5); p = np.sign(np.sin(2 * np.pi * f * t_)) * np.exp(-t_ * 9) * 0.06; put(fx, p.astype(np.float32), 19.95 + k * 0.07)
# room tone so silence never sounds dead
room = sosfilt(butter(2, [80, 900], "bandpass", fs=SR, output="sos"), rng.uniform(-1, 1, N)).astype(np.float32) * 0.006
mix = voice * 0.85 + fx + room
mix[int(21.3 * SR):] *= np.linspace(1, 0, N - int(21.3 * SR))
mix /= max(1.0, np.abs(mix).max() / 0.95)
wavfile.write("teaser_mix.wav", SR, (mix * 32767).astype(np.int16))
print("ok", N / SR)
