"""Voiceover placed from the plan (each line levelled), music ducked under it, loudness -14 LUFS, muxed with the video.
Usage: python3 mix_launch.py plan.json video.mp4 music.wav out.mp4"""
import json, subprocess, sys
import numpy as np
from scipy.io import wavfile

plan, video, music, out = sys.argv[1:5]
P = json.load(open(plan))
SR = 48000
N = int(SR * P["duration"])
vo = np.zeros(N)
for path, at in P.get("vo", []):
    sr, x = wavfile.read(path)
    assert sr == SR, (path, sr)
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    x /= 32768.0
    frames = x[: len(x) // 480 * 480].reshape(-1, 480)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    voiced = rms[rms > rms.max() * 0.1]
    x *= 10 ** (-19 / 20) / max(1e-6, np.sqrt((voiced ** 2).mean()))  # speech level about -19 dBFS RMS
    i = int(at * SR)
    x = x[: N - i]
    vo[i : i + len(x)] += x
has_vo = bool(P.get("vo"))
if has_vo:
    wavfile.write("vo_track.wav", SR, (np.clip(np.stack([vo, vo], axis=1), -1, 1) * 32767).astype(np.int16))
    fc = ("[1:a]volume=0.5[mu];[2:a]asplit=2[v][sc];[mu][sc]sidechaincompress=threshold=0.015:ratio=7:attack=12:release=380:makeup=1[duck];"
          "[v][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]")
    inputs = ["-i", video, "-i", music, "-i", "vo_track.wav"]
else:
    fc = "[1:a]volume=0.8,loudnorm=I=-14:TP=-1.5:LRA=9[a]"
    inputs = ["-i", video, "-i", music]
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                "-ar", "48000", "-t", str(P["duration"]), "-movflags", "+faststart", out], check=True)
print("mix ok", out)
