"""Campfire Q&A v5: the hook and body (fire_render2 --range parts v5r0..2: frames 0..1707, no intro), the intro inserted after
the hook (frame 104), the ending (end3.mp4), one encode, then the v5 mix. Every count is checked against timeline4.json
(v5 keeps v4's cut)."""
import json, subprocess, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); W, H = 1080, 1920; FS = W * H * 3
TL = json.load(open(f"{HERE}/timeline4.json")); INTRO = TL["intro"]["nf"]; HOOK = TL["intro"]["out"]; BODY_END = TL["segs"][-1]["out"] - INTRO
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
def gold(arr, f): return (255 - (255 - arr.astype(np.float32)) * (1 - f * np.array([1.0, 0.86, 0.62], np.float32))).astype(np.uint8) if f > 0 else arr
def smooth(v): v = max(0., min(1., v)); return v * v * (3 - 2 * v)
PATCHES = [("v6patch_food.mp4", 1384, 1468)]                      # re-rendered stretches spliced over the parts (Dreamy's cloud)
def body():
    pt = {}
    for path, a, b in PATCHES:
        for j, f in enumerate(frames(f"{HERE}/{path}")): pt[a + j] = f
        assert len([k for k in pt if a <= k < b]) == b - a, (path, len(pt))
    i = 0
    for path in ("v5r0.mp4", "v5r1.mp4", "v5r2.mp4"):
        for f in frames(f"{HERE}/{path}"): yield pt.get(i, f); i += 1
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HERE}/campfire6_silent.mp4"], stdin=subprocess.PIPE)
n = dict(hook=0, intro=0, body=0, end=0); i = 0
for f in body():
    if i == HOOK:
        for g in frames(f"{HERE}/intro_silent.mp4"): enc.stdin.write(g.tobytes()); n["intro"] += 1
    if i >= HOOK and i - HOOK < 9: f = gold(f, 1 - smooth((i - HOOK + 1) / 9))     # out of the intro's gold
    enc.stdin.write(f.tobytes()); n["hook" if i < HOOK else "body"] += 1; i += 1
for f in frames(f"{HERE}/end3.mp4"): enc.stdin.write(f.tobytes()); n["end"] += 1
enc.stdin.close(); enc.wait()
print(n, "total", sum(n.values()), "expected", TL["n"])
assert n["hook"] == HOOK and n["intro"] == INTRO and n["body"] == BODY_END - HOOK and sum(n.values()) == TL["n"], n
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/campfire6_silent.mp4", "-i", f"{HERE}/campfire5_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                "-shortest", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v6.mp4"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/LifeFlow_Campfire_QA_v6.mp4", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "copy", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v6_send.mp4"], check=True)
print("done")
