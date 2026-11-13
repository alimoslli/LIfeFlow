"""LifeFlow launch video v2 (pier, Nov 12 clips): Tyler (IMG_4105), Ali (IMG_4127), Ali's closing line (IMG_4126).
The founders stay on screen; the app comes in as overlays: the skylings in the real sky, the app's pixel clouds with real
details, and two pieces of the app pulled out in 3D with no background: the wheel (Today's sky dome, turned from morning to
night) rising behind Ali, and the timeline (the day's track) flowing along the real horizon behind him to each thing he
names. A person matte keeps Ali in front of them. Everything is the app's own art, recorded from main.
    python3 render.py [out.mp4] | --preview 1.0,2.5
"""
import json, math, os, subprocess, sys, glob
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); L = os.path.dirname(HERE); SP = os.path.dirname(L)
KIT = f"{SP}/kit/lifeflow-brand"; sys.path.insert(0, f"{KIT}/tools")
from make_cloud import make_cloud
W, H, FPS = 1080, 1920, 30
FONT_CAP = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-SemiBold.ttf", 54)
FONT_END = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-SemiBold.ttf", 50)
FONT_URL = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 38)
NAVY, GOLD, SOFT = (20, 36, 81), (255, 210, 122), (243, 245, 250)

# ---------------------------------------------------------------- timeline (output frames at 30 fps)
T_N = 352                      # Tyler: all of IMG_4105
A1_S, A1_E = 57, 513           # IMG_4127 1.9 s .. 17.1 s ("What's up" ... "and all your finances", the last "s" kept)
A2_S, A2_E = 585, 672          # IMG_4127 19.5 s .. 22.4 s ("with a very smart skyling by your side all day.")
C_S, C_E = 29, 85              # IMG_4126 (fr/c starts at 21.0 s): 21.967 s .. 23.833 s ("Be ready by January, 2027.")
SLOW_N = 22                    # IMG_4126 from 23.833 s at 120 fps, one source frame per output frame (0.25x): he gets up
END_N = 105
O_A1 = T_N; O_A2 = O_A1 + (A1_E - A1_S); O_C = O_A2 + (A2_E - A2_S); O_SL = O_C + (C_E - C_S); O_END = O_SL + SLOW_N; N = O_END + END_N
ZOOM2 = 1.06

def seg_of(i):
    """-> (clip, source seconds, frame path, zoom, source frame number for the matte)"""
    if i < O_A1: return "t", i / FPS, f"{L}/fr/t/{i + 1:04d}.jpg", 1.0, None
    if i < O_A2: s = A1_S + (i - O_A1); return "a", s / FPS, f"{L}/fr/a/{s + 1:04d}.jpg", 1.0, s + 1
    if i < O_C: s = A2_S + (i - O_A2); return "a", s / FPS, f"{L}/fr/a/{s + 1:04d}.jpg", ZOOM2, s + 1
    if i < O_SL: s = C_S + (i - O_C); return "c", 21.0 + s / FPS, f"{L}/fr/c/{s + 1:04d}.jpg", 1.0, f"{L}/fr/cm/{s + 1:04d}.png"
    if i < O_END: k = 16 + (i - O_SL); return "c", 23.7 + k / 120, f"{L}/fr/cslow/{min(k + 1, 40):04d}.jpg", 1.0, f"{L}/fr/csm/{min(k + 1, 40):04d}.png"
    return "end", (i - O_END) / FPS, None, 1.0, None

TRK = {c: [np.vstack([np.array(m), [0, 0, 1]]) for m in json.load(open(f"{HERE}/track_{c}.json"))] for c in "tac"}
T0 = {"t": 0.0, "a": 0.0, "c": 21.0}
def cam(clip, t):
    tr = TRK[clip]; f = min(max((t - T0[clip]) * FPS, 0), len(tr) - 1); a = int(f); b = min(a + 1, len(tr) - 1); u = f - a
    return tr[a] * (1 - u) + tr[b] * u
def ref_at(clip, frame, x, y):
    p = np.linalg.inv(TRK[clip][frame]) @ [x, y, 1]; return p[0], p[1]
def to_screen(clip, t, zoom, x, y):
    p = cam(clip, t) @ [x, y, 1]; X, Y = p[0], p[1]
    if zoom != 1: X = 540 + (X - 540) * zoom; Y = 930 + (Y - 930) * zoom
    return X, Y

# ---------------------------------------------------------------- easing
def clamp(v, a=0., b=1.): return max(a, min(b, v))
def smooth(v): v = clamp(v); return v * v * (3 - 2 * v)
def back(v, s=1.9): v = clamp(v) - 1; return 1 + (s + 1) * v ** 3 + s * v ** 2
def out3(v): v = clamp(v); return 1 - (1 - v) ** 3
def in3(v): v = clamp(v); return v ** 3
def smoothv(v): return v * v * (3 - 2 * v)

# ---------------------------------------------------------------- skylings (kit frames: 40 px per art pixel)
_art = {}
def art(name, pose):
    key = (name, pose)
    if key not in _art:
        fs = sorted(glob.glob(f"{KIT}/assets/skylings_animated/{name}_{pose}/*.png"))
        _art[key] = [np.array(Image.open(f).convert("RGBA"))[40::40, 40::40] for f in fs]
    return _art[key]
def pose_frame(name, pose, t, phase=0.):
    fr = art(name, pose)
    if pose == "idle": return fr[1] if len(fr) > 1 and ((t + phase) % 1.8) < 0.18 else fr[0]
    return fr[int((t + phase) / 0.18) % len(fr)]
_glow = {}
def glow_for(a, k, color):
    key = (a.tobytes(), k, color)
    if key not in _glow:
        al = Image.fromarray(np.repeat(np.repeat(a[..., 3], k, 0), k, 1)).filter(ImageFilter.GaussianBlur(k * 2.2))
        g = Image.new("RGBA", al.size, color + (0,)); g.putalpha(al.point(lambda v: int(v * 0.42))); _glow[key] = g
    return _glow[key]
def paste(img, im, x, y):
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(W, x + im.width), min(H, y + im.height)
    if x1 <= x0 or y1 <= y0: return
    img.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))
def draw_skyling(img, a, k, cx, cy, scale=1., anchor="center", alpha=1., glow=(255, 226, 160)):
    size = max(1, int(round(26 * k * scale)))
    big = Image.fromarray(np.repeat(np.repeat(a, k, 0), k, 1)) if scale == 1 else Image.fromarray(a).resize((size, size), Image.NEAREST)
    if alpha < 1: big.putalpha(big.getchannel("A").point(lambda v: int(v * alpha)))
    x = int(round(cx - size / 2)); y = int(round(cy - size / 2 if anchor == "center" else cy - size * 0.96))
    if glow and scale > 0.3:
        g = glow_for(a, k, glow)
        if scale != 1: g = g.resize((size, size))
        if alpha < 1: g = g.copy(); g.putalpha(g.getchannel("A").point(lambda v: int(v * alpha)))
        paste(img, g, x, y)
    paste(img, big, x, y)
STAR = ["..#..", ".###.", "#####", ".###.", "..#.."]
def pixel_star(img, cx, cy, k, alpha, color=GOLD):
    if alpha <= 0: return
    d = ImageDraw.Draw(img, "RGBA"); c = color + (int(255 * alpha),)
    for r, row in enumerate(STAR):
        for q, ch in enumerate(row):
            if ch == "#": x = cx + (q - 2) * k; y = cy + (r - 2) * k; d.rectangle([x, y, x + k - 1, y + k - 1], fill=c)
def burst(img, cx, cy, t, k=6, n=6, radius=120, seed=0, color=GOLD):
    if not (0 <= t < 0.55): return
    rng = np.random.default_rng(seed)
    for j in range(n):
        ang = 2 * math.pi * (j / n) + rng.uniform(-0.3, 0.3); r = radius * out3(t / 0.5) * rng.uniform(0.7, 1.1)
        pixel_star(img, int(cx + r * math.cos(ang)), int(cy + r * math.sin(ang)), max(2, int(k * (1 - t / 0.55))), 1 - t / 0.55, color)

# ---------------------------------------------------------------- clouds (the kit's make_cloud.py)
_cl = {}
def cloud(text, zoom, shape=1, night=True):
    key = (text, zoom, shape, night)
    if key not in _cl: _cl[key] = make_cloud(text, shape, night, zoom)
    return _cl[key]
def draw_cloud(img, c, cx, cy, s=1., alpha=1.):
    if s <= 0.02 or alpha <= 0: return
    im = c if s == 1 else c.resize((max(1, int(c.width * s)), max(1, int(c.height * s))), Image.NEAREST if s > 0.9 else Image.BILINEAR)
    if alpha < 1: im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    paste(img, im, int(round(cx - im.width / 2)), int(round(cy - im.height / 2)))

# ---------------------------------------------------------------- the two app pieces, no background, in 3D
WHEEL = sorted(glob.glob(f"{SP}/whatsnew/cap/wheel2/w*.png"))       # Today's dome turned from 7:10 AM to night (see-through)
TLINE = sorted(glob.glob(f"{SP}/whatsnew/cap/timeline2/t*.png"))    # the day's track, scroll 1300 + 2.5 per frame (see-through)
TL_Y0, TL_Y1 = 100, 650
_tlmask = None
def premul(im):
    a = im[..., 3:4] / 255; return np.dstack([im[..., :3] * a, im[..., 3]])
WMASK = np.array(Image.open(f"{HERE}/wheel_mask.png")).astype(np.float32) / 255
def wheel_tex(k):
    im = np.array(Image.open(WHEEL[int(clamp(round(k), 0, len(WHEEL) - 1))]).convert("RGBA"))[:720].astype(np.float32)
    im[..., 3] *= WMASK; return premul(im)
def tline_tex(scroll):
    global _tlmask
    k = int(round((scroll - 1300) / 2.5)); im = np.array(Image.open(TLINE[int(clamp(k, 0, len(TLINE) - 1))]).convert("RGBA"))[TL_Y0:TL_Y1].astype(np.float32)
    if _tlmask is None: x = np.arange(im.shape[1]); _tlmask = smoothv(np.clip(np.minimum(x - 20, im.shape[1] - 20 - x) / 170, 0, 1))
    im[..., 3] *= _tlmask[None, :]; return premul(im)
def rot(rx, ry, rz=0.):
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    X = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
    Y = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
    Z = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    return Z @ Y @ X
def plane3d(base, tex, cx, cy, width, rx, ry, rz=0., alpha=1., glow=(150, 180, 255), f=1500., anchor_y=0.5):
    """draw a premultiplied RGBA texture as a card in 3D (rx: top tilts away, ry: turns); (cx, cy) is the point at anchor_y of its height."""
    if alpha <= 0.01 or width < 4: return
    h, w = tex.shape[:2]; hw = width / 2; ht = width * h / w; top, bot = -ht * anchor_y, ht * (1 - anchor_y)
    R = rot(rx, ry, rz); dst = []
    for x, y in [(-hw, top), (hw, top), (hw, bot), (-hw, bot)]:
        p = R @ [x, y, 0]; s = f / (f + p[2]); dst.append([cx + p[0] * s, cy + p[1] * s])
    dst = np.float32(dst); x0, y0 = np.floor(dst.min(0)).astype(int) - 40; x1, y1 = np.ceil(dst.max(0)).astype(int) + 40
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if x1 <= x0 or y1 <= y0: return
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(dst - [x0, y0]))
    warp = cv2.warpPerspective(tex, M, (x1 - x0, y1 - y0), flags=cv2.INTER_AREA if width < w * 0.75 else cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    a = warp[..., 3:4] / 255 * alpha; rgb = warp[..., :3] * alpha
    region = base[y0:y1, x0:x1].astype(np.float32)
    if glow:
        g = cv2.GaussianBlur(a[..., 0], (0, 0), 16)[..., None] * 0.30
        region = region * (1 - g) + np.array(glow, np.float32) * g
    base[y0:y1, x0:x1] = np.clip(region * (1 - a) + rgb, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- captions
CAPS = {
    "t": [(0.0, 1.46, "Hey guys, how's it going?"), (1.52, 2.62, "My name is Tyler Kardy."), (2.66, 3.7, "I run the marketing here"),
          (3.7, 4.44, "for LifeFlow."), (4.44, 5.48, "Today, Ali and I"), (5.48, 6.16, "will be explaining"), (6.16, 7.18, "our future plans"),
          (7.18, 8.3, "and what we got going"), (8.3, 10.8, "for early January of 2027."), (10.86, 11.6, "Let's go!")],
    "a": [(2.42, 3.2, "What's up, everybody?"), (3.3, 4.3, "My name is Ali Moslli."), (4.3, 4.78, "I'm the developer"), (4.78, 5.8, "behind LifeFlow,"),
          (5.86, 7.02, "and I think the skylings"), (7.02, 7.6, "are the new way"), (7.6, 8.56, "you can manage your life"),
          (8.56, 10.22, "in a simple, easy sky"), (10.22, 12.4, "that goes by with your day,"), (12.62, 13.95, "showing all your classes,"),
          (14.0, 14.72, "your work shifts,"), (14.76, 15.6, "your schedules,"), (15.98, 17.0, "and all your finances,"),
          (19.5, 20.98, "with a very smart skyling"), (20.98, 22.5, "by your side all day.")],
    "c": [(21.98, 24.1, "Be ready by January, 2027.")],
}
GOLDW = {"sky", "skylings", "skyling"}
_capc = {}
def caption_img(text):
    if text in _capc: return _capc[text]
    words = text.split(" "); sp = FONT_CAP.getlength(" ")
    ws = [FONT_CAP.getlength(w) for w in words]; tw = sum(ws) + sp * (len(words) - 1)
    pw, ph = int(tw + 64), 88
    im = Image.new("RGBA", (pw + 40, ph + 40), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0); ImageDraw.Draw(sh).rounded_rectangle([20, 26, 20 + pw, 26 + ph], 26, fill=110)
    sha = Image.new("RGBA", im.size, (5, 10, 30, 0)); sha.putalpha(sh.filter(ImageFilter.GaussianBlur(12))); im.alpha_composite(sha)
    d = ImageDraw.Draw(im); d.rounded_rectangle([20, 20, 20 + pw, 20 + ph], 26, fill=NAVY + (222,))
    x = 20 + 32
    for w, wl in zip(words, ws):
        core = w.strip(",.?!").lower(); d.text((x, 20 + ph / 2 + 2), w, font=FONT_CAP, fill=GOLD if core in GOLDW else SOFT, anchor="lm"); x += wl + sp
    _capc[text] = im; return im
def draw_caption(img, clip, t, y=1528):
    for a, b, text in CAPS.get(clip, []):
        if a <= t < b:
            im = caption_img(text); u = clamp((t - a) / 0.12); s = 0.94 + 0.06 * out3(u)
            if s != 1: im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
            if u < 1: im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * out3(u))))
            paste(img, im, int(540 - im.width / 2), int(y - im.height / 2)); return

# ---------------------------------------------------------------- overlays
LOCK = Image.open(f"{KIT}/assets/logo/logo_lockup_white_text.png").convert("RGBA").crop((20, 20, 1142, 340))
LOCK = LOCK.resize((300, int(300 * LOCK.height / LOCK.width)), Image.LANCZOS)
REF = {}
def init_refs():
    REF["t_dreamy"] = ref_at("t", 5, 270, 470); REF["t_name"] = ref_at("t", 60, 540, 790); REF["t_date"] = ref_at("t", 280, 600, 720)
    REF["a_name"] = ref_at("a", 110, 540, 690); REF["a_row_y"] = ref_at("a", 200, 540, 520)[1]; REF["a_side"] = ref_at("a", 600, 250, 935)
    REF["a_horizon"] = ref_at("a", 300, 540, 800)
    REF["c_date"] = ref_at("c", 40, 540, 500); REF["c_row_y"] = ref_at("c", 40, 540, 310)[1]

def overlays_tyler(img, t, z):
    S = lambda x, y: to_screen("t", t, z, x, y)
    dx, dy = REF["t_dreamy"]
    if t >= -0.14:
        u = (t + 0.14) / 0.3; s = back(u) if u < 1 else 1
        pose = "wave" if 0.55 <= t < 1.55 else ("celebrate" if 3.9 <= t < 4.62 or 10.86 <= t < 11.4 else "idle")
        fy = 8 * math.sin(t * 2 * math.pi / 2.6)
        if t >= 11.36: fy -= 1500 * in3((t - 11.36) / 0.36)
        X, Y = S(dx, dy + fy); draw_skyling(img, pose_frame("Dreamy-night", pose, t), 11, X, Y, s, glow=(200, 215, 255))
        burst(img, X, Y, t + 0.05, k=7, n=7, radius=170, seed=1)
    if 1.52 <= t < 4.5:
        u = (t - 1.52) / 0.28; v = (4.5 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*REF["t_name"]); draw_cloud(img, cloud("Tyler Kardy, CMO", 2.7, 2), X, Y, s * clamp(v * 1.2), clamp(v))
    if t >= 9.0:
        u = (t - 9.0) / 0.3; s = back(u) if u < 1 else 1; X, Y = S(*REF["t_date"])
        if t >= 11.36: Y -= 1500 * in3((t - 11.36) / 0.36)
        draw_cloud(img, cloud("Early January 2027", 3.2, 1), X, Y, s); burst(img, X, Y, t - 9.05, k=8, n=8, radius=300, seed=4)
        for ox, oy, ph in [(-290, -70, 0.0), (300, -50, 0.5), (-250, 80, 1.1), (270, 90, 0.8)]:
            if t > 9.25: pixel_star(img, int(X + ox), int(Y + oy), 5, 0.85 * (0.5 + 0.5 * math.sin((t - 9.2) * 5 + ph * 6)) * clamp((t - 9.25) / 0.2))
    if 3.92 <= t < 11.4:
        u = clamp((t - 3.92) / 0.35); v = clamp((11.4 - t) / 0.25)
        im = LOCK.copy(); im.putalpha(im.getchannel("A").point(lambda q: int(q * out3(u) * v))); paste(img, im, 540 - im.width // 2, int(262 - 18 * (1 - out3(u))))

FIVE = [("Dawn", 150), ("Ray", 345), ("Goldie", 540), ("Twinkle-night", 735), ("Dreamy-night", 930)]
# the wheel rises behind Ali from the real horizon and turns from morning to night ("a simple, easy sky that goes by with your day")
W_IN, W_TURN0, W_TURN1, W_OUT = 8.42, 8.95, 12.1, 12.25
W_W, W_HOR = 1000, 640 / 720          # the dome's horizon line sits 640 px down the 720 px texture
def wheel_pose(t, hx, hy):
    u = (t - W_IN) / 0.55; e = back(u, 1.3) if u < 1 else 1
    rx = 62 * (1 - e) - 8 + 3 * math.sin(t * 1.7); ry = 11 * math.sin((t - W_IN) * 1.2); cy = hy + 90 * (1 - e)
    sc = 0.7 + 0.3 * e; al = clamp(u * 2.2)
    if t > W_OUT: v = in3((t - W_OUT) / 0.35); rx += 80 * v; sc *= 1 - 0.25 * v; al *= 1 - v
    return rx, ry, hx, cy, sc, al
def draw_wheel(base, t, hx, hy):
    if not (W_IN <= t < W_OUT + 0.35): return
    k = 10 + (len(WHEEL) - 1 - 14 - 10) * smoothv(clamp((t - W_TURN0) / (W_TURN1 - W_TURN0)))
    rx, ry, cx, cy, sc, al = wheel_pose(t, hx, hy)
    plane3d(base, wheel_tex(k), cx, cy, W_W * sc, rx, ry, alpha=al, glow=(150, 175, 240), anchor_y=W_HOR)
# the timeline flows along the horizon behind Ali; what he names stops left of his head (view x 120 of 412)
TL_IN, TL_OUT = 12.2, 19.5
TL_KEYS = [(12.2, 1400), (12.7, 1513), (13.42, 1617), (14.12, 1721), (14.86, 1840), (15.6, 1895), (16.45, 2155), (19.5, 2160)]
TL_HOR = (400 - TL_Y0) / (TL_Y1 - TL_Y0)   # the strip's horizon, as a share of the cropped texture height
def tl_scroll(t):
    for (a, va), (b, vb) in zip(TL_KEYS[:-1], TL_KEYS[1:]):
        if a <= t <= b: u = (t - a) / (b - a); u = 0.4 * u + 0.6 * smoothv(u); return va + (vb - va) * u
    return TL_KEYS[-1][1] if t > TL_KEYS[-1][0] else TL_KEYS[0][1]
def draw_timeline(base, t, hx, hy):
    if not (TL_IN <= t < TL_OUT + 0.3): return
    u = (t - TL_IN) / 0.5; e = back(u, 1.2) if u < 1 else 1
    rx = 55 * (1 - e) + 12 + 2 * math.sin(t * 1.6); ry = -8 + 13 * smoothv(clamp((t - TL_IN) / 4.8)); sc = 0.75 + 0.25 * e; al = clamp(u * 2.2)
    if t > TL_OUT: v = in3((t - TL_OUT) / 0.3); rx += 60 * v; al *= 1 - v
    plane3d(base, tline_tex(tl_scroll(t)), hx, hy + 8, 1120 * sc, rx, ry, alpha=al, glow=(140, 170, 235), anchor_y=TL_HOR)
# the real details from Today rise as the app's clouds above the timeline, one after another
DETAILS = [(13.36, "Chapter 6 reading due 11:59 PM", -150), (14.04, "Thu: 12:30 to 3 PM shift", 170), (14.82, "12 PM Lunch with Sam", -170),
           (16.4, "Spotify $11.99 tomorrow, you have $1,842", 0)]
def draw_details(img, t):
    for j, (ts, txt, ox) in enumerate(DETAILS):
        life = t - (ts - 0.1)
        if life < 0: continue
        end = (TL_OUT - (ts - 0.1)) if j == 3 else (DETAILS[j + 1][0] + 1.0 - (ts - 0.1))
        if life > end + 0.3: continue
        u = life / 0.34; s = 0.4 + 0.6 * back(u, 1.3) if u < 1 else 1
        y = 560 - 220 * out3(clamp(life / 1.8)); a = 1.0
        if life > end: q = (life - end) / 0.3; a = 1 - q; y -= 60 * q
        if t >= TL_OUT: a = min(a, 1 - (t - TL_OUT) / 0.25)
        draw_cloud(img, cloud(txt, 2.0, 1 + j % 3), 540 + ox, y, s, clamp(a))
        if 0 <= life < 0.6: burst(img, 540 + ox, y, life - 0.1, k=4, n=5, radius=80, seed=20 + j)

def matte(src_frame, zoom):
    p = f"{L}/fr/am/{src_frame:04d}.png"
    if not os.path.exists(p): return None
    m = Image.open(p)
    if zoom != 1:
        m = m.resize((int(W * zoom), int(H * zoom)), Image.BILINEAR); ox, oy = int(540 * zoom - 540), int(930 * zoom - 930); m = m.crop((ox, oy, ox + W, oy + H))
    return np.array(m).astype(np.float32)[..., None] / 255

def overlays_ali(arr, t, z, src):
    """the 3D pieces go behind Ali (person matte), the pixel art and clouds in front. Returns RGBA image."""
    S = lambda x, y: to_screen("a", t, z, x, y)
    hx, hy = S(*REF["a_horizon"])
    if W_IN <= t < W_OUT + 0.35 or TL_IN <= t < TL_OUT + 0.3:
        orig = arr.copy(); draw_wheel(arr, t, hx, hy); draw_timeline(arr, t, hx, hy)
        m = matte(src, z)
        if m is not None: arr[:] = (arr * (1 - m) + orig * m).astype(np.uint8)
    img = Image.fromarray(arr).convert("RGBA")
    if 3.3 <= t < 5.85:
        u = (t - 3.3) / 0.28; v = (5.85 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*REF["a_name"]); draw_cloud(img, cloud("Ali Moslli, CEO and Developer", 2.6, 1), X, Y, s * clamp(v * 1.2), clamp(v))
    # "the skylings": all five pop over the Bay Bridge, then hop up into the wheel as it rises
    for j, (nm, x) in enumerate(FIVE):
        t0 = 6.62 + j * 0.13; tg = 8.2 + j * 0.05
        if t0 <= t < tg + 0.42:
            u = (t - t0) / 0.28; s = back(u) if u < 1 else 1
            X, Y = S(x, REF["a_row_y"] + 7 * math.sin((t + j * 0.5) * 2 * math.pi / 2.4))
            if t >= tg:
                w = in3((t - tg) / 0.42); tx, ty = hx, hy - 0.86 * W_W * W_HOR * 720 / 1080
                X += (tx - X) * w; Y += (ty - Y) * w - 120 * math.sin(math.pi * w); s *= 1 - 0.95 * w
            draw_skyling(img, pose_frame(nm, "wave" if 7.3 <= t < 8.2 else "idle", t, j * 0.37), 7, X, Y, s, glow=(255, 226, 160) if j < 3 else (200, 215, 255))
            burst(img, X, Y, t - t0, k=5, n=5, radius=90, seed=10 + j)
    draw_details(img, t)
    lx, ly = REF["a_side"]
    if t >= 19.6:
        arrive = 20.3; X, Y = S(lx, ly + 7 * math.sin(t * 2 * math.pi / 2.4))
        if t < arrive: w = out3((t - 19.6) / (arrive - 19.6)); X += -260 * (1 - w); Y -= 1050 * (1 - w) ** 1.6
        cyc = [(21.76, "Dawn"), (21.86, "Ray"), (21.96, "Goldie"), (22.06, "Twinkle-night"), (22.16, "Dreamy-night")]
        nm, last = "Dreamy-night", None
        for ts, n in cyc:
            if t >= ts: nm, last = n, ts
        pose = "wave" if 20.45 <= t < 21.65 else ("celebrate" if t >= 22.16 else "idle")
        draw_skyling(img, pose_frame(nm, pose, t), 9, X, Y, glow={"Dawn": (240, 170, 130), "Ray": (255, 220, 140), "Goldie": (255, 200, 120)}.get(nm, (200, 215, 255)))
        burst(img, X, Y, t - arrive, k=5, n=6, radius=120, seed=7)
        if last is not None and t - last < 0.3: burst(img, X, Y, t - last, k=5, n=5, radius=110, seed=int(last * 100))
    return img

def overlays_close(img, t, slow_t):
    """Ali's last line (IMG_4126): all five celebrate in the sky, "January 2027" lands; he gets up in slow motion."""
    S = lambda x, y: to_screen("c", t, 1.0, x, y); tt = t if slow_t is None else 23.833 + slow_t
    for j, (nm, x) in enumerate(FIVE):
        t0 = 21.98 + j * 0.07; u = (tt - t0) / 0.28
        if u < 0: continue
        s = back(u) if u < 1 else 1; X, Y = S(x, REF["c_row_y"] + 7 * math.sin(tt * 2.6 + j))
        draw_skyling(img, pose_frame(nm, "celebrate" if tt > 22.8 else "wave", tt, j * 0.3), 7, X, Y, s, glow=(255, 226, 160) if j < 3 else (200, 215, 255))
        burst(img, X, Y, tt - t0, k=5, n=5, radius=90, seed=40 + j)
    if tt >= 22.78:
        u = (tt - 22.78) / 0.32; s = back(u) if u < 1 else 1; X, Y = S(*REF["c_date"])
        draw_cloud(img, cloud("January 2027", 3.8, 1), X, Y, s); burst(img, X, Y, tt - 22.8, k=9, n=9, radius=340, seed=5)
        for ox, oy, ph in [(-300, -80, 0.0), (310, -60, 0.5), (-260, 90, 1.1), (280, 100, 0.8)]:
            if tt > 23.0: pixel_star(img, int(X + ox), int(Y + oy), 6, 0.9 * (0.5 + 0.5 * math.sin((tt - 23.0) * 5 + ph * 6)) * clamp((tt - 23.0) / 0.2))

# ---------------------------------------------------------------- frames
END_V = f"{KIT}/assets/logo/LifeFlow_Logo_Ending.mp4"; END = None
def end_frames():
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", END_V, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, H, W, 3)
def load_bg(path, zoom):
    im = Image.open(path).convert("RGB")
    if zoom != 1:
        nw, nh = int(W * zoom), int(H * zoom); im = im.resize((nw, nh), Image.LANCZOS)
        ox, oy = int(540 * zoom - 540), int(930 * zoom - 930); im = im.crop((ox, oy, ox + W, oy + H))
    return im
def whip(arr, off, blur):
    pad = int(abs(off) + blur + 4); big = cv2.copyMakeBorder(arr, pad, pad, 0, 0, cv2.BORDER_REPLICATE)
    out = big[pad - int(off): pad - int(off) + H]
    if blur > 1: k = np.zeros((int(blur) | 1, 1), np.float32); k[:] = 1 / k.size; out = cv2.filter2D(out, -1, k)
    return out
def mosaic(arr, size):
    if size <= 1: return arr
    small = cv2.resize(arr, (max(1, W // size), max(1, H // size)), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_NEAREST)

def frame(i):
    global END
    clip, t, path, z, src = seg_of(i)
    if clip == "end":
        if END is None: END = end_frames()
        img = Image.fromarray(END[min(i - O_END, len(END) - 1)]).convert("RGBA"); te = (i - O_END) / FPS; u = clamp((te - 0.7) / 0.5)
        if u > 0:
            d = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(d)
            dd.text((540, 352), "Early January 2027", font=FONT_END, fill=SOFT + (int(235 * out3(u)),), anchor="mm")
            dd.text((540, 1530), "lifeflowweb.com", font=FONT_URL, fill=(201, 213, 238, int(235 * out3(u))), anchor="mm")
            fade = clamp((3.5 - te) / 0.5); d.putalpha(d.getchannel("A").point(lambda v: int(v * fade))); img.alpha_composite(d)
        return np.array(img.convert("RGB"))
    bg = load_bg(path, z)
    if clip == "a": img = overlays_ali(np.array(bg), t, z, src)
    else:
        img = bg.convert("RGBA")
        if clip == "t": overlays_tyler(img, t, z)
        else:
            orig = np.array(bg).astype(np.float32); overlays_close(img, t, (i - O_SL) / FPS if i >= O_SL else None)
            m = np.array(Image.open(src)).astype(np.float32)[..., None] / 255
            img = Image.fromarray((np.array(img.convert("RGB")) * (1 - m) + orig * m).astype(np.uint8)).convert("RGBA")
    arr = np.array(img.convert("RGB"))
    if O_A1 - 11 <= i < O_A1: u = (i - (O_A1 - 11)) / 11; arr = whip(arr, 1400 * u ** 3, 6 + 220 * u ** 2)
    elif O_A1 <= i < O_A1 + 12: u = (i - O_A1) / 12; arr = whip(arr, -1400 * (1 - u) ** 3, 6 + 220 * (1 - u) ** 2)
    cap = Image.fromarray(arr).convert("RGBA"); draw_caption(cap, clip, t); arr = np.array(cap.convert("RGB"))
    if O_END - 9 <= i < O_END:
        if END is None: END = end_frames()
        u = (i - (O_END - 9)) / 9; arr = mosaic(arr, int(1 + 70 * u ** 1.5)); arr = (arr * (1 - smooth(u)) + END[0] * smooth(u)).astype(np.uint8)
    return arr

if __name__ == "__main__":
    init_refs(); args = sys.argv[1:]
    if args and args[0] == "--preview":
        os.makedirs(f"{L}/prev", exist_ok=True)
        for s in args[1].split(","):
            i = int(round(float(s) * FPS)); Image.fromarray(frame(i)).save(f"{L}/prev/p_{float(s):05.2f}.jpg", quality=90)
        sys.exit()
    out = args[0] if args else f"{L}/launch_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(N):
        enc.stdin.write(frame(i).tobytes())
        if i % 100 == 0: print(i, "/", N, flush=True)
    enc.stdin.close(); enc.wait(); print("frames", N, "seconds", N / FPS, "O_A2", O_A2 / FPS, "O_C", O_C / FPS, "O_SL", O_SL / FPS, "O_END", O_END / FPS)
