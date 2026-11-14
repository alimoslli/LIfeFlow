"""The LifeFlow talk intro (reusable): a 5.35 s pixel scene (v2, Ali: "a bit too fast": every beat about 1.6x calmer), made in code from the app's own pieces, with its own sound.
  0.0  the question's sparks gather into one spark that shoots up through the dark
  0.3  it bursts and the sky opens around it
  0.35 a whole day in a second: the sky runs dawn to night in the app's sky colours while the skyling of each moment rides
       across it (Dawn, Ray, Goldie, Twinkle, Dreamy), each handing over to the next with a chime, leaving a light trail
  1.6  night: a pixel campfire lights on the hill, four skylings land around it like shooting stars, Dreamy floats above as the moon
  1.85 the fire throws sparks that spell the show's name in ember letters across the stars
  2.3  the camera falls into the fire and it flashes gold (the video opens out of the gold)
Not the logo, not a name card: the title is one beat of a scene.
    python3 fire_intro.py ["CAMPFIRE Q&A"] [--preview 0.5,1.0]     -> intro_silent.mp4, intro.wav, intro.mp4
"""
import glob, math, os, re, subprocess, sys, wave
import numpy as np, cv2
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
KIT = f"{SP}/kit/lifeflow-brand/assets"
APP = next(p for p in [os.path.normpath(f"{HERE}/../../../src"), "/home/user/lf-main/src"] if os.path.exists(f"{p}/lib/sky.ts"))
W, H, FPS, PX = 1080, 1920, 30, 4                     # drawn on a 270 x 480 pixel canvas, shown 4x
AW, AH = W // PX, H // PX
DUR = 5.35; NF = int(DUR * FPS)
TITLE = next((a for a in sys.argv[1:] if not a.startswith("--") and not re.match(r"^[0-9.,]+$", a)), "CAMPFIRE Q&A").upper()
def clamp(v, a=0., b=1.): return max(a, min(b, v))
def smooth(v): v = clamp(v); return v * v * (3 - 2 * v)
def out3(v): v = clamp(v); return 1 - (1 - v) ** 3
def in3(v): v = clamp(v); return v ** 3
def back(v, s=1.7): v = clamp(v) - 1; return 1 + (s + 1) * v ** 3 + s * v ** 2

# ---------------------------------------------------------------- the app's sky (src/lib/sky.ts keys; sunrise 7:00, sunset 18:00)
_sky = open(f"{APP}/lib/sky.ts").read()
RISE, SET = 420, 1080
KEYS = sorted([({"rise": RISE, "set": SET, "noon": (RISE + SET) / 2}[w] + int(d), [np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) for h in (a, b, c)])
               for d, w, a, b, c in re.findall(r'\[(-?\d+), "(rise|set|noon)", "(#\w{6})", "(#\w{6})", "(#\w{6})"\]', _sky)], key=lambda k: k[0])
def sky_at(m):
    m = clamp(m, KEYS[0][0], KEYS[-1][0])
    for (a, ca), (b, cb) in zip(KEYS, KEYS[1:]):
        if m <= b: u = (m - a) / max(1, b - a); return [ca[i] + (cb[i] - ca[i]) * u for i in range(3)]
    return KEYS[-1][1]

# ---------------------------------------------------------------- the skylings (kit frames, 40 px per art pixel) and a 5 x 7 pixel font
_art = {}
def skyling(name, pose, t, ph=0.):
    if (name, pose) not in _art:
        _art[(name, pose)] = [np.array(Image.open(f).convert("RGBA"))[40::40, 40::40] for f in sorted(glob.glob(f"{KIT}/skylings_animated/{name}_{pose}/*.png"))]
    fr = _art[(name, pose)]
    if pose == "idle": return fr[1] if len(fr) > 1 and ((t + ph) % 1.8) < 0.18 else fr[0]
    return fr[int((t + ph) / 0.12) % len(fr)]
FONT5 = {
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "B": "####.|#...#|#...#|####.|#...#|#...#|####.", "C": ".###.|#...#|#....|#....|#....|#...#|.###.",
    "D": "####.|#...#|#...#|#...#|#...#|#...#|####.", "E": "#####|#....|#....|####.|#....|#....|#####", "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.####", "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#", "I": ".###.|..#..|..#..|..#..|..#..|..#..|.###.",
    "J": "..###|...#.|...#.|...#.|...#.|#..#.|.##..", "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", "N": "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#", "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "P": "####.|#...#|#...#|####.|#....|#....|#....", "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..", "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    "V": "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..", "W": "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.", "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "Z": "#####|....#|...#.|..#..|.#...|#....|#####", "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#",
    "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..", "'": "..#..|..#..|.....|.....|.....|.....|.....",
}
def text_cells(text):
    cells, x = [], 0
    for ch in text:
        if ch == " ": x += 4; continue
        for r, row in enumerate(FONT5.get(ch, FONT5["?"]).split("|")):
            for q, c in enumerate(row):
                if c == "#": cells.append((x + q, r))
        x += 6
    return cells, x - 1
def heat_col(h):
    stops = [(0.0, (120, 30, 10)), (0.15, (205, 70, 25)), (0.4, (255, 140, 50)), (0.7, (255, 206, 110)), (1.0, (255, 248, 228))]
    h = clamp(h)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if h <= b: u = (h - a) / (b - a); return tuple(int(ca[i] + (cb[i] - ca[i]) * u) for i in range(3))
    return stops[-1][1]

# ---------------------------------------------------------------- the scene
HZ = 300                                               # the far horizon (art px)
def ground_y(x): return 388 + 0.0016 * (x - 135) ** 2  # the hill
FIRE = (135, 398)
RIDERS = [("Dawn", (255, 200, 170)), ("Ray", (255, 226, 160)), ("Goldie", (255, 205, 130)), ("Twinkle-night", (200, 215, 255)), ("Dreamy-night", (200, 215, 255))]
U_AT = [0.0, 0.2, 0.45, 0.65, 0.85, 1.0]; M_AT = [385, 560, 900, 1060, 1130, 1300]
RIDE0, RIDE1 = 0.75, 2.85
def ride_u(t): return smooth((t - RIDE0) / (RIDE1 - RIDE0)) * 0.93 + 0.07 * clamp((t - RIDE0) / (RIDE1 - RIDE0))
def rider_pos(u): return 135 - 108 * math.cos(math.pi * u), HZ + 6 - 196 * math.sin(math.pi * u)
SEATS = [("Dawn", 58, (255, 200, 170)), ("Ray", 92, (255, 226, 160)), ("Goldie", 178, (255, 205, 130)), ("Twinkle-night", 212, (200, 215, 255))]
rng = np.random.default_rng(5)
STARS = [(int(rng.uniform(4, AW - 4)), int(rng.uniform(6, HZ - 30)), rng.uniform(0, 6.28), rng.uniform(0.4, 1)) for _ in range(70)]
FLAME = [["......y.....", ".....yy.....", "....yyo..y..", "....yoo.yy..", "...yoor.yo..", "..yyorrooy..", "..yorrroooy.", ".yoorrrrooy.",
          ".yorrwwrroy.", ".yorwwwwroy.", "..yowwwwoy..", "...yowwoy..."],
         [".......y....", "......yy....", "..y..yoo....", "..yy.yoo.y..", "..yoyoor.y..", "..yoooorroy.", ".yoorrrrooy.", ".yorrrrrroy.",
          ".yorrwwrroy.", ".yorwwwwroy.", "..yowwwwoy..", "...yowwoy..."],
         ["....y.......", "....yy...y..", "...yoo..yy..", "...yoo.yoo..", "..yoorryoo..", "..yoorrroy..", ".yoorrrrroy.", ".yorrrrrroy.",
          ".yorrwwrroy.", ".yorwwwwroy.", "..yowwwwoy..", "...yowwoy..."]]
FCOL = {"y": (255, 210, 63), "o": (255, 159, 64), "r": (255, 90, 90), "w": (255, 241, 194)}
LOGS = ["..NN......NN..", ".NnnN....NnnN.", "..NnnNNNNnnN..", "....NnnnnN....", "..NnnNNNNnnN..", ".NnnN....NnnN."]
LCOL = {"N": (107, 63, 31), "n": (176, 114, 63)}
SPARK0 = 3.15
TCELLS, TW = text_cells(TITLE); CELL = max(2, min(3, (AW - 20) // TW))
TX0 = AW / 2 - TW * CELL / 2; TY0 = 132
rng2 = np.random.default_rng(8)
TITLE_P = [dict(tx=TX0 + (q + 0.5) * CELL, ty=TY0 + (r + 0.5) * CELL, ts=SPARK0 + 0.45 * (q / max(1, TW)) + rng2.uniform(0, 0.1), dur=rng2.uniform(0.36, 0.5),
                sx=FIRE[0] + rng2.normal(0, 4), sy=FIRE[1] - 14, arc=rng2.uniform(20, 60) * rng2.choice([-1, 1]), fl=rng2.uniform(5, 10), fp=rng2.uniform(0, 6.28))
           for q, r in TCELLS]
GATHER = [(rng2.uniform(0, AW), rng2.uniform(80, AH - 40), rng2.uniform(0.0, 0.12)) for _ in range(40)]

def put_sprite(img, a, cx, cy, scale=1, alpha=1.0, white=0.0, anchor="center"):
    im = Image.fromarray(a)
    if scale != 1: im = im.resize((int(a.shape[1] * scale), int(a.shape[0] * scale)), Image.NEAREST)
    if white > 0 or alpha < 1:
        arr = np.array(im).astype(np.float32)
        arr[..., :3] = arr[..., :3] * (1 - white) + 255 * white; arr[..., 3] *= alpha; im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    x = int(round(cx - im.width / 2)); y = int(round(cy - im.height / 2)) if anchor == "center" else int(round(cy - im.height))
    img.alpha_composite(im, (x, y)) if 0 <= x and 0 <= y and x + im.width <= AW and y + im.height <= AH else _clip_paste(img, im, x, y)
def _clip_paste(img, im, x, y):
    x0, y0, x1, y1 = max(0, x), max(0, y), min(AW, x + im.width), min(AH, y + im.height)
    if x1 > x0 and y1 > y0: img.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))
def glow(L, cx, cy, r, col, a):
    """a soft round light on the light layer (art px)"""
    if a <= 0: return
    r = max(2, int(r)); yy, xx = np.mgrid[0:2 * r, 0:2 * r]; d = np.hypot(xx - r, yy - r) / r
    g = Image.new("RGBA", (2 * r, 2 * r), col + (0,)); g.putalpha(Image.fromarray((np.clip(1 - d, 0, 1) ** 2 * 255 * a).astype(np.uint8)))
    _clip_paste(L, g, int(cx - r), int(cy - r))

def scene(t):
    """returns (base RGB art-res, light RGBA art-res)"""
    base = np.zeros((AH, AW, 3), np.float32); L = Image.new("RGBA", (AW, AH), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    u = ride_u(t); m = float(np.interp(clamp(u), U_AT, M_AT)) if t >= RIDE0 else M_AT[0]
    top, mid, hor = sky_at(m)
    ys = np.arange(AH)[:, None].astype(np.float32); tt = np.clip(ys / HZ, 0, 1)
    sky = np.where(tt[..., None] < 0.55, top + (mid - top) * (tt / 0.55)[..., None], mid + (hor - mid) * ((tt - 0.55) / 0.45)[..., None])
    sky = np.broadcast_to(sky, (AH, AW, 3)).copy()
    xs = np.arange(AW)[None, :]; gy = ground_y(xs)
    sea = (ys >= HZ) & (ys < gy)
    mirror = np.clip(1 - (ys - HZ) / 60, 0, 1)[..., None]
    ripple = ((ys.astype(int) + (xs // 9 + int(t * 12)) % 3) % 5 == 0)[..., None] * 0.10
    sea_col = hor * (0.30 + 0.35 * mirror + ripple) + np.array([6, 12, 30], np.float32) * 0.5
    img = np.where(sea[..., None], sea_col, sky)
    land = ys >= gy
    dark = clamp((0.33 - (0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2]) / 255) / 0.2)
    land_col = np.array([10, 18, 40], np.float32) + hor * 0.10 * (1 - dark)
    img = np.where(land[..., None], land_col, img)
    rim = (ys >= gy) & (ys < gy + 1)
    img = np.where(rim[..., None], hor * 0.45 + 20, img)
    base[:] = img
    open_r = 1e9                                                    # the sky opens around the spark
    if t < 0.5: open_r = -1
    elif t < 0.95: open_r = 620 * out3((t - 0.5) / 0.45)
    if open_r < 1e8:
        yy, xx = np.mgrid[0:AH, 0:AW]; dd = np.hypot(xx - 135, yy - 120)
        mk = np.clip((open_r - dd) / 26, 0, 1)[..., None] if open_r > 0 else np.zeros((AH, AW, 1), np.float32)
        base = base * mk
        if 0 < open_r < 600:                                        # its bright edge
            ring = np.clip(1 - np.abs(open_r - dd) / 10, 0, 1) * (1 - open_r / 620)
            Lr = np.dstack([np.full((AH, AW, 3), (255, 226, 170), np.float32), ring[..., None] * 255]).astype(np.uint8)
            L.alpha_composite(Image.fromarray(Lr, "RGBA"))
    else: mk = None
    for (sx, sy, ph, br) in STARS:                                  # stars, when it's dark
        a = dark * br * (0.6 + 0.4 * math.sin(t * 7 + ph))
        if mk is not None: a *= float(mk[sy, sx, 0])
        if a > 0.05: d.point((sx, sy), fill=(255, 246, 220, int(255 * a)))
    if t >= 0.5:                                                    # the far horizon's glowing line
        a = 1 if mk is None else float(mk[HZ, 135, 0])
        d.line([(0, HZ), (AW, HZ)], fill=tuple(int(min(255, c * 1.25 + 30)) for c in hor) + (int(200 * a),), width=1)

    # 0 .. 0.3: the question's sparks gather into one, which shoots up
    if t < 0.6:
        for (gx, gy_, dl) in GATHER:
            v = clamp((t - dl) / 0.26)
            if v >= 1: continue
            x = gx + (135 - gx) * out3(v); y = gy_ + (440 - gy_) * out3(v); d.rectangle([x, y, x + 1, y + 1], fill=heat_col(0.8) + (int(255 * (1 - v * 0.5)),))
        if 0.2 <= t < 0.52:
            v = (t - 0.2) / 0.3; y = 440 - 320 * in3(v) ** 0.8
            for j in range(10):
                yy_ = y + j * 7 * (0.3 + v); d.rectangle([134, yy_, 136, yy_ + 2], fill=heat_col(1 - j / 12) + (int(255 * (1 - j / 10)),))
            glow(L, 135, y, 10, (255, 236, 200), 0.9)
        if 0.5 <= t < 0.78:                                        # the burst
            v = (t - 0.5) / 0.28
            for j in range(16):
                ang = j / 16 * 6.283; r = 60 * out3(v); d.rectangle([135 + r * math.cos(ang), 120 + r * math.sin(ang), 136 + r * math.cos(ang), 121 + r * math.sin(ang)], fill=heat_col(0.9) + (int(255 * (1 - v)),))
            glow(L, 135, 120, 40 * (1 - v) + 6, (255, 240, 210), 1 - v)

    sprites = Image.new("RGBA", (AW, AH), (0, 0, 0, 0))
    # 0.36 .. 1.6: the day, ridden by the skyling of each moment
    if RIDE0 <= t < 2.97:
        j = max(i for i in range(5) if u >= U_AT[i]) if u < 1 else 4
        nm, gc = RIDERS[j]; x, y = rider_pos(u)
        for k in range(1, 14):                                      # the light trail
            uu = ride_u(t - k * 0.02)
            if uu <= 0: break
            px_, py_ = rider_pos(uu); d.rectangle([px_ - 1, py_ - 1, px_ + 1, py_ + 1], fill=gc + (int(200 * (1 - k / 14)),))
        since = (u - U_AT[j]) / 0.05 if j > 0 else (t - RIDE0) / 0.18
        wh = clamp(1 - since) if j > 0 else clamp(1 - since)
        fade = clamp((2.97 - t) / 0.15)
        glow(L, x, y, 30, gc, 0.32 * fade)
        put_sprite(sprites, skyling(nm, "wave" if j in (0, 4) else "idle", t), x, y, 2 * (0.75 + 0.25 * back(clamp(since))), alpha=fade, white=wh * 0.6)
        if j > 0 and since < 1:                                     # the hand-over burst
            for q in range(10):
                ang = q / 10 * 6.283 + j; r = 34 * out3(since); d.rectangle([x + r * math.cos(ang), y + r * math.sin(ang), x + 1 + r * math.cos(ang), y + 1 + r * math.sin(ang)], fill=gc + (int(255 * (1 - since)),))
    # 1.55 ..: night by the fire
    if t >= 2.8:
        v = clamp((t - 2.8) / 0.25)
        fl = FLAME[int(t / 0.11) % 3]; fs = 1 + 0.5 * math.exp(-(t - 2.8) / 0.3)                 # it flares as it lights
        fim = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
        for yy_, row in enumerate(fl):
            for xx_, ch in enumerate(row):
                if ch in FCOL: fim.putpixel((xx_, yy_), FCOL[ch] + (255,))
        fim = fim.resize((int(24 * fs * v + 1), int(28 * fs * v + 1)), Image.NEAREST)
        lim = Image.new("RGBA", (14, 6), (0, 0, 0, 0))
        for yy_, row in enumerate(LOGS):
            for xx_, ch in enumerate(row):
                if ch in LCOL: lim.putpixel((xx_, yy_), LCOL[ch] + (255,))
        lim = lim.resize((28, 12), Image.NEAREST); _clip_paste(sprites, lim, FIRE[0] - 14, FIRE[1] - 6)
        glow(L, FIRE[0], FIRE[1] - 14, 46 + 5 * math.sin(t * 19), (255, 150, 60), 0.42 * v)
        _clip_paste(sprites, fim, int(FIRE[0] - fim.width / 2), int(FIRE[1] - 4 - fim.height))
        fl2 = fim.copy(); fl2.putalpha(fl2.getchannel("A").point(lambda q: int(q * 0.35))); _clip_paste(L, fl2, int(FIRE[0] - fim.width / 2), int(FIRE[1] - 4 - fim.height))
        for q, (nm, sx, gc) in enumerate(SEATS):                    # they land like shooting stars
            ts = 2.9 + q * 0.12; w_ = clamp((t - ts) / 0.4)
            if t < ts: continue
            gx = sx; gy2 = ground_y(sx) + 1; fx_, fy_ = 135 + (sx - 135) * 1.6, 60
            x = fx_ + (gx - fx_) * out3(w_); y = fy_ + (gy2 - 13 - fy_) * out3(w_)
            if w_ < 1:
                for k in range(8):
                    ww = clamp(w_ - k * 0.05); xx2 = fx_ + (gx - fx_) * out3(ww); yy2 = fy_ + (gy2 - 13 - fy_) * out3(ww)
                    d.rectangle([xx2 - 1, yy2 - 1, xx2 + 1, yy2 + 1], fill=gc + (int(220 * (1 - k / 8)),))
            else:
                glow(L, x, gy2 - 16, 22, (255, 160, 80), 0.22)
                put_sprite(sprites, skyling(nm, "celebrate" if t - ts < 1.0 else "idle", t, q * 0.4), x, gy2 + 1, 1.4, anchor="bottom")
        v2 = clamp((t - 2.95) / 0.45)                               # Dreamy, the moon, floats over the fire
        if v2 > 0:
            y = 318 - 10 * out3(v2) + 2 * math.sin(t * 3); glow(L, 135, y, 40, (200, 215, 255), 0.28 * v2)
            put_sprite(sprites, skyling("Dreamy-night", "idle", t), 135, y, 1.8, alpha=out3(v2))
        landed = []
        for p in TITLE_P:                                           # the fire throws the title
            if t < p["ts"]: continue
            w_ = (t - p["ts"]) / p["dur"]
            if w_ < 1:
                e = 1 - (1 - w_) ** 2.2; x = p["sx"] + (p["tx"] - p["sx"]) * e + p["arc"] * math.sin(math.pi * w_); y = p["sy"] + (p["ty"] - p["sy"]) * e
                d.rectangle([x, y, x + 1, y + 1], fill=heat_col(0.95) + (255,))
            else:                                                    # v2: the launch video's letters (soft white, navy rim, gold glow)
                age = t - p["ts"] - p["dur"]; landed.append((p["tx"] - CELL / 2, p["ty"] - CELL / 2, clamp(math.exp(-age / 0.15))))
        if landed:
            ds = ImageDraw.Draw(sprites)
            for x0, y0, hot in landed: ds.rectangle([x0 - 1, y0 - 1, x0 + CELL, y0 + CELL], fill=(20, 36, 81, 235))
            for x0, y0, hot in landed:
                ds.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], fill=tuple(int(v + (255 - v) * hot) for v in (243, 245, 250)) + (255,))
                d.rectangle([x0 - 1, y0 - 1, x0 + CELL, y0 + CELL], fill=(255, 210, 122, 60))
        for q in range(26):                                         # sparks always rising from the fire
            ph = (t * 0.9 + q * 0.137) % 1; x = FIRE[0] + 10 * math.sin(q * 3.1 + ph * 6) * (0.4 + ph); y = FIRE[1] - 18 - 120 * ph
            d.point((x, y), fill=heat_col(0.9 - 0.6 * ph) + (int(255 * (1 - ph) * v),))
    out = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA"); out.alpha_composite(sprites)
    return np.array(out.convert("RGB")), L

GOLDC = np.array([1.0, 0.86, 0.62], np.float32)
def gold(arr, f): return (255 - (255 - arr.astype(np.float32)) * (1 - f * GOLDC)).astype(np.uint8) if f > 0 else arr
def light_comp(base, fx):
    f = np.asarray(fx).astype(np.float32); a = f[..., 3:4] / 255; Lg = f[..., :3] * a
    small = cv2.resize(Lg, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    g = cv2.resize(cv2.GaussianBlur(small, (0, 0), 2.5) * 1.3 + cv2.GaussianBlur(small, (0, 0), 10) * 1.6, (W, H), interpolation=cv2.INTER_LINEAR)
    tot = np.clip(Lg + g * np.array([1.0, 0.82, 0.62], np.float32), 0, 255)
    return (255 - (255 - base.astype(np.float32)) * (1 - tot / 255)).astype(np.uint8)
def frame(i):
    t = i / FPS; b, L = scene(t)
    big = cv2.resize(b, (W, H), interpolation=cv2.INTER_NEAREST); Lb = L.resize((W, H), Image.NEAREST)
    out = light_comp(big, Lb)
    if t > 4.75:                                                    # the fall into the fire, and the gold flash
        v = (t - 4.75) / (DUR - 4.75); fx_, fy_ = FIRE[0] * PX, (FIRE[1] - 10) * PX; acc = np.zeros_like(out, np.float32)
        for k in range(4):
            s = 1 + 3.2 * in3(v) * (1 + 0.035 * k); M = np.float32([[s, 0, fx_ - s * fx_], [0, s, fy_ - s * fy_]])
            acc += cv2.warpAffine(out, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        out = gold((acc / 4).astype(np.uint8), smooth((t - 4.95) / 0.36))
    return out

# ---------------------------------------------------------------- its sound (made in code, plus the app's own)
SR = 48000
def sound():
    n = int(DUR * SR); mix = np.zeros((n, 2), np.float32); R2 = np.random.default_rng(3)
    def band(x, lo, hi):
        X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x)).astype(np.float32)
    def norm(x): return x / (np.abs(x).max() + 1e-9)
    def put(x, t, g):
        x = np.asarray(x, np.float32); x = np.stack([x, x], -1) if x.ndim == 1 else x; i = int(t * SR); j = min(n, i + len(x))
        if j > i: mix[i:j] += x[: j - i] * 10 ** (g / 20)
    def load(p):
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "2", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True).stdout
        return np.frombuffer(b, np.int16).reshape(-1, 2).astype(np.float32) / 32768
    def env(L, a, r): e = np.ones(L, np.float32); e[: int(a * SR)] = np.linspace(0, 1, int(a * SR)); e[-int(r * SR):] *= np.linspace(1, 0, int(r * SR)); return e
    L = int(0.55 * SR); up = band(R2.normal(0, 1, L), 1200, 9000) * np.linspace(0.2, 1, L) ** 2; put(norm(up) * env(L, 0.02, 0.05), 0.0, -14)   # the spark shoots up
    pop = np.exp(-np.arange(int(0.25 * SR)) / (0.05 * SR)) * band(R2.normal(0, 1, int(0.25 * SR)), 400, 8000); put(norm(pop), 0.5, -11)
    sfx = f"{SP}/editorpack/sfx"; put(load(f"{sfx}/sky_turns.wav"), 0.52, -9)
    for k, f0 in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5]):     # a chime as each skyling hands over (pentatonic, rising)
        tk = RIDE0 if k == 0 else RIDE0 + (RIDE1 - RIDE0) * np.interp(U_AT[k], [ride_u(RIDE0 + (RIDE1 - RIDE0) * s) for s in np.linspace(0, 1, 200)], np.linspace(0, 1, 200))
        Lc = int(0.5 * SR); tt = np.arange(Lc) / SR; tone = (np.sin(2 * np.pi * f0 * tt) + 0.35 * np.sin(4 * np.pi * f0 * tt) + 0.12 * np.sign(np.sin(2 * np.pi * f0 * tt))) * np.exp(-tt / 0.16)
        put(norm(tone) * env(Lc, 0.003, 0.05), tk, -15)
    Lw = int(0.6 * SR); wh = band(R2.normal(0, 1, Lw), 80, 1500) * np.sin(np.pi * np.linspace(0, 1, Lw)) ** 1.5; put(norm(wh), 2.72, -12)     # the fire lights
    cr = np.zeros(int(1.2 * SR), np.float32)
    for tc in R2.uniform(0, 1.2, 70):
        i = int(tc * SR); Lk = int(SR * R2.uniform(0.002, 0.01))
        if i + Lk < len(cr): cr[i:i + Lk] += R2.normal(0, 1, Lk) * np.exp(-np.arange(Lk) / (Lk / 3))
    put(norm(band(cr, 900, 12000)), 2.8, -15)
    for q in range(4): put(load(f"{sfx}/skylings_pop_up.wav")[: int(0.11 * SR)], 2.9 + q * 0.12 + 0.4, -10)
    Ls = int(1.1 * SR); siz = band(R2.normal(0, 1, Ls), 2500, 9500) * (0.6 + 0.4 * np.abs(np.sin(np.arange(Ls) / SR * 40))); put(norm(siz) * env(Ls, 0.03, 0.25), SPARK0, -18)
    Lr = int(0.62 * SR); roar = band(R2.normal(0, 1, Lr), 50, 1600) * np.linspace(0, 1, Lr) ** 2.4; put(norm(roar), DUR - 0.64, -10)            # into the fire
    Lb = int(0.9 * SR); tb = np.arange(Lb) / SR; boom = np.sin(2 * np.pi * (70 * tb - 20 * tb * tb)) * np.exp(-tb / 0.28); put(norm(boom), DUR - 0.04, -6)  # lands on the video's first frame
    return mix, n

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--preview" in args:
        os.makedirs(f"{HERE}/prev_intro", exist_ok=True)
        for sv in args[args.index("--preview") + 1].split(","):
            Image.fromarray(frame(int(round(float(sv) * FPS)))).save(f"{HERE}/prev_intro/i_{float(sv):04.2f}.jpg", quality=90)
        sys.exit()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", f"{HERE}/intro_silent.mp4"], stdin=subprocess.PIPE)
    for i in range(NF): enc.stdin.write(frame(i).tobytes())
    enc.stdin.close(); enc.wait()
    mix, n = sound()                                                # the boom spills past the end: keep its tail for the video's mix
    with wave.open(f"{HERE}/intro.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/intro_silent.mp4", "-i", f"{HERE}/intro.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", f"{HERE}/intro.mp4"], check=True)
    print("intro", NF, "frames", DUR, "s, title", TITLE)
