"""LifeFlow "Campfire Q&A" (Nov 14 takes): Ali and Tyler at the fire, cut tight like a two-camera podcast from one static 4K
shot (push-ins: close-ups, two-shot, wide), a warm night grade with lit faces, and the app's own pieces in the scene:
the wheel rising behind them, the skylings along the sun's arc, clouds with what they say, embers rising from the fire
that become pixel stars, and the "Your day, drawn as the sky." ending into the logo.
    python3 fire_render.py [--preview 1.0,5.0] [--nocap]
"""
import json, math, os, sys, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
sys.path.insert(0, f"{SP}/launch/work")
import render5 as R5
from render5 import R4, R3, R
from render3 import clamp, smooth, back, out3, in3, smoothv, paste, pose_frame, burst, pixel_star, cloud, draw_cloud, wheel_tex, plane3d, GOLD, SOFT, NAVY
W, H, FPS, SW, SH = 1080, 1920, 30, 2160, 3840
IDX = {c["n"]: c for c in json.load(open(f"{HERE}/all_index.json"))}
SRC = lambda n: f"{HERE}/src/{IDX[n]['file']}"

# ---------------------------------------------------------------- the shots (source pixels of the 2160 x 3840 portrait frame)
TY = dict(z=2.55, cx=1460, cy=2235); AL = dict(z=2.55, cx=760, cy=2235); TWO = dict(z=1.72, cx=1115, cy=2140)
WIDE = dict(z=1.28, cx=1080, cy=2020)
def sh(base, **k): d = dict(base); d.update(k); return d
# the cut: (clip, in, out, [(t, shot)...] keyframes in segment time; a new list entry = a cut, a pair = a move)
SEGS = [
    dict(n=8, a=8.28, b=11.75, shots=[(0, sh(TY, z=2.45)), (3.47, sh(TY, z=2.75))], tag="hook"),                       # Tyler: "what does it do for me?"
    dict(n=7, a=1.82, b=10.75, shots=[(0, sh(AL, z=2.5)), (2.55, sh(AL, z=2.62)), (2.6, sh(TWO, z=1.78)), (8.93, sh(TWO, z=1.62))], tag="wheel"),
    dict(n=5, a=0.80, b=4.25, shots=[(0, sh(TY, z=2.6)), (3.45, sh(TY, z=2.72))], tag="tyler_name"),                   # "So Ali, why did you build it?"
    dict(n=11, a=0.42, b=8.85, shots=[(0, sh(AL, z=2.45)), (8.43, sh(AL, z=2.7))], tag="clouds"),                      # "...seven classes, work shifts, finance"
    dict(n=6, a=0.94, b=6.95, shots=[(0, sh(TWO, z=1.7)), (6.01, sh(TWO, z=1.86, cx=1190))]),                          # "what's the character on top?"
    dict(n=8, a=1.10, b=6.32, shots=[(0, sh(WIDE, z=1.28)), (5.22, sh(WIDE, z=1.38, cy=1990))], tag="arc"),           # "five characters, each time of day"
    dict(n=3, a=0.24, b=5.02, shots=[(0, sh(TWO, z=1.75)), (4.78, sh(TWO, z=1.92, cx=1260))]),                         # "Tyler, tell us... finance"
    dict(n=10, a=1.56, b=11.02, shots=[(0, sh(TY, z=2.45)), (9.46, sh(TY, z=2.72))], tag="food"),                      # the food story
    dict(n=10, a=15.50, b=17.65, shots=[(0, sh(TWO, z=1.8, cx=1200)), (2.15, sh(TWO, z=1.86, cx=1200))]),             # "so that works a long way"
    dict(n=9, a=0.56, b=11.12, shots=[(0, sh(TY, z=2.5)), (10.56, sh(TY, z=2.78))], tag="health"),                     # "January 2027... Apple Health"
    # Ali's new line has no picture of its own: it plays over the night sky and string lights above the fire (heads out of frame)
    dict(n=4, a=0.36, b=4.75, shots=[(0, dict(z=2.3, cx=1080, cy=1100)), (4.39, dict(z=2.42, cx=1080, cy=1010))], tag="vo", clip_video=11, va=9.3),
]
XF, END_HOLD, HOLD = 12, 18, 66
o = 0
for s in SEGS: s["out"] = o; s["nf"] = int(round((s["b"] - s["a"]) * FPS)); o += s["nf"]
END_OUT = o - XF; N = END_OUT + END_HOLD + 1 + HOLD
def shot_at(seg, t):
    ks = seg["shots"]
    for j in range(len(ks) - 1):
        (t0, a), (t1, b) = ks[j], ks[j + 1]
        if t0 <= t < t1 or j == len(ks) - 2:
            if t1 - t0 < 0.1: continue                                     # a cut point
            u = smoothv(clamp((t - t0) / (t1 - t0)))
            return {k: a[k] + (b[k] - a[k]) * u for k in a}
    return ks[-1][1]
def crop_of(s):
    w, h = SW / s["z"], SH / s["z"]; x0 = clamp(s["cx"] - w / 2, 0, SW - w); y0 = clamp(s["cy"] - h / 2, 0, SH - h); return x0, y0, w, h
def to_scr(c, x, y): x0, y0, w, h = c; k = W / w; return (x - x0) * k, (y - y0) * k

# ---------------------------------------------------------------- source frames (HDR to SDR, 3 frames blended from 120 fps)
TM = "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=pc,format=rgb24"
class Reader:
    def __init__(self, n, a, nf, black=False):
        self.nf = nf; self.black = black
        if not black:
            self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-i", SRC(n), "-frames:v", str(nf + 2), "-vf", f"tmix=frames=3:weights='1 2 1',fps=30,setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc:range=tv,{TM}",
                                       "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    def next(self):
        b = self.p.stdout.read(SW * SH * 3)
        if len(b) < SW * SH * 3: return self.last
        self.last = np.frombuffer(b, np.uint8).reshape(SH, SW, 3); return self.last

# ---------------------------------------------------------------- the people (MediaPipe), for the face light and the wheel behind them
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
SEG = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=mpt.BaseOptions(model_asset_path=f"{SP}/launch/models/selfie_multiclass.tflite"), output_confidence_masks=True))
MX0, MY0, MS = 260, 1560, 1700                     # the square around both of them
_prev_m = None
def matte_full(src):
    global _prev_m
    sq = cv2.resize(src[MY0:MY0 + MS, MX0:MX0 + MS], (768, 768), interpolation=cv2.INTER_AREA)
    r = SEG.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(sq)))
    m = 1 - r.confidence_masks[0].numpy_view(); m = np.clip((m - 0.35) / 0.3, 0, 1).astype(np.float32)
    if _prev_m is not None: m = 0.6 * m + 0.4 * _prev_m
    _prev_m = m; return m
def matte_crop(m768, c):
    """the person matte in the output frame's coordinates"""
    x0, y0, w, h = c; k = 768 / MS
    M = np.float32([[k * w / W, 0, (x0 - MX0) * k], [0, k * h / H, (y0 - MY0) * k]])
    return cv2.warpAffine(m768, M, (W, H), flags=cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR, borderValue=0)[..., None]

# ---------------------------------------------------------------- the grade: warm firelight, deep night, glowing lights, faces lifted
def lut(points):
    xs, ys = zip(*points); return np.clip(np.interp(np.arange(256) / 255, xs, ys) * 255, 0, 255).astype(np.uint8)
LUT = np.stack([lut([(0, 0.0), (0.06, 0.05), (0.25, 0.27), (0.55, 0.62), (0.85, 0.91), (1, 1)]),
                lut([(0, 0.0), (0.06, 0.055), (0.25, 0.26), (0.55, 0.57), (0.85, 0.86), (1, 0.99)]),
                lut([(0, 0.025), (0.06, 0.08), (0.25, 0.27), (0.55, 0.53), (0.85, 0.8), (1, 0.95)])], 0)
yy, xx = np.mgrid[0:H, 0:W]; VIG = (1 - 0.38 * np.clip(np.hypot((xx - 540) / 700, (yy - 1000) / 1150) - 0.42, 0, 1) ** 1.5)[..., None].astype(np.float32)
def grade(img, m):
    out = np.stack([LUT[c][img[..., c]] for c in range(3)], -1).astype(np.float32)
    g = out.mean(-1, keepdims=True); out = np.clip(g + (out - g) * 1.1, 0, 255)
    if m is not None:                                                       # a soft key light on faces and chests (the fire's side)
        ys = np.where(m[..., 0].max(1) > 0.5)[0]; top = ys[0] if len(ys) else 700
        wgt = m * np.clip(1 - (np.arange(H)[:, None, None] - top - 100) / 600, 0, 1) * 0.75
        up = np.clip((out / 255) ** 0.74 * 1.06, 0, 1) * 255 * np.array([1.04, 1.0, 0.95], np.float32)
        out = out * (1 - wgt) + up * wgt
    lum = out[..., 0] * 0.3 + out[..., 1] * 0.55 + out[..., 2] * 0.15
    sat = (out.max(-1) - out.min(-1)) / np.maximum(out.max(-1), 1)
    hi = (np.clip((lum - 175) / 70, 0, 1) * np.clip((sat - 0.12) / 0.25, 0.15, 1))[..., None] * out * np.array([1.0, 0.86, 0.66], np.float32)   # warm lights bloom, white glare doesn't
    small = cv2.resize(hi, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    bloom = cv2.resize(cv2.GaussianBlur(small, (0, 0), 4) * 0.6 + cv2.GaussianBlur(small, (0, 0), 14) * 0.5, (W, H), interpolation=cv2.INTER_LINEAR)
    out = 255 - (255 - np.clip(out, 0, 255)) * (1 - np.clip(bloom, 0, 255) / 255)
    return np.clip(out * VIG, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- embers: rising from the fire, some become pixel stars in the sky
rng = np.random.default_rng(7)
EMBERS = [dict(t0=t, x=rng.uniform(470, 1430), vx=rng.uniform(-40, 40), v=rng.uniform(260, 430), life=rng.uniform(1.6, 3.2), star=rng.random() < 0.22, ph=rng.uniform(0, 6))
          for t in np.sort(rng.uniform(-3, N / FPS, int(N / FPS * 7)))]
def draw_embers(img, T, c, boost=1.0):
    d = ImageDraw.Draw(img, "RGBA"); k = W / c[2]
    for e in EMBERS:
        a = T - e["t0"]
        if not (0 <= a < e["life"] + (2.5 if e["star"] else 0)): continue
        if a < e["life"]:
            y = 2430 - e["v"] * a - 30 * a * a; x = e["x"] + e["vx"] * a + 18 * math.sin(a * 3 + e["ph"])
            X, Y = to_scr(c, x, y); al = (1 - a / e["life"]) ** 1.3 * boost; s = max(2, int(round(5 * k / 1.3)))
            col = (255, int(150 + 80 * (1 - a / e["life"])), 60) if not e["star"] else GOLD
            d.rectangle([X, Y, X + s - 1, Y + s - 1], fill=col + (int(235 * min(1, al)),))
        elif e["star"]:                                                         # it settles as a twinkling star
            y = 2430 - e["v"] * e["life"] - 30 * e["life"] ** 2; x = e["x"] + e["vx"] * e["life"]
            X, Y = to_scr(c, x, y); b = a - e["life"]; tw = (0.5 + 0.5 * math.sin(b * 6 + e["ph"])) * clamp(b / 0.3) * clamp((2.5 - b) / 0.6)
            pixel_star(img, int(X), int(Y), max(3, int(4 * k / 1.3)), 0.9 * tw * boost)

# ---------------------------------------------------------------- the app's pieces in the scene
FIVE = [("Dawn", (255, 200, 170)), ("Ray", (255, 226, 160)), ("Goldie", (255, 205, 130)), ("Twinkle-night", (200, 215, 255)), ("Dreamy-night", (200, 215, 255))]
def overlays(seg, img, arr, t, c, m):
    tag = seg.get("tag"); k = W / c[2]
    if tag == "wheel" and t >= 2.6:                                          # the wheel rises behind them and turns through the day
        tt = t - 2.6; u = tt / 0.6; e = back(u, 1.2) if u < 1 else 1
        hx, hy = to_scr(c, 1115, 1985); wk = 10 + (len(R.WHEEL) - 1 - 24) * smoothv(clamp((tt - 0.3) / 5.6))
        orig = arr.astype(np.float32)
        plane3d(arr, wheel_tex(wk), hx, hy + 80 * (1 - e), 1180 * k * (0.7 + 0.3 * e), 62 * (1 - e) - 8, 9 * math.sin(tt * 1.3), alpha=clamp(u * 2.5), glow=(170, 170, 220), anchor_y=R.W_HOR)
        if m is not None: arr[:] = R5.lit_composite(arr, orig, m)
    return arr

def front(seg, img, t, c, T):
    tag = seg.get("tag"); k = W / c[2]
    if tag == "wheel" and t < 2.6:                                           # Ali's name
        u = (t - 0.25) / 0.3; v = (2.6 - t) / 0.2
        if u > 0: X, Y = to_scr(c, 760, 1885); draw_cloud(img, cloud("Ali Moslli, CEO and Developer", 2.4, 1), X, Y, (back(u) if u < 1 else 1) * clamp(v * 1.2), clamp(v))
    if tag == "tyler_name":
        u = (t - 0.3) / 0.3; v = (3.45 - t) / 0.2
        if u > 0: X, Y = to_scr(c, 1460, 1900); draw_cloud(img, cloud("Tyler Kardy, CMO", 2.6, 2), X, Y, (back(u) if u < 1 else 1) * clamp(v * 1.2), clamp(v))
    if tag == "clouds":                                                      # out of the fire, as he names them
        for j, (ts, txt, tx, ty) in enumerate([(4.75, "7 classes", 520, 1720), (5.75, "Work shifts", 980, 1810), (6.9, "Personal finance", 640, 1900)]):
            if t < ts: continue
            u = (t - ts) / 0.55; w = out3(u); sx, sy = to_scr(c, 900, 2440); ex, ey = to_scr(c, tx, ty)
            X, Y = sx + (ex - sx) * w, sy + (ey - sy) * w - 40 * math.sin(math.pi * clamp(u)); draw_cloud(img, cloud(txt, 2.5, 1 + j), X, Y, 0.3 + 0.7 * out3(u))
            burst(img, X, Y, t - ts - 0.45, k=5, n=6, radius=110, seed=30 + j)
    if tag == "arc":                                                         # the five along the sun's path, each with its time of day
        for j, (nm, glow) in enumerate(FIVE):
            ts = 1.6 + j * 0.42
            if t < ts: continue
            ang = math.pi * (0.92 - 0.84 * j / 4); x = 1090 + 640 * math.cos(ang); y = 1760 - 520 * math.sin(ang)
            u = (t - ts) / 0.3; X, Y = to_scr(c, x, y + 8 * math.sin(T * 2.4 + j))
            R.draw_skyling(img, pose_frame(nm, "wave" if t - ts < 1.2 else "idle", T, j * 0.3), 6, X, Y, back(u) if u < 1 else 1, glow=glow)
            burst(img, X, Y, t - ts, k=5, n=6, radius=100, seed=50 + j)
    if tag == "food" and t >= 5.6:                                           # his skyling and the app's real money note
        u = (t - 5.6) / 0.3; X, Y = to_scr(c, 1215, 1830 + 8 * math.sin(T * 2.4))
        R.draw_skyling(img, pose_frame("Dreamy-night", "wave" if t < 7.0 else "idle", T), 8, X, Y, back(u) if u < 1 else 1, glow=(200, 215, 255))
        burst(img, X, Y, t - 5.6, k=5, n=6, radius=110, seed=61)
        if t >= 6.2:
            v = (t - 6.2) / 0.3; X2, Y2 = to_scr(c, 1520, 1700); draw_cloud(img, cloud("Food is running high", 2.4, 1), X2, Y2, back(v) if v < 1 else 1)
    if tag == "health":
        if t >= 0.9:
            u = (t - 0.9) / 0.32; X, Y = to_scr(c, 1460, 1700); draw_cloud(img, cloud("January 2027", 3.3, 1), X, Y, back(u) if u < 1 else 1)
            burst(img, X, Y, t - 0.95, k=7, n=8, radius=240, seed=71)
        if t >= 7.55:
            u = (t - 7.55) / 0.3; X, Y = to_scr(c, 1330, 1880); draw_cloud(img, cloud("Apple Health", 2.5, 2), X, Y, back(u) if u < 1 else 1)
    if tag == "vo":                                                          # the five rise out of the fire into the sky
        for j, (nm, glow) in enumerate(FIVE):
            ts = 0.5 + j * 0.25
            if t < ts: continue
            u = clamp((t - ts) / 1.6); x = 720 + j * 195; y = 2300 - (2300 - 1180) * out3(u)
            X, Y = to_scr(c, x, y + 10 * math.sin(T * 2.2 + j)); R.draw_skyling(img, pose_frame(nm, "celebrate" if u >= 1 else "idle", T, j * 0.3), 7, X, Y, min(1, 0.4 + u), glow=glow)

# ---------------------------------------------------------------- captions (exact words; chunks in clip time), drawn word by word in gold
CAPS = {
    8: [(8.33, 10.15, "So what does it actually do for me,"), (10.15, 11.7, "like on a normal day?"), (1.13, 2.23, "Oh, the skylings."),
        (2.23, 3.71, "Those are just five different characters"), (3.71, 6.1, "that represent each different time of day.")],
    7: [(1.86, 2.61, "So you can wake up"), (2.61, 3.43, "to a notification"), (3.43, 4.63, "from your skyling"), (4.63, 6.39, "planning out your whole day and week."),
        (6.39, 7.39, "You can ask it"), (7.39, 8.83, "to block times for study time,"), (8.83, 10.77, "and they can overview a whole week.")],
    5: [(0.84, 1.93, "So Ali,"), (1.93, 4.2, "why exactly did you build LifeFlow?")],
    11: [(0.44, 1.83, "Also, I was just trying"), (1.83, 2.79, "to build myself a tool"), (2.79, 4.23, "where I can organize my whole day,"), (4.23, 5.91, "have all my seven classes,"),
         (5.91, 6.71, "my work shifts,"), (6.71, 8.01, "and all my personal finance"), (8.01, 8.8, "in one place.")],
    6: [(0.96, 3.1, "And what exactly is"), (3.1, 4.44, "the little, like, character"), (4.44, 5.54, "kind of thing on top?"), (5.54, 6.9, "What does that represent?")],
    3: [(0.27, 0.95, "Tyler,"), (0.95, 2.18, "I think you should tell us"), (2.18, 3.54, "how your skyling's helping you"), (3.54, 5.0, "with all your personal finance.")],
    10: [(1.6, 2.54, "So for instance,"), (2.54, 4.26, "I have a really bad habit"), (4.26, 6.74, "of going out to get food after work,"), (6.74, 8.34, "and my skyling will always"),
         (8.34, 11.0, "remind me about home-cooked meals,"), (15.52, 17.6, "so that works a long way.")],
    9: [(0.6, 3.67, "So as of January next year, 2027,"), (3.67, 5.41, "LifeFlow will actually be able"), (5.41, 6.75, "to connect all your health data"),
        (6.75, 9.67, "and connect your Apple Health app"), (9.67, 11.1, "into LifeFlow.")],
    4: [(0.4, 2.36, "You heard him, January 2027,")],
}
F_C = R5.F_C; CAP_Y = 1430
def pieces(a, b, text, maxw=930):
    words = text.split(" "); sp = F_C.getlength(" "); out, cur = [], []
    for w in words:
        if cur and F_C.getlength(" ".join(cur + [w])) > maxw: out.append(cur); cur = [w]
        else: cur.append(w)
    out.append(cur); tot = sum(len(" ".join(p)) for p in out); res, t = [], a
    for p in out: d = (b - a) * len(" ".join(p)) / tot; res.append((t, t + d, " ".join(p))); t += d
    return res
def caption(img, n, ct):
    for a0, b0, text0 in CAPS.get(n, []):
        if not (a0 <= ct < b0): continue
        a, b, text = next(p for p in pieces(a0, b0, text0) if p[0] <= ct < p[1] + 1e-6)
        words = text.split(" "); lens = [len(w.strip(",.?!")) + 1.5 for w in words]; tot = sum(lens); speak = (b - a) * 0.9
        starts, acc = [], a
        for l in lens: starts.append(acc); acc += speak * l / tot
        sp = F_C.getlength(" "); ws = [F_C.getlength(w) for w in words]; x = 540 - (sum(ws) + sp * (len(words) - 1)) / 2
        if sum(ws) + sp * (len(words) - 1) > 980: x = 540 - (sum(ws) + sp * (len(words) - 1)) / 2
        layer = Image.new("RGBA", (W, 240), (0, 0, 0, 0)); d = ImageDraw.Draw(layer); cur = max(j for j, s in enumerate(starts) if ct >= s)
        for j, (w, wl) in enumerate(zip(words, ws)):
            if ct >= starts[j]:
                u = clamp((ct - starts[j]) / 0.14); s = 1 + 0.18 * (1 - out3(u)); core = w.strip(",.?!").lower()
                col = GOLD if (j == cur or core in ("sky", "skylings", "skyling", "skyling's")) else SOFT
                f = F_C if s == 1 else ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", int(66 * s))
                d.text((x + wl / 2, 128), w, font=f, fill=col + (int(255 * min(1, u * 2)),), anchor="mm", stroke_width=5, stroke_fill=(8, 14, 34, int(200 * min(1, u * 2))))
            x += wl + sp
        shd = layer.filter(ImageFilter.GaussianBlur(10)); dk = Image.new("RGBA", layer.size, (5, 10, 30, 0)); dk.putalpha(shd.getchannel("A").point(lambda v: int(v * 0.55)))
        img.alpha_composite(dk, (0, CAP_Y - 122)); img.alpha_composite(layer, (0, CAP_Y - 128)); return

# ---------------------------------------------------------------- the ending: title in the sky, logo dissolves in under it
TITLE = [(2.02, [("Your day,", SOFT)], 1350), (2.32, [("drawn as the ", SOFT), ("sky.", GOLD)], 1452)]
SUB = (3.2, "Join the waitlist  ·  lifeflowweb.com", 1525)
LABEL_F = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-SemiBold.ttf", 44)
def end_card(j):
    if R3.END is None: R3.END = R.end_frames()
    return R3.END[min(j, END_HOLD)].copy()

def frame(i, rd, caps=True):
    k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < SEGS[-1]["out"] + SEGS[-1]["nf"] else None
    T = i / FPS
    if k is None:                                                            # the logo, title held
        img = Image.fromarray(end_card(i - END_OUT)).convert("RGBA")
        vo = SEGS[-1]; t = (i - vo["out"]) / FPS
        R4.title(img, t, TITLE, sub=SUB); return np.array(img.convert("RGB"))
    seg = SEGS[k]; t = (i - seg["out"]) / FPS; ct = seg["a"] + t
    src = rd.next(); s = shot_at(seg, t); c = crop_of(s); x0, y0, w, h = c
    m768 = matte_full(src); m = matte_crop(m768, c)
    crop = src[int(y0):int(y0 + h), int(x0):int(x0 + w)]
    arr = cv2.resize(crop, (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
    arr = grade(arr, m)
    arr = overlays(seg, None, arr, t, c, m)
    img = Image.fromarray(arr).convert("RGBA")
    draw_embers(img, T, c, 1.4 if seg.get("tag") == "vo" else 1.0)
    front(seg, img, t, c, T)
    if seg.get("tag") == "hook" and t < 3.3:                                 # the series label
        a = clamp(t / 0.3) * clamp((3.3 - t) / 0.3)
        d = ImageDraw.Draw(img); d.text((540, 300), "Campfire Q&A", font=LABEL_F, fill=SOFT + (int(225 * a),), anchor="mm", stroke_width=3, stroke_fill=(8, 14, 34, int(150 * a)))
    if caps: caption(img, seg["n"], ct)
    if seg.get("tag") == "vo": R4.title(img, t, TITLE, sub=SUB)
    arr = np.array(img.convert("RGB"))
    if k == len(SEGS) - 1 and i >= END_OUT:                                 # straight into the logo, the title stays on top
        u = smooth((i - END_OUT + 1) / XF)
        img2 = Image.fromarray(end_card(i - END_OUT)).convert("RGBA"); R4.title(img2, t, TITLE, sub=SUB)
        arr = (arr.astype(np.float32) * (1 - u) + np.array(img2.convert("RGB")).astype(np.float32) * u).astype(np.uint8)
    return arr

def reader_for(seg, skip=0):
    n = seg.get("clip_video", seg["n"]); a = seg.get("va", seg["a"]); return Reader(n, a + skip / FPS, seg["nf"] - skip)

if __name__ == "__main__":
    args = sys.argv[1:]; caps = "--nocap" not in args
    json.dump(dict(segs=[{k: v for k, v in s.items() if k != "shots"} for s in SEGS], end_out=END_OUT, n=N), open(f"{HERE}/timeline.json", "w"))
    if args and args[0] == "--preview":
        os.makedirs(f"{HERE}/prev", exist_ok=True)
        for sv in args[1].split(","):
            i = int(round(float(sv) * FPS)); k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < SEGS[-1]["out"] + SEGS[-1]["nf"] else None
            if k is None: Image.fromarray(frame(i, None, caps)).save(f"{HERE}/prev/p_{float(sv):05.2f}.jpg", quality=92); continue
            seg = SEGS[k]; rd = reader_for(seg); _prev_m = None
            for _ in range(i - seg["out"]): rd.next()
            Image.fromarray(frame(i, rd, caps)).save(f"{HERE}/prev/p_{float(sv):05.2f}.jpg", quality=92); rd.p.kill()
        sys.exit()
    part, parts = (int(args[1]), int(args[2])) if args and args[0] == "--part" else (0, 1)
    i0, i1 = N * part // parts, N * (part + 1) // parts
    out = f"{HERE}/campfire_silent.mp4" if parts == 1 else f"{HERE}/part{part}.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    k_now, rd = -1, None
    for i in range(i0, i1):
        k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < SEGS[-1]["out"] + SEGS[-1]["nf"] else None
        if k is not None and k != k_now:
            if rd is not None: rd.p.kill()
            rd = reader_for(SEGS[k], i - SEGS[k]["out"]); k_now = k; _prev_m = None
        enc.stdin.write(frame(i, rd).tobytes())
        if i % 60 == 0: print(i, "/", i1, flush=True)
    enc.stdin.close(); enc.wait(); print("frames", N, "seconds", round(N / FPS, 2))
