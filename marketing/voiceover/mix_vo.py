"""Places a one-take voiceover on the video's beats, cutting only inside real silences, and mixes it over the music.
Usage: python3 mix_vo2.py vo.wav music.wav out.wav
Phrases are the speech regions between silences (energy below -32 dB of speech for at least 0.18 s). Each line is a run of
phrases; pauses inside a line longer than CAP are shortened by removing their silent middle. The music dips under the voice."""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
_, vo = wavfile.read(sys.argv[1]); vo = vo.astype(np.float32) / 32768.0
_, mu = wavfile.read(sys.argv[2]); mu = mu.astype(np.float32) / 32768.0
OUT = sys.argv[3]; N = len(mu)
CAP = 0.30

hop = 480; n = len(vo) // hop
rms = np.array([np.sqrt(np.mean(vo[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
ref = np.median(rms[rms > np.percentile(rms, 40)])
sil = 20 * np.log10(rms / ref + 1e-9) < -32
phr, i = [], 0
start = None
runs = []
while i < n:
    if sil[i]:
        j = i
        while j < n and sil[j]: j += 1
        if (j - i) * hop / SR >= 0.18: runs.append((i * hop / SR, j * hop / SR))
        i = j
    else: i += 1
edges = [0.0] + [x for r in runs for x in r] + [len(vo) / SR]
phrases = [(edges[k], edges[k + 1]) for k in range(0, len(edges), 2) if edges[k + 1] - edges[k] > 0.05]
print(len(phrases), "phrases")
assert len(phrases) == 23, phrases

# (phrase indexes, where the line starts in the video)
LINES = [([0, 1], 0.08), ([2, 3], 3.12), ([4, 5], 6.32), ([6, 7, 8], 8.40), ([9], 14.62), ([10, 11, 12], 17.05),
         ([13, 14, 15], 20.14), ([16, 17], 23.76), ([18, 19], 26.35), ([20, 21, 22], 30.35)]
PRE, POST = 0.03, 0.10

def cut(a, b): return vo[max(0, int(a * SR)): int(b * SR)].copy()
def fade(x, n=int(0.01 * SR)):
    n = min(n, len(x) // 2); w = np.linspace(0, 1, n); x[:n] *= w; x[-n:] *= w[::-1]; return x

hp = butter(2, 85, "highpass", fs=SR, output="sos")
pres = butter(2, [2500, 6000], "bandpass", fs=SR, output="sos")
def chain(x):
    x = sosfilt(hp, x); x = x + 0.35 * sosfilt(pres, x)
    env = np.sqrt(np.convolve(x * x, np.ones(480) / 480, mode="same")) + 1e-6
    thr = 0.08; g = np.where(env > thr, (thr + (env - thr) / 3.0) / env, 1.0)
    return x * np.convolve(g, np.ones(240) / 240, mode="same")

voice = np.zeros(N, dtype=np.float32); speak = np.zeros(N, dtype=np.float32); placed = []
for idx, at in LINES:
    ps = [phrases[k] for k in idx]
    parts = []
    for k, (a, b) in enumerate(ps):
        a0 = a - PRE if k == 0 else a - min(CAP, a - ps[k - 1][1]) / 2
        b0 = b + POST if k == len(ps) - 1 else b + min(CAP, ps[k + 1][0] - b) / 2
        parts.append(cut(a0, b0))
    line = fade(np.concatenate(parts))
    i0 = int(at * SR); j0 = min(N, i0 + len(line))
    assert not speak[i0:j0].any(), f"overlap at {at}"
    voice[i0:j0] += line[: j0 - i0]; speak[i0:j0] = 1.0
    placed.append((at, round(at + len(line) / SR, 2)))
voice = chain(voice)
target = np.where(speak > 0, 0.30, 0.62).astype(np.float32)
look = int(0.12 * SR); tl = np.concatenate([target[look:], np.full(look, target[-1])])
env = np.empty_like(tl); e = tl[0]
a_up = 1 - np.exp(-1 / (0.35 * SR)); a_dn = 1 - np.exp(-1 / (0.15 * SR))
for k in range(N):
    t = tl[k]; e += (t - e) * (a_dn if t < e else a_up); env[k] = e
mus = mu * env[:, None]
vr = np.sqrt(np.mean(voice[speak > 0] ** 2)); mr = np.sqrt(np.mean(mus[speak > 0] ** 2))
voice *= (mr * 10 ** (11 / 20)) / vr
mix = mus + voice[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
wavfile.write(OUT, SR, (mix * 32767).astype(np.int16))
wavfile.write(OUT.replace(".wav", "_voice.wav"), SR, (voice / max(1e-6, np.abs(voice).max()) * 0.9 * 32767).astype(np.int16))
print("lines (start, end):", placed)
