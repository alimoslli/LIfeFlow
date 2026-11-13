"""LifeFlow launch video (pier, Nov 12 clips): Tyler (IMG_4105) then Ali (IMG_4127), the app as overlays over them.
Everything drawn here is the app's own art: skylings (kit frames, one art pixel = k screen pixels, no smoothing), pixel
clouds (make_cloud.py, the app's tiles and CSS), the Today page recorded from main at four real times, the logo ending.
    python3 render.py [--preview N] [--only a,b]   -> pipes frames into ffmpeg (launch_silent.mp4)
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

# ---------------------------------------------------------------- timeline (output frames)
T_N = 352                      # Tyler: all of IMG_4105 (11.73 s)
A1_S, A1_E = 57, 507           # Ali source frames (30 fps): 1.9 s .. 16.9 s ("...all your finances")
A2_S, A2_E = 544, 672          # 18.13 s .. 22.4 s ("That's very easy to understand ... all day.")  "in one place" is cut
SLOW_S, SLOW_N = 120, 57       # aslow (120 fps from 21.4 s): from 22.4 s, 0.4x speed
END_N = 105                    # logo ending 3.5 s
O_A1 = T_N; O_A2 = O_A1 + (A1_E - A1_S); O_SL = O_A2 + (A2_E - A2_S); O_END = O_SL + SLOW_N; N = O_END + END_N
ZOOM2 = 1.06                   # punch-in on A2 hides the jump cut

def seg_of(i):
    """-> (clip, source time in seconds of that clip, frame path, zoom)"""
    if i < O_A1: return "t", i / FPS, f"{L}/fr/t/{i + 1:04d}.jpg", 1.0
    if i < O_A2: s = A1_S + (i - O_A1); return "a", s / FPS, f"{L}/fr/a/{s + 1:04d}.jpg", 1.0
    if i < O_SL: s = A2_S + (i - O_A2); return "a", s / FPS, f"{L}/fr/a/{s + 1:04d}.jpg", ZOOM2
    if i < O_END:
        k = SLOW_S + (i - O_SL) * 1.6; s = 21.4 + k / 120
        return "a", s, f"{L}/fr/aslow/{int(round(k)) + 1:04d}.jpg", ZOOM2
    return "end", (i - O_END) / FPS, None, 1.0

TRK = {c: [np.vstack([np.array(m), [0, 0, 1]]) for m in json.load(open(f"{HERE}/track_{c}.json"))] for c in "ta"}
def cam(clip, t):
    """reference-frame -> current-frame transform for clip time t (interpolated, 30 fps track)."""
    tr = TRK[clip]; f = min(max(t * FPS, 0), len(tr) - 1); a = int(f); b = min(a + 1, len(tr) - 1); u = f - a
    return tr[a] * (1 - u) + tr[b] * u
def ref_at(clip, frame, x, y):
    """a point picked on (0-based) frame `frame` of the clip -> reference coordinates"""
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

# ---------------------------------------------------------------- skylings (the kit's frames are 40 px per art pixel)
_art = {}
def art(name, pose):
    key = (name, pose)
    if key not in _art:
        fs = sorted(glob.glob(f"{KIT}/assets/skylings_animated/{name}_{pose}/*.png"))
        _art[key] = [np.array(Image.open(f).convert("RGBA"))[40::40, 40::40] for f in fs]
    return _art[key]
def pose_frame(name, pose, t, phase=0.):
    fr = art(name, pose)
    if pose == "idle":  # blink: second frame for 0.18 s every 1.8 s
        return fr[1] if len(fr) > 1 and ((t + phase) % 1.8) < 0.18 else fr[0]
    return fr[int((t + phase) / 0.18) % len(fr)]
_glow = {}
def glow_for(a, k, color):
    key = (a.tobytes(), k, color)
    if key not in _glow:
        al = Image.fromarray(np.repeat(np.repeat(a[..., 3], k, 0), k, 1)).filter(ImageFilter.GaussianBlur(k * 2.2))
        g = Image.new("RGBA", al.size, color + (0,)); g.putalpha(al.point(lambda v: int(v * 0.42)))
        _glow[key] = g
    return _glow[key]
def draw_skyling(img, a, k, cx, cy, scale=1., anchor="center", alpha=1., glow=(255, 226, 160)):
    """paste art a (26x26 RGBA, one px per art pixel) at k screen px per art pixel. scale != 1 only during pops."""
    size = max(1, int(round(26 * k * scale)))
    if scale == 1: big = Image.fromarray(np.repeat(np.repeat(a, k, 0), k, 1))
    else: big = Image.fromarray(a).resize((size, size), Image.NEAREST)
    if alpha < 1: big.putalpha(big.getchannel("A").point(lambda v: int(v * alpha)))
    x = int(round(cx - size / 2)); y = int(round(cy - size / 2 if anchor == "center" else cy - size * 0.96))
    if glow and scale > 0.3:
        g = glow_for(a, k, glow)
        if scale != 1: g = g.resize((size, size))
        if alpha < 1: g = g.copy(); g.putalpha(g.getchannel("A").point(lambda v: int(v * alpha)))
        img.alpha_composite(g, (x, y)) if 0 <= x and 0 <= y and x + size <= W and y + size <= H else paste(img, g, x, y)
    paste(img, big, x, y)
def paste(img, im, x, y):
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(W, x + im.width), min(H, y + im.height)
    if x1 <= x0 or y1 <= y0: return
    img.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))

# pixel sparkles and dust (gold, k-px blocks)
STAR = ["..#..", ".###.", "#####", ".###.", "..#.."]
def pixel_star(img, cx, cy, k, alpha, color=GOLD):
    if alpha <= 0: return
    d = ImageDraw.Draw(img, "RGBA"); c = color + (int(255 * alpha),)
    for r, row in enumerate(STAR):
        for q, ch in enumerate(row):
            if ch == "#": x = cx + (q - 2) * k; y = cy + (r - 2) * k; d.rectangle([x, y, x + k - 1, y + k - 1], fill=c)
def burst(img, cx, cy, t, k=6, n=6, radius=120, seed=0, color=GOLD):
    """sparkles flying out from a point over 0.5 s (t = seconds since the burst)."""
    if not (0 <= t < 0.55): return
    rng = np.random.default_rng(seed)
    for j in range(n):
        ang = 2 * math.pi * (j / n) + rng.uniform(-0.3, 0.3); r = radius * out3(t / 0.5) * rng.uniform(0.7, 1.1)
        pixel_star(img, int(cx + r * math.cos(ang)), int(cy + r * math.sin(ang)), max(2, int(k * (1 - t / 0.55))), 1 - t / 0.55, color)
def dust(img, cx, cy, t, k=6):
    if not (0 <= t < 0.45): return
    d = ImageDraw.Draw(img, "RGBA")
    for j, (vx, vy) in enumerate([(-1, -0.6), (-0.6, -1), (0.6, -1), (1, -0.6), (-1.3, -0.2), (1.3, -0.2)]):
        x = cx + vx * 110 * out3(t / 0.45); y = cy + vy * 50 * out3(t / 0.45) + 60 * (t / 0.45) ** 2
        a = int(200 * (1 - t / 0.45)); d.rectangle([x, y, x + k - 1, y + k - 1], fill=(225, 230, 240, a))

# ---------------------------------------------------------------- clouds (made by the kit's make_cloud.py)
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

# ---------------------------------------------------------------- the Today page (recorded from main, four real times)
FRONT = {n: sorted(glob.glob(f"{SP}/whatsnew/cap/front_{n}/0*.jpg")) for n in ["morning", "afternoon", "golden", "night"]}
PH_W = 404; PH_H = int(PH_W * 1920 / 1080); BEZ = 10; RAD = 46
_phmask = None
def phone_img(name, t):
    global _phmask
    fs = FRONT[name]; f = fs[min(len(fs) - 1, int(t * FPS) % len(fs))]
    sc = Image.open(f).convert("RGB").resize((PH_W, PH_H), Image.LANCZOS)
    ow, oh = PH_W + 2 * BEZ, PH_H + 2 * BEZ
    if _phmask is None:
        m = Image.new("L", (ow * 2, oh * 2), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, ow * 2 - 1, oh * 2 - 1], RAD * 2, fill=255)
        _phmask = (m.resize((ow, oh), Image.LANCZOS), )
        m2 = Image.new("L", (PH_W * 2, PH_H * 2), 0); ImageDraw.Draw(m2).rounded_rectangle([0, 0, PH_W * 2 - 1, PH_H * 2 - 1], (RAD - BEZ) * 2, fill=255)
        _phmask += (m2.resize((PH_W, PH_H), Image.LANCZOS), )
        sh = Image.new("L", (ow + 120, oh + 120), 0); sh.paste(_phmask[0].point(lambda v: int(v * 0.55)), (60, 75)); _phmask += (sh.filter(ImageFilter.GaussianBlur(26)), )
    out = Image.new("RGBA", (ow + 120, oh + 120), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (5, 10, 30, 0)); shadow.putalpha(_phmask[2]); out.alpha_composite(shadow)
    body = Image.new("RGBA", (ow, oh), (16, 22, 40, 255)); body.putalpha(_phmask[0])
    ImageDraw.Draw(body).rounded_rectangle([1, 1, ow - 2, oh - 2], RAD, outline=(120, 140, 185, 160), width=2)
    out.alpha_composite(body, (60, 60))
    scr = sc.convert("RGBA"); scr.putalpha(_phmask[1]); out.alpha_composite(scr, (60 + BEZ, 60 + BEZ))
    return out
def phone_mix(t, segs):
    """segs: [(start, name)], crossfade 0.16 s into each next time of day"""
    cur = segs[0][1]; img = None
    for j, (st, nm) in enumerate(segs):
        if t >= st: cur = nm; k = j
    img = phone_img(cur, t)
    if k + 1 < len(segs) and segs[k + 1][0] - t < 0.16:
        nxt = phone_img(segs[k + 1][1], t); u = 1 - (segs[k + 1][0] - t) / 0.16
        img = Image.blend(img, nxt, smooth(u))
    return img

# ---------------------------------------------------------------- captions (Fraunces SemiBold, navy box, "sky" words in gold)
CAPS = {
    "t": [(0.0, 1.46, "Hey guys, how's it going?"), (1.52, 2.62, "My name is Tyler Kardy."), (2.66, 3.7, "I run the marketing here"),
          (3.7, 4.44, "for LifeFlow."), (4.44, 5.48, "Today, Ali and I"), (5.48, 6.16, "will be explaining"), (6.16, 7.18, "our future plans"),
          (7.18, 8.3, "and what we got going"), (8.3, 10.8, "for early January of 2027."), (10.86, 11.6, "Let's go!")],
    "a": [(2.42, 3.2, "What's up, everybody?"), (3.3, 4.3, "My name is Ali Moslli."), (4.3, 4.78, "I'm the developer"), (4.78, 5.8, "behind LifeFlow,"),
          (5.86, 7.02, "and I think the skylings"), (7.02, 7.6, "are the new way"), (7.6, 8.56, "you can manage your life"),
          (8.56, 10.22, "in a simple, easy sky"), (10.22, 12.3, "that goes by with your day,"), (12.6, 13.84, "showing all your classes,"),
          (13.9, 14.66, "your work shifts,"), (14.7, 15.26, "your schedules"), (15.26, 16.92, "and all your finances."),
          (18.13, 19.36, "That's very easy to understand"), (19.36, 20.92, "with a very smart skyling"), (20.92, 22.6, "by your side all day.")],
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
        core = w.strip(",.?!").lower(); col = GOLD if core in GOLDW else SOFT
        d.text((x, 20 + ph / 2 + 2), w, font=FONT_CAP, fill=col, anchor="lm"); x += wl + sp
    _capc[text] = im; return im
def draw_caption(img, clip, t, y=1528):
    for a, b, text in CAPS.get(clip, []):
        if a <= t < b:
            im = caption_img(text); u = clamp((t - a) / 0.12); s = 0.94 + 0.06 * out3(u)
            if s != 1: im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
            if u < 1: im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * out3(u))))
            paste(img, im, int(540 - im.width / 2), int(y - im.height / 2)); return

# ---------------------------------------------------------------- overlays per clip
LOCK = Image.open(f"{KIT}/assets/logo/logo_lockup_white_text.png").convert("RGBA").crop((20, 20, 1142, 340))
LOCK = LOCK.resize((300, int(300 * LOCK.height / LOCK.width)), Image.LANCZOS)

def overlays_tyler(img, t, z):
    S = lambda x, y: to_screen("t", t, z, x, y)
    # Dreamy (night) in the sky over the Ferry Building
    dx, dy = REF["t_dreamy"]
    if t >= -0.14:
        u = (t + 0.14) / 0.3; s = back(u) if u < 1 else 1
        pose = "wave" if 0.55 <= t < 1.55 else ("celebrate" if 3.9 <= t < 4.62 or 10.86 <= t < 11.4 else "idle")
        a = pose_frame("Dreamy-night", pose, t)
        fy = 8 * math.sin(t * 2 * math.pi / 2.6)
        if t >= 11.36: fy -= 1500 * in3((t - 11.36) / 0.36)          # flies up with the whip
        X, Y = S(dx, dy + fy); draw_skyling(img, a, 11, X, Y, s, glow=(200, 215, 255))
        burst(img, X, Y, t + 0.05, k=7, n=7, radius=170, seed=1)
    # name tag
    if 1.52 <= t < 4.5:
        u = (t - 1.52) / 0.28; v = (4.5 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*REF["t_name"]); draw_cloud(img, cloud("Tyler Kardy, CMO", 2.7, 2), X, Y, s * clamp(v * 1.2), clamp(v))
    # the date
    if t >= 9.0:
        u = (t - 9.0) / 0.3; s = back(u) if u < 1 else 1; X, Y = S(*REF["t_date"])
        if t >= 11.36: Y -= 1500 * in3((t - 11.36) / 0.36)
        draw_cloud(img, cloud("Early January 2027", 3.2, 1), X, Y, s)
        burst(img, X, Y, t - 9.05, k=8, n=8, radius=300, seed=4)
        for j, (ox, oy, ph) in enumerate([(-290, -70, 0.0), (300, -50, 0.5), (-250, 80, 1.1), (270, 90, 0.8)]):
            tw = 0.5 + 0.5 * math.sin((t - 9.2) * 5 + ph * 6)
            if t > 9.25: pixel_star(img, int(X + ox), int(Y + oy), 5, 0.85 * tw * clamp((t - 9.25) / 0.2))
    # the logo, small, at the top while Tyler talks
    if 3.92 <= t < 11.4:
        u = clamp((t - 3.92) / 0.35); v = clamp((11.4 - t) / 0.25)
        im = LOCK.copy(); im.putalpha(im.getchannel("A").point(lambda q: int(q * out3(u) * v)))
        paste(img, im, 540 - im.width // 2, int(262 - 18 * (1 - out3(u))))

FIVE = [("Dawn", 150), ("Ray", 345), ("Goldie", 540), ("Twinkle-night", 735), ("Dreamy-night", 930)]
DETAILS = [(13.36, "Chapter 6 reading due 11:59 PM"), (14.04, "Thu: 12:30 to 3 PM shift"), (14.82, "12 PM Lunch with Sam"),
           (16.46, "Spotify $11.99 tomorrow, you have $1,842")]
DET_Y = [262, 392, 522, 652]
PH_IN, PH_OUT = 8.62, 18.2
def phone_xy(t):
    """phone's top-left corner on screen (with its 60 px shadow margin), sliding in from the right and out again"""
    x0, y0 = 640, 190
    if t < PH_IN + 0.42: x0 += (1 - back((t - PH_IN) / 0.42, 1.3)) * 560
    if t > PH_OUT: x0 += in3((t - PH_OUT) / 0.35) * 620
    return x0 - 60, y0 - 60
def overlays_ali(img, t, z, slow=False):
    S = lambda x, y: to_screen("a", t, z, x, y)
    # name tag
    if 3.3 <= t < 5.85:
        u = (t - 3.3) / 0.28; v = (5.85 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*REF["a_name"]); draw_cloud(img, cloud("Ali Moslli, developer and CEO", 2.6, 1), X, Y, s * clamp(v * 1.2), clamp(v))
    # "the skylings": all five pop into the sky over the Bay Bridge, then hop into the phone
    for j, (nm, x) in enumerate(FIVE):
        t0 = 6.62 + j * 0.13; tg = 8.5 + j * 0.07
        if t0 <= t < tg + 0.4:
            u = (t - t0) / 0.28; s = back(u) if u < 1 else 1
            pose = "wave" if 7.3 <= t < 8.3 else "idle"
            X, Y = S(x, REF["a_row_y"] + 7 * math.sin((t + j * 0.5) * 2 * math.pi / 2.4))
            if t >= tg:  # into the phone's sky
                w = in3((t - tg) / 0.4); px, py = phone_xy(t); tx, ty = px + 60 + PH_W / 2 + BEZ, py + 60 + 90
                X += (tx - X) * w; Y += (ty - Y) * w - 140 * math.sin(math.pi * w); s *= 1 - 0.8 * w
            draw_skyling(img, pose_frame(nm, pose, t, j * 0.37), 7, X, Y, s, glow=(255, 226, 160) if j < 3 else (200, 215, 255))
            burst(img, X, Y, t - t0, k=5, n=5, radius=90, seed=10 + j)
    # the Today page, small, beside Ali: the sky going by with the day
    if PH_IN <= t < PH_OUT + 0.4:
        segs = [(0, "morning"), (9.9, "afternoon"), (10.75, "golden"), (11.55, "night")]
        ph = phone_mix(t, segs); px, py = phone_xy(t); paste(img, ph, int(px), int(py))
        # the details come out of the page as the app's clouds
        for j, (ts, txt) in enumerate(DETAILS):
            if t >= ts - 0.12:
                u = (t - ts + 0.12) / 0.34; w = out3(u)
                sx, sy = px + 60 + PH_W / 2, py + 60 + 360 + j * 40; ex, ey = 316, DET_Y[j]
                X = sx + (ex - sx) * w; Y = sy + (ey - sy) * w; s = 0.35 + 0.65 * back(u, 1.2) if u < 1 else 1
                if t > PH_OUT - 0.05: q = (t - PH_OUT + 0.05 - j * 0.05) / 0.22; s *= 1 - in3(q); Y -= 40 * out3(q)
                draw_cloud(img, cloud(txt, 2.1, 1 + (j % 3)), X, Y, max(0, s))
                if 0 <= t - ts < 0.6: burst(img, ex + 250, ey - 30, t - ts - 0.2, k=4, n=4, radius=60, seed=20 + j)
    # "a very smart skyling by your side": Dreamy drops onto the ledge, waves, then "all day" runs through all five
    lx, ly = REF["a_side"]
    if t >= 19.86:
        arrive = 20.34; X, Y = S(lx, ly + 7 * math.sin(t * 2 * math.pi / 2.4))
        if t < arrive:  # floats down from the sky in an arc and settles beside his head
            w = out3((t - 19.86) / (arrive - 19.86)); X += -260 * (1 - w); Y -= 1050 * (1 - w) ** 1.6
        cyc = [(21.7, "Dawn"), (21.82, "Ray"), (21.94, "Goldie"), (22.06, "Twinkle-night"), (22.18, "Dreamy-night")]
        nm = "Dreamy-night"; last = None
        for ts, n in cyc:
            if t >= ts: nm, last = n, ts
        pose = "wave" if 20.45 <= t < 21.6 else ("celebrate" if slow or t >= 22.18 else "idle")
        if 21.7 <= t < 22.18: pose = "idle"
        draw_skyling(img, pose_frame(nm, pose, t if not slow else T_OUT[0]), 9, X, Y,
                     glow={"Dawn": (240, 170, 130), "Ray": (255, 220, 140), "Goldie": (255, 200, 120)}.get(nm, (200, 215, 255)))
        burst(img, X, Y, t - arrive, k=5, n=6, radius=120, seed=7)
        if last is not None and t - last < 0.3: burst(img, X, Y, t - last, k=5, n=5, radius=110, seed=int(last * 100))
    # the end: the family is back in the sky
    if slow:
        for j, (nm, x) in enumerate([("Dawn", 200), ("Ray", 410), ("Goldie", 680), ("Twinkle-night", 890)]):
            tt = T_OUT[0] - j * 0.08
            if tt > 0:
                u = tt / 0.28; s = back(u) if u < 1 else 1; X, Y = S(x, REF["a_row_y"] - 30 + 7 * math.sin(T_OUT[0] * 2.6 + j))
                draw_skyling(img, pose_frame(nm, "celebrate" if j % 2 == 0 else "wave", T_OUT[0], j * 0.3), 7, X, Y, s,
                             glow=(255, 226, 160) if j < 3 else (200, 215, 255))
                burst(img, X, Y, tt, k=5, n=5, radius=90, seed=40 + j)
T_OUT = [0.0]

# design positions (picked on real frames) -> reference coordinates
REF = {}
def init_refs():
    REF["t_dreamy"] = ref_at("t", 5, 270, 470)
    REF["t_name"] = ref_at("t", 60, 540, 790)
    REF["t_date"] = ref_at("t", 280, 600, 720)
    REF["a_name"] = ref_at("a", 110, 540, 690)
    REF["a_row_y"] = ref_at("a", 200, 540, 520)[1]
    REF["a_side"] = ref_at("a", 600, 250, 935)

# ---------------------------------------------------------------- frames
END_V = f"{KIT}/assets/logo/LifeFlow_Logo_Ending.mp4"
def end_frames():
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", END_V, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
    a = np.frombuffer(p.stdout, np.uint8).reshape(-1, H, W, 3); return a
END = None
def load_bg(path, zoom):
    im = Image.open(path).convert("RGB")
    if zoom != 1:
        nw, nh = int(W * zoom), int(H * zoom); im = im.resize((nw, nh), Image.LANCZOS)
        ox, oy = int(540 * zoom - 540), int(930 * zoom - 930); im = im.crop((ox, oy, ox + W, oy + H))
    return im
def whip(arr, off, blur):
    """camera whip: shift the frame vertically by off px with motion blur of `blur` px (edges reflect)"""
    pad = int(abs(off) + blur + 4)
    big = cv2.copyMakeBorder(arr, pad, pad, 0, 0, cv2.BORDER_REPLICATE)
    out = big[pad - int(off): pad - int(off) + H]
    if blur > 1:
        k = np.zeros((int(blur) | 1, 1), np.float32); k[:] = 1 / k.size; out = cv2.filter2D(out, -1, k)
    return out
def mosaic(arr, size):
    if size <= 1: return arr
    small = cv2.resize(arr, (max(1, W // size), max(1, H // size)), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_NEAREST)

def frame(i):
    global END
    clip, t, path, z = seg_of(i)
    if clip == "end":
        if END is None: END = end_frames()
        img = Image.fromarray(END[min(i - O_END, len(END) - 1)]).convert("RGBA"); te = (i - O_END) / FPS
        u = clamp((te - 0.7) / 0.5)
        if u > 0:
            d = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(d)
            dd.text((540, 352), "Early January 2027", font=FONT_END, fill=SOFT + (int(235 * out3(u)),), anchor="mm")
            dd.text((540, 1530), "lifeflowweb.com", font=FONT_URL, fill=(201, 213, 238, int(235 * out3(u))), anchor="mm")
            fade = clamp((3.5 - te) / 0.5); d.putalpha(d.getchannel("A").point(lambda v: int(v * fade)))
            img.alpha_composite(d)
        return np.array(img.convert("RGB"))
    img = load_bg(path, z).convert("RGBA")
    if clip == "t": overlays_tyler(img, t, z)
    else:
        slow = i >= O_SL; T_OUT[0] = (i - O_SL) / FPS if slow else 0
        overlays_ali(img, t, z, slow)
    arr = np.array(img.convert("RGB"))
    # the whip from Tyler to Ali
    if O_A1 - 11 <= i < O_A1:
        u = (i - (O_A1 - 11)) / 11; arr = whip(arr, 1400 * u ** 3, 6 + 220 * u ** 2)
    elif O_A1 <= i < O_A1 + 12:
        u = (i - O_A1) / 12; arr = whip(arr, -1400 * (1 - u) ** 3, 6 + 220 * (1 - u) ** 2)
    cap = Image.fromarray(arr).convert("RGBA"); draw_caption(cap, clip, t); arr = np.array(cap.convert("RGB"))
    # pixel out into the logo ending
    if O_END - 9 <= i < O_END:
        if END is None: END = end_frames()
        u = (i - (O_END - 9)) / 9; arr = mosaic(arr, int(1 + 70 * u ** 1.5))
        arr = (arr * (1 - smooth(u)) + END[0] * smooth(u)).astype(np.uint8)
    return arr

if __name__ == "__main__":
    init_refs()
    args = sys.argv[1:]
    if args and args[0] == "--preview":
        for s in args[1].split(","):
            i = int(float(s) * FPS); Image.fromarray(frame(i)).save(f"{L}/prev/p_{float(s):05.2f}.jpg", quality=90)
        sys.exit()
    out = args[0] if args else f"{L}/launch_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(N):
        enc.stdin.write(frame(i).tobytes())
        if i % 100 == 0: print(i, "/", N, flush=True)
    enc.stdin.close(); enc.wait(); print("frames", N, "seconds", N / FPS)
