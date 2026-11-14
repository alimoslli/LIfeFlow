"""Campfire Q&A v3: the hook (hook3.mp4), the intro (intro_silent.mp4), the body (fire_render2 frames 104..1873 from the v2
parts), the new ending (end3.mp4), one encode, then the v3 mix (campfire3_mix.wav). The body's first frames come out of the
intro's gold."""
import json, subprocess, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); W, H = 1080, 1920; FS = W * H * 3
TL = json.load(open(f"{HERE}/timeline3.json"))
def frames(path, skip=0, count=None):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE); n = 0; k = 0
    while True:
        b = p.stdout.read(FS)
        if len(b) < FS: break
        if k >= skip:
            yield np.frombuffer(b, np.uint8).reshape(H, W, 3); n += 1
            if count is not None and n >= count: break
        k += 1
    p.kill()
def gold(arr, f):
    return (255 - (255 - arr.astype(np.float32)) * (1 - f * np.array([1.0, 0.86, 0.62], np.float32))).astype(np.uint8) if f > 0 else arr
def smooth(v): v = max(0., min(1., v)); return v * v * (3 - 2 * v)
BODY0, BODY1 = 104, TL["segs"][-1]["out"] - TL["intro"]["nf"]          # v2 frames 104 .. 1873
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HERE}/campfire3_silent.mp4"], stdin=subprocess.PIPE)
n = {"hook": 0, "intro": 0, "body": 0, "end": 0}
for f in frames(f"{HERE}/hook3.mp4", 0, 104): enc.stdin.write(f.tobytes()); n["hook"] += 1
for f in frames(f"{HERE}/intro_silent.mp4"): enc.stdin.write(f.tobytes()); n["intro"] += 1
j = 0
for path, start in [("v2part0.mp4", 0), ("v2part1.mp4", 693), ("v2part2.mp4", 1386)]:
    lo = max(BODY0, start); hi = BODY1
    if hi <= lo: continue
    for f in frames(f"{HERE}/{path}", lo - start, hi - lo):
        if j < 9: f = gold(f, 1 - smooth((j + 1) / 9))
        enc.stdin.write(f.tobytes()); j += 1
n["body"] = j
for f in frames(f"{HERE}/end3.mp4"): enc.stdin.write(f.tobytes()); n["end"] += 1
enc.stdin.close(); enc.wait()
tot = sum(n.values()); print(n, "total", tot, "expected", TL["n"])
assert tot == TL["n"], "frame count does not match the timeline"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/campfire3_silent.mp4", "-i", f"{HERE}/campfire3_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                "-shortest", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v3.mp4"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/LifeFlow_Campfire_QA_v3.mp4", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "copy", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v3_send.mp4"], check=True)
print("done")
