"""The show open, v2, stage 1: the plate. The wide shot of the two of them at the fire just before Ali's first answer
(clip 7, up to 1.82 s), in slow motion (every 120 fps frame, with the body's own 3-frame blend), time coming back to normal
as the camera pushes in; the last frame sits one step before the body's first frame (AL, z 2.5), so the cut is invisible.
    python3 open2_plate.py            -> open2/plate.mp4 (graded, 1080 x 1920, 160 frames) + open2/plate.json (crops)
"""
import json, os, subprocess, sys
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); _a = sys.argv; sys.argv = sys.argv[:1]
import fire_render as F
sys.argv = _a
W, H, SW, SH, FPS = F.W, F.H, F.SW, F.SH, 30
CLIP, T_BODY, NF = 7, 1.82, 160
PUSH0, RAMP = 122, 26                                              # the push-in starts here; time speeds up over the last RAMP frames
def smooth5(u): u = min(1., max(0., u)); return u * u * u * (u * (u * 6 - 15) + 10)
START = dict(z=1.12, cx=1080, cy=SH / 1.12 / 2); HOLD = dict(z=1.20, cx=1080, cy=1672); END = dict(F.AL, z=2.5)   # the hold pushes gently toward the title (it stays put on screen)
def cam(i):
    """the shot at (fractional) frame i: a slow drift, then a dolly into Ali's close-up"""
    if i <= PUSH0:
        u = i / PUSH0; u = u * (2 - u) * 0.55 + u * 0.45                                  # eases, but never quite stops
        return {k: START[k] + (HOLD[k] - START[k]) * u for k in START}
    u = smooth5((i - PUSH0) / (NF - PUSH0)); z = HOLD["z"] * (END["z"] / HOLD["z"]) ** u
    w = (1 - HOLD["z"] / z) / (1 - HOLD["z"] / END["z"])                                 # centre moves the way a real push would
    return dict(z=z, cx=HOLD["cx"] + (END["cx"] - HOLD["cx"]) * w, cy=HOLD["cy"] + (END["cy"] - HOLD["cy"]) * w)
VF = "tmix=frames=3:weights='1 2 1',setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc:range=tv," + F.TM
def stream(extra_vf="", n=260, size=(SW, SH)):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", F.SRC(CLIP), "-frames:v", str(n), "-fps_mode", "passthrough", "-vf", VF + extra_vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    fs = size[0] * size[1] * 3
    while True:
        b = p.stdout.read(fs)
        if len(b) < fs: break
        yield np.frombuffer(b, np.uint8).reshape(size[1], size[0], 3)
    p.kill()
if __name__ == "__main__":
    os.makedirs(f"{HERE}/open2", exist_ok=True)
    rd = F.Reader(CLIP, T_BODY, 1); body0 = rd.next().copy(); rd.p.kill()                 # the body's first source frame, as the body reads it
    ref = cv2.resize(body0, (270, 480), interpolation=cv2.INTER_AREA).astype(np.float32)
    errs = [float(np.abs(cv2.resize(f, (270, 480), interpolation=cv2.INTER_AREA).astype(np.float32) - ref).mean()) for f in stream()]
    s0 = int(np.argmin(errs)); print("body frame 0 = stream frame", s0, "err", round(errs[s0], 3), "neighbours", [round(e, 3) for e in errs[s0 - 3:s0 + 4]], flush=True)
    step = [1 + 3 * smooth5((i - (NF - RAMP)) / RAMP) ** 1.3 if i > NF - RAMP else 1.0 for i in range(NF)]
    pos = np.zeros(NF); pos[-1] = s0 - 4
    for i in range(NF - 1, 0, -1): pos[i - 1] = pos[i] - step[i]
    idx = np.round(pos).astype(int); assert idx[0] >= 2 and (np.diff(idx) >= 1).all(), idx[:5]
    print("source frames", idx[0], "..", idx[-1], "last steps", list(np.diff(idx)[-8:]), flush=True)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", f"{HERE}/open2/plate.mp4"], stdin=subprocess.PIPE)
    want = {int(s): i for i, s in enumerate(idx)}; meta = []; F._prev_m = None
    for k, src in enumerate(stream(n=int(idx[-1]) + 1)):
        if k not in want: continue
        i = want[k]; c = F.crop_of(cam(i)); ca, cb = F.crop_of(cam(i - 0.27)), F.crop_of(cam(i + 0.27))          # the shutter: a bit over half a frame
        disp = max(abs(F.to_scr(ca, x, y)[q] - F.to_scr(cb, x, y)[q]) for x in (c[0], c[0] + c[2]) for y in (c[1], c[1] + c[3]) for q in (0, 1))
        ns = int(min(14, max(1, np.ceil(disp / 2.5)))) if i > PUSH0 - 2 else 1
        subs = [F.crop_of(cam(i + d)) for d in np.linspace(-0.27, 0.27, ns)] if ns > 1 else [c]
        acc = np.zeros((H, W, 3), np.float32)
        for (x0, y0, w, h) in subs: acc += cv2.resize(src[int(round(y0)):int(round(y0 + h)), int(round(x0)):int(round(x0 + w))], (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
        arr = np.clip(acc / len(subs), 0, 255).astype(np.uint8)
        arr = F.grade(arr, F.matte_crop(F.matte_full(src), c))
        enc.stdin.write(arr.tobytes()); meta.append(dict(i=i, src=k, crop=list(map(float, c)), subs=[list(map(float, s)) for s in subs]))
        if i % 20 == 0: print("frame", i, flush=True)
    enc.stdin.close(); enc.wait()
    json.dump(dict(s0=s0, nf=NF, push0=PUSH0, frames=meta), open(f"{HERE}/open2/plate.json", "w")); print("plate", len(meta), "frames")
