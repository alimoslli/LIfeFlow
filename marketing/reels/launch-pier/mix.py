"""Sound for the launch video: Tyler's and Ali's real voices (cleaned), the kit's pixel sounds on the overlays,
the score (ElevenLabs Music via Higgsfield, owner approved), and the logo ending's own sound."""
import subprocess, wave, numpy as np, os
HERE = os.path.dirname(os.path.abspath(__file__)); L = os.path.dirname(HERE); SP = os.path.dirname(L)
SR = 48000; DUR = 1078 / 30; N = int(SR * DUR)
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
ty = load(f"{HERE}/raw_4105.wav", VOICE); al = load(f"{HERE}/raw_4127.wav", VOICE); al2 = load(f"{HERE}/raw_4126.wav", VOICE)
s = lambda a, t0, t1: a[int(t0 * SR): int(t1 * SR)]
O_A1, O_A2, O_C, O_SL, O_END = 352 / 30, 808 / 30, 895 / 30, 951 / 30, 973 / 30
A1 = lambda t: O_A1 + t - 1.9; A2 = lambda t: O_A2 + t - 19.5; C = lambda t: O_C + t - 21.9667
put(mix_v, s(ty, 0, 11.70), 0.0, 0, 0.002, 0.12)
put(mix_v, s(al, 1.9, 17.11), O_A1, 0, 0.12, 0.015)                    # "...and all your finances" (kept whole)
put(mix_v, s(al, 19.5, 22.4), O_A2, 0, 0.02, 0.05)                    # "with a very smart skyling by your side all day."
put(mix_v, s(al2, 21.9667, 23.8333), O_C, 0, 0.02, 0.03)              # IMG_4126: "Be ready by January, 2027."
tail = load(f"{HERE}/raw_4126.wav", "atrim=23.8333:24.0,asetpts=PTS-STARTPTS,atempo=0.5,atempo=0.5,highpass=f=85,afftdn=nr=10:nf=-42")
put(mix_v, tail, O_SL, -6, 0.03, 0.3)
FX = {n: load(f"{SP}/editorpack/sfx/{n}.wav") for n in ["skylings_pop_up", "added_to_your_day", "answer_lands", "send", "sky_turns", "tap",
      "star_tick_it_off", "sun_goal_reached", "whoosh_scene_change", "night_stars_twinkle"]}
pop = FX["skylings_pop_up"][: int(0.11 * SR)]
cues = [(pop, -0.12, -3), (FX["night_stars_twinkle"], 0.05, -14),                     # Dreamy pops into Tyler's sky
        (FX["answer_lands"], 1.52, -8), (FX["added_to_your_day"], 3.92, -10),           # name, logo
        (FX["sun_goal_reached"], 9.0, -6),                                               # Early January 2027
        (FX["whoosh_scene_change"], 11.3, -2), (FX["whoosh_scene_change"], 11.62, -7),    # the whip
        (FX["answer_lands"], A1(3.3), -8),                                               # Ali's name
        (FX["skylings_pop_up"], A1(6.62), -3),                                           # the five skylings
        (FX["whoosh_scene_change"], A1(8.2), -10), (FX["send"], A1(8.42), -7),            # they hop into the wheel as it rises
        (FX["sky_turns"], A1(9.0), -8), (FX["sky_turns"], A1(10.5), -11),                # the wheel turns through the day
        (FX["whoosh_scene_change"], A1(12.15), -9), (FX["whoosh_scene_change"], A1(12.25), -13)]  # wheel out, timeline in
cues += [(FX["added_to_your_day"], A1(t - 0.12), -7) for t in [13.36, 14.04, 14.82, 16.4]]   # the details rise as clouds
cues += [(FX["tap"], A1(t), -14) for t in [13.42, 14.12, 14.86, 16.45]]                    # the timeline lands on each thing
cues += [(FX["whoosh_scene_change"], A2(19.5), -12), (FX["night_stars_twinkle"], A2(19.6), -9), (FX["star_tick_it_off"], A2(20.3), -9)]
cues += [(FX["tap"], A2(t), -6) for t in [21.76, 21.86, 21.96, 22.06, 22.16]]                 # "all day": five skylings
cues += [(FX["skylings_pop_up"], C(21.98), -6), (FX["sun_goal_reached"], C(22.78), -5), (FX["whoosh_scene_change"], O_END - 0.3, -9)]
for a, t, g in cues: put(mix_fx, a, max(0, t), g)
end = load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"); put(mix_fx, end, O_END, -2, 0.01, 0.2)
# the score: ElevenLabs Music v2.5 through Higgsfield (owner approved, 5.24 credits), 36 s, instrumental; 0.5 s later than
# the picture so its build lands on the whip into Ali. About 12 dB under the voices, 4 dB more while someone talks.
music = load(f"{L}/music_el.mp3"); bed = np.zeros((N, 2), np.float32); put(bed, music, 0.5, -12, 0.01, 0.8)
voice_env = np.convolve(np.abs(mix_v[:, 0]), np.ones(4800) / 4800, mode="same"); duck = 1 - 0.37 * np.clip(voice_env / 0.04, 0, 1)
bed *= duck[:, None]
out = mix_v + mix_fx + bed
peak = np.abs(out).max(); print("peak", round(float(peak), 3))
with wave.open(f"{L}/launch_mix_pre.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{L}/launch_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{L}/launch_mix.wav"], check=True)
print("mix done")
