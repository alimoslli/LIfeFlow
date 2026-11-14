"""LifeFlow launch video v8 (+ 15 s cut): render4.py with changes you can see.
  - the ending's title "Your day, drawn as the sky." stays on screen while Ali's scene dissolves into the logo, which sits
    higher so the title becomes part of the final frame
  - captions in the title's style: Fraunces Bold, words pop in as they're said, the word being said in gold
  - a cinematic night grade (deeper blacks, warm glowing lights, cool shadows, a soft vignette), faces lit, and the app's
    colours washing over Ali while the wheel or the timeline is behind him; the skylings' glow on the scene is stronger
    python3 render5.py main|short [--preview 1.0,2.0] [--nocap] [--plain]   (--plain: the v7 look, for before/after)
"""
import json, math, os, sys, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render4 as R4
from render4 import R3, R
from render3 import clamp, smooth, out3, W, H, FPS, L, SP, GOLD, SOFT, paste
PLAIN = "--plain" in sys.argv

# ---------------------------------------------------------------- mattes: one consistent set for all of IMG_4127
def matte_arr(clip, n, zoom):
    p = {"a": f"{L}/fr2/am/{n + 1:04d}.png", "k": f"{L}/fr2/km/{n + 1:04d}.png", "t": f"{L}/fr2/tm/{n + 1:04d}.png"}[clip]
    if not os.path.exists(p): return None
    m = Image.open(p)
    if zoom != 1:
        m = m.resize((int(W * zoom), int(H * zoom)), Image.BILINEAR); ox, oy = int(540 * zoom - 540), int(930 * zoom - 930); m = m.crop((ox, oy, ox + W, oy + H))
    return np.array(m).astype(np.float32)[..., None] / 255
R3.matte_arr = matte_arr; R4.matte_arr = matte_arr

# ---------------------------------------------------------------- the grade (applied to the footage only; the app's art stays true)
def lut(points):
    xs, ys = zip(*points); return np.clip(np.interp(np.arange(256) / 255, xs, ys) * 255, 0, 255).astype(np.uint8)
LUT = np.stack([lut([(0, 0), (0.08, 0.055), (0.3, 0.29), (0.6, 0.65), (0.85, 0.9), (1, 1)]),           # red: warmer highlights
                lut([(0, 0), (0.08, 0.06), (0.3, 0.29), (0.6, 0.62), (0.85, 0.87), (1, 1)]),
                lut([(0, 0.02), (0.08, 0.085), (0.3, 0.31), (0.6, 0.61), (0.85, 0.84), (1, 0.97)])], 0)   # blue: cool shadows
_vig = None
def grade(arr):
    global _vig
    out = np.stack([LUT[c][arr[..., c]] for c in range(3)], -1).astype(np.float32)
    g = out.mean(-1, keepdims=True); out = g + (out - g) * 1.14                                  # a little richer colour
    lum = out[..., 0] * 0.3 + out[..., 1] * 0.55 + out[..., 2] * 0.15
    hi = np.clip((lum - 170) / 70, 0, 1)[..., None] * out                                       # the lights glow (bloom)
    bloom = cv2.GaussianBlur(hi, (0, 0), 13) * 0.55 + cv2.GaussianBlur(hi, (0, 0), 40) * 0.35
    out = 255 - (255 - np.clip(out, 0, 255)) * (1 - np.clip(bloom, 0, 255) / 255)
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W]; r = np.hypot((xx - 540) / 760, (yy - 900) / 1150); _vig = (1 - 0.32 * np.clip(r - 0.45, 0, 1) ** 1.6)[..., None]
    return np.clip(out * _vig, 0, 255).astype(np.uint8)
def face_light(arr, m, strength=0.8):
    """a soft key light on the face and chest: brighter mids inside the person's matte, top part only"""
    if m is None: return arr
    ys = np.where(m[..., 0].max(1) > 0.5)[0]
    if len(ys) == 0: return arr
    top = ys[0]; yy = np.arange(H)[:, None, None]
    wgt = m * np.clip(1 - (yy - top - 120) / 520, 0, 1) * strength
    f = arr.astype(np.float32) / 255; up = np.clip(f ** 0.72 * 1.06, 0, 1)
    up = up * np.array([1.03, 1.0, 0.97], np.float32)                                            # a touch warm, like a lamp
    return ((f * (1 - wgt) + np.clip(up, 0, 1) * wgt) * 255).astype(np.uint8)
_load0 = R.load_bg
def load_bg(path, zoom):
    im = _load0(path, zoom)
    if PLAIN or "/fr2/" not in path: return im
    clip = path.split("/fr2/")[1][0]; n = int(path[-8:-4]) - 1
    arr = grade(np.array(im)); arr = face_light(arr, matte_arr(clip, n, zoom), 0.9 if clip == "t" else 0.7)
    return Image.fromarray(arr)
R.load_bg = load_bg
if not PLAIN: R3.lift_face = lambda arr, m: arr        # replaced by face_light

# ---------------------------------------------------------------- the app's light on Ali: its colours wash over him (plus the thin edge light)
_lit0 = R3.lit_composite
def lit_composite(pieces, orig, m):
    base = _lit0(pieces, orig, m)
    if PLAIN: return base
    pf = pieces.astype(np.float32); lum = lambda x: x[..., 0] * 0.3 + x[..., 1] * 0.55 + x[..., 2] * 0.15
    add = np.clip((lum(pf) - lum(orig)) / 60, 0, 1)
    if add.mean() < 0.002: return base
    small = cv2.resize(pf * add[..., None], (W // 8, H // 8), interpolation=cv2.INTER_AREA); sw = cv2.resize(add, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
    col = cv2.GaussianBlur(small, (0, 0), 25) / np.maximum(cv2.GaussianBlur(sw, (0, 0), 25)[..., None], 1e-3)
    col = cv2.resize(col, (W, H), interpolation=cv2.INTER_LINEAR)
    amt = np.clip(cv2.resize(cv2.GaussianBlur(sw, (0, 0), 25), (W, H)) * 9, 0, 1)[..., None]
    ys = np.where(m[..., 0].max(1) > 0.5)[0]; top = ys[0] if len(ys) else 700
    yy = np.arange(H)[:, None, None]; wash = m * np.clip(1 - (yy - top) / 650, 0, 1) * amt * 0.30   # head and shoulders, fading down
    out = base.astype(np.float32); out = 255 - (255 - out) * (1 - wash * col / 255)
    return np.clip(out, 0, 255).astype(np.uint8)
R3.lit_composite = lit_composite; R4.lit_composite = lit_composite

# ---------------------------------------------------------------- the skylings light the scene more
_sk0 = R3._draw_skyling0; _sp = {}
def draw_skyling_lit(img, a, k, cx, cy, scale=1., anchor="center", alpha=1., glow=(255, 226, 160)):
    if glow and scale > 0.3 and not PLAIN:
        size = int(26 * k * 4.2); key = (size, glow)
        if key not in _sp:
            yy, xx = np.mgrid[0:size, 0:size]; r = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
            g = Image.new("RGBA", (size, size), glow + (0,)); g.putalpha(Image.fromarray((np.clip(1 - r, 0, 1) ** 2.0 * 78).astype(np.uint8))); _sp[key] = g
        sp = _sp[key]
        if scale * alpha < 0.999: sp = sp.copy(); sp.putalpha(sp.getchannel("A").point(lambda v: int(v * min(1, scale) * alpha)))
        oy = 0 if anchor == "center" else -26 * k * 0.46
        paste(img, sp, int(cx - size / 2), int(cy + oy - size / 2))
        _sk0(img, a, k, cx, cy, scale, anchor, alpha, glow); return
    R3.draw_skyling_lit(img, a, k, cx, cy, scale, anchor, alpha, glow)
R.draw_skyling = draw_skyling_lit

# ---------------------------------------------------------------- captions in the title's style
F_C = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", 66)
CAP_Y = 1430
def draw_caption(img, clip, t):
    if PLAIN: return R3_draw_caption0(img, clip, t)
    for a, b, text in R.CAPS.get(clip, []):
        if not (a <= t < b): continue
        words = text.split(" "); lens = [len(w.strip(",.?!")) + 1.5 for w in words]; tot = sum(lens); speak = (b - a) * 0.9
        starts, acc = [], a
        for l in lens: starts.append(acc); acc += speak * l / tot
        sp = F_C.getlength(" "); ws = [F_C.getlength(w) for w in words]; x = 540 - (sum(ws) + sp * (len(words) - 1)) / 2
        layer = Image.new("RGBA", (W, 240), (0, 0, 0, 0)); d = ImageDraw.Draw(layer); cur = max(j for j, s in enumerate(starts) if t >= s)
        for j, (w, wl) in enumerate(zip(words, ws)):
            if t >= starts[j]:
                u = clamp((t - starts[j]) / 0.14); s = 1 + 0.18 * (1 - out3(u))                      # pops in
                core = w.strip(",.?!").lower(); col = GOLD if (j == cur or core in R.GOLDW) else SOFT
                f = F_C if s == 1 else ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", int(66 * s))
                cx = x + wl / 2
                d.text((cx, 128), w, font=f, fill=col + (int(255 * min(1, u * 2)),), anchor="mm", stroke_width=5, stroke_fill=(8, 14, 34, int(200 * min(1, u * 2))))
            x += wl + sp
        sh = layer.filter(ImageFilter.GaussianBlur(10)); dark = Image.new("RGBA", layer.size, (5, 10, 30, 0)); dark.putalpha(sh.getchannel("A").point(lambda v: int(v * 0.55)))
        img.alpha_composite(dark, (0, CAP_Y - 128 + 6)); img.alpha_composite(layer, (0, CAP_Y - 128)); return
R3_draw_caption0 = R3.draw_caption
R3.draw_caption = draw_caption

# ---------------------------------------------------------------- the ending: the title stays while the logo comes in under it
TITLE_LINES = [(22.02, [("Your day,", SOFT)], 1350), (22.32, [("drawn as the ", SOFT), ("sky.", GOLD)], 1452)]
TITLE_SUB = (22.78, "LifeFlow  ·  Early January 2027", 1525)
_ending0 = R4.ending
def ending_no_title(arr, t, z, n):
    saved = R4.title; R4.title = lambda *a, **k: None
    try: return _ending0(arr, t, z, n)
    finally: R4.title = saved
if not PLAIN: R4.ending = ending_no_title
SHIFT = 250                                     # the logo ending sits this much higher, so the title fits under it
_end0 = R3.end_frame
def end_frame(j, hold_from=93):
    if PLAIN: return _end0(j, hold_from)
    if R3.END is None: R3.END = R.end_frames()
    f = R3.END[min(j, hold_from)]
    out = np.empty_like(f); out[:H - SHIFT] = f[SHIFT:]; out[H - SHIFT:] = f[:SHIFT][::-1]   # stars fill the bottom (the top, mirrored)
    img = Image.fromarray(out).convert("RGBA"); u = clamp((j / FPS - 0.9) / 0.5)
    if u > 0:
        d = ImageDraw.Draw(img); d.text((540, 1612), "lifeflowweb.com", font=R.FONT_URL, fill=(201, 213, 238, int(235 * out3(u))), anchor="mm")
    return np.array(img.convert("RGB"))
R3.end_frame = end_frame

_frame0 = R3.frame
def frame(i, TL, captions=True):
    arr = _frame0(i, TL, captions)
    if PLAIN: return arr
    last = TL["segs"][-1]
    if last["clip"] == "k" and i >= last["out"]:
        t = last["a"] / FPS + (i - last["out"]) / FPS             # the ending's clock keeps running into the logo
        img = Image.fromarray(arr).convert("RGBA"); R4.title(img, t, TITLE_LINES, sub=TITLE_SUB)
        for ox, oy, ph in [(-330, 1290, 0.0), (350, 1330, 0.6), (-300, 1480, 1.2), (330, 1470, 0.3)]:
            if t > 22.5: R3.pixel_star(img, 540 + ox, oy, 5, 0.85 * (0.5 + 0.5 * math.sin((t - 22.5) * 5 + ph * 6)) * clamp((t - 22.5) / 0.3))
        arr = np.array(img.convert("RGB"))
    return arr
R3.frame = frame

if __name__ == "__main__":
    cut = sys.argv[1]; TL = R3.build(cut); R3.init_refs_k(); args = [a for a in sys.argv[2:] if a != "--plain"]; caps = "--nocap" not in args
    json.dump(TL, open(f"{L}/timeline_{cut}.json", "w"))
    tag = "plain" if PLAIN else "v8"
    if args and args[0] == "--preview":
        os.makedirs(f"{L}/prev", exist_ok=True)
        for s in args[1].split(","):
            i = int(round(float(s) * FPS)); Image.fromarray(R3.frame(i, TL, caps)).save(f"{L}/prev/{tag}{cut}_{float(s):05.2f}.jpg", quality=92)
        sys.exit()
    out = f"{L}/{cut}_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(TL["n"]):
        enc.stdin.write(R3.frame(i, TL).tobytes())
        if i % 100 == 0: print(i, "/", TL["n"], flush=True)
    enc.stdin.close(); enc.wait(); print(cut, "frames", TL["n"], "seconds", round(TL["n"] / FPS, 2))
