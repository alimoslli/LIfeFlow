"""The skylings skit, stage 1: the campfire shots it needs, graded like the Q&A and framed, with no overlays, so the skylings,
voices and captions can be laid on top (stage 2) without decoding the 4K again. The rim close-ups get a macro look (the rim
sharp, everything else soft) so the skylings read as tiny people on it, like the reference's keyboard shots.
    python3 skit_plates.py [name ...]      -> plates/<name>.mp4 (1080 x 1920, 30 fps)
"""
import json, math, os, sys, subprocess
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); FIRE = os.path.join(os.path.dirname(HERE), "fire")
sys.path.insert(0, FIRE); sys.argv = sys.argv[:1] + sys.argv[1:]
import fire_render as F
W, H, FPS = 1080, 1920, 30
TY, AL, TWO, WIDE = F.TY, F.AL, F.TWO, F.WIDE
def sh(base, **k): d = dict(base); d.update(k); return d
def macro(cx, cy=2585, z=4.0): return dict(z=z, cx=cx, cy=cy)
# name: (clip, in, out, [(t, shot), ...], macro focus y (source px) or None)
PLATES = {
    "q_tyler": (6, 0.94, 5.44, [(0, sh(TWO, z=1.62, cy=2190)), (4.5, sh(TWO, z=1.74, cy=2200, cx=1180))], None),          # "what's the little character thing on top?"
    "a_oh": (8, 1.10, 2.26, [(0, sh(AL, z=2.45)), (1.16, sh(AL, z=2.5))], None),                                                  # "Oh, the skylings."
    "m_dawn": (11, 2.6, 8.6, [(0, macro(640)), (6.0, macro(650, z=4.25))], 2700),
    "m_ray": (11, 8.6, 13.4, [(0, macro(900, 2600)), (4.8, macro(905, 2600, 4.25))], 2705),
    "r_tyler": (7, 0.2, 1.6, [(0, sh(TY, z=2.6)), (1.4, sh(TY, z=2.68))], None),                                                    # Tyler listening
    "m_goldie": (11, 13.4, 18.6, [(0, macro(1160, 2600)), (5.2, macro(1165, 2600, 4.25))], 2705),
    "m_twinkle": (7, 3.0, 8.0, [(0, macro(1400, 2590)), (5.0, macro(1405, 2590, 4.25))], 2690),
    "m_dreamy": (10, 11.2, 16.2, [(0, macro(1700, 2520, 3.8)), (5.0, macro(1705, 2520, 4.0))], 2600),
    "a_dead": (8, 2.23, 5.56, [(0, sh(AL, z=2.5)), (3.33, sh(AL, z=2.62))], None),                                                # "Those are just five different characters..."
    "a_day": (8, 5.98, 6.31, [(0, sh(AL, z=2.85)), (0.33, sh(AL, z=2.87))], None),                                                # "...day."
    "end_rim": (10, 4.6, 8.6, [(0, macro(960, 2770, 3.0)), (4.0, macro(960, 2760, 3.15))], 2712),                                 # all five on the rim: "Pick one." "Or let the sky pick."
    "end_sky": (11, 10.6, 14.1, [(0, dict(z=2.3, cx=1080, cy=1120)), (3.5, dict(z=2.42, cx=1080, cy=1030))], None),              # the sky over the fire (no faces): the day runs through it
}
def shot_at(keys, t):
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1 or (t1, b) == keys[-1]:
            u = F.smoothv(F.clamp((t - t0) / max(1e-6, t1 - t0))); return {k: a[k] + (b[k] - a[k]) * u for k in a}
    return keys[-1][1]
def render(name):
    n, a, b, keys, focus = PLATES[name]; nf = int(round((b - a) * FPS)); rd = F.Reader(n, a, nf); F._prev_m = None
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", f"{HERE}/plates/{name}.mp4"], stdin=subprocess.PIPE)
    meta = []
    for i in range(nf):
        t = i / FPS; src = rd.next(); s = shot_at(keys, t); c = F.crop_of(s); x0, y0, w, h = c
        m = None if focus else F.matte_crop(F.matte_full(src), c)
        arr = cv2.resize(src[int(y0):int(y0 + h), int(x0):int(x0 + w)], (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
        arr = F.grade(arr, m)
        if focus:                                                     # macro: sharp at the rim, soft above and below it
            fy = (focus - y0) * W / w; yy = np.arange(H, dtype=np.float32)
            wgt = np.clip((np.abs(yy - fy) - 70) / 260, 0, 1)[:, None, None]
            soft = cv2.GaussianBlur(arr, (0, 0), 9); arr = (arr * (1 - wgt) + soft * wgt).astype(np.uint8)
        enc.stdin.write(arr.tobytes()); meta.append(c)
    enc.stdin.close(); enc.wait(); rd.p.kill()
    json.dump(dict(name=name, clip=n, a=a, b=b, nf=nf, crops=meta), open(f"{HERE}/plates/{name}.json", "w"))
    print(name, nf, "frames", flush=True)
if __name__ == "__main__":
    os.makedirs(f"{HERE}/plates", exist_ok=True)
    for nm in (sys.argv[1:] or list(PLATES)): render(nm)
