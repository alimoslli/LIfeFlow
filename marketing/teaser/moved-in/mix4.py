import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000; DUR = 25.8; N = int(DUR * SR); rng = np.random.default_rng(9)
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
put(voice, fade(vchain(rd("../build/aud/D.wav"))), 22.4)
voice /= np.abs(voice).max() + 1e-9
put(fx, tri(880, 0.15, 25, 0.06, 0.3), 0.05)                                   # title
put(fx, sq(523, 0.14, 20, 0.05, 0.9), 0.85)                                    # Ray peeks
for t, f in [(1.25, 392), (1.85, 440), (2.4, 494), (2.95, 523), (2.75, 587), (3.05, 349), (3.4, 659), (3.6, 698), (4.1, 330)]:
    put(fx, sq(f, 0.18, 16, 0.07, 0.7), t - 0.02)                              # boing on each landing
for t in [1.87, 2.42, 2.77, 2.97, 3.07, 3.42, 3.62]:                           # a card crumbles into pixels
    for k in range(10): put(fx, sq(rng.choice([1046, 1318, 1568, 1760, 2093]), 0.04, 80, 0.025), t + k * 0.025 + rng.uniform(0, 0.01))
    put(fx, noise_sweep(0.35, 3000, 900, 0.18), t)
put(fx, noise_sweep(0.8, 2200, 500, 0.4), 3.75)                                # the real sky wipes down
for i in range(6): put(fx, sq(660 + i * 60, 0.06, 40, 0.03), 4.15 + i * 0.05)   # everyone hops to the row
t_ = tt(6.6); pad_ = sum(np.sin(2 * np.pi * f * t_) for f in (196, 247, 294)) * 0.03 * np.minimum(1, t_ / 0.8) * np.minimum(1, (6.6 - t_) / 0.8)
put(fx, pad_.astype(np.float32), 4.0)                                           # a soft bed under the day
for i, f in enumerate([523, 587, 659, 784, 880, 1046]):                         # each skyling's moment: a hop and a note
    a0 = 4.3 + i * 0.95
    put(fx, sq(f / 2, 0.16, 16, 0.06, 0.8), a0)
    put(fx, tri(f, 0.7, 5, 0.07), a0 + 0.3); put(fx, tri(f * 1.5, 0.6, 6, 0.035), a0 + 0.38)
for i, f in enumerate([1568, 2093, 2637]): put(fx, tri(f, 0.4, 7, 0.045), 8.8 + i * 0.09)    # six skylings
put(fx, noise_sweep(0.5, 400, 2400, 0.3), 10.25); put(fx, tri(660, 0.25, 12, 0.06, 0.5), 10.6)  # Today arrives
t = 12.0
while t < 13.9:
    put(fx, sq(2400, 0.012, 300, 0.05), t); t += 0.05 + (t - 12.0) * 0.05      # turning: ticks that slow down
for k in range(8): put(fx, sq(2000, 0.012, 300, 0.04), 14.05 + k * 0.08)        # back to now
put(fx, tri(988, 0.12, 25, 0.08), 14.8)                                          # tap
put(fx, noise_sweep(0.8, 600, 2600, 0.3), 14.85)                                 # the day opens
for i, f in enumerate([659, 784, 988, 1318]): put(fx, tri(f, 0.5, 7, 0.05), 15.2 + i * 0.07)
put(fx, noise_sweep(1.2, 1600, 500, 0.18), 16.25)                                # slide back
for k in range(6): put(fx, sq(rng.choice([1760, 2093, 2349]), 0.05, 60, 0.03), 17.2 + k * 0.12)  # what's done sparkles
put(fx, noise_sweep(1.0, 500, 1800, 0.2), 18.25)                                 # slide ahead
put(fx, noise_sweep(0.5, 800, 2600, 0.25), 20.2)                                 # flick to the week
t_ = tt(3.5); ch = sum(np.sin(2 * np.pi * f * t_) for f in (262, 330, 392, 523)) * 0.04 * np.minimum(1, t_ / 0.8) * np.minimum(1, (3.5 - t_) / 1.0)
put(fx, ch.astype(np.float32), 21.6)                                             # the sun comes up
for i, f in enumerate([1046, 1318, 1568, 2093]): put(fx, tri(f, 0.6, 6, 0.055), 22.1 + i * 0.08)
for k in range(8): put(fx, sq(rng.choice([1568, 1760, 2093]), 0.05, 60, 0.02), 22.4 + k * 0.2)
room = sosfilt(butter(2, [80, 900], "bandpass", fs=SR, output="sos"), rng.uniform(-1, 1, N)).astype(np.float32) * 0.004
mix = voice * 0.9 + fx + room
mix[int(25.5 * SR):] *= np.linspace(1, 0, N - int(25.5 * SR))
mix /= max(1.0, np.abs(mix).max() / 0.95)
wavfile.write("mix4.wav", SR, (mix * 32767).astype(np.int16)); print("ok")
