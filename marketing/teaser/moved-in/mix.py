import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 20.6; N = int(DUR * SR); rng = np.random.default_rng(9)
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
    i = int(t * SR); j = min(N, i + len(x))
    if 0 <= i < N: buf[i:j] += x[: j - i]
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR
    return (np.sign(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def tri(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR
    return ((2 / np.pi) * np.arcsin(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def noise_sweep(d, f0, f1, amp):
    L = int(d * SR); n = rng.uniform(-1, 1, L).astype(np.float32); out = np.zeros(L, np.float32)
    for k in range(0, L, 2400):
        f = f0 + (f1 - f0) * (k / L); out[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
    return out * np.sin(np.linspace(0, np.pi, L)) ** 2 * amp
put(voice, fade(vchain(rd("../build/aud/D.wav"))), 17.2)
voice /= np.abs(voice).max() + 1e-9
put(fx, tri(880, 0.15, 25, 0.06, 0.3), 0.05)                                   # title
put(fx, sq(523, 0.14, 20, 0.05, 0.9), 0.85)                                    # Ray peeks
for t, f in [(1.25, 392), (1.85, 440), (2.4, 494), (2.95, 523), (2.75, 587), (3.05, 349), (3.4, 659), (3.6, 698), (4.1, 330)]:
    put(fx, sq(f, 0.18, 16, 0.07, 0.7), t - 0.02)                              # boing on each landing
for t in [1.87, 2.42, 2.77, 2.97, 3.07, 3.42, 3.62]:                           # a card crumbles into pixels
    for k in range(10): put(fx, sq(rng.choice([1046, 1318, 1568, 1760, 2093]), 0.04, 80, 0.025), t + k * 0.025 + rng.uniform(0, 0.01))
    put(fx, noise_sweep(0.35, 3000, 900, 0.18), t)
put(fx, sq(1200, 0.03, 100, 0.12), 4.12); put(fx, sq(600, 0.03, 100, 0.10), 4.16) # the light switch
put(fx, noise_sweep(0.9, 1800, 300, 0.45), 4.1)                                # the night comes down
for i in range(6): put(fx, tri(500 + i * 110, 0.3, 8, 0.05, 1.2), 4.2 + i * 0.07)  # whee, they leap out
for i, f in enumerate([1568, 2093, 2637]): put(fx, tri(f, 0.4, 7, 0.05), 4.9 + i * 0.09)  # lights out sparkle
for i, f in enumerate([784, 988, 1175, 1568]): put(fx, tri(f, 0.6, 6, 0.06), 6.05 + i * 0.08)  # meet the skylings
for i in range(6): put(fx, sq([523, 587, 659, 698, 784, 880][i], 0.08, 30, 0.035), 7.9 + i * 0.09)  # six little ones
put(fx, noise_sweep(0.5, 400, 2400, 0.3), 9.45); put(fx, tri(660, 0.25, 12, 0.06, 0.5), 9.75)  # the card arrives
t = 11.2                                                                        # the wheel turning: ticks that slow down
while t < 13.3:
    put(fx, sq(2400, 0.012, 300, 0.05), t); t += 0.05 + (t - 11.2) * 0.05
for k in range(8): put(fx, sq(2000, 0.012, 300, 0.04), 13.45 + k * 0.08)        # back to now
put(fx, tri(988, 0.12, 25, 0.08), 14.2)                                          # tap
put(fx, noise_sweep(0.8, 600, 2600, 0.3), 14.25)                                 # it rolls out
for i, f in enumerate([659, 784, 988, 1318]): put(fx, tri(f, 0.5, 7, 0.05), 14.6 + i * 0.07)
t_ = tt(3.5); ch = sum(np.sin(2 * np.pi * f * t_) for f in (262, 330, 392, 523)) * 0.04 * np.minimum(1, t_ / 0.8) * np.minimum(1, (3.5 - t_) / 1.0)
put(fx, ch.astype(np.float32), 16.4)                                             # the sun comes up
for i, f in enumerate([1046, 1318, 1568, 2093]): put(fx, tri(f, 0.6, 6, 0.055), 16.9 + i * 0.08)
room = sosfilt(butter(2, [80, 900], "bandpass", fs=SR, output="sos"), rng.uniform(-1, 1, N)).astype(np.float32) * 0.004
mix = voice * 0.9 + fx + room
mix[int(20.2 * SR):] *= np.linspace(1, 0, N - int(20.2 * SR))
mix /= max(1.0, np.abs(mix).max() / 0.95)
wavfile.write("mix.wav", SR, (mix * 32767).astype(np.int16)); print("ok")
