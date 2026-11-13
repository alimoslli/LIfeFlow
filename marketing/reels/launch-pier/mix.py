"""Sound for the launch video: Tyler's and Ali's real voices (cleaned), the kit's pixel sounds on the overlays,
a soft local pad under it all (placeholder; no generated music), and the logo ending's own sound."""
import subprocess, wave, numpy as np, os
HERE = os.path.dirname(os.path.abspath(__file__)); L = os.path.dirname(HERE); SP = os.path.dirname(L)
SR = 48000; DUR = 36.4; N = int(SR * DUR)
def load(path, filt=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-af", filt] if filt else []) + ["-ac", "2", "-ar", str(SR), "-f", "s16le", "-"]
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.int16).reshape(-1, 2) / 32768.
    return a.astype(np.float32)
def db(x): return 10 ** (x / 20)
mix_v = np.zeros((N, 2), np.float32); mix_fx = np.zeros((N, 2), np.float32)
def put(buf, a, t, g=0., fade_in=0.004, fade_out=0.004):
    a = a.copy() * db(g); n = len(a); fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi: a[:fi] *= np.linspace(0, 1, fi)[:, None]
    if fo: a[-fo:] *= np.linspace(1, 0, fo)[:, None]
    i = int(round(t * SR)); j = min(N, i + n)
    if j > i: buf[i:j] += a[: j - i]
VOICE = "highpass=f=85,afftdn=nr=10:nf=-42,equalizer=f=3200:t=q:w=1.2:g=2,acompressor=threshold=-24dB:ratio=2.6:attack=6:release=140:makeup=2,loudnorm=I=-16:TP=-2:LRA=8"
ty = load(f"{HERE}/raw_4105.wav", VOICE); al = load(f"{HERE}/raw_4127.wav", VOICE)
s = lambda a, t0, t1: a[int(t0 * SR): int(t1 * SR)]
put(mix_v, s(ty, 0, 11.70), 0.0, 0, 0.002, 0.12)
put(mix_v, s(al, 1.9, 16.9), 11.7333, 0, 0.12, 0.03)
put(mix_v, s(al, 18.1333, 22.4), 26.7333, 0, 0.03, 0.05)
# the slow-motion tail: the pier's own sound, slowed and fading
tail = load(f"{HERE}/raw_4127.wav", "atrim=22.35:23.16,asetpts=PTS-STARTPTS,atempo=0.5,atempo=0.8,highpass=f=85,afftdn=nr=10:nf=-42")
put(mix_v, tail[: int(1.9 * SR)], 31.0, -6, 0.05, 0.6)
FX = {n: load(f"{SP}/editorpack/sfx/{n}.wav") for n in ["skylings_pop_up", "added_to_your_day", "answer_lands", "send", "sky_turns", "tap",
      "star_tick_it_off", "sun_goal_reached", "whoosh_scene_change", "night_stars_twinkle"]}
pop = FX["skylings_pop_up"][: int(0.11 * SR)]
A1 = lambda t: 11.7333 + t - 1.9; A2 = lambda t: 26.7333 + t - 18.1333
cues = [(pop, -0.12, -3), (FX["night_stars_twinkle"], 0.05, -14),                     # Dreamy pops into Tyler's sky
        (FX["answer_lands"], 1.52, -8), (FX["added_to_your_day"], 3.92, -10),           # name, logo
        (FX["sun_goal_reached"], 9.0, -6),                                               # Early January 2027
        (FX["whoosh_scene_change"], 11.3, -2), (FX["whoosh_scene_change"], 11.62, -7),    # the whip
        (FX["answer_lands"], A1(3.3), -8),                                               # Ali's name
        (FX["skylings_pop_up"], A1(6.62), -3),                                           # the five skylings
        (FX["whoosh_scene_change"], A1(8.5), -12), (FX["send"], A1(8.62), -6),            # into the phone, phone in
        (FX["sky_turns"], A1(9.62), -11)]
cues += [(FX["added_to_your_day"], A1(t - 0.12), -7) for t in [13.36, 14.04, 14.82, 16.46]]   # the details
cues += [(FX["whoosh_scene_change"], A2(18.2), -12), (FX["night_stars_twinkle"], A2(19.9), -9), (FX["star_tick_it_off"], A2(20.34), -9)]
cues += [(FX["tap"], A2(t), -6) for t in [21.7, 21.82, 21.94, 22.06, 22.18]]                 # "all day": five skylings
cues += [(FX["skylings_pop_up"], 31.0, -6), (FX["whoosh_scene_change"], 32.62, -9)]
for a, t, g in cues: put(mix_fx, a, max(0, t), g)
end = load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"); put(mix_fx, end, 32.9, -2, 0.01, 0.2)
# a soft pad (placeholder bed): D major, slow chords, 10 dB under the voices, ducked while someone talks
t = np.arange(N) / SR; pad = np.zeros(N, np.float32)
chords = [(0, [146.83, 220.0, 293.66, 369.99]), (6, [123.47, 185.0, 246.94, 293.66]), (11.73, [146.83, 220.0, 293.66, 369.99]),
          (16.4, [196.0, 246.94, 293.66, 392.0]), (21.0, [164.81, 246.94, 329.63, 415.3]), (26.7, [123.47, 185.0, 246.94, 369.99]),
          (31.0, [146.83, 220.0, 293.66, 440.0]), (36.4, [])]
for (t0, fr), (t1, _) in zip(chords[:-1], chords[1:]):
    i0, i1 = int(t0 * SR), int(min(t1 + 0.6, DUR) * SR); tt = t[i0:i1] - t0
    env = np.minimum(1, tt / 0.9) * np.clip((t1 + 0.6 - t0 - tt) / 0.9, 0, 1)
    for k, f in enumerate(fr):
        for det in (-0.12, 0.12):
            pad[i0:i1] += (np.sin(2 * np.pi * (f + det) * tt + k) * 0.5 + 0.12 * np.sin(4 * np.pi * (f + det) * tt)) * env / len(fr)
# a gentle pluck on each overlay beat
for tp, f in [(0, 587.33), (9.0, 739.99), (A1(6.62), 880.0), (A1(13.24), 739.99), (A1(13.92), 659.25), (A1(14.70), 587.33), (A1(16.34), 739.99), (A2(20.34), 880.0), (31.0, 1174.66)]:
    i0 = int(tp * SR); n = int(1.2 * SR); tt = np.arange(n) / SR
    if i0 + n < N: pad[i0:i0 + n] += 0.35 * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 4)
voice_env = np.convolve(np.abs(mix_v[:, 0]), np.ones(4800) / 4800, mode="same"); duck = 1 - 0.55 * np.clip(voice_env / 0.04, 0, 1)
bed = np.stack([pad, pad], 1) * duck[:, None] * db(-25)
bed[int(32.9 * SR):] *= np.linspace(1, 0, N - int(32.9 * SR))[:, None] ** 2       # the ending's own sound takes over
out = mix_v + mix_fx + bed
peak = np.abs(out).max(); print("peak", round(float(peak), 3))
with wave.open(f"{L}/launch_mix_pre.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{L}/launch_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{L}/launch_mix.wav"], check=True)
print("mix done")
