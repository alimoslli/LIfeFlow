"""LifeFlow launch video v6 (+ a 15 s cut): everything from render.py (v5), plus
  - a hook: Ali's "Skylings. Skylings." from IMG_4126 opens the video, the five skylings burst into the sky around him
    and the wheel rises behind him and spins through the day; then the whip down to Tyler
  - the cinematic re-decode (fr2: three 120 fps frames blended per frame, half the grain) and Tyler's face lifted a little
  - light from the app: the wheel and the timeline put a rim of light on Ali's hair and shoulders; every skyling spills a
    faint glow on the scene
  - captions that light up word by word as they're said, a little higher (clear of Instagram's own text)
    python3 render3.py main|short [--preview 1.0,2.0] [--nocap]     (also writes timeline_<cut>.json for mix3.py)
"""
import json, math, os, sys, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from render import (clamp, smooth, back, out3, in3, smoothv, W, H, FPS, L, HERE, SP, KIT, NAVY, GOLD, SOFT, FONT_CAP,
                    pose_frame, burst, pixel_star, cloud, draw_cloud, paste, wheel_tex, plane3d, FIVE)

R.TRK["k"] = [np.vstack([np.array(m), [0, 0, 1]]) for m in json.load(open(f"{HERE}/track_k.json"))]; R.T0["k"] = 0.0
R.init_refs()

# ---------------------------------------------------------------- the cuts (clip, first frame, end frame, zoom); clips are 30 fps frames from 0 s
CUTS = {
    "main": dict(segs=[("k", 25, 87, 1.0), ("t", 0, 352, 1.0), ("a", 57, 513, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                 trans=["whip", "whip", "cut", "cut"], hook_wheel=True, hold=20),
    # 15 s: the hook, "in a simple, easy sky that goes by with your day" (the wheel), "with a very smart skyling by your side all day",
    # "Be ready by January, 2027.", the logo
    "short": dict(segs=[("k", 25, 87, 1.0), ("a", 255, 372, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                  trans=["whip", "cut", "cut"], hook_wheel=False, hold=6),
}
XF = 12                      # the last clip dissolves straight into the logo ending
def build(cut):
    c = CUTS[cut]; tl = []; o = 0
    for s in c["segs"]: tl.append(dict(out=o, clip=s[0], a=s[1], b=s[2], zoom=s[3])); o += s[2] - s[1]
    end_out = o - XF; n = end_out + 94 + c["hold"]
    return dict(segs=tl, trans=c["trans"], end_out=end_out, n=n, hook_wheel=c["hook_wheel"])

# ---------------------------------------------------------------- sources
def src_path(clip, n): return f"{L}/fr2/{clip}/{n + 1:04d}.jpg"
def matte_arr(clip, n, zoom):
    p = {"a": f"{L}/fr/am/{n + 1:04d}.png", "k": f"{L}/fr2/km/{n + 1:04d}.png", "t": f"{L}/fr2/tm/{n + 1:04d}.png"}[clip]
    if not os.path.exists(p): return None
    m = Image.open(p)
    if zoom != 1:
        m = m.resize((int(W * zoom), int(H * zoom)), Image.BILINEAR); ox, oy = int(540 * zoom - 540), int(930 * zoom - 930); m = m.crop((ox, oy, ox + W, oy + H))
    return np.array(m).astype(np.float32)[..., None] / 255

# ---------------------------------------------------------------- light
_spill = {}
_draw_skyling0 = R.draw_skyling
def draw_skyling_lit(img, a, k, cx, cy, scale=1., anchor="center", alpha=1., glow=(255, 226, 160)):
    """the kit's skyling, plus a faint wide glow on the scene around it (light, not a shape)"""
    if glow and scale > 0.3:
        size = int(26 * k * 3.2); key = (size, glow)
        if key not in _spill:
            yy, xx = np.mgrid[0:size, 0:size]; r = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
            g = Image.new("RGBA", (size, size), glow + (0,)); g.putalpha(Image.fromarray((np.clip(1 - r, 0, 1) ** 2.2 * 34).astype(np.uint8))); _spill[key] = g
        sp = _spill[key]
        if scale * alpha < 0.999: sp = sp.copy(); sp.putalpha(sp.getchannel("A").point(lambda v: int(v * min(1, scale) * alpha)))
        oy = 0 if anchor == "center" else -26 * k * 0.46
        paste(img, sp, int(cx - size / 2), int(cy + oy - size / 2))
    _draw_skyling0(img, a, k, cx, cy, scale, anchor, alpha, glow)
R.draw_skyling = draw_skyling_lit

def lit_composite(pieces, orig, m):
    """the 3D pieces behind the person, and their light wrapping onto the person's edge (hair, shoulders)"""
    pf = pieces.astype(np.float32); lum = lambda x: x[..., 0] * 0.3 + x[..., 1] * 0.55 + x[..., 2] * 0.15
    bright = np.clip((lum(pf) - lum(orig)) / 55, 0, 1)                  # only what the pieces add as light
    if bright.max() < 0.02: return (pf * (1 - m) + orig * m).astype(np.uint8)
    w = cv2.GaussianBlur(bright, (0, 0), 30)[..., None]
    col = cv2.GaussianBlur(pf * bright[..., None], (0, 0), 30) / np.maximum(w, 1e-3)
    mm = m[..., 0]; inner = cv2.erode(mm, np.ones((7, 7), np.uint8)); rim = cv2.GaussianBlur(np.clip(mm - inner, 0, 1), (0, 0), 2)[..., None] * m
    light = np.clip(w * 4.0, 0, 1) * rim * 0.38
    lit = 255 - (255 - orig) * (1 - light * col / 255)                 # screen blend
    return np.clip(pf * (1 - m) + lit * m, 0, 255).astype(np.uint8)

def lift_face(arr, m):
    """Tyler stood darker than Ali: lift his face and upper body a little (gamma), only inside his matte, top part"""
    if m is None: return arr
    yy = np.arange(H)[:, None, None]; wgt = m * np.clip((1450 - yy) / 250, 0, 1) * 0.85
    f = arr.astype(np.float32) / 255; up = np.clip(f ** 0.78 * 1.04, 0, 1)
    return ((f * (1 - wgt) + up * wgt) * 255).astype(np.uint8)

# ---------------------------------------------------------------- Ali's part with the app's light on him (from render.py)
def overlays_ali(arr, t, z, n):
    S = lambda x, y: R.to_screen("a", t, z, x, y)
    hx, hy = S(*R.REF["a_horizon"])
    if R.W_IN <= t < R.W_OUT + 0.35 or R.TL_IN <= t < R.TL_OUT + 0.3:
        orig = arr.astype(np.float32); R.draw_wheel(arr, t, hx, hy); R.draw_timeline(arr, t, hx, hy)
        m = matte_arr("a", n, z)
        if m is not None: arr[:] = lit_composite(arr, orig, m)
    img = Image.fromarray(arr).convert("RGBA")
    if 3.3 <= t < 5.85:
        u = (t - 3.3) / 0.28; v = (5.85 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*R.REF["a_name"]); draw_cloud(img, cloud("Ali Moslli, CEO and Developer", 2.6, 1), X, Y, s * clamp(v * 1.2), clamp(v))
    for j, (nm, x) in enumerate(FIVE):
        t0 = 6.62 + j * 0.13; tg = 8.2 + j * 0.05
        if t0 <= t < tg + 0.42:
            u = (t - t0) / 0.28; s = back(u) if u < 1 else 1
            X, Y = S(x, R.REF["a_row_y"] + 7 * math.sin((t + j * 0.5) * 2 * math.pi / 2.4))
            if t >= tg:
                w = in3((t - tg) / 0.42); tx, ty = hx, hy - 0.86 * R.W_W * R.W_HOR * 720 / 1080
                X += (tx - X) * w; Y += (ty - Y) * w - 120 * math.sin(math.pi * w); s *= 1 - 0.95 * w
            R.draw_skyling(img, pose_frame(nm, "wave" if 7.3 <= t < 8.2 else "idle", t, j * 0.37), 7, X, Y, s, glow=(255, 226, 160) if j < 3 else (200, 215, 255))
            burst(img, X, Y, t - t0, k=5, n=5, radius=90, seed=10 + j)
    R.draw_details(img, t)
    lx, ly = R.REF["a_side"]
    if t >= 19.6:
        arrive = 20.3; X, Y = S(lx, ly + 7 * math.sin(t * 2 * math.pi / 2.4))
        if t < arrive: w = out3((t - 19.6) / (arrive - 19.6)); X += -260 * (1 - w); Y -= 1050 * (1 - w) ** 1.6
        cyc = [(21.76, "Dawn"), (21.86, "Ray"), (21.96, "Goldie"), (22.06, "Twinkle-night"), (22.16, "Dreamy-night")]
        nm, last = "Dreamy-night", None
        for ts, nn in cyc:
            if t >= ts: nm, last = nn, ts
        pose = "wave" if 20.45 <= t < 21.65 else ("celebrate" if t >= 22.16 else "idle")
        R.draw_skyling(img, pose_frame(nm, pose, t), 9, X, Y, glow={"Dawn": (240, 170, 130), "Ray": (255, 220, 140), "Goldie": (255, 200, 120)}.get(nm, (200, 215, 255)))
        burst(img, X, Y, t - arrive, k=5, n=6, radius=120, seed=7)
        if last is not None and t - last < 0.3: burst(img, X, Y, t - last, k=5, n=5, radius=110, seed=int(last * 100))
    return img

# ---------------------------------------------------------------- the hook (IMG_4126 0.84 .. 2.9 s): "Skylings. Skylings."
H_POS = [(170, 480), (350, 330), (700, 330), (880, 480), (525, 205)]      # around his head, in the sky (picked on frame 40)
HW_IN, HW_T0, HW_T1 = 1.93, 2.05, 2.62
def overlays_hook(arr, t, z, n, wheel):
    S = lambda x, y: R.to_screen("k", t, z, x, y)
    hx, hy = S(*REF_K["horizon"])
    if wheel and t >= HW_IN:
        orig = arr.astype(np.float32)
        u = (t - HW_IN) / 0.32; e = back(u, 1.2) if u < 1 else 1
        k = 10 + (len(R.WHEEL) - 1 - 24) * smoothv(clamp((t - HW_T0) / (HW_T1 - HW_T0)))
        plane3d(arr, wheel_tex(k), hx, hy + 70 * (1 - e), R.W_W * (0.7 + 0.3 * e), 62 * (1 - e) - 8, 10 * math.sin((t - HW_IN) * 2.5),
                alpha=clamp(u * 2.5), glow=(150, 175, 240), anchor_y=R.W_HOR)
        m = matte_arr("k", n, z)
        if m is not None: arr[:] = lit_composite(arr, orig, m)
    img = Image.fromarray(arr).convert("RGBA")
    for j, (nm, _) in enumerate(FIVE):
        t0 = 0.8 + j * 0.1; u = (t - t0) / 0.26
        if u < 0: continue
        s = back(u) if u < 1 else 1; x, y = REF_K["pos"][j]; X, Y = S(x, y + 7 * math.sin(t * 2.6 + j))
        if wheel and t >= 2.0 + j * 0.04:   # into the wheel's sky as it rises
            w = in3((t - 2.0 - j * 0.04) / 0.36); tx, ty = hx, hy - 0.86 * R.W_W * R.W_HOR * 720 / 1080
            X += (tx - X) * w; Y += (ty - Y) * w - 100 * math.sin(math.pi * w); s *= 1 - 0.95 * w
            if w >= 1: continue
        pose = "celebrate" if t >= 1.96 else "wave"
        R.draw_skyling(img, pose_frame(nm, pose, t, j * 0.3), 8, X, Y, s, glow=(255, 226, 160) if j < 3 else (200, 215, 255))
        burst(img, X, Y, t - t0, k=6, n=6, radius=110, seed=60 + j)
    if not wheel and t >= 1.96: burst(img, 540, 380, t - 1.96, k=8, n=10, radius=420, seed=70)
    return img

REF_K = {}
def init_refs_k():
    REF_K["horizon"] = R.ref_at("k", 40, 540, 738)
    REF_K["pos"] = [R.ref_at("k", 40, x, y) for x, y in H_POS]

# ---------------------------------------------------------------- captions: word by word, a little higher
R.CAPS["k"] = [(0.86, 1.92, "Skylings."), (1.94, 2.95, "Skylings.")] + R.CAPS["c"]
CAP_Y = 1420
_capw = {}
def caption_img(text, upto):
    key = (text, upto)
    if key in _capw: return _capw[key]
    words = text.split(" "); sp = FONT_CAP.getlength(" ")
    ws = [FONT_CAP.getlength(w) for w in words]; tw = sum(ws) + sp * (len(words) - 1)
    pw, ph = int(tw + 64), 88
    im = Image.new("RGBA", (pw + 40, ph + 40), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0); ImageDraw.Draw(sh).rounded_rectangle([20, 26, 20 + pw, 26 + ph], 26, fill=110)
    sha = Image.new("RGBA", im.size, (5, 10, 30, 0)); sha.putalpha(sh.filter(ImageFilter.GaussianBlur(12))); im.alpha_composite(sha)
    d = ImageDraw.Draw(im); d.rounded_rectangle([20, 20, 20 + pw, 20 + ph], 26, fill=NAVY + (222,))
    x = 20 + 32
    for j, (w, wl) in enumerate(zip(words, ws)):
        core = w.strip(",.?!").lower(); col = GOLD if core in R.GOLDW else SOFT
        a = 255 if j < upto else 105                                   # said: full; still to come: dim
        d.text((x, 20 + ph / 2 + 2), w, font=FONT_CAP, fill=col + (a,), anchor="lm"); x += wl + sp
    _capw[key] = im; return im
def draw_caption(img, clip, t):
    for a, b, text in R.CAPS.get(clip, []):
        if a <= t < b:
            words = text.split(" "); L_ = [len(w.strip(",.?!")) + 1.5 for w in words]; tot = sum(L_); speak = (b - a) * 0.9
            acc, upto = a, 0
            for j, l in enumerate(L_):
                if t >= acc: upto = j + 1
                acc += speak * l / tot
            im = caption_img(text, upto); u = clamp((t - a) / 0.12); s = 0.94 + 0.06 * out3(u)
            if s != 1: im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
            if u < 1: im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * out3(u))))
            paste(img, im, int(540 - im.width / 2), int(CAP_Y - im.height / 2)); return

# ---------------------------------------------------------------- frames
END = None
def end_frame(j, hold_from=93):
    global END
    if END is None: END = R.end_frames()
    img = Image.fromarray(END[min(j, hold_from)]).convert("RGBA"); te = j / FPS; u = clamp((te - 0.7) / 0.5)
    if u > 0:
        d = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(d)
        dd.text((540, 352), "Early January 2027", font=R.FONT_END, fill=SOFT + (int(235 * out3(u)),), anchor="mm")
        dd.text((540, 1530), "lifeflowweb.com", font=R.FONT_URL, fill=(201, 213, 238, int(235 * out3(u))), anchor="mm")
        img.alpha_composite(d)
    return np.array(img.convert("RGB"))

def scene(seg, i, TL, captions=True):
    clip, z = seg["clip"], seg["zoom"]; n = seg["a"] + (i - seg["out"]); t = n / FPS
    bg = R.load_bg(src_path(clip, n), z); arr = np.array(bg)
    if clip == "t":
        arr = lift_face(arr, matte_arr("t", n, z)); img = Image.fromarray(arr).convert("RGBA"); R.overlays_tyler(img, t, z)
    elif clip == "a": img = overlays_ali(arr, t, z, n)
    elif t < 5: img = overlays_hook(arr, t, z, n, TL["hook_wheel"])
    else:
        img = Image.fromarray(arr).convert("RGBA"); R.overlays_close(img, t, None)
        m = matte_arr("k", n, z)
        if m is not None: img = Image.fromarray((np.array(img.convert("RGB")) * (1 - m) + np.array(bg) * m).astype(np.uint8)).convert("RGBA")
    out = np.array(img.convert("RGB"))
    return out, clip, t

def frame(i, TL, captions=True):
    if i >= TL["segs"][-1]["out"] + (TL["segs"][-1]["b"] - TL["segs"][-1]["a"]): return end_frame(i - TL["end_out"])
    k = max(j for j, s in enumerate(TL["segs"]) if s["out"] <= i); seg = TL["segs"][k]
    arr, clip, t = scene(seg, i, TL)
    seg_end = seg["out"] + seg["b"] - seg["a"]
    if k + 1 < len(TL["segs"]) and TL["trans"][k] == "whip" and i >= seg_end - 11:
        u = (i - (seg_end - 11)) / 11; arr = R.whip(arr, 1400 * u ** 3, 6 + 220 * u ** 2)
    if k > 0 and TL["trans"][k - 1] == "whip" and i < seg["out"] + 12:
        u = (i - seg["out"]) / 12; arr = R.whip(arr, -1400 * (1 - u) ** 3, 6 + 220 * (1 - u) ** 2)
    if captions:
        cap = Image.fromarray(arr).convert("RGBA"); draw_caption(cap, clip, t); arr = np.array(cap.convert("RGB"))
    if k == len(TL["segs"]) - 1 and i >= TL["end_out"]:
        u = smooth((i - TL["end_out"] + 1) / XF); arr = (arr.astype(np.float32) * (1 - u) + end_frame(i - TL["end_out"]).astype(np.float32) * u).astype(np.uint8)
    return arr

if __name__ == "__main__":
    cut = sys.argv[1]; TL = build(cut); init_refs_k(); args = sys.argv[2:]; caps = "--nocap" not in args
    json.dump(TL, open(f"{L}/timeline_{cut}.json", "w"))
    if args and args[0] == "--preview":
        os.makedirs(f"{L}/prev", exist_ok=True)
        for s in args[1].split(","):
            i = int(round(float(s) * FPS)); Image.fromarray(frame(i, TL, caps)).save(f"{L}/prev/{cut}_{float(s):05.2f}.jpg", quality=92)
        sys.exit()
    out = f"{L}/{cut}_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(TL["n"]):
        enc.stdin.write(frame(i, TL).tobytes())
        if i % 100 == 0: print(i, "/", TL["n"], flush=True)
    enc.stdin.close(); enc.wait(); print(cut, "frames", TL["n"], "seconds", round(TL["n"] / FPS, 2))
