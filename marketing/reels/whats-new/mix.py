# Sound for "What's new in LifeFlow" v3: pixel sound effects on the timeline's own clock (taps from the capture logs),
# a soft bed, and the logo's ending sound. No voice, no music.
import json, re
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
TL = json.load(open("timeline.json")); SR = 48000; DUR = TL["end"]; N = int(DUR * SR); rng = np.random.default_rng(11)
fx = np.zeros(N, np.float32)
def put(x, t, a=1.0):
    i = int(t * SR); j = min(N, i + len(x))
    if 0 <= i < N: fx[i:j] += a * x[: j - i]
tt = lambda d: np.arange(int(d * SR)) / SR
def sq(f, d, decay, amp, bend=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d)) / SR; return (np.sign(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def tri(f, d, decay, amp, bend=0.0, vib=0.0):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f * (1 + bend * t / d) * (1 + vib * np.sin(2 * np.pi * 9 * t))) / SR
    return ((2 / np.pi) * np.arcsin(np.sin(ph)) * np.exp(-t * decay) * amp).astype(np.float32)
def sweep(d, f0, f1, amp):
    L = int(d * SR); n = rng.uniform(-1, 1, L).astype(np.float32); out = np.zeros(L, np.float32)
    for k in range(0, L, 2400):
        f = f0 + (f1 - f0) * (k / L); out[k:k + 2400] = sosfilt(butter(2, [f, f * 1.5], "bandpass", fs=SR, output="sos"), n[k:k + 2400])
    return out * np.sin(np.linspace(0, np.pi, L)) ** 2 * amp
def click(t): put(sweep(0.04, 3000, 6000, 0.45), t); put(sq(1568, 0.05, 60, 0.05), t)
def pad(t0, d, freqs, amp):
    t = tt(d); x = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs) * amp
    put((x * np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.5)).astype(np.float32), t0)
local = lambda src: "." + src[len("/whatsnew"):] if src.startswith("/whatsnew") else ".." + src
seg = {s["key"]: s for s in TL["segs"]}
def taps(s):
    try: log = json.load(open(local(s["src"]) + "/log.json"))
    except Exception: return []
    return [s["start"] + j / 30 for j, f in enumerate(s["frames"]) if (e := log["frames"][f - 1]) and re.match(r"^tap", e["tag"]) and not e["tag"].endswith("-after") and e.get("finger")]
# hook: two notes as the words land, the sun's rays
put(tri(880, 0.18, 20, 0.07, 0.3), 0.15); put(tri(1046, 0.2, 18, 0.07, 0.3), 0.72)
for k, f in enumerate([1318, 1568, 2093]): put(tri(f, 0.25, 14, 0.035), 0.55 + k * 0.09)
# between scenes: a soft whoosh; every caption: a tick
for s in TL["segs"][1:-1]: put(sweep(0.35, 3200, 1200, 0.16), s["start"] - 0.06)
for s in TL["segs"]:
    for c in s["caps"]: put(tri(1318, 0.08, 40, 0.03), s["start"] + c[0])
    for t in taps(s): click(t)
# the sky turns
put(sweep(1.6, 2600, 500, 0.24), seg["sky"]["start"] + 0.75)
# the skyling on Today: typing, the send, the answer lands, Do it, the block is added
a = seg["ask"]; fa = a["frames"]
def at(frame):  # first time a capture frame shows in the segment
    return a["start"] + fa.index(frame) / 30
for k in range(0, 34, 2): put(sq(2200 + (k % 3) * 180, 0.018, 120, 0.018), at(26) + k / 30)
put(sweep(0.45, 900, 2800, 0.18), at(72) + 0.03)
put(tri(988, 0.3, 9, 0.06), at(110)); put(tri(1318, 0.4, 8, 0.06), at(110) + 0.12)
for k, f in enumerate([784, 988, 1175, 1568]): put(tri(f, 0.3, 10, 0.055), at(143) + k * 0.06)
# the block on the line
put(sweep(0.6, 900, 3000, 0.18), at(151))
# tick it off: a pop and a little star chime
for t in taps(seg["tick"])[-1:]:
    put(tri(523, 0.16, 14, 0.09, 1.2), t + 0.02)
    for k, f in enumerate([1046, 1318, 1568, 2093]): put(sq(f, 0.09, 26, 0.03), t + 0.1 + k * 0.065)
    for k, f in enumerate([2637, 3136]): put(tri(f, 0.25, 12, 0.03), t + 0.42 + k * 0.08)
# tonight's stars: twinkles
n0 = seg["night"]["start"]
for k, f in enumerate([2093, 2637, 3136, 2349, 2794, 3520]): put(tri(f, 0.35, 9, 0.022), n0 + 0.15 + k * 0.28)
# the goal: the sun pops out, a bright chime, the squiggle
gl = seg["goal"]; tg = taps(gl)
for t in tg[-1:]:
    put(tri(392, 0.2, 10, 0.1, 1.6), t + 0.08); put(sweep(0.3, 800, 3500, 0.2), t + 0.05)
    for k, f in enumerate([784, 988, 1175, 1568, 1976, 2349]): put(tri(f, 0.35, 8, 0.055), t + 0.18 + k * 0.07)
    put(tri(660, 0.9, 3, 0.045, 0.0, 0.08), t + 0.7)
# money, school, more: the dock taps already click; the sheet rises
put(sweep(0.45, 700, 2400, 0.16), seg["more"]["start"] + 7 / 30)
# skylings and the pick
sk = seg["skylings"]
for i, f in enumerate([523, 587, 659, 784, 880, 988]): put(sq(f, 0.12, 20, 0.04, 0.5), sk["start"] + 0.4 + i * 0.12)
for t in taps(sk)[-1:]:
    for k, f in enumerate([784, 988, 1175, 1568, 2093]): put(tri(f, 0.3, 10, 0.06), t + 0.12 + k * 0.06)
# a soft bed under the app, darker for the night shot
pad(0.0, seg["tick"]["start"] + 0.3, (262, 330, 392), 0.011); pad(seg["tick"]["start"], n0 + 2.8 - seg["tick"]["start"], (220, 262, 330), 0.011); pad(seg["goal"]["start"] - 0.2, seg["end"]["start"] - seg["goal"]["start"] + 0.4, (262, 330, 392), 0.011)
# the ending (the logo's own sound)
sr, end = wavfile.read("../sting/outro.wav"); put(end.astype(np.float32) / 32768.0, seg["end"]["start"])
fx += sosfilt(butter(2, [200, 3000], "bandpass", fs=SR, output="sos"), rng.normal(0, 0.004, N)).astype(np.float32)
wavfile.write("mix.wav", SR, (np.clip(fx, -1, 1) * 32767).astype(np.int16)); print("ok", round(float(np.abs(fx).max()), 3), "taps", {k: [round(t, 2) for t in taps(s)] for k, s in seg.items() if taps(s)})
