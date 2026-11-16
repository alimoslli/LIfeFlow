"""The skylings skit, v3 (Fable's cut). Same footage, same skylings (the app's own pixel art), free voices; what's new:
  - cold open low on the fire-pit rim: the five warming themselves, noticing they're being talked about
  - each close-up is lit by the real fire (a rim light that flickers with the plate, a cast shadow, light wrap), with a soft
    haze of that skyling's own hour behind it (the app's sky colours) and a deeper macro focus
  - they talk: mouths open and close on their own voices (the app's own open-mouth pixels), they look at whoever speaks,
    and the skeptical face (the app's "think" frame) lands the jokes
  - a button on Ali's real line ("Those are JUST five different characters...") : they all turn. "Just?"
  - word-timed captions in the launch style, name tags with each one's hour, the launch score (it drops out for the beat)
    python3 skit3_compose.py [--preview 3.0,9.5] [--nosound]
"""
import json, math, os, sys, subprocess, wave
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE); FIRE = f"{SP}/fire"
sys.path.insert(0, FIRE); sys.path.insert(0, HERE); _argv = sys.argv; sys.argv = sys.argv[:1]
import fire_render2 as G
sys.argv = _argv
import sprites as SPR
F, R4 = G.F, G.R4
from fire_render2 import W, H, FPS, clamp, smooth, back, out3, in3, to_scr, paste
SR = 48000
GOLD3, SOFT3, NAVY3 = G.GOLD3, G.SOFT3, G.NAVY3

# ---------------------------------------------------------------- the cast
CAST = {  # kit name, key, its hour (minutes, for the app's sky), label, glow
    "dawn": ("Dawn", 398, "FIRST LIGHT", (255, 200, 170)), "ray": ("Ray", 700, "THE DAY", (255, 226, 160)), "goldie": ("Goldie", 1035, "GOLDEN HOUR", (255, 205, 130)),
    "twinkle": ("Twinkle-night", 1130, "EVENING", (200, 215, 255)), "dreamy": ("Dreamy-night", 1300, "NIGHT", (200, 215, 255))}
ORDER = ["dawn", "ray", "goldie", "twinkle", "dreamy"]
def feet_y(x): return float(np.interp(x, [500, 700, 900, 1100, 1300, 1500, 1700, 1800], [2722, 2724, 2722, 2714, 2700, 2672, 2630, 2600]))   # on the rim's top
WIDE_X = [560, 760, 960, 1160, 1360]; LINE_X = [700, 850, 1000, 1150, 1300]
TWO_X = [795, 955, 1115, 1275, 1435]; AL_X = [460, 610, 760, 910, 1060]   # where they stand in the two-shot and under Ali (all five in frame)
PX_WIDE, PX_LINE, PX_MACRO = 5.4, 6.2, 10.6                           # source px per art pixel (close-ups cheat a little bigger)

# ---------------------------------------------------------------- voices (vo/<key>.wav + .json: dur, words [(word, start, end)])
def vmeta(key): return json.load(open(f"{HERE}/vo/{key}.json"))
def vdur(key): return vmeta(key)["dur"]
_env = {}
def venv(key, t):
    if key not in _env:
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{HERE}/vo/{key}.wav", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
        a = np.frombuffer(b, np.int16).astype(np.float32) / 32768
        e = np.array([np.sqrt((a[i:i + 480] ** 2).mean()) for i in range(0, max(1, len(a) - 480), 160)]); _env[key] = e / (np.percentile(e, 95) + 1e-9)
    e = _env[key]; i = int(t * 100)
    return float(min(1.0, e[i])) if 0 <= i < len(e) else 0.0
def mouth_open(key, t):                                              # syllable-rate flap: open on the loud half of each syllable
    return venv(key, t) > 0.32 and (venv(key, t) >= venv(key, t - 0.05) * 0.8)

# ---------------------------------------------------------------- the cut
LEAD, TAIL = 0.26, 0.24
REAL_WORDS = {  # the real lines, word by word (clip time), from the transcript
    6: [("What", 1.60, 1.84), ("exactly", 1.84, 2.22), ("is", 2.22, 2.6), ("the", 3.02, 3.28), ("little,", 3.28, 3.60), ("like,", 3.60, 3.86), ("character", 3.86, 4.34), ("kind", 4.34, 4.62),
        ("of", 4.62, 4.74), ("thing", 4.74, 4.92), ("on", 4.92, 5.10), ("top?", 5.10, 5.40)],
    8: [("Oh,", 1.24, 1.5), ("the", 1.52, 1.62), ("skylings.", 1.62, 2.12), ("Those", 2.30, 2.40), ("are", 2.40, 2.52), ("just", 2.52, 2.68), ("five", 2.68, 2.90), ("different", 2.90, 3.22),
        ("characters", 3.22, 3.54), ("that", 3.54, 3.78), ("represent", 3.78, 4.20), ("each", 4.20, 4.58), ("different", 4.58, 4.94), ("time", 4.94, 5.16), ("of", 5.16, 5.30), ("day.", 5.98, 6.28)]}
SHOTS = []
def add(**k): SHOTS.append(k)
add(id="open", plate=("skit3", "open_line"), dur=2.28, kind="line_open", real=(6, 1.58, 3.86))
add(id="q", plate=("skit", "q_tyler"), p0=88, dur=1.56, kind="wide", real=(6, 3.86, 5.42), look=1, cap_y=1560, xs=TWO_X)
add(id="oh", plate=("skit", "a_oh"), dur=1.16, kind="wide", real=(8, 1.10, 2.26), look=-1, hop="dawn", cap_y=1250, xs=AL_X)
for key, plate in [("dawn", ("skit", "m_dawn")), ("ray", ("skit3", "m_ray2")), ("goldie", ("skit", "m_goldie"))]:
    add(id=key, plate=plate, dur=round(LEAD + vdur(key) + TAIL, 2), kind="macro", who=key)
add(id="tyler", plate=("skit", "r_tyler"), dur=0.95, kind="plain")
for key, plate in [("twinkle", ("skit", "m_twinkle")), ("dreamy", ("skit", "m_dreamy"))]:
    add(id=key, plate=plate, dur=round(LEAD + vdur(key) + TAIL, 2), kind="macro", who=key)
add(id="dead", plate=("skit", "a_dead"), dur=3.33, kind="wide", real=(8, 2.23, 5.56), look=-1, cap_y=1250, xs=AL_X)
add(id="day", plate=("skit", "a_day"), dur=0.33, kind="wide", real=(8, 5.98, 6.31), look=-1, cap_y=1250, xs=AL_X)
JUST_AT = 0.78
add(id="just", plate=("skit3", "just_line"), dur=round(JUST_AT + vdur("just") + 0.5, 2), kind="line_just")
add(id="react", plate=("skit3", "a_react"), dur=0.95, kind="plain")
PICK_A = 0.3; PICK_B = round(PICK_A + vdur("pick") + 0.3, 2)
add(id="pick", plate=("skit3", "just_line"), p0=72, dur=round(PICK_B + vdur("sky") + 0.45, 2), kind="line_pick")
add(id="sky", plate=("skit", "end_sky"), dur=2.4, kind="sky")
XF, END_LEN = 10, 2.6
o = 0
for s in SHOTS: s["out"] = o; s["nf"] = int(round(s["dur"] * FPS)); o += s["nf"]
END_OUT = o - XF; N = END_OUT + int(END_LEN * FPS)
BY = {s["id"]: s for s in SHOTS}
_crops = {}
def crop_at(s, pi):
    if s["plate"] not in _crops: _crops[s["plate"]] = json.load(open(f"{SP}/{s['plate'][0]}/plates/{s['plate'][1]}.json"))["crops"]
    c = _crops[s["plate"]]; return c[min(len(c) - 1, pi)]
_plates = {}
def plate_frame(s, pi):
    key = s["plate"]
    if key not in _plates:
        if len(_plates) >= 2: _plates.pop(next(iter(_plates)))
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{SP}/{key[0]}/plates/{key[1]}.mp4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        _plates[key] = np.frombuffer(b, np.uint8).reshape(-1, H, W, 3)
    fr = _plates[key]; n = len(fr); pi = pi if pi < n else max(0, 2 * (n - 1) - pi)       # past its end the plate plays back (flames don't mind)
    return fr[pi]

# ---------------------------------------------------------------- the lens: deeper focus fall-off and fire bloom above the rim
_yy = np.arange(H, dtype=np.float32)[:, None]
def lens(arr, y_focus, strength=1.0):
    a = arr.astype(np.float32)
    far = cv2.GaussianBlur(a, (0, 0), 15)
    w = (np.clip((y_focus - 150 - _yy) / 300, 0, 1) ** 1.1 * strength)[..., None]
    out = a * (1 - w) + far * w
    hi = np.clip(a - 185, 0, 255) * w                                  # the fire blooms
    sm = cv2.resize(hi, (W // 4, H // 4), interpolation=cv2.INTER_AREA); bloom = cv2.resize(cv2.GaussianBlur(sm, (0, 0), 9), (W, H), interpolation=cv2.INTER_LINEAR)
    out = 255 - (255 - out) * (1 - np.clip(bloom * 0.9, 0, 255) / 255)
    below = (np.clip((_yy - y_focus - 110) / 500, 0, 1) * 0.55)[..., None]   # the wall and the ground fall into the dark, so the words sit on calm
    return out * (1 - below)
def flicker(arr, y_focus):
    """how bright the fire is in this frame (0.75 .. 1.25 around its usual level)"""
    reg = arr[max(0, int(y_focus) - 520):max(1, int(y_focus) - 40), ::8]; v = float(np.percentile(reg[..., 0], 88)) / 255
    return clamp(0.55 + 0.75 * v, 0.7, 1.3)
def hour_haze(a, X, Y, minute, alpha, r=640, y_max=None):
    """a soft haze of the skyling's own hour behind it (the app's sky: top, middle, horizon), screened in"""
    if alpha <= 0.01: return a
    top, mid, hor = G.sky_cols(np.array([float(minute)]))[0]
    x0, x1, y0, y1 = int(max(0, X - r)), int(min(W, X + r)), int(max(0, Y - r * 1.25)), int(min(H if y_max is None else y_max, Y + r * 0.35))
    if x1 <= x0 or y1 <= y0: return a
    ys = np.arange(y0, y1, dtype=np.float32)[:, None]; xs = np.arange(x0, x1, dtype=np.float32)[None, :]
    tt = np.clip((ys - (Y - r * 1.25)) / (r * 1.6), 0, 1)[..., None]
    col = np.where(tt < 0.55, top + (mid - top) * (tt / 0.55), mid + (hor - mid) * ((tt - 0.55) / 0.45))
    d = np.hypot((xs - X) / r, (ys - (Y - r * 0.35)) / (r * 0.95)); m = (np.clip(1 - d, 0, 1) ** 1.4 * alpha)[..., None]
    reg = a[y0:y1, x0:x1]; a[y0:y1, x0:x1] = 255 - (255 - reg) * (1 - col * m / 255)
    return a

# ---------------------------------------------------------------- a skyling in the scene
TINT = np.array([1.04, 0.985, 0.91], np.float32); FIRE_RIM = np.array([255, 190, 112], np.float32)
def lit_art(art, flip, rim, dim=0.95, warm=True):
    """the 26 x 26 frame, relit at pixel level: the fire behind puts a warm rim on its outline (top and sides)"""
    a = art[:, ::-1] if flip else art; al = a[..., 3] > 0; pad = np.pad(al, 1)
    up, left, right = ~pad[:-2, 1:-1], ~pad[1:-1, :-2], ~pad[1:-1, 2:]
    rows = np.where(al.any(1))[0]; upper = (np.arange(26)[:, None] < rows.min() + 0.55 * (rows.max() - rows.min()))
    w = (al * np.clip(0.9 * up + 0.4 * ((left | right) & upper), 0, 1) * rim)[..., None]
    rgb = a[..., :3].astype(np.float32) * dim * (TINT if warm else 1.0); rgb = rgb + (FIRE_RIM - rgb) * w
    return np.dstack([np.clip(rgb, 0, 255), a[..., 3:4].astype(np.float32)])
def put_skyling(a, art, X, Yf, px, flip=False, sx=1.0, sy=1.0, lift=0.0, fl=1.0, alpha=1.0, glow=None, fire=True, shadow=True):
    """a: float frame (H, W, 3). X centre, Yf where its feet stand, px screen px per art pixel."""
    w, h = max(2, int(round(26 * px * sx))), max(2, int(round(26 * px * sy)))
    spr = cv2.resize(lit_art(art, flip, (0.55 * fl) if fire else 0.0, 0.95 if fire else 1.0, fire), (w, h), interpolation=cv2.INTER_NEAREST)
    x0 = int(round(X - w / 2)); y0 = int(round(Yf - lift - h * 0.962))
    if shadow:                                                          # contact shadow, and the shadow the fire throws toward us
        k = clamp(1 - lift / (px * 9)); sh = np.zeros((H, W), np.float32)
        cv2.ellipse(sh, (int(X), int(Yf + px * 0.5)), (int(px * 8.2 * (0.6 + 0.4 * k)), max(2, int(px * 1.5))), 0, 0, 360, 0.62 * k * alpha, -1)
        cv2.ellipse(sh, (int(X), int(Yf + px * 3.4)), (int(px * 7.4), max(2, int(px * 3.6))), 0, 0, 360, 0.26 * k * alpha * (0.7 + 0.3 * fl), -1)
        r = int(px * 9); ys0, ys1, xs0, xs1 = max(0, int(Yf - r)), min(H, int(Yf + r * 1.2)), max(0, int(X - r * 1.4)), min(W, int(X + r * 1.4))
        if ys1 > ys0 and xs1 > xs0:
            reg = cv2.GaussianBlur(sh[ys0:ys1, xs0:xs1], (0, 0), max(1.0, px * 0.9)); a[ys0:ys1, xs0:xs1] *= (1 - reg)[..., None]
    if glow is not None:                                                # its own faint light
        g = G.glow_disc(int(26 * px * 0.8), glow, 0.2 * alpha); ga = np.asarray(g).astype(np.float32); gx, gy = int(X - g.width / 2), int(Yf - lift - h * 0.5 - g.height / 2)
        u0, v0, u1, v1 = max(0, gx), max(0, gy), min(W, gx + g.width), min(H, gy + g.height)
        if u1 > u0 and v1 > v0:
            gg = ga[v0 - gy:v1 - gy, u0 - gx:u1 - gx]; a[v0:v1, u0:u1] = 255 - (255 - a[v0:v1, u0:u1]) * (1 - gg[..., :3] * gg[..., 3:4] / 255 / 255)
    u0, v0, u1, v1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if u1 <= u0 or v1 <= v0: return
    s = spr[v0 - y0:v1 - y0, u0 - x0:u1 - x0]; al = s[..., 3:4] / 255 * alpha; bg = a[v0:v1, u0:u1].copy()
    comp = bg * (1 - al) + s[..., :3] * al
    if fire:                                                            # light wrap: the bright fire behind bleeds over its edges
        soft = cv2.GaussianBlur(al, (0, 0), max(0.8, px * 0.55)); soft = soft[..., None] if soft.ndim == 2 else soft
        wrap = al * np.clip(1 - soft, 0, 1) * 1.6
        bgb = cv2.GaussianBlur(np.clip(bg - 60, 0, 255), (0, 0), max(1.0, px * 1.1))
        comp = 255 - (255 - comp) * (1 - np.clip(bgb * wrap * 0.35, 0, 255) / 255)
    a[v0:v1, u0:u1] = comp

def blink(T, ph): return ((T + ph) % 2.7) < 0.13
def face(key, T, talk_key=None, tl=0.0, pose=None, ph=0.0):
    """which of the app's frames it shows right now"""
    nm = CAST[key][0]
    if pose == "skeptic" and key in ("dawn", "ray", "goldie"): return SPR.kit(nm, "think")[0]
    if pose in ("wave", "celebrate"):
        fr = SPR.kit(nm, pose); return fr[int((T + ph) / (0.16 if pose == "wave" else 0.12)) % len(fr)]
    if talk_key and mouth_open(talk_key, tl): return SPR.talk_frame(nm)[0]
    idle = SPR.kit(nm, "idle"); return idle[1] if blink(T, ph) and not talk_key else idle[0]

# ---------------------------------------------------------------- words on screen (the launch style, timed word by word)
F_C = F.F_C; CAP_Y = 1436
def lines_of(words, maxw=900):
    """split timed words into caption lines: at sentence ends and pauses, and a phrase too wide for one line into balanced lines"""
    chunks, cur = [], []
    for (w, s, e) in words:
        if cur and (s - cur[-1][2] > 0.32 or cur[-1][0][-1] in ".?!"): chunks.append(cur); cur = []
        cur.append((w, s, e))
    if cur: chunks.append(cur)
    wid = lambda ws: F_C.getlength(" ".join(x[0] for x in ws)); out = []
    for ch in chunks:
        while wid(ch) > maxw:
            n = math.ceil(wid(ch) / maxw); tgt = wid(ch) / n
            k = min(range(1, len(ch)), key=lambda q: (wid(ch[:q]) > maxw, abs(wid(ch[:q]) - tgt)))
            out.append(ch[:k]); ch = ch[k:]
        out.append(ch)
    return out
def caption(img, words, t, hold=0.3, CAP_Y=CAP_Y):
    for li, line in enumerate(lines_of(words)):
        nxt = lines_of(words)[li + 1][0][1] if li + 1 < len(lines_of(words)) else 1e9
        if not (line[0][1] - 0.02 <= t < min(line[-1][2] + hold, nxt - 0.02)): continue
        sp = F_C.getlength(" "); ws = [F_C.getlength(w) for w, _, _ in line]; x = 540 - (sum(ws) + sp * (len(line) - 1)) / 2
        lay = Image.new("RGBA", (W, 240), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); cur = max([j for j, (_, s, _) in enumerate(line) if t >= s] or [0])
        for j, ((w, s, e), wl) in enumerate(zip(line, ws)):
            if t >= s:
                u = clamp((t - s) / 0.14); sc = 1 + 0.18 * (1 - out3(u)); core = w.strip(",.?!").lower()
                col = GOLD3 if (j == cur or core in ("skylings", "skyling", "sky")) else SOFT3
                f = F_C if sc == 1 else ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", int(66 * sc))
                d.text((x + wl / 2, 128), w, font=f, fill=col + (int(255 * min(1, u * 2)),), anchor="mm", stroke_width=5, stroke_fill=(8, 14, 34, int(200 * min(1, u * 2))))
            x += wl + sp
        shd = lay.filter(ImageFilter.GaussianBlur(10)); dk = Image.new("RGBA", lay.size, (5, 10, 30, 0)); dk.putalpha(shd.getchannel("A").point(lambda v: int(v * 0.55)))
        img.alpha_composite(dk, (0, CAP_Y - 122)); img.alpha_composite(lay, (0, CAP_Y - 128)); return
def name_tag(img, key, X, y_top, u):
    """its name in the launch pixel letters (gold, navy rim) and its hour under it"""
    if u <= 0: return
    nm = CAST[key][0].replace("-night", "").upper(); s_ = back(u / 0.28) if u < 0.28 else 1; d = ImageDraw.Draw(img)
    cells, wc = G.text_cells(nm); pp = 13 * s_; yc = y_top - 150
    cush = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(cush).ellipse([X - wc * 6.5 - 90, yc - 75, X + wc * 6.5 + 90, yc + 135], fill=(8, 12, 28, int(120 * min(1, u * 4))))
    img.alpha_composite(cush.filter(ImageFilter.GaussianBlur(38)))
    G.draw_cells(d, None, [(X + (q - wc / 2 + 0.5) * pp, yc + (r - 3) * pp, pp * 0.92, min(1, u * 5), 0.0) for q, r in cells], gold=True)
    v = clamp((u - 0.3) / 0.3)
    if v > 0:
        cells, wc = G.text_cells(CAST[key][2]); pp = 6
        G.draw_cells(d, None, [(X + (q - wc / 2 + 0.5) * pp, yc + 78 + (r - 3) * pp + 8 * (1 - out3(v)), pp * 0.9, v, 0.0) for q, r in cells])

# ---------------------------------------------------------------- frames
def end_card(j):
    img = Image.fromarray(G.end_card(j)).convert("RGBA")
    R4.title(img, j / FPS, [(0.35, [("Which one's ", G.SOFT), ("yours?", G.GOLD)], 1380)], sub=(0.85, "Get on the waitlist  ·  lifeflowweb.com", 1462))
    return np.array(img.convert("RGB"))
ARC = [(170 + 185 * j, 760 - 330 * math.sin(math.pi * (0.1 + 0.8 * j / 4))) for j in range(5)]
_grain = np.random.default_rng(4)
def real_words(s):
    n, a, b = s["real"]; return [(w, ws - a, we - a) for w, ws, we in REAL_WORDS[n] if a - 0.05 <= ws < b]
def frame(i, caps=True):
    T = i / FPS
    k = max(j for j, s in enumerate(SHOTS) if s["out"] <= i) if i < SHOTS[-1]["out"] + SHOTS[-1]["nf"] else None
    if k is None: return end_card(i - END_OUT)
    s = SHOTS[k]; t = (i - s["out"]) / FPS; pi = s.get("p0", 0) + (i - s["out"]); kind = s["kind"]
    arr = plate_frame(s, pi); c = crop_at(s, pi); kk = W / c[2]; top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    words = None
    if kind == "sky":                                                    # "let the sky pick": the day runs through their sky
        arr = arr.copy(); mnt = 300 + 1000 * smooth(clamp((t - 0.35) / 1.45))
        _, _, _, above, r1 = G.sky_geom(c)                                # the night sky's own smudges (far trees, glare) go, the lights stay
        if r1 > 0: sub = arr[:r1].astype(np.float32); arr[:r1] = (sub * (1 - above * np.clip((135 - sub.max(-1)) / 40, 0, 1))[..., None]).astype(np.uint8)
        G.sky_wash(arr, c, lambda xs: G.sky_cols(np.full_like(xs, float(mnt))), 0.82 * clamp(t / 0.35))
        a = arr.astype(np.float32)
        for j, key in enumerate(ORDER):
            u = clamp((t - 0.05 * j) / 0.6); x, y = ARC[j]; Y = 2150 + (y - 2150) * out3(u)
            lit = math.exp(-((mnt - CAST[key][1]) / 120) ** 2) if t > 0.4 else 0
            put_skyling(a, face(key, T, pose="celebrate" if lit > 0.6 else None, ph=j * 0.4), x, Y + 60, 4.7 + 1.3 * lit, fl=1, glow=CAST[key][3] if lit > 0.25 else None, fire=False, shadow=False)
    elif kind == "plain":
        a = arr.astype(np.float32)
    elif kind == "wide":
        a = arr.astype(np.float32); yf = to_scr(c, 960, 2722)[1]; fl = flicker(arr, yf)
        for j, key in enumerate(ORDER):
            xs = s.get("xs", WIDE_X); X, Y = to_scr(c, xs[j], feet_y(xs[j])); px = PX_WIDE * kk; lift = 0; pose = None
            if s.get("hop") == key and t > s["dur"] - 0.42: lift = 46 * kk * math.sin(math.pi * clamp((t - (s["dur"] - 0.42)) / 0.42)); pose = "wave"
            put_skyling(a, face(key, T, pose=pose, ph=j * 0.37), X, Y, px, flip=(s.get("look", 1) < 0), lift=lift, fl=fl, glow=CAST[key][3])
        words = real_words(s)
    elif kind == "macro":
        key = s["who"]; nm, minute, label, glow = CAST[key]; cx = c[0] + c[2] / 2; X, Yf = to_scr(c, cx, feet_y(cx)); px = PX_MACRO * kk
        fl = flicker(arr, Yf); a = lens(arr, Yf)
        a = hour_haze(a, X, Yf - 13 * px, minute, 0.34 * clamp(t / 0.5), y_max=int(Yf + 20))
        tl = t - LEAD; meta = vmeta(key); wv = meta["words"]
        ent = clamp(t / 0.3); lift = 40 * (1 - out3(ent)); sy = 1 - 0.10 * math.sin(math.pi * clamp((t - 0.3) / 0.16)) if 0.3 <= t < 0.46 else 1.0   # it lands
        talking = 0 <= tl <= meta["dur"]; pose = None
        for (p0, p1, po) in meta.get("poses", []):
            if p0 <= tl < p1: pose = po
        e = venv(key, tl) if talking else 0
        bob = 3 * math.sin(T * 2.2) if key != "dreamy" else 9 * math.sin(T * 1.6) + 10
        put_skyling(a, face(key, T, key if talking else None, tl, pose), X, Yf, px, sx=1 + 0.035 * e, sy=sy * (1 - 0.045 * e), lift=lift + max(0, bob) + 5 * e, fl=fl, alpha=clamp(t / 0.12), glow=glow)
        name_at = meta.get("name_at", 0.2)
        name_tag(top, key, X, Yf - 26 * px, tl - name_at)
        words = [(w, ws + LEAD, we + LEAD) for w, ws, we in wv]
    elif kind in ("line_open", "line_just", "line_pick"):
        Yf0 = to_scr(c, 1000, 2722)[1]; fl = flicker(arr, Yf0); a = lens(arr, Yf0, 0.9)
        say = None
        for j, key in enumerate(ORDER):
            X, Y = to_scr(c, LINE_X[j], feet_y(LINE_X[j])); px = PX_LINE * kk; flip = False; pose = None; lift = 0; tk = None; tl = 0; sxy = (1, 1)
            if kind == "line_open":                                         # they notice they're being talked about: one by one they look over
                tn = 1.02 + 0.08 * j
                if t >= tn: flip = False; lift = 10 * kk * math.sin(math.pi * clamp((t - tn) / 0.22))
                else: flip = (j % 2 == 0)                                   # until then they face each other, warming up
                if key == "dreamy": lift += 6 + 5 * math.sin(T * 1.6)
            if kind == "line_just":
                tn = 0.16 + 0.05 * j
                if t >= tn: flip = True; pose = "skeptic"; lift = 6 * kk * math.sin(math.pi * clamp((t - tn) / 0.18))
                if key == "ray" and JUST_AT <= t < JUST_AT + vdur("just"): sxy = (1.06, 1.06); say = ("just", t - JUST_AT)
            if kind == "line_pick":
                if key == "dawn" and PICK_A <= t < PICK_A + vdur("pick"): tk, tl = "pick", t - PICK_A; pose = "wave" if t - PICK_A < 0.5 else None; say = ("pick", t - PICK_A)
                if key == "dreamy" and PICK_B <= t < PICK_B + vdur("sky"): tk, tl = "sky", t - PICK_B; say = ("sky", t - PICK_B)
                if key == "dreamy": lift += 6 + 5 * math.sin(T * 1.6)
                if t > s["dur"] - 0.36: pose = "celebrate"; lift += 30 * kk * math.sin(math.pi * clamp((t - (s["dur"] - 0.36)) / 0.36))
            e = venv(tk, tl) if tk else 0
            put_skyling(a, face(key, T, tk, tl, pose, ph=j * 0.31), X, Y, px * sxy[0], flip=flip, sx=1 + 0.03 * e, sy=1 - 0.04 * e, lift=lift + 4 * e, fl=fl, glow=CAST[key][3])
            if kind == "line_just" and key == "ray" and t >= JUST_AT - 0.05:   # a little "?" over Ray
                u = clamp((t - JUST_AT + 0.05) / 0.2); cells, wc = G.text_cells("?"); pp = 9 * (back(u) if u < 1 else 1)
                G.draw_cells(ImageDraw.Draw(top), None, [(X + (q - 2) * pp, Y - 26 * px - 66 + (r - 3) * pp, pp * 0.92, u, 0.0) for q, r in cells], gold=True)
        if kind == "line_open": words = real_words(s)
        elif say: words = [(w, ws + (t - say[1]), we + (t - say[1])) for w, ws, we in vmeta(say[0])["words"]]
    if kind != "plain" or True:
        a = np.clip(a + _grain.normal(0, 2.0, (H, W, 1)).astype(np.float32), 0, 255)       # a little grain binds the pixels to the footage
    img = Image.fromarray(a.astype(np.uint8)).convert("RGBA"); img.alpha_composite(top)
    if caps and words: caption(img, words, t, CAP_Y=s.get("cap_y", CAP_Y))
    out = np.array(img.convert("RGB"))
    if i >= END_OUT:
        u = smooth((i - END_OUT + 1) / XF); out = (out.astype(np.float32) * (1 - u) + end_card(i - END_OUT).astype(np.float32) * u).astype(np.uint8)
    return out

# ---------------------------------------------------------------- sound
def load(path, filt=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-af", filt] if filt else []) + ["-ac", "2", "-ar", str(SR), "-f", "s16le", "-"]
    return (np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.int16).reshape(-1, 2) / 32768.).astype(np.float32)
def db(x): return 10 ** (x / 20)
def mix():
    NS = int(N / FPS * SR); voice, bed, fx, amb = (np.zeros((NS, 2), np.float32) for _ in range(4))
    def put(buf, a, t, g=0., fi=0.006, fo=0.02):
        if t < 0: a = a[int(-t * SR):]; t = 0
        a = a.copy() * db(g); i0, i1 = int(fi * SR), int(fo * SR)
        if i0: a[:i0] *= np.linspace(0, 1, i0)[:, None]
        if i1: a[-i1:] *= np.linspace(1, 0, i1)[:, None]
        i = int(t * SR); j = min(NS, i + len(a))
        if j > i: buf[i:j] += a[: j - i]
    VOICE = "highpass=f=90,afftdn=nr=8:nf=-50,equalizer=f=3300:t=q:w=1.2:g=2.5,acompressor=threshold=-24dB:ratio=2.8:attack=5:release=130:makeup=2,loudnorm=I=-16:TP=-2"
    AIR = "aecho=1.0:0.88:13|29:0.10|0.06"                                 # a little of the yard's air, so they sit by the fire
    raw = {}
    for s in SHOTS:
        if "real" in s:
            n, a, b = s["real"]
            if n not in raw: raw[n] = load(f"{FIRE}/wav/c{n}.wav", VOICE)
            put(voice, raw[n][int(a * SR): int(b * SR)], s["out"] / FPS, 0, 0.012, 0.03)
        if s["kind"] == "macro": put(voice, load(f"{HERE}/vo/{s['who']}.wav", AIR), s["out"] / FPS + LEAD, 0.5)
    put(voice, load(f"{HERE}/vo/just.wav", AIR), BY["just"]["out"] / FPS + JUST_AT, 2.5)
    put(voice, load(f"{HERE}/vo/pick.wav", AIR), BY["pick"]["out"] / FPS + PICK_A, 0.5); put(voice, load(f"{HERE}/vo/sky.wav", AIR), BY["pick"]["out"] / FPS + PICK_B, 0.5)
    rng = np.random.default_rng(5)                                          # the fire under everything
    br = np.cumsum(rng.normal(0, 1, NS)).astype(np.float32); br -= np.convolve(br, np.ones(4800) / 4800, mode="same"); br /= np.abs(br).max() + 1e-9
    crk = np.zeros(NS, np.float32)
    for tt in rng.uniform(0, NS / SR, int(NS / SR * 9)):
        L = int(SR * rng.uniform(0.004, 0.03)); i = int(tt * SR)
        if i + L < NS: crk[i:i + L] += np.diff(np.r_[0, rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.15, 1.0) ** 2]).astype(np.float32)
    fire = np.convolve(br, np.ones(60) / 60, mode="same") * 0.5 * db(-29) + crk * db(-34); amb[:, 0] = fire; amb[:, 1] = np.roll(fire, 37)
    M = load(f"{SP}/launch/music_el.mp3"); ms = lambda a, b: M[int(a * SR): int(b * SR)]; E = END_OUT / FPS; xf = int(1.0 * SR)
    def arrange(n_groove):
        parts = [ms(0, 10.5), ms(10.5, 30)] + [ms(12.0, 30)] * n_groove + [ms(30, 36.0)]; mus = parts[0]
        for p in parts[1:]:
            fade = np.linspace(0, 1, xf)[:, None]; mus = np.vstack([mus[:-xf], mus[-xf:] * (1 - fade) + p[:xf] * fade, p[xf:]])
        return mus
    g_ = 0
    while len(arrange(g_)) / SR - 6.0 < E - 0.3: g_ += 1
    mus = arrange(g_); off = E - 0.3 - (len(mus) / SR - 6.0); put(bed, mus, off, -7.5, 0.0, 0.6)
    bed[: int(0.5 * SR)] *= np.linspace(0.25, 1, int(0.5 * SR))[:, None]
    e = np.convolve(np.abs(voice[:, 0]), np.ones(9600) / 9600, mode="same"); bed *= (1 - 0.6 * np.clip(e / 0.035, 0, 1))[:, None]
    t0 = BY["just"]["out"] / FPS + 0.05; t1 = BY["pick"]["out"] / FPS + 0.1; g = np.ones(NS, np.float32)     # the music stops for the beat
    i0, i1 = int(t0 * SR), int(t1 * SR); g[i0:i1] = 0; r_ = int(0.12 * SR); g[i0:i0 + r_] = np.linspace(1, 0, r_); r2 = int(0.5 * SR); g[i1:i1 + r2] = np.linspace(0, 1, r2); bed *= g[:, None]
    sfx = f"{SP}/editorpack/sfx"; S_ = lambda n: load(f"{sfx}/{n}.wav"); pop = S_("skylings_pop_up")[: int(0.11 * SR)]; tap = S_("tap")
    for s in SHOTS:
        t = s["out"] / FPS
        if s["kind"] == "macro": put(fx, pop, t + 0.02, -10); put(fx, tap, t + 0.3, -16)
        if s.get("hop"): put(fx, tap, t + s["dur"] - 0.4, -10)
        if s["kind"] == "line_open":
            for j in range(5): put(fx, tap, t + 1.02 + 0.08 * j, -15)
        if s["kind"] == "line_just":
            for j in range(5): put(fx, tap, t + 0.16 + 0.05 * j, -13)
        if s["kind"] == "sky":
            put(fx, S_("sky_turns"), t + 0.35, -6); put(fx, S_("night_stars_twinkle"), t + 1.8, -12)
            for j in range(5): put(fx, pop, t + 0.4 + 1.6 * (j / 4.2), -13)
    put(fx, load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"), E, -3, 0.01, 0.2)
    out = voice + fx + bed + amb; out[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))[:, None] ** 2
    with wave.open(f"{HERE}/skit3_mix_pre.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/skit3_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{HERE}/skit3_mix.wav"], check=True)

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--preview":
        os.makedirs(f"{HERE}/prev", exist_ok=True)
        for sv in args[1].split(","): Image.fromarray(frame(int(round(float(sv) * FPS)))).save(f"{HERE}/prev/s_{float(sv):05.2f}.jpg", quality=90)
        sys.exit()
    json.dump(dict(shots=SHOTS, end_out=END_OUT, n=N), open(f"{HERE}/skit3_timeline.json", "w"), default=str)
    if "--nosound" not in args: mix()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HERE}/skit3_silent.mp4"], stdin=subprocess.PIPE)
    for i in range(N): enc.stdin.write(frame(i).tobytes())
    enc.stdin.close(); enc.wait()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/skit3_silent.mp4", "-i", f"{HERE}/skit3_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest",
                    "-movflags", "+faststart", f"{HERE}/LifeFlow_Skylings_Skit_v3.mp4"], check=True)
    print("skit v3", N, "frames", round(N / FPS, 2), "s")
