"""Campfire Q&A v4: hook3 + the slower intro + the body (re-rendered pieces v4_<tag>.mp4; unchanged pieces straight from the
v2 render: clouds, question, the first part of the skylings answer, long_way) + end3, one encode, then the v4 mix."""
import json, subprocess, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); W, H = 1080, 1920; FS = W * H * 3
TL4 = json.load(open(f"{HERE}/timeline4.json"))
# where the reused pieces start in the v2 render (fire_render's cut list, which v2 rendered from; timeline2.json is rewritten on every run)
V2 = {"clouds": dict(out=476), "question": dict(out=729), "arc": dict(out=909), "long_way": dict(out=1493)}
PARTS = [("v2part0.mp4", 0), ("v2part1.mp4", 693), ("v2part2.mp4", 1386)]
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
def v2_frames(i0, n):
    """frames i0 .. i0+n of the v2 render, across its three part files"""
    for path, start in PARTS:
        lo, hi = max(i0, start), i0 + n
        nxt = next((s for _, s in PARTS if s > start), 10 ** 9)
        if lo >= min(hi, nxt): continue
        yield from frames(f"{HERE}/{path}", lo - start, min(hi, nxt) - lo)
def gold(arr, f): return (255 - (255 - arr.astype(np.float32)) * (1 - f * np.array([1.0, 0.86, 0.62], np.float32))).astype(np.uint8) if f > 0 else arr
def smooth(v): v = max(0., min(1., v)); return v * v * (3 - 2 * v)
REUSE = set(V2)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HERE}/campfire4_silent.mp4"], stdin=subprocess.PIPE)
count = {}
def put(tag, gen):
    n = 0
    for f in gen:
        if tag == "wheel" and n < 9: f = gold(f, 1 - smooth((n + 1) / 9))     # out of the intro's gold
        enc.stdin.write(f.tobytes()); n += 1
    count[tag] = n
for s in TL4["segs"]:
    tag = s["tag"]
    if tag == "hook": put(tag, frames(f"{HERE}/hook3.mp4", 0, s["nf"]))
    elif tag == "intro": put(tag, frames(f"{HERE}/intro_silent.mp4", 0, s["nf"]))
    elif tag == "vo": put("end", frames(f"{HERE}/end3.mp4"))
    elif tag in REUSE: put(tag, v2_frames(V2[tag]["out"], s["nf"]))
    else: put(tag, frames(f"{HERE}/v4_{tag}.mp4", 0, s["nf"]))
    want = s["nf"] if tag != "vo" else TL4["n"] - s["out"]
    assert count[tag if tag != "vo" else "end"] == want, (tag, count, want)
enc.stdin.close(); enc.wait()
print(count, "total", sum(count.values()), "expected", TL4["n"])
assert sum(count.values()) == TL4["n"]
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/campfire4_silent.mp4", "-i", f"{HERE}/campfire4_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                "-shortest", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v4.mp4"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/LifeFlow_Campfire_QA_v4.mp4", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "copy", "-movflags", "+faststart", f"{HERE}/LifeFlow_Campfire_QA_v4_send.mp4"], check=True)
print("done")
