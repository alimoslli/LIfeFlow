"""LifeFlow "Campfire Q&A" v2: same cut, same grade, all-new effects made for a fire at night (nothing from the launch video:
no wheel, no word clouds, no skylings popping in, no "Your day, drawn as the sky." title).
  - hook: embers swirl out of the fire into a glowing pixel "?" over Tyler's question, and it bursts when Ali answers
  - names: written in the air like a sparkler (long-exposure light), fading into smoke
  - "wake up ... plan your whole day": the real sky above them turns through a day in the app's own sky colours
    (lib/sky.ts keys), the app's pixel sun crosses and sets behind the roof, the moon comes up; the books rise for study
    time; a whole week = seven little suns rising in a row
  - "seven classes, work shifts, finance": the fire throws sparks that land as ember letters with the app's own icons,
    and "in one place" pulls them all into one pixel sun
  - "the character on top?": stars come out; "five characters, each time of day": the stars join into five
    constellations that ignite into the five skylings, and the sky behind them runs dawn to night, left to right
  - Tyler's skyling falls like a shooting star and sits on the fire-pit rim; a coin with wings flies off on "food after
    work"; a pixel speech bubble with the app's bowl on "home-cooked meals"
  - health: a heartbeat drawn in light across the sky into the app's heart, then the heart joins the app's sun
  - ending: the camera falls into the fire while the sparks spell JANUARY 2027, the fire flashes into the logo's
    sunrise, and its sun throws "GET ON THE WAITLIST"
  - captions: warm white, the spoken word lit ember-orange
    python3 fire_render2.py [--preview 1.0,5.0] [--nocap] [--part k K]
"""
import json, math, os, sys, subprocess, re
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import fire_render as F
from fire_render import W, H, FPS, shot_at, crop_of, to_scr, grade, matte_full, matte_crop, XF, END_HOLD, HOLD, CAPS, pieces, end_card, R, R3, R4, R5
from fire_render import clamp, smooth, back, out3, in3, smoothv, paste, pose_frame, pixel_star, GOLD, SOFT, TY, AL, TWO, WIDE, sh
APP = next(p for p in [os.path.normpath(f"{HERE}/../../../src"), "/home/user/lf-main/src"] if os.path.exists(f"{p}/components/day-clock/pixel-icons.ts"))   # the app's own icons and sky
rng0 = np.random.default_rng(11)

# ---------------------------------------------------------------- the cut (fire_render's, with two changes)
SEGS = [dict(s) for s in F.SEGS]
TAGS = ["hook", "wheel", "tyler_name", "clouds", "question", "arc", "ask_tyler", "food", "long_way", "health", "vo"]
for s, tg in zip(SEGS, TAGS): s["tag"] = tg
# "seven classes..." cuts to the two-shot so the ember words have the whole sky
SEGS[3]["shots"] = [(0, sh(AL, z=2.45)), (3.70, sh(AL, z=2.57)), (3.73, sh(TWO, z=1.80)), (8.43, sh(TWO, z=1.66))]
# Ali's new line plays over the fire (heads out of frame) and the camera falls into it
SEGS[10]["va"] = 10.6                                         # clip 11: sky until 13.75 s, its biggest flames at 14.2 .. 15.0 s
VO_A, VO_B, VO_C, VO_D = dict(z=2.3, cx=1080, cy=1100), dict(z=2.42, cx=1080, cy=1010), dict(z=4.0, cx=900, cy=2625), dict(z=6.0, cx=885, cy=2575)
WHIP0, WHIP1 = 3.2, 3.6
# v4 (Ali: "some of the cuts aren't right ... the clip after has some silenced frames ... the health clip ... how long it is"):
#   his skylings answer loses its half-second pause before "day" (a punch-in hides the jump), "Tyler, ... I think you should
#   tell us" loses its 0.46 s of silence the same way, and Tyler's health line ends on "...connect all your health data"
#   without its pause after "2027,". A piece carries fx_tag/fx_t0 so its effects continue the whole line's timing.
def _split(tag, pieces):
    i = next(j for j, s in enumerate(SEGS) if s["tag"] == tag); base = SEGS[i]; out, t0 = [], 0.0
    for k, (a, b, shots) in enumerate(pieces):
        d = dict(base); d.update(a=a, b=b, shots=shots, tag=tag if k == 0 else f"{tag}_{k}", fx_tag=tag, fx_t0=t0); out.append(d); t0 += b - a
    SEGS[i:i + 1] = out
_split("arc", [(1.10, 5.56, [(0, sh(WIDE, z=1.28)), (5.22, sh(WIDE, z=1.38, cy=1990))]), (5.98, 6.31, [(0, sh(WIDE, z=1.5, cx=1090, cy=2030)), (0.33, sh(WIDE, z=1.52, cx=1090, cy=2030))])])
_split("ask_tyler", [(0.24, 0.54, [(0, sh(TWO, z=1.75)), (0.3, sh(TWO, z=1.76))]), (0.96, 5.02, [(0, sh(TWO, z=1.82, cx=1115)), (4.06, sh(TWO, z=1.96, cx=1250))])])
_split("health", [(0.56, 3.56, [(0, sh(TY, z=2.5)), (3.0, sh(TY, z=2.6))]), (4.0, 6.88, [(0, sh(TY, z=2.7)), (2.88, sh(TY, z=2.82))])])
o = 0
for s in SEGS: s["out"] = o; s["nf"] = int(round((s["b"] - s["a"]) * FPS)); o += s["nf"]
END_OUT = o - XF; N = END_OUT + END_HOLD + 1 + HOLD
BY = {s["tag"]: s for s in SEGS}
def shot2(seg, t):
    if seg["tag"] == "vo":                                       # the sky, a whip down into the flames, a push into them
        if t < WHIP0: a, b, u = VO_A, VO_B, smoothv(clamp(t / WHIP0))
        elif t < WHIP1: a, b, u = VO_B, VO_C, smoothv(clamp((t - WHIP0) / (WHIP1 - WHIP0)))
        else: a, b, u = VO_C, VO_D, clamp((t - WHIP1) / 0.84) ** 1.4
        return {k: a[k] + (b[k] - a[k]) * u for k in a}
    return shot_at(seg, t)

# ---------------------------------------------------------------- the app's own pixel icons (day-clock/pixel-icons.ts)
_src = open(f"{APP}/components/day-clock/pixel-icons.ts").read()
PAL = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in re.findall(r'^\s*([a-zA-Z]):\s*"(#[0-9a-fA-F]{6})"', _src.split("const ART")[0], re.M)}
ICON_ROWS = {n: re.findall(r'"([^"]*)"', b) for n, b in re.findall(r'^\s{2}([a-zA-Z]+):\s*\[(.*?)\]', _src.split("const ART")[1], re.M | re.S)}
def icon_arr(name, rows=None):
    rows = rows or ICON_ROWS[name]; a = np.zeros((len(rows), max(map(len, rows)), 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in PAL: a[y, x] = PAL[ch] + (255,)
    return a
ICON = {n: icon_arr(n) for n in ["sun", "moon", "books", "briefcase", "cash", "bowl", "coinwings", "heart", "bell", "house"]}
_art_src = open(f"{APP}/components/pixel/art.ts").read()
PAL16 = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in re.findall(r'^\s*([a-zA-Z]):\s*"(#[0-9a-fA-F]{6})"', _art_src.split("export const COLOR")[0], re.M)}
ROWS16 = {n: re.findall(r'"([^"]*)"', b) for n, b in re.findall(r'^\s{2}([a-zA-Z]+):\s*\[(.*?)\]', _art_src, re.M | re.S)}
def icon16(name):
    """an icon from the app's own 16 x 16 set; MONO ones (x = the text colour) get soft white with a navy rim"""
    rows = ROWS16[name]; a = np.zeros((16, 16, 4), np.uint8); mono = np.zeros((16, 16), bool)
    for y, r in enumerate(rows[:16]):
        for x, ch in enumerate(r[:16]):
            if ch in PAL16 and ch != "x": a[y, x] = PAL16[ch] + (255,)
            elif ch == "x": mono[y, x] = True
    if mono.any():
        rim = np.zeros_like(mono)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1): rim |= np.roll(np.roll(mono, dy, 0), dx, 1)
        a[rim & ~mono] = (20, 36, 81, 255); a[mono] = (243, 245, 250, 255)
    return a
ICON16 = {n: icon16(n) for n in ["class", "shift", "money", "mail", "goal", "todo", "flag", "health"]}

def bowl_frame(t):                                               # the steam drifts
    rows = list(ICON_ROWS["bowl"]); sh_ = int(t / 0.22) % 3 - 1
    for j in range(3): r = rows[j]; rows[j] = (r[-sh_:] + r[:-sh_]) if sh_ > 0 else ((r[-sh_:] + r[:-sh_]) if sh_ < 0 else r)
    return icon_arr("bowl", rows)
_isc = {}
def icon_img(a, px, alpha=1.0, white=0.0):
    """a pixel icon at px screen pixels per art pixel; white = how much it is still a white-hot silhouette"""
    px = max(1, int(round(px))); key = (a.tobytes(), px)
    if key not in _isc: _isc[key] = Image.fromarray(a).resize((a.shape[1] * px, a.shape[0] * px), Image.NEAREST)
    im = _isc[key]
    if white > 0 or alpha < 1:
        arr = np.array(im).astype(np.float32)
        if white > 0: arr[..., :3] = arr[..., :3] * (1 - white) + np.array([255, 244, 214]) * white
        arr[..., 3] *= alpha; im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    return im
_gl = {}
def glow_disc(r, col, a):
    r = max(4, int(r)); key = (r, col)
    if key not in _gl:
        yy, xx = np.mgrid[0:2 * r, 0:2 * r]; d = np.hypot(xx - r, yy - r) / r
        g = Image.new("RGBA", (2 * r, 2 * r), col + (0,)); g.putalpha(Image.fromarray((np.clip(1 - d, 0, 1) ** 2 * 255).astype(np.uint8))); _gl[key] = g
    g = _gl[key]
    if a < 1: g = g.copy(); g.putalpha(g.getchannel("A").point(lambda v: int(v * a)))
    return g
def put_icon(img, a, X, Y, px, alpha=1.0, white=0.0, glow=None, rot=0.0, sx=1.0):
    if alpha <= 0.01: return
    if glow: g = glow_disc(a.shape[0] * px * 0.95, glow, 0.55 * alpha); paste(img, g, int(X - g.width / 2), int(Y - g.height / 2))
    im = icon_img(a, px, alpha, white)
    if sx != 1: im = im.resize((max(1, int(im.width * sx)), im.height), Image.NEAREST)
    if rot: im = im.rotate(rot, resample=Image.NEAREST, expand=True)
    paste(img, im, int(round(X - im.width / 2)), int(round(Y - im.height / 2)))

# ---------------------------------------------------------------- a 5 x 7 pixel font for the ember letters
FONT5 = {
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "B": "####.|#...#|#...#|####.|#...#|#...#|####.", "C": ".###.|#...#|#....|#....|#....|#...#|.###.",
    "D": "####.|#...#|#...#|#...#|#...#|#...#|####.", "E": "#####|#....|#....|####.|#....|#....|#####", "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.####", "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#", "I": ".###.|..#..|..#..|..#..|..#..|..#..|.###.",
    "J": "..###|...#.|...#.|...#.|...#.|#..#.|.##..", "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", "N": "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#", "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "P": "####.|#...#|#...#|####.|#....|#....|#....", "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..", "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    "V": "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..", "W": "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.", "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", "2": ".###.|#...#|....#|...#.|..#..|.#...|#####", "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
    "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#", "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "-": ".....|.....|.....|.###.|.....|.....|.....",
}
def text_cells(text):
    """lit cells (col, row) of a line of the pixel font, and its width in cells"""
    cells, x = [], 0
    for ch in text:
        if ch == " ": x += 4; continue
        for r, row in enumerate(FONT5[ch].split("|")):
            for q, c in enumerate(row):
                if c == "#": cells.append((x + q, r))
        x += 6
    return cells, x - 1

def heat_col(h):
    """ember colour: 1 white-hot, 0.7 gold, 0.4 orange, 0.1 deep red"""
    stops = [(0.0, (120, 30, 10)), (0.15, (205, 70, 25)), (0.4, (255, 140, 50)), (0.7, (255, 206, 110)), (1.0, (255, 248, 228))]
    h = clamp(h)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if h <= b: u = (h - a) / (b - a); return tuple(int(ca[i] + (cb[i] - ca[i]) * u) for i in range(3))
    return stops[-1][1]

NAVY3, SOFT3, GOLD3 = (20, 36, 81), (243, 245, 250), (255, 210, 122)
def brand_col(h, gold=False):
    """the launch video's colours for pixel letters: soft white (or gold), white-hot just after they land"""
    base = GOLD3 if gold else SOFT3; h = clamp(h)
    return tuple(int(base[i] + (255 - base[i]) * h) for i in range(3))
def draw_cells(dtop, dfx, cells, gold=False):
    """cells: (X, Y, size, alpha, hot). Outlines first (so neighbours merge into one navy rim), then the faces, then a glow."""
    for X, Y, sz, a, hot in cells:
        o = max(2.0, sz * 0.22); dtop.rectangle([X - sz / 2 - o, Y - sz / 2 - o, X + sz / 2 + o, Y + sz / 2 + o], fill=NAVY3 + (int(235 * a),))
    for X, Y, sz, a, hot in cells:
        dtop.rectangle([X - sz / 2, Y - sz / 2, X + sz / 2, Y + sz / 2], fill=brand_col(hot, gold) + (int(255 * a),))
        if dfx: g = sz * 0.75; dfx.rectangle([X - g, Y - g, X + g, Y + g], fill=GOLD3 + (int(70 * a),))

class Embers:
    """sparks that fly out of the fire to target cells, glow there, then leave (burst / converge / drift)"""
    def __init__(self, targets, cs, origin, t0, stagger=0.5, flight=(0.6, 1.0), spread=50, swirl=0.0, arc=160, seed=0):
        r = np.random.default_rng(seed); self.cs = cs; self.p = []
        xs = [t[0] for t in targets]; x0, x1 = min(xs), max(xs) + 1e-6
        for (tx, ty) in targets:
            self.p.append(dict(tx=tx, ty=ty, ts=t0 + stagger * (tx - x0) / (x1 - x0) * 0.7 + r.uniform(0, stagger * 0.3), dur=r.uniform(*flight),
                               sx=origin[0] + r.normal(0, spread), sy=origin[1] + r.normal(0, spread * 0.3), ph=r.uniform(0, 6.28), sw=swirl * r.uniform(0.6, 1.25),
                               dr=r.choice([-1, 1]), arc=arc * r.uniform(0.6, 1.3), fl=r.uniform(4, 9), fp=r.uniform(0, 6.28), vx=r.normal(0, 1), vy=r.normal(0, 1)))
        self.cx = float(np.mean([t[0] for t in targets])); self.cy = float(np.mean([t[1] for t in targets]))
    def pos(self, p, t):
        u = (t - p["ts"]) / p["dur"]
        if u < 0: return None
        if u >= 1: return p["tx"], p["ty"], 1.0
        e = 1 - (1 - u) ** 2.2
        x = p["sx"] + (p["tx"] - p["sx"]) * e; y = p["sy"] + (p["ty"] - p["sy"]) * e - p["arc"] * math.sin(math.pi * u)
        if p["sw"]: a = p["ph"] + p["dr"] * 3.2 * math.pi * u; x += p["sw"] * (1 - u) * math.cos(a); y += p["sw"] * (1 - u) * 0.55 * math.sin(a)
        return x, y, u
    def draw(self, d, t, c, exit=None, alpha=1.0, base_heat=0.62, top=None, gold=False):
        """exit: None, ("burst", t_start), ("converge", t_start, (x, y), dur), ("drift", t_start)"""
        k = W / c[2]; cs = self.cs * k; landed = []
        for p in self.p:
            q = self.pos(p, t)
            if q is None: continue
            x, y, u = q; h = base_heat; a = alpha; size = cs * 0.86
            if u < 1:                                                  # in flight: a small bright spark with a short trail
                for j, back_ in enumerate((0.06, 0.03, 0.0)):
                    qq = self.pos(p, t - back_)
                    if qq is None: continue
                    X, Y = to_scr(c, qq[0], qq[1]); s = max(2, cs * (0.32 + 0.12 * j)); col = heat_col(0.95)
                    d.rectangle([X - s / 2, Y - s / 2, X + s / 2, Y + s / 2], fill=col + (int(255 * a * (0.35 + 0.3 * j)),))
                continue
            age = t - p["ts"] - p["dur"]
            h = base_heat + 0.38 * math.exp(-age / 0.18) + 0.09 * math.sin(t * p["fl"] + p["fp"])   # lands white-hot, then glows and flickers
            if exit and t >= exit[1]:
                v = t - exit[1]
                if exit[0] == "burst":
                    ang = math.atan2(y - self.cy + 1e-3, x - self.cx + 1e-3) + 0.4 * p["vx"]; sp = 700 + 260 * p["vy"]
                    x += math.cos(ang) * sp * v; y += math.sin(ang) * sp * v + 500 * v * v; a *= clamp(1 - v / 0.55); size *= 1 - 0.5 * clamp(v / 0.55); h += 0.2
                elif exit[0] == "converge":
                    tx, ty = exit[2]; w = in3(clamp((v - 0.12 * abs(p["vx"])) / exit[3])); x += (tx - x) * w; y += (ty - y) * w
                    x += 40 * math.sin(p["ph"] + v * 9) * (1 - w) * w; size *= 1 - 0.5 * w; h += 0.3 * w
                elif exit[0] == "drift":
                    x += 60 * p["vx"] * v; y -= (90 + 40 * p["vy"]) * v; a *= clamp(1 - v / 0.9); h -= 0.35 * clamp(v / 0.9); size *= 1 - 0.4 * clamp(v / 0.9)
            if a <= 0.01: continue
            X, Y = to_scr(c, x, y)
            if top is not None: landed.append((X, Y, size * 0.92, a, clamp(math.exp(-age / 0.15) + 0.04 * math.sin(t * p["fl"] + p["fp"])))); continue
            col = heat_col(h); s2 = size * 0.42
            d.rectangle([X - size / 2, Y - size / 2, X + size / 2, Y + size / 2], fill=col + (int(255 * a),))
            d.rectangle([X - s2 / 2, Y - s2 / 2, X + s2 / 2, Y + s2 / 2], fill=heat_col(h + 0.28) + (int(255 * a),))
        if top is not None and landed: draw_cells(top, d, landed, gold)

def word_targets(text, cx, cy, cs, icon=None, icon_px=None):
    cells, wc = text_cells(text); extra = (len(icon[0]) * icon_px / cs + 2) if icon is not None else 0
    tot = wc + extra; left = cx - tot * cs / 2 + extra * cs
    return [(left + (q + 0.5) * cs, cy + (r - 3) * cs) for q, r in cells], (cx - tot * cs / 2 + (extra - 2) * cs / 2, cy)

# ---------------------------------------------------------------- the light layer: everything that glows gets real bloom
def light_comp(base, fx):
    f = np.asarray(fx).astype(np.float32); a = f[..., 3:4] / 255; L = f[..., :3] * a
    small = cv2.resize(L, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    g = cv2.resize(cv2.GaussianBlur(small, (0, 0), 2.5) * 1.35 + cv2.GaussianBlur(small, (0, 0), 9) * 1.7, (W, H), interpolation=cv2.INTER_LINEAR)
    tot = np.clip(L + g * np.array([1.0, 0.8, 0.6], np.float32), 0, 255)
    return (255 - (255 - base.astype(np.float32)) * (1 - tot / 255)).astype(np.uint8)

# ---------------------------------------------------------------- the sky: the app's real sky keys (lib/sky.ts), sunrise 7:00, sunset 18:00
def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
RISE, SET = 420, 1080; NOON = (RISE + SET) / 2
_K = [(-100, "rise", "#142451", "#233c6e", "#3a5a8f"), (-55, "rise", "#182b55", "#2b4677", "#4a6699"), (-22, "rise", "#13284f", "#3f5d8c", "#d98a62"),
      (4, "rise", "#2e5791", "#7d9cc7", "#ffb27a"), (60, "rise", "#3f7fc8", "#9dc3e8", "#f8dcbc"), (150, "rise", "#2f7cd2", "#76b1e8", "#cfe6f8"),
      (0, "noon", "#2a76d0", "#6aaae6", "#c8e3f8"), (-110, "set", "#3479c9", "#7fb2e2", "#d6e7f3"), (-45, "set", "#4a7fbf", "#a6bfd8", "#ffd391"),
      (-5, "set", "#36578f", "#c98f78", "#ff8a45"), (22, "set", "#1b3263", "#6a5a7a", "#e2643f"), (50, "set", "#1a2d5a", "#344c7c", "#5a6588"),
      (100, "set", "#142451", "#233c6e", "#3a5a8f")]
KEYS = sorted([({"rise": RISE, "set": SET, "noon": NOON}[w] + d, hexc(a), hexc(b), hexc(c)) for d, w, a, b, c in _K], key=lambda k: k[0])
KM = np.array([k[0] for k in KEYS]); KC = np.stack([np.stack(k[1:]) for k in KEYS])     # (13, 3, 3)
def sky_cols(minutes):
    """minutes: array -> (n, 3 stops, 3) colours"""
    m = np.mod(minutes, 1440); m = np.clip(m, KM[0], KM[-1])
    j = np.clip(np.searchsorted(KM, m), 1, len(KM) - 1); a, b = KM[j - 1], KM[j]; u = ((m - a) / np.maximum(b - a, 1))[:, None, None]
    return KC[j - 1] + (KC[j] - KC[j - 1]) * u
def roof(xs): return 1530 + 0.156 * xs
def sky_geom(c):
    x0, y0, w, h = c; k = W / w
    xs = x0 + (np.arange(W) + 0.5) / k; ys = y0 + (np.arange(H) + 0.5) / k; rf = roof(xs)
    r1 = int(np.searchsorted(ys, rf.max() + 5))
    above = np.clip((rf[None, :] - 8 - ys[:r1, None]) / 26, 0, 1).astype(np.float32)
    return xs, ys[:r1], rf, above, r1
def sky_wash(arr, c, cols_of_x, alpha, reveal=None):
    """paint the sky above the roof (dark pixels only, so the string lights and the lit trees stay) with the app's sky"""
    if alpha <= 0.005: return None
    xs, ys, rf, above, r1 = sky_geom(c)
    if r1 <= 0: return None
    sub = arr[:r1].astype(np.float32); lum = sub.max(-1)
    m = above * np.clip((110 - lum) / 60, 0, 1) * alpha
    if reveal is not None: m *= reveal(xs)[None, :]
    m = cv2.GaussianBlur(m, (0, 0), 1.6)
    cols = cols_of_x(xs)                                             # (W, 3 stops, 3)
    tt = np.clip((ys[:, None] - 380) / (rf[None, :] - 380), 0, 1)[..., None]
    top, mid, hor = cols[None, :, 0], cols[None, :, 1], cols[None, :, 2]
    col = np.where(tt < 0.55, top + (mid - top) * (tt / 0.55), mid + (hor - mid) * ((tt - 0.55) / 0.45))
    col = col * (0.82 + 0.18 * tt)                                   # a touch deeper overhead, like the app
    col += rng0.normal(0, 1.4, col.shape[:2])[..., None]             # no banding
    out = sub * (1 - m[..., None]) + col * m[..., None]
    out = 255 - (255 - out) * (1 - sub * m[..., None] * 0.9 / 255)    # the lights and their halos stay on top
    arr[:r1] = np.clip(out, 0, 255).astype(np.uint8)
    return above
def sky_sprite(arr, above, im, X, Y):
    """an icon in the sky that sets behind the roof"""
    if above is None: return
    x, y = int(round(X - im.width / 2)), int(round(Y - im.height / 2)); r1 = above.shape[0]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + im.width), min(r1, y + im.height)
    if x1 <= x0 or y1 <= y0: return
    a = np.asarray(im).astype(np.float32)[y0 - y:y1 - y, x0 - x:x1 - x]; al = a[..., 3:4] / 255 * above[y0:y1, x0:x1, None]
    arr[y0:y1, x0:x1] = (arr[y0:y1, x0:x1] * (1 - al) + a[..., :3] * al).astype(np.uint8)
def sun_on(arr, above, c, x, y, px_src, alpha=1.0, name="sun"):
    k = W / c[2]; X, Y = to_scr(c, x, y); px = px_src * k
    g = glow_disc(12 * px * 1.6, (255, 214, 140) if name == "sun" else (200, 215, 255), 0.6 * alpha); sky_sprite(arr, above, g, X, Y)
    sky_sprite(arr, above, icon_img(ICON[name], px, alpha), X, Y)

# ---------------------------------------------------------------- sparkler writing (Sacramento, a monoline script: SIL OFL)
SCRIPT = f"{HERE}/fonts_dl/Sacramento-Regular.ttf"
F_ROLE = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-SemiBold.ttf", 34)
class Sparkler:
    def __init__(self, text, size, role):
        f = ImageFont.truetype(SCRIPT, size); bb = f.getbbox(text); pad = 30
        im = Image.new("L", (bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad)); ImageDraw.Draw(im).text((pad - bb[0], pad - bb[1]), text, font=f, fill=255, stroke_width=1, stroke_fill=255)
        self.m = np.array(im).astype(np.float32) / 255; cols = np.where(self.m.max(0) > 0.3)[0]; self.c0, self.c1 = cols[0], cols[-1]
        ys = np.arange(self.m.shape[0])[:, None]; ws = self.m.sum(0); self.hy = (self.m * ys).sum(0) / np.maximum(ws, 1e-3); self.has = ws > 0.3
        self.role = role
    def draw(self, fx, top, X, Y, t, t0, dur=1.0, hold=1.3, rng_seed=0):
        """X, Y: screen centre. Writes left to right from t0 over dur; the trail stays lit, then turns to smoke after hold."""
        if t < t0: return
        hgt, wid = self.m.shape; cols = np.arange(wid); tr = t0 + dur * (cols - self.c0) / max(1, self.c1 - self.c0)
        age = t - tr; tf = t0 + dur + hold
        bright = np.where(age < 0, 0, 0.75 + 0.25 * np.exp(-np.maximum(age, 0) / 0.12))
        bright *= 0.9 + 0.1 * np.sin(cols * 0.35 + t * 23)
        fade = clamp((t - tf) / 0.45)
        if fade > 0: bright *= 1 - fade
        if fade < 1:
            hot = np.clip(np.exp(-np.maximum(age, 0) / 0.2), 0, 1)
            col = np.stack([np.full(wid, 255.), 200 + 50 * hot, 120 + 120 * hot], -1)            # gold, white where fresh
            a = (self.m * bright[None, :])[..., None]; rgba = np.dstack([np.broadcast_to(col[None], (hgt, wid, 3)), a * 255]).astype(np.uint8)
            paste(fx, Image.fromarray(rgba, "RGBA"), int(X - wid / 2), int(Y - hgt / 2))
        if tf < t < tf + 1.2:                                                                    # smoke, rising and spreading
            u = clamp((t - tf) / 1.2)
            if u < 1:
                sm = cv2.GaussianBlur(self.m, (0, 0), 3 + 14 * u) * (0.42 * (1 - u) * clamp((t - tf) / 0.25))
                rgba = np.dstack([np.full((hgt, wid, 3), (196, 186, 178), np.float32), sm[..., None] * 255]).astype(np.uint8)
                paste(top, Image.fromarray(rgba, "RGBA"), int(X - wid / 2), int(Y - hgt / 2 - 70 * u))
        head = t - t0
        if 0 <= head < dur + 0.05:                                                              # the sparkler's head, spitting sparks
            q = int(self.c0 + (self.c1 - self.c0) * clamp(head / dur)); q = min(wid - 1, max(0, q))
            while q > 0 and not self.has[q]: q -= 1
            hx, hy = X - wid / 2 + q, Y - hgt / 2 + self.hy[q]
            d = ImageDraw.Draw(fx); r = np.random.default_rng(int(t * 1000) + rng_seed)
            g = glow_disc(46, (255, 236, 200), 0.95); paste(fx, g, int(hx - 46), int(hy - 46))
            for _ in range(16):
                ang = r.uniform(0, 6.28); L = r.uniform(8, 55); x2, y2 = hx + L * math.cos(ang), hy + L * math.sin(ang) + 0.004 * L * L
                d.line([hx + 0.3 * (x2 - hx), hy + 0.3 * (y2 - hy), x2, y2], fill=(255, 238, 190, int(r.uniform(140, 255))), width=2)
        if t > t0 + dur * 0.8 and t < tf + 0.4:                                                 # the role, plain and small under it
            a = clamp((t - t0 - dur * 0.8) / 0.35) * (1 - clamp((t - tf) / 0.4)); lay = ImageDraw.Draw(top)
            s = self.role; sp = 4; wsum = sum(F_ROLE.getlength(ch) + sp for ch in s) - sp; x = X - wsum / 2; y = Y + hgt / 2 - 6 + 10 * (1 - out3(a))
            for ch in s:
                lay.text((x + 2, y + 2), ch, font=F_ROLE, fill=(10, 8, 6, int(150 * a))); lay.text((x, y), ch, font=F_ROLE, fill=(255, 241, 214, int(240 * a))); x += F_ROLE.getlength(ch) + sp

# ---------------------------------------------------------------- the pieces
FIVE = [("Dawn", (255, 200, 170), 398), ("Ray", (255, 226, 160), 700), ("Goldie", (255, 205, 130), 1035), ("Twinkle-night", (200, 215, 255), 1130), ("Dreamy-night", (200, 215, 255), 1300)]
ARC_POS = [(430, 1345), (720, 1205), (1010, 1150), (1300, 1205), (1590, 1335)]
ART_W = 9.6                                                       # source px per skyling art pixel in the sky
def contour(name):
    a = pose_frame(name, "idle", 0); al = (a[..., 3] > 0).astype(np.uint8) * 255; big = cv2.resize(al, (260, 260), interpolation=cv2.INTER_NEAREST)
    cs_, _ = cv2.findContours(big, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cc = max(cs_, key=cv2.contourArea)
    ap = cv2.approxPolyDP(cc, 0.03 * cv2.arcLength(cc, True), True)[:, 0, :] / 10.0 - 13; return ap
CONST = [contour(nm) for nm, _, _ in FIVE]
ANCH = sky_cols(np.array([f[2] for f in FIVE], np.float32)); ANCH_X = np.array([p[0] for p in ARC_POS], np.float32)
def arc_cols(xs):
    """each skyling's own sky behind it, blended softly between neighbours"""
    w = np.exp(-((xs[:, None] - ANCH_X[None, :]) / 230) ** 2) + 1e-6; w /= w.sum(1, keepdims=True)
    return np.einsum("wk,kij->wij", w, ANCH)
STARS = [(rng0.uniform(150, 2000), rng0.uniform(500, 1480), rng0.uniform(0, 6.28), rng0.uniform(0, 1)) for _ in range(46)]
STARS = [s for s in STARS if s[1] < roof(s[0]) - 60]
DREAMY = (1712, 2600)                                             # Tyler's skyling's seat on the fire-pit rim

def draw_skyling_px(img, a, px, X, Y, alpha=1.0, glow=None, anchor="center"):
    kk = max(1, int(round(px))); R.draw_skyling(img, a, kk, X, Y, px / kk, anchor=anchor, alpha=alpha, glow=glow)

_card = None
F_NT = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-SemiBold.ttf", 25); F_NH = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Bold.ttf", 36)
F_NB = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 30)
def notif_card():
    """the skyling's notification, drawn in the app's pixel style (ink outline, stepped corners), with the app's real words
    for this note (lib/jarvis-voice.ts spending_pace: headline and ask; no made-up amounts)"""
    global _card
    if _card is not None: return _card
    px = 5; cw, ch = 132, 34; g = np.zeros((ch, cw, 4), np.uint8); ink = PAL["k"] + (255,); wh = (255, 252, 246, 245)
    for y in range(ch):
        for x in range(cw):
            if (x in (0, cw - 1) and y in (0, 1, ch - 2, ch - 1)) or (y in (0, ch - 1) and x in (1, cw - 2)): continue
            edge = x in (0, cw - 1) or y in (0, ch - 1) or (x in (1, cw - 2) and y in (1, ch - 2))
            g[y, x] = ink if edge else wh
    im = Image.fromarray(g).resize((cw * px, ch * px), Image.NEAREST)
    sun = Image.fromarray(ICON["sun"]).resize((12 * 7, 12 * 7), Image.NEAREST)               # the app's pixel sun, on its sky tile
    tile = Image.new("RGBA", (12 * 7 + 16, 12 * 7 + 16), (0, 0, 0, 0)); td = ImageDraw.Draw(tile)
    td.rounded_rectangle([0, 0, tile.width - 1, tile.height - 1], 18, fill=(72, 127, 192, 255)); tile.alpha_composite(sun, (8, 8)); im.alpha_composite(tile, (22, (im.height - tile.height) // 2))
    d = ImageDraw.Draw(im); x0 = 22 + tile.width + 22; ink3 = PAL["k"]
    d.text((x0, 26), "DREAMY  ·  NOW", font=F_NT, fill=(120, 132, 156, 255))
    d.text((x0, 58), "Food is running high", font=F_NH, fill=ink3 + (255,))
    d.text((x0, 104), "Want to see where it went?", font=F_NB, fill=(70, 82, 108, 255))
    _card = im; return im

import make_cloud as MC                                             # the kit's cloud (the app's idea-cloud tiles)
_cl2 = {}
def cloud_lines(lines, zoom=2.0, shape=2, night=True):
    """the app's pixel cloud (kit make_cloud.py tiles), grown to hold more than one line; navy words, centred"""
    key = (tuple(lines), zoom, shape, night)
    if key in _cl2: return _cl2[key]
    t_ = MC.TILES[f"tile-{shape}"]; T_, R_, B_, L_ = t_["top"], t_["right"], t_["bottom"], t_["left"]
    tile = Image.open(os.path.join(MC.HERE, f"tile-{shape}-{'night' if night else 'day'}.png")).convert("RGBA")
    font = ImageFont.truetype(os.path.join(MC.HERE, "Geist-SemiBold.ttf"), round(13 * zoom)); LH = 17
    tw = max(font.getlength(l) for l in lines) / zoom; Wc = max(tw + 28, 2 * (L_ + R_)); Hc = 2 * T_ + 24 + LH * (len(lines) - 1) + 2 * B_
    ow, oh = round(Wc * zoom), round(Hc * zoom); cl = Image.new("RGBA", (ow, oh), (0, 0, 0, 0))
    sx = [0, L_, 48 - R_, 48]; sy = [0, T_, 21 - B_, 21]
    dx = [0, round(2 * L_ * zoom), ow - round(2 * R_ * zoom), ow]; dy = [0, round(2 * T_ * zoom), oh - round(2 * B_ * zoom), oh]
    for r in range(3):
        for c in range(3):
            w, h = dx[c + 1] - dx[c], dy[r + 1] - dy[r]
            if w > 0 and h > 0: cl.alpha_composite(tile.crop((sx[c], sy[r], sx[c + 1], sy[r + 1])).resize((w, h), Image.NEAREST), (dx[c], dy[r]))
    pad = round(6 * zoom); img = Image.new("RGBA", (ow, oh + pad), (0, 0, 0, 0))
    sh_ = Image.new("RGBA", cl.size, (19, 33, 61, 0)); sh_.putalpha(cl.getchannel("A").point(lambda a: round(a * 0.12)))
    img.alpha_composite(sh_, (0, round(4 * zoom))); img.alpha_composite(cl, (0, 0)); d = ImageDraw.Draw(img)
    y0 = (oh - (len(lines) - 1) * LH * zoom) / 2 - 2 * zoom
    for j, l in enumerate(lines): d.text((ow / 2, y0 + j * LH * zoom), l, font=font, fill=(19, 33, 61, 255), anchor="mm")
    _cl2[key] = img; return img

def icon_bubble(icons, px=5):
    """the app's pixel speech bubble holding only pictures (the app's 12 x 12 icons), the tail at the bottom right"""
    w = 4 + sum(i.shape[1] for i in icons) + 3 * (len(icons) - 1) + 4; h = 18; g = np.zeros((h + 4, w, 4), np.uint8)
    ink = PAL["k"] + (255,); wh = (255, 255, 255, 255)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) and y in (0, h - 1): continue
            g[y, x] = ink if (x in (0, w - 1) or y in (0, h - 1) or (x in (1, w - 2) and y in (1, h - 2))) else wh
    tx = w - 10
    for j, (x0, x1) in enumerate([(tx, tx + 4), (tx + 1, tx + 4), (tx + 2, tx + 4), (tx + 3, tx + 4)]):
        for x in range(x0, x1): g[h - 1 + j, x] = wh
        g[h - 1 + j, x0 - 1] = ink; g[h - 1 + j, x1] = ink
    g[h + 3, tx + 2:tx + 5] = ink; x = 4
    for ic in icons:
        sl = g[3:15, x:x + ic.shape[1]]; g[3:15, x:x + ic.shape[1]] = np.where(ic[..., 3:4] > 0, ic, sl); x += ic.shape[1] + 3
    return Image.fromarray(g).resize((w * px, (h + 4) * px), Image.NEAREST), (tx + 2) * px

def say_bubble(lines, icon=None, px=4):
    """the app's pixel speech bubble (white, ink outline, stepped corners), an icon on the left, pixel words in ink; the tail
    at the bottom right. Returns the image and the tail tip's x."""
    widths = [text_cells(l)[1] for l in lines]; tw = max(widths); iw = 0 if icon is None else icon.shape[1] + 3
    w = 4 + iw + tw + 4; h = max(8 * len(lines) + 4, 16 if icon is not None else 0); g = np.zeros((h + 4, w, 4), np.uint8)
    ink = PAL["k"] + (255,); wh = (255, 255, 255, 255)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) and y in (0, h - 1): continue
            g[y, x] = ink if (x in (0, w - 1) or y in (0, h - 1) or (x in (1, w - 2) and y in (1, h - 2))) else wh
    tx = w - 10
    for j, (x0, x1) in enumerate([(tx, tx + 4), (tx + 1, tx + 4), (tx + 2, tx + 4), (tx + 3, tx + 4)]):
        for x in range(x0, x1): g[h - 1 + j, x] = wh
        g[h - 1 + j, x0 - 1] = ink; g[h - 1 + j, x1] = ink
    g[h + 3, tx + 2:tx + 5] = ink
    if icon is not None: g[(h - 12) // 2:(h - 12) // 2 + 12, 3:15] = np.where(icon[..., 3:4] > 0, icon, g[(h - 12) // 2:(h - 12) // 2 + 12, 3:15])
    oy0 = (h - 8 * len(lines) + 1) // 2
    for li, l in enumerate(lines):
        cells, lw = text_cells(l); ox = 4 + iw + (tw - lw) // 2
        for q, r in cells: g[oy0 + 8 * li + r, ox + q] = ink
    return Image.fromarray(g).resize((w * px, (h + 4) * px), Image.NEAREST), (tx + 2) * px

def bubble_img(icon, px):
    """the app's pixel speech bubble: ink outline, white, a tail at the bottom left, the icon inside"""
    w, h = 18, 16; g = np.zeros((h + 3, w, 4), np.uint8); ink = PAL["k"] + (255,); wh = (255, 255, 255, 255)
    for y in range(h):
        for x in range(w):
            corner = (x in (0, w - 1) and y in (0, h - 1))
            if corner: continue
            edge = x in (0, w - 1) or y in (0, h - 1) or (x in (1, w - 2) and y in (1, h - 2))
            if (x in (1, w - 2) and y in (1, h - 2)): g[y, x] = ink; continue
            g[y, x] = ink if edge else wh
    for j, (x0, x1) in enumerate([(3, 6), (3, 5), (3, 4)]):
        for x in range(x0, x1 + 1): g[h + j - 1, x] = wh
        g[h + j - 1, x0 - 1] = ink; g[h + j - 1, x1 + 1] = ink
    g[h + 2, 3:5] = ink
    g[2:14, 3:15] = np.where(icon[..., 3:4] > 0, icon, g[2:14, 3:15])
    return Image.fromarray(g).resize((w * px, (h + 3) * px), Image.NEAREST)

# ---------------------------------------------------------------- per-segment effects
HOOK_Q = Embers(*(lambda tc: (tc, 30))(word_targets("?", 1530, 1818, 30)[0]), origin=(1280, 2470), t0=-0.55, stagger=0.6, flight=(0.85, 1.25), spread=70, swirl=170, arc=120, seed=3)
HOOK_BURST = 3.12
SHOW_LABEL = os.environ.get("CAMPFIRE_LABEL", "0") == "1"
LABEL_CELLS = text_cells("CAMPFIRE Q&A")
class FuseName:
    """the name in the pixel letters, burned in left to right by a fuse (a bright head spitting sparks), glowing, then
    cooling and lifting off as embers; the role in small plain letters under it"""
    def __init__(self, text, role, cs=10.5):
        self.cells, self.wc = text_cells(text); self.role = role; self.cs = cs; r = np.random.default_rng(len(text))
        self.ph = {c: r.uniform(0, 6.28) for c in self.cells}; self.v = {c: (r.normal(0, 1), r.uniform(0.6, 1.4)) for c in self.cells}
    def draw(self, fx, top, X, Y, t, t0, dur=0.85, hold=1.25, k=1.0):
        if t < t0: return
        d = ImageDraw.Draw(fx); px = self.cs * k; x0 = X - self.wc * px / 2; y0 = Y - 3.5 * px; tf = t0 + dur + hold; cells = []
        head = t0 + dur * 1.0
        for (q, r_) in self.cells:
            tl = t0 + dur * q / max(1, self.wc)
            if t < tl: continue
            age = t - tl; h = 0.68 + 0.32 * math.exp(-age / 0.16) + 0.06 * math.sin(t * 9 + self.ph[(q, r_)])
            x, y, a, sz = x0 + q * px, y0 + r_ * px, 1.0, px * 0.88
            if t > tf:                                                     # it cools and lifts off as embers
                v = t - tf - 0.25 * (q / max(1, self.wc)); vx, vs = self.v[(q, r_)]
                if v > 0: x += 26 * vx * v * k; y -= 70 * vs * v * k; a = clamp(1 - v / 0.7); h -= 0.4 * clamp(v / 0.7); sz *= 1 - 0.5 * clamp(v / 0.7)
            if a <= 0.01: continue
            cells.append((x + sz / 2, y + sz / 2, sz, a, clamp(math.exp(-age / 0.15))))
        if cells: draw_cells(ImageDraw.Draw(top), d, cells)
        if t < t0 + dur + 0.05:                                            # the fuse's head
            hx = x0 + self.wc * px * clamp((t - t0) / dur); hy = Y + 2.5 * px * math.sin((t - t0) * 9)
            g = glow_disc(int(4 * px), (255, 236, 200), 0.95); paste(fx, g, int(hx - g.width / 2), int(hy - g.height / 2))
            rr = np.random.default_rng(int(t * 1000))
            for _ in range(14):
                ang = rr.uniform(0, 6.28); L = rr.uniform(0.6, 4.5) * px; x2, y2 = hx + L * math.cos(ang), hy + L * math.sin(ang) + 0.02 * L * L
                d.line([hx + 0.3 * (x2 - hx), hy + 0.3 * (y2 - hy), x2, y2], fill=(255, 236, 190, int(rr.uniform(140, 255))), width=2)
        if t0 + dur * 0.7 < t < tf + 0.5:                                  # the role, plain and small
            a = clamp((t - t0 - dur * 0.7) / 0.3) * (1 - clamp((t - tf) / 0.5)); lay = ImageDraw.Draw(top)
            sp = 4; wsum = sum(F_ROLE.getlength(ch) + sp for ch in self.role) - sp; x = X - wsum / 2; y = y0 + 7 * px + 18 + 8 * (1 - out3(a))
            for ch in self.role:
                lay.text((x + 2, y + 2), ch, font=F_ROLE, fill=(10, 8, 6, int(150 * a))); lay.text((x, y), ch, font=F_ROLE, fill=(255, 241, 214, int(240 * a))); x += F_ROLE.getlength(ch) + sp
ALI = FuseName("ALI MOSLLI", "CEO & DEVELOPER"); TYLER = FuseName("TYLER KARDY", "CMO")
WORDS = []
CONNECT = [("7 CLASSES", "class", 4.55, 0, 0), ("WORK SHIFTS", "shift", 5.5, 0, 1), ("FINANCE", "money", 6.6, 0, 2), ("MAIL", "mail", 6.98, 0, 3),
           ("GOALS", "goal", 7.06, 1, 0), ("TO-DOS", "todo", 7.14, 1, 1), ("MILESTONES", "flag", 7.22, 1, 2), ("HEALTH", "health", 7.3, 1, 3)]
CS_W = 7.0; ICON_PX = 4.3                                          # world px per letter cell and per icon pixel
for j, (txt, ic, ts, col, row) in enumerate(CONNECT):
    x_icon = 555 if col == 0 else 1150; y = 1252 + row * 105; cells, wc = text_cells(txt)
    tg = [(x_icon + 45 + (q + 0.5) * CS_W, y + (r - 3) * CS_W) for q, r in cells]
    spoken = j < 3
    WORDS.append(dict(e=Embers(tg, CS_W, origin=(880, 2470), t0=ts - (0.55 if spoken else 0.42), stagger=0.4 if spoken else 0.25, flight=(0.45, 0.7) if spoken else (0.35, 0.5),
                           spread=90, swirl=30, arc=240, seed=20 + j), icon=ic, ix=x_icon, iy=y, ts=ts))
ONE_PLACE = (1115, 1330); ONE_T = 7.55
_ws = [p for wd in WORDS for p in [(q["tx"], q["ty"]) for q in wd["e"].p]] + [(wd["ix"] - 36, wd["iy"]) for wd in WORDS]
FRAME_BOX = (min(x for x, _ in _ws) - 34, max(x for x, _ in _ws) + 34, min(y for _, y in _ws) - 48, max(y for _, y in _ws) + 48)
JAN = Embers(word_targets("JANUARY 2027", 1080, 1185, 11.5)[0], 11.5, origin=(1000, 2300), t0=0.2, stagger=0.6, flight=(0.7, 1.05), spread=260, swirl=60, arc=60, seed=40)
END_L1, _ = word_targets("GET ON THE", 540, 1262, 11.0); END_L2, _ = word_targets("WAITLIST", 540, 1362, 11.0)
END_TXT = Embers(END_L1 + END_L2, 11.0, origin=(540, 760), t0=0.3, stagger=0.5, flight=(0.45, 0.7), spread=8, swirl=0, arc=-120, seed=41)
EKG = None

def ekg_points():
    xs = np.arange(1030, 1895, 3.0); base = 1790; y = np.full_like(xs, base)
    for cx_ in (1210, 1460, 1710):                                     # three beats; the middle one is where the heart appears
        u = xs - cx_
        y += -14 * np.exp(-((u + 34) / 9) ** 2) + 18 * np.exp(-((u + 8) / 4) ** 2) - 95 * np.exp(-(u / 4.5) ** 2) + 40 * np.exp(-((u - 9) / 4) ** 2) - 22 * np.exp(-((u - 42) / 11) ** 2)
    return xs, y
EKG_X, EKG_Y = ekg_points()

def effects(seg, arr, t, c, T, m):
    """returns (arr, fx layer, top layer); arr gets the sky work, fx the light, top the solid pieces"""
    tag = seg["tag"]; k = W / c[2]
    fx = Image.new("RGBA", (W, H), (0, 0, 0, 0)); top = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(fx); dt = ImageDraw.Draw(top)
    # ambient embers from the fire (no stars any more)
    boost = 1.6 if tag == "vo" else 1.0
    for e in F.EMBERS:
        a = T - e["t0"]
        if not (0 <= a < e["life"]): continue
        y = 2430 - e["v"] * a - 30 * a * a; x = e["x"] + e["vx"] * a + 18 * math.sin(a * 3 + e["ph"])
        X, Y = to_scr(c, x, y); al = (1 - a / e["life"]) ** 1.3 * boost; s = max(2, int(round(5 * k / 1.3)))
        d.rectangle([X, Y, X + s - 1, Y + s - 1], fill=heat_col(0.55 + 0.4 * (1 - a / e["life"])) + (int(235 * min(1, al)),))

    if tag == "hook":
        HOOK_Q.draw(d, t, c, exit=("burst", HOOK_BURST) if t >= HOOK_BURST else None, base_heat=0.66, top=dt, gold=True)
        if t < 3.3 and SHOW_LABEL:                                      # the series name, ember pixels at the top (v3: the intro carries it)
            a = clamp(t / 0.25) * clamp((3.3 - t) / 0.3); cells, wc = LABEL_CELLS; px = 7
            for q, r in cells:
                h = 0.66 + 0.1 * math.sin(T * 7 + q * 1.7 + r)
                X = 540 - wc * px / 2 + q * px; Y = 175 + r * px; d.rectangle([X, Y, X + px - 2, Y + px - 2], fill=heat_col(h) + (int(255 * a),))
    if tag == "wheel" and t < 0.5:                                      # the last of the "?" burst, carried across the cut
        HOOK_Q.draw(d, BY["hook"]["nf"] / FPS + t, crop_of(shot2(BY["hook"], HOOK_BURST)), exit=("burst", HOOK_BURST), base_heat=0.66, top=dt, gold=True)

    if tag == "wheel":
        if t < 2.75:                                                    # his name, burned in
            X, Y = to_scr(c, 762, 1752); ALI.draw(fx, top, X, Y, t, 0.3, 0.8, 1.05)
        # "wake up to a notification from your skyling": Dawn, the morning's skyling, rings the app's bell beside him
        if 0.7 <= t < 2.62:
            u = clamp((t - 0.7) / 0.4); up = in3(clamp((t - 2.3) / 0.32))
            X, Y = to_scr(c, 1035, 2010 - 30 * out3(u)); Y -= 900 * up; px = 5.6 * k
            draw_skyling_px(top, pose_frame("Dawn", "wave" if t < 1.9 else "idle", T), px, X, Y, alpha=out3(u), glow=(255, 200, 170))
            if t >= 0.95:
                rv = t - 0.95; rot = 20 * math.sin(rv * 26) * math.exp(-rv * 1.4); bx, by = X + 10 * px, Y - 19 * px
                put_icon(top, ICON["bell"], bx, by, 4.2 * k, alpha=clamp(rv / 0.12) * (1 - up), rot=rot, glow=GOLD3)
                if rv < 1.2:
                    for sgn in (-1, 1):
                        for j_ in range(2):
                            r_ = (30 + 14 * j_) * k / 1.25; a0 = 180 if sgn < 0 else 0
                            dt.arc([bx - r_, by - r_, bx + r_, by + r_], a0 - 22, a0 + 22, fill=GOLD3 + (int(220 * (1 - rv / 1.2)),), width=4)
        # "planning out your whole day and week": the day as a line across their sky, the app's icons as its stops
        if t >= 2.7:
            fade = clamp((8.93 - t) / 0.35) * clamp((7.2 - t) / 0.25)    # the day line hands over to the app's timeline
            LY = 1470; LX0, LX1 = 540, 1520
            wk = clamp((t - 7.05) / 0.5)                                # "a whole week": the day becomes one of seven
            draw_t = clamp((t - 2.7) / 0.45)
            P0 = to_scr(c, LX0, LY); P1 = to_scr(c, LX0 + (LX1 - LX0) * out3(draw_t), LY)
            d.line([P0, P1], fill=SOFT3 + (int(235 * fade),), width=max(3, int(4 * k)))
            stops = [("bell", 610, 3.0), ("books", 800, 3.3), ("briefcase", 990, 3.6), ("bowl", 1290, 3.9), ("moon", 1460, 4.2)]
            for j_, (nm, x, ts) in enumerate(stops):
                if t < ts: continue
                u = (t - ts) / 0.3; s_ = back(u) if u < 1 else 1
                if nm in ("books", "briefcase") and t >= 5.75: x += (-30 if nm == "books" else -60) * out3((t - 5.75) / 0.35)   # room is made
                if nm == "bowl" and t >= 5.75: x += 50 * out3((t - 5.75) / 0.35)
                X, Y = to_scr(c, x, LY); sc = 1 - 0.55 * wk
                put_icon(top, ICON[nm], X, Y - 4 * k, 7.6 * k * s_ * sc, alpha=fade, glow=GOLD3)
            if t >= 5.75:                                              # "block times for study time": a study block drops into the gap
                u = (t - 5.75) / 0.4; X, Y = to_scr(c, 1140, LY); sc = 1 - 0.55 * wk
                bw, bh = 190 * k * sc, 60 * k * sc; yy = Y - 260 * k * (1 - out3(u)) if u < 1 else Y
                dt.rounded_rectangle([X - bw / 2 - 3, yy - bh / 2 - 3, X + bw / 2 + 3, yy + bh / 2 + 3], 10, fill=NAVY3 + (int(220 * fade),))
                dt.rounded_rectangle([X - bw / 2, yy - bh / 2, X + bw / 2, yy + bh / 2], 8, fill=GOLD3 + (int(235 * fade),))
                put_icon(top, ICON["books"], X, yy, 4.4 * k * sc, alpha=fade)
                if 0 < u < 1.6: g = glow_disc(int(90 * k), GOLD3, 0.7 * (1 - u / 1.6)); paste(fx, g, int(X - g.width / 2), int(yy - g.height / 2))
            if t >= 6.95:                                              # "overview a whole week": the app's own timeline runs through the week
                v = clamp((t - 6.95) / 0.3) * clamp((8.93 - t) / 0.3); n_ = int(1 + 300 * smoothv(clamp((t - 6.95) / 1.95)))
                tl = Image.open(R.TLINE[min(n_, len(R.TLINE) - 1)]).convert("RGBA"); tl = tl.resize((1000, int(760 * 1000 / 1080)), Image.LANCZOS)
                if v < 1: tl.putalpha(tl.getchannel("A").point(lambda q: int(q * v)))
                paste(top, tl, 40, int(30 + 40 * (1 - out3(clamp((t - 6.95) / 0.35)))))

    if tag == "tyler_name":
        X, Y = to_scr(c, 1462, 1765); TYLER.draw(fx, top, X, Y, t, 0.3, 0.8, 1.55)

    if tag == "clouds":
        fade = 1 - clamp((t - 8.12) / 0.3)
        for wd in WORDS:
            wd["e"].draw(d, t, c, alpha=fade, top=dt)
            if t >= wd["ts"] - 0.05:                                  # the app's own icon lights up with its word
                u = clamp((t - wd["ts"] + 0.05) / 0.3); X, Y = to_scr(c, wd["ix"], wd["iy"]); px = ICON_PX * k * (back(u) if u < 1 else 1)
                put_icon(top, ICON16[wd["icon"]], X, Y, px, alpha=out3(u) * fade, white=1 - clamp((t - wd["ts"]) / 0.3), glow=GOLD3)
        if t >= ONE_T:                                                 # "in one place": a gold pixel frame draws itself around all three
            u = out3((t - ONE_T) / 0.45); x0w, x1w, y0w, y1w = FRAME_BOX
            pts = [(x0w, y0w), (x1w, y0w), (x1w, y1w), (x0w, y1w), (x0w, y0w)]; per = [math.dist(a_, b_) for a_, b_ in zip(pts, pts[1:])]; L = sum(per) * u
            cs_ = 9 * k; acc = 0; cells = []
            for (ax, ay), (bx, by), pl in zip(pts, pts[1:], per):
                n = int(pl / 9)
                for q in range(n):
                    if acc + q * 9 > L: break
                    X, Y = to_scr(c, ax + (bx - ax) * q / n, ay + (by - ay) * q / n); cells.append((X, Y, cs_ * 0.95, fade, 0.0))
                acc += pl
            draw_cells(dt, d, cells, gold=True)
            if u < 1 and cells: hx, hy = cells[-1][:2]; g = glow_disc(int(40 * k), (255, 240, 210), 0.9); paste(fx, g, int(hx - g.width / 2), int(hy - g.height / 2))

    if tag == "question":
        for j, (x, y, ph, br) in enumerate(STARS):                     # the stars come out while he asks
            ts = 1.2 + 4.2 * (j / len(STARS))
            if t < ts: continue
            X, Y = to_scr(c, x, y); tw = 0.55 + 0.45 * math.sin(T * (2 + 2 * br) + ph)
            pixel_star(top, int(X), int(Y), 4 if br < 0.7 else 5, (0.45 + 0.55 * br) * tw * clamp((t - ts) / 0.4), (255, 244, 214))

    if tag == "arc":
        # the sky behind them runs dawn to night, left to right, under each skyling's own time
        rev_t = clamp((t - 2.55) / 0.9)
        above = sky_wash(arr, c, arc_cols, 0.8, reveal=lambda xs: np.clip((rev_t * 2600 - (xs - 150)) / 300, 0, 1)) if rev_t > 0 else None
        for j, (x, y, ph, br) in enumerate(STARS):
            day = 0.0 if rev_t <= 0 else clamp((rev_t * 2600 - (x - 150)) / 300) * clamp((1200 - x) / 500)
            X, Y = to_scr(c, x, y); tw = 0.55 + 0.45 * math.sin(T * (2 + 2 * br) + ph)
            pixel_star(top, int(X), int(Y), 2 if br < 0.7 else 3, (0.35 + 0.5 * br) * tw * (1 - day), (255, 244, 214))
        for j, (nm, glow, _) in enumerate(FIVE):
            cx_, cy_ = ARC_POS[j]; pts = CONST[j]; ig = 1.22 + j * 0.3; t_in = 0.1 + j * 0.13
            if t < t_in: continue
            P = [to_scr(c, cx_ + px_ * ART_W, cy_ + py_ * ART_W + 7 * math.sin(T * 2.3 + j)) for px_, py_ in pts]
            ca = 1 - clamp((t - ig) / 0.35)                            # the constellation, drawn star by star
            if ca > 0:
                n_on = (t - t_in) / 0.035
                for q in range(len(P)):
                    if q + 1 > n_on: break
                    A, B = P[q], P[(q + 1) % len(P)]; lu = clamp(n_on - q - 1)
                    if lu > 0: d.line([A, (A[0] + (B[0] - A[0]) * lu, A[1] + (B[1] - A[1]) * lu)], fill=(200, 216, 255, int(150 * ca)), width=2)
                    pixel_star(fx, int(A[0]), int(A[1]), 3, ca * (0.75 + 0.25 * math.sin(T * 9 + q)), (240, 246, 255))
            if t >= ig - 0.06:                                         # it ignites into the skyling
                u = clamp((t - ig + 0.06) / 0.28); X, Y = to_scr(c, cx_, cy_ + 7 * math.sin(T * 2.3 + j)); px = ART_W * k
                g = glow_disc(26 * px * 0.9, (255, 250, 235), 0.9 * clamp(1 - (t - ig) / 0.45)); paste(fx, g, int(X - g.width / 2), int(Y - g.height / 2))
                draw_skyling_px(top, pose_frame(nm, "wave" if t - ig < 1.3 else "idle", T, j * 0.3), px * (0.85 + 0.15 * out3(u)), X, Y, alpha=out3(u), glow=glow)

    if tag == "ask_tyler":
        for j, (x, y, ph, br) in enumerate(STARS):                     # the stars are still out
            X, Y = to_scr(c, x, y); tw = 0.55 + 0.45 * math.sin(T * (2 + 2 * br) + ph)
            pixel_star(top, int(X), int(Y), 3 if br < 0.7 else 4, (0.35 + 0.5 * br) * tw * clamp((1.85 - t) / 0.5 + 0.3), (255, 244, 214))
        ts = 1.53                                                       # "your skyling's": one falls like a shooting star to the rim by Tyler
        if t >= ts:
            u = clamp((t - ts) / 0.62); sx, sy = 560, 1180; ex, ey = DREAMY[0], DREAMY[1] - 95
            path = lambda uu: (sx + (ex - sx) * (in3(uu) * 0.35 + uu * 0.65), sy + (ey - sy) * (in3(uu) * 0.35 + uu * 0.65) - 120 * math.sin(math.pi * uu))
            fa = 1 - clamp((t - ts - 0.62) / 0.3); prev = None
            for j in range(30):                                         # the tail
                uu = u - j * 0.012
                if uu < 0: break
                P = to_scr(c, *path(uu))
                if prev is not None and fa > 0: d.line([prev, P], fill=brand_col(1 - j / 30, gold=True) + (int(255 * fa * (1 - j / 30)),), width=max(2, int((9 - j * 0.28) * k)))
                prev = P
            if u < 1: Hx, Hy = to_scr(c, *path(u)); g = glow_disc(34, (255, 240, 210), 0.9); paste(fx, g, int(Hx - 34), int(Hy - 34))
            if t >= ts + 0.6:                                           # it lands as Tyler's skyling
                v = clamp((t - ts - 0.6) / 0.3); X, Y = to_scr(c, *DREAMY); px = 6.5 * k
                g = glow_disc(26 * px, (255, 236, 200), clamp(1 - (t - ts - 0.6) / 0.5)); paste(fx, g, int(X - g.width / 2), int(Y - 13 * px - g.height / 2))
                draw_skyling_px(top, pose_frame("Dreamy-night", "wave" if t - ts < 1.6 else "idle", T), px * (0.8 + 0.2 * back(v)), X, Y, alpha=out3(v), glow=(255, 170, 90), anchor="bottom")

    if tag in ("food", "long_way"):
        X, Y = to_scr(c, *DREAMY); px = 6.5 * k
        pose = "idle"
        if tag == "food" and 5.25 <= t < 6.6: pose = "wave"
        if tag == "long_way": pose = "celebrate"
        lift = 0
        if tag == "long_way" and t > 1.35: lift = 900 * in3(clamp((t - 1.35) / 0.8))      # off into the night
        if lift:
            for j in range(6): pixel_star(fx, int(X + 30 * math.sin(j * 2.1)), int(Y - 13 * px - lift + 40 + j * 38), 3, 0.8 * (1 - j / 6))
        draw_skyling_px(top, pose_frame("Dreamy-night", pose, T), px, X, Y - lift, glow=(255, 170, 90), anchor="bottom")
        if tag == "food" and 2.95 <= t < 5.2:                         # "going out to get food after work": a coin with wings flies off
            u = clamp((t - 2.95) / 2.1); x = 1440 + 520 * u + 40 * math.sin(u * 9); y = 2380 - 980 * u - 30 * math.sin(u * 14)
            X2, Y2 = to_scr(c, x, y); flap = 0.75 + 0.25 * math.cos(T * 22)
            put_icon(top, ICON["coinwings"], X2, Y2, 10 * k * (0.6 + 0.4 * out3(u * 4)), alpha=clamp(u * 6), rot=8 * math.sin(T * 6), sx=flap)
        if tag == "food" and t >= 6.7:                                # "remind me about home-cooked meals": Dreamy says so, in its bubble
            if t < 7.0:                                                 # a little "!" pops over Dreamy first
                v = clamp((t - 6.7) / 0.12); cells, wc_ = text_cells("!"); pp = 6 * k
                draw_cells(dt, d, [(X + (q - 2) * pp, Y - 26 * px - 30 * k + (r - 3) * pp - 10 * out3(v), pp * 0.92, v * clamp((7.0 - t) / 0.08), 0.3) for q, r in cells], gold=True)
            if t >= 6.9:
                u = (t - 6.9) / 0.3; s_ = back(u) if u < 1 else 1
                if t > 9.1: s_ *= 1 - in3(clamp((t - 9.1) / 0.25))
                if s_ > 0.03:
                    b = cloud_lines(["Hey Ty, try out this high protein", "recipe after work today!"], 2.3)      # the owner's words (v6)
                    bb = b.resize((max(1, int(b.width * s_)), max(1, int(b.height * s_))), Image.LANCZOS)
                    fy = 6 * math.sin(T * 2.2); bx = clamp(X - bb.width * 0.62, 24, W - 24 - bb.width)
                    paste(top, bb, int(bx), int(Y - 26 * px - bb.height - 14 + fy))

    if tag == "health":
        # "connect all your health data": a heartbeat drawn in light across the sky; the heart appears on the middle beat
        t0, dur = 4.3, 1.05
        if t >= t0:
            fade = 1 - clamp((t - 5.5) / 0.5)
            if fade > 0:
                xr = 1030 + (1895 - 1030) * clamp((t - t0) / dur); sel = EKG_X <= xr
                pts = [to_scr(c, x, y) for x, y in zip(EKG_X[sel], EKG_Y[sel])]
                ages = t - (t0 + dur * (EKG_X[sel] - 1030) / 865)
                for q in range(1, len(pts)):
                    a = fade * (0.55 + 0.45 * math.exp(-ages[q] / 0.25)); col = (255, int(205 + 45 * math.exp(-ages[q] / 0.15)), int(130 + 110 * math.exp(-ages[q] / 0.15)))
                    d.line([pts[q - 1], pts[q]], fill=col + (int(255 * a),), width=max(3, int(5 * k)))
                if 0 < t - t0 < dur and len(pts):
                    hx, hy = pts[-1]; g = glow_disc(40, (255, 236, 200), 0.95); paste(fx, g, int(hx - 40), int(hy - 40))
        hx0, hy0 = 1460, 1690; sx0, sy0 = 1640, 1690
        tp = t0 + dur * (1460 - 1030) / 865 - 0.02
        if t >= tp:
            beat = 1 + 0.14 * max(0.0, math.sin((t - tp) * 2 * math.pi / 0.85)) ** 6
            hx = hx0; j_in = 0.0
            u = (t - tp) / 0.3; X, Y = to_scr(c, hx, hy0); px = 8.5 * k * (back(u) if u < 1 else 1) * beat * (1 - 0.6 * j_in)
            put_icon(top, ICON["heart"], X, Y, px, white=clamp(1 - (t - tp) / 0.25), glow=(255, 140, 170))
            if False:                                               # the app's sun on the right, a light thread between them
                v = (t - 6.45) / 0.3; XS, YS = to_scr(c, sx0, sy0); flash = clamp(1 - abs(t - 9.55) / 0.3)
                ps = 8.5 * k * (back(v) if v < 1 else 1) * (1 + 0.25 * flash)
                put_icon(top, ICON["sun"], XS, YS, ps, white=clamp(1 - (t - 6.45) / 0.25) + 0.6 * flash, glow=(255, 214, 140))
                if flash > 0: g = glow_disc(200 * k, (255, 236, 190), flash); paste(fx, g, int(XS - g.width / 2), int(YS - g.height / 2))
                if t < 9.5:
                    for q in range(26):                                 # the thread, with light running along it to the sun
                        uu = q / 25; x = X + 12 * px / 2 + (XS - 12 * ps / 2 - X - 12 * px / 2) * uu
                        if x < X + 12 * px / 2: continue
                        run = 0.5 + 0.5 * math.cos((uu - (t * 1.4) % 1) * 2 * math.pi) ** 8
                        al = clamp((t - 6.6) / 0.4) * (0.35 + 0.65 * run)
                        d.rectangle([x - 2, Y - 2, x + 2, Y + 2], fill=(255, 226, 170, int(255 * al)))

    if tag == "vo":
        sky_wash(arr, c, lambda xs: sky_cols(np.full_like(xs, 1300.0)), 0.8 * clamp(t / 1.4))   # the night turns the app's night blue
        JAN.draw(d, t, c, base_heat=0.68)
        if t >= 3.3:                                                    # the flames come up from below as the camera whips into them
            u = clamp((t - 3.3) / 0.4); g = glow_disc(int(1300 * u + 100), (255, 214, 150), u); paste(fx, g, int(540 - g.width / 2), int(1900 - g.height / 2 - 500 * u))
    return arr, fx, top

# ---------------------------------------------------------------- captions: warm white, the spoken word lit like an ember
CAPS2 = dict(CAPS); CAPS2[4] = [(0.4, 2.36, "You heard him, January 2027,"), (2.36, 4.0, "but you can get on the waitlist")]
CAPS2[8] = [c for c in CAPS[8] if c[0] < 3.7] + [(3.71, 5.56, "that represent each different time of"), (5.98, 6.31, "day.")]   # v4 cuts
CAPS2[3] = [(0.27, 0.54, "Tyler,"), (0.96, 2.18, "I think you should tell us")] + [c for c in CAPS[3] if c[0] >= 2.18]
CAPS2[9] = [(0.6, 3.56, "So as of January next year, 2027,"), (4.0, 5.41, "LifeFlow will actually be able"), (5.41, 6.88, "to connect all your health data.")]
F_C2 = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Bold.ttf", 62); CAP_Y = 1500
F.CAPS = CAPS2                                                    # v5: the launch video's captions (fire_render.caption), with the v4 cuts' words
def caption2(img, n, ct, T):
    for a0, b0, text0 in CAPS2.get(n, []):
        if not (a0 <= ct < b0): continue
        a, b, text = next(p for p in pieces(a0, b0, text0) if p[0] <= ct < p[1] + 1e-6)
        words = text.split(" "); lens = [len(w.strip(",.?!")) + 1.5 for w in words]; tot = sum(lens); speak = (b - a) * 0.9
        starts, acc = [], a
        for l in lens: starts.append(acc); acc += speak * l / tot
        sp = F_C2.getlength(" "); ws = [F_C2.getlength(w) for w in words]; x = 540 - (sum(ws) + sp * (len(words) - 1)) / 2
        lay = Image.new("RGBA", (W, 200), (0, 0, 0, 0)); glo = Image.new("RGBA", (W, 200), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); dg = ImageDraw.Draw(glo)
        cur = max(j for j, s in enumerate(starts) if ct >= s)
        for j, (w, wl) in enumerate(zip(words, ws)):
            if ct >= starts[j]:
                u = clamp((ct - starts[j]) / 0.16); al = int(255 * min(1, u * 2)); yy = 100 + 12 * (1 - out3(u))
                if j == cur:
                    fl = 0.9 + 0.1 * math.sin(T * 17 + j)
                    col = heat_col(0.52 + 0.4 * (1 - out3(u)) + 0.04 * math.sin(T * 13))
                    dg.text((x + wl / 2, yy), w, font=F_C2, fill=(255, 120, 40, int(al * fl)), anchor="mm")
                else: col = (255, 243, 222)
                d.text((x + wl / 2, yy), w, font=F_C2, fill=col + (al,), anchor="mm")
            x += wl + sp
        sh_ = lay.filter(ImageFilter.GaussianBlur(9)); dk = Image.new("RGBA", lay.size, (6, 4, 2, 0)); dk.putalpha(sh_.getchannel("A").point(lambda v: int(v * 0.7)))
        g2 = glo.filter(ImageFilter.GaussianBlur(14))
        img.alpha_composite(dk, (0, CAP_Y - 96)); img.alpha_composite(g2, (0, CAP_Y - 100)); img.alpha_composite(g2, (0, CAP_Y - 100)); img.alpha_composite(lay, (0, CAP_Y - 100)); return

# ---------------------------------------------------------------- the end card: the logo's sunrise throws the words
F_URL = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 44)
def end_overlay(img, j):
    t = j / FPS; fx = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(fx)
    END_TXT.draw(d, t, (0, 0, W, H), base_heat=0.72)
    base = np.array(img.convert("RGB")); out = Image.fromarray(light_comp(base, fx)).convert("RGBA")
    if t > 1.35:
        a = clamp((t - 1.35) / 0.35); dd = ImageDraw.Draw(out); y = 1468 + 14 * (1 - out3(a))
        dd.text((540, y), "lifeflowweb.com", font=F_URL, fill=(201, 213, 238, int(255 * a)), anchor="mm")
    return out

GOLDC = np.array([1.0, 0.86, 0.62], np.float32)
def gold(arr, f):
    if f <= 0: return arr
    return (255 - (255 - arr.astype(np.float32)) * (1 - f * GOLDC)).astype(np.uint8)
_DIST = np.hypot(*(np.mgrid[0:H, 0:W][::-1] - np.array([540, 760])[:, None, None])).astype(np.float32)
def end_img(j):
    """the logo opens out of the gold, from its icon outward (a fade from gold to navy would pass through grey)"""
    img = np.array(end_overlay(Image.fromarray(end_card(j + 6)).convert("RGBA"), j).convert("RGB"))   # from its 6th frame: the icon is already there
    r = 1750 * smooth((j + 1) / 18) - 60
    if r > 1700: return img
    mk = np.clip((r - _DIST) / 240, 0, 1)[..., None]
    return (img * mk + gold(img, 1.0) * (1 - mk)).astype(np.uint8)

def frame(i, rd, caps=True):
    k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < END_OUT else None      # from END_OUT on: the gold opens into the logo
    T = i / FPS
    if k is None:
        return end_img(i - END_OUT)
    seg = SEGS[k]; t = (i - seg["out"]) / FPS; ct = seg["a"] + t
    src = rd.next(); s = shot2(seg, t); c = crop_of(s); x0, y0, w, h = c
    m768 = matte_full(src); m = matte_crop(m768, c)
    crop = src[int(y0):int(y0 + h), int(x0):int(x0 + w)]
    arr = cv2.resize(crop, (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
    arr = grade(arr, m)
    if seg["tag"] == "vo" and WHIP0 - 0.05 < t < WHIP1 + 0.1:          # the whip's motion blur
        c2 = crop_of(shot2(seg, t - 1 / FPS)); dy = abs((c[1] + c[3] / 2) - (c2[1] + c2[3] / 2)) * W / c[2]
        L = int(dy * 0.9) | 1
        if L > 3: kern = np.full((L, 1), 1 / L, np.float32); arr = cv2.filter2D(arr, -1, kern)
    arr, fx, top = effects(dict(seg, tag=seg.get("fx_tag", seg["tag"])), arr, t + seg.get("fx_t0", 0.0), c, T, m)
    arr = light_comp(arr, fx)
    if seg["tag"] == "vo" and t > 3.35:                                # ... and flash gold, out of which the logo opens
        arr = gold(arr, smooth((t - 3.35) / 0.32))
    img = Image.fromarray(arr).convert("RGBA"); img.alpha_composite(top)
    if caps and not (seg["tag"] == "vo" and t > 3.6): F.caption(img, seg["n"], ct)
    arr = np.array(img.convert("RGB"))
    return arr

def reader_for(seg, skip=0):
    n = seg.get("clip_video", seg["n"]); a = seg.get("va", seg["a"]); return F.Reader(n, a + skip / FPS, seg["nf"] - skip)

if __name__ == "__main__":
    args = sys.argv[1:]; caps = "--nocap" not in args
    json.dump(dict(segs=[{k: v for k, v in s.items() if k != "shots"} for s in SEGS], end_out=END_OUT, n=N), open(f"{HERE}/timeline2.json", "w"))
    if args and args[0] == "--preview":
        os.makedirs(f"{HERE}/prev2", exist_ok=True)
        for sv in args[1].split(","):
            i = int(round(float(sv) * FPS)); k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < SEGS[-1]["out"] + SEGS[-1]["nf"] else None
            if k is None: Image.fromarray(frame(i, None, caps)).save(f"{HERE}/prev2/p_{float(sv):05.2f}.jpg", quality=90); continue
            seg = SEGS[k]; skip = i - seg["out"]; rd = reader_for(seg, skip); F._prev_m = None
            Image.fromarray(frame(i, rd, caps)).save(f"{HERE}/prev2/p_{float(sv):05.2f}.jpg", quality=90); rd.p.kill()
        sys.exit()
    part, parts = (int(args[1]), int(args[2])) if args and args[0] == "--part" else (0, 1)
    i0, i1 = N * part // parts, N * (part + 1) // parts
    out = f"{HERE}/campfire2_silent.mp4" if parts == 1 else f"{HERE}/v2part{part}.mp4"
    if args and args[0] == "--range": i0, i1, out = int(args[1]), int(args[2]), f"{HERE}/{args[3]}"
    if args and args[0] == "--segs":                                   # v4: render only the pieces that changed, one file each
        for tg in args[1].split(","):
            sg = next(x for x in SEGS if x["tag"] == tg); a0, a1 = sg["out"], sg["out"] + sg["nf"]
            enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", f"{HERE}/v4_{tg}.mp4"], stdin=subprocess.PIPE)
            rd = reader_for(sg, 0); F._prev_m = None
            for i in range(a0, a1):
                enc.stdin.write(frame(i, rd, caps).tobytes())
                if (i - a0) % 60 == 0: print(tg, i - a0, "/", a1 - a0, flush=True)
            enc.stdin.close(); enc.wait(); rd.p.kill(); print(tg, "done", flush=True)
        sys.exit()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    k_now, rd = -1, None
    for i in range(i0, i1):
        k = max(j for j, s in enumerate(SEGS) if s["out"] <= i) if i < SEGS[-1]["out"] + SEGS[-1]["nf"] else None
        if k is not None and k != k_now:
            if rd is not None: rd.p.kill()
            rd = reader_for(SEGS[k], i - SEGS[k]["out"]); k_now = k; F._prev_m = None
        enc.stdin.write(frame(i, rd, caps).tobytes())
        if i % 60 == 0: print(i, "/", i1, flush=True)
    enc.stdin.close(); enc.wait(); print("frames", N, "seconds", round(N / FPS, 2))
