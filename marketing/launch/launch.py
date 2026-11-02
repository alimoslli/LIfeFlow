"""LifeFlow launch campaign renderer.

Look: white editorial canvas, Newsreader + Geist type, glossy sage-glass 3D (the brand molecule, orbs, ribbon),
a glass phone with a catch-light that sweeps on every cut and a floor reflection, real app recordings, and the
app's real cards popping out of the screen in 3D.

Inputs (relative to the working dir): rec/*.mp4 (1080x2338 app recordings), cards/*.png, shots/*.png,
g/*.png (glossy stills), m/*.mp4 (glossy loops), fonts/*.ttf.
Usage: python3 launch.py <plan.json> <out.mp4>          full render (video only, 30 fps)
       python3 launch.py <plan.json> preview t1 t2 ...    JPEG frames
       python3 launch.py photos                           the two story photos
"""
import json, math, subprocess, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H, FPS = 1080, 1920, 30
INK, GRAY, MOSS, SAGE, CREAM = (20, 22, 20), (112, 116, 110), (40, 91, 69), (150, 196, 166), (246, 242, 233)
WHITE = (255, 255, 255)

_fonts = {}


def font(name, size, var=None):
    key = (name, size, var)
    if key not in _fonts:
        f = ImageFont.truetype("fonts/" + name, size)
        if var:
            try:
                f.set_variation_by_name(var)
            except Exception:
                pass
        _fonts[key] = f
    return _fonts[key]


SERIF = lambda s: font("Newsreader.ttf", s, "Regular")
SERIF_I = lambda s: font("Newsreader-Italic.ttf", s, "Italic")
SANS = lambda s, v="Medium": font("Geist.ttf", s, v)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def eo(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def eio(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def eback(x, s=1.4):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def with_alpha(img, a):
    if a >= 0.999:
        return img
    img = img.copy()
    img.putalpha(img.getchannel("A").point(lambda v: int(v * max(0.0, a))))
    return img


# ---------------------------------------------------------------- video readers
class Clip:
    """Sequential frame reader. cover=True fills WxH and centre-crops (glossy loops)."""

    def __init__(self, path, start, n, w, h, speed=1.0, cover=False):
        vf = [f"setpts=PTS/{speed}"] if speed != 1 else []
        vf.append(f"fps={FPS}")
        vf.append(f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}" if cover else f"scale={w}:{h}:flags=lanczos")
        self.w, self.h, self.last = w, h, None
        self.p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", f"{max(0.0, start):.3f}", "-i", path, "-vf", ",".join(vf),
                                   "-frames:v", str(max(1, n)), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)

    def next(self):
        b = self.p.stdout.read(self.w * self.h * 3)
        if len(b) == self.w * self.h * 3:
            self.last = Image.frombuffer("RGB", (self.w, self.h), b)
        return self.last


# ---------------------------------------------------------------- 3D helpers
def homography(src, dst):
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        b += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def project(w, h, cx, cy, ry, rx, rz=0.0, scale=1.0, f=2400.0):
    ry, rx, rz = map(math.radians, (ry, rx, rz))
    pts = []
    for (x, y) in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        x, y = x * scale, y * scale
        x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
        X, Z = x * math.cos(ry), x * math.sin(ry)
        Y, Z = y * math.cos(rx) - Z * math.sin(rx), y * math.sin(rx) + Z * math.cos(rx)
        k = f / (f + Z)
        pts.append((cx + X * k, cy + Y * k))
    return pts


def warp_into(im, img, dst, alpha=1.0, fill=(0, 0, 0)):
    """Perspective-warp img onto the quad dst (TL, TR, BR, BL) of im, working only inside the quad's bounding box."""
    xs, ys = [p[0] for p in dst], [p[1] for p in dst]
    x0, y0 = max(0, int(min(xs)) - 2), max(0, int(min(ys)) - 2)
    x1, y1 = min(W, int(max(xs)) + 3), min(H, int(max(ys)) + 3)
    if x1 <= x0 or y1 <= y0:
        return
    w, h = img.size
    local = [(x - x0, y - y0) for x, y in dst]
    out = img.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, homography([(0, 0), (w, 0), (w, h), (0, h)], local), Image.BICUBIC, fillcolor=fill + (0,))
    im.alpha_composite(with_alpha(out, alpha), (x0, y0))


def soft_shadow(im, dst, alpha, blur=50, dy=60, dx=0, color=(22, 42, 32)):
    s = 4
    lay = Image.new("L", (W // s, H // s), 0)
    ImageDraw.Draw(lay).polygon([((x + dx) / s, (y + dy) / s) for x, y in dst], fill=int(clamp(alpha, 0, 255)))
    lay = lay.filter(ImageFilter.GaussianBlur(blur / s)).resize((W, H), Image.BILINEAR)
    sh = Image.new("RGBA", (W, H), color + (0,))
    sh.putalpha(lay)
    im.alpha_composite(sh)


# ---------------------------------------------------------------- canvas, glass orbs
def key_white(img, lo=10, span=120):
    """Glass shot on white -> RGBA. Alpha grows with distance from white, so highlights stay translucent."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    alpha = np.clip((255 - a.min(axis=2) - lo) / span, 0, 1)
    return Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), "RGBA")


def glass_ball(path, cx, cy, r, size, blur=0):
    """Cut one glass sphere out of a still: keyed against white and limited to a feathered circle."""
    src = Image.open(path).convert("RGB")
    c = src.crop((int(cx - r * 1.1), int(cy - r * 1.1), int(cx + r * 1.1), int(cy + r * 1.1))).resize((size, size), Image.LANCZOS)
    ball = key_white(c)
    m = Image.new("L", (size, size), 0)
    rr = size / 2 / 1.1 * 0.99
    ImageDraw.Draw(m).ellipse((size / 2 - rr, size / 2 - rr, size / 2 + rr, size / 2 + rr), fill=255)
    ball.putalpha(ImageChops.multiply(ball.getchannel("A"), m.filter(ImageFilter.GaussianBlur(size * 0.012))))
    return ball.filter(ImageFilter.GaussianBlur(blur)) if blur else ball


def smooth_mask(top0, top1):
    y = np.arange(H, dtype=np.float32)
    m = np.clip((y - top0) / (top1 - top0), 0, 1)
    m = m * m * (3 - 2 * m)
    return Image.fromarray(np.ascontiguousarray(np.broadcast_to((m * 255)[:, None], (H, W))).astype(np.uint8), "L")


BG = ORBS = ORB_MASK = FG_ORB = LOGO = None


def assets():
    global BG, ORBS, ORB_MASK, FG_ORB, LOGO
    if BG is not None:
        return
    y = np.linspace(0, 1, H)[:, None, None]
    base = np.array([255.0, 255, 255]) * (1 - y) + np.array([241.0, 243, 239]) * y
    BG = Image.fromarray(np.ascontiguousarray(np.broadcast_to(base, (H, W, 3))).astype("uint8")).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-380, 1000, 820, 2300), fill=SAGE + (46,))
    gd.ellipse((520, -260, 1460, 640), fill=(246, 234, 214, 70))
    BG.alpha_composite(glow.filter(ImageFilter.GaussianBlur(200)))
    # glass orbs behind the phone: keyed, a touch of depth-of-field, larger than the frame so they can drift
    g2 = Image.open("g/g2.png").convert("RGB")
    g2 = g2.resize((W + 160, int((W + 160) * g2.height / g2.width)), Image.LANCZOS)
    ORBS = key_white(g2).filter(ImageFilter.GaussianBlur(4))
    ORB_MASK = smooth_mask(330, 700)  # keep the headline area clean
    # one out-of-focus glass orb in front of the phone (bottom-right), for depth
    FG_ORB = glass_ball("g/g2.png", 1090, 1995, 175, 430, blur=7)
    LOGO = Image.open("shots/logo.png").convert("RGBA")


def orbs_layer(im, t, alpha=0.5):
    ox = 80 + 46 * math.sin(t * 0.31)
    oy = max(0, (ORBS.height - H) / 2 + 40 * math.sin(t * 0.23 + 1.0))
    win = ORBS.crop((int(ox), int(oy), int(ox) + W, int(oy) + H))
    win.putalpha(ImageChops.multiply(win.getchannel("A"), ORB_MASK).point(lambda v: int(v * alpha)))
    im.alpha_composite(win)


def fg_orb(im, t, alpha=0.85):
    o = FG_ORB
    x = int(W - o.width * 0.62 + 30 * math.sin(t * 0.5))
    y = int(H - o.height * 0.78 + 24 * math.sin(t * 0.42 + 0.7))
    im.alpha_composite(with_alpha(o, alpha), (x, y))


# ---------------------------------------------------------------- glass phone
SW = 640
SH = int(SW * 2338 / 1080)
BZ, SR, STATUS = 20, 92, 62
SMASK = Image.new("L", (SW, SH), 0)
ImageDraw.Draw(SMASK).rounded_rectangle((0, 0, SW - 1, SH - 1), radius=SR, fill=255)
PHONE = {}


def phone_parts():
    if PHONE:
        return PHONE
    fw, fh = SW + 2 * BZ, SH + 2 * BZ
    fr = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    d = ImageDraw.Draw(fr)
    d.rounded_rectangle((0, 0, fw - 1, fh - 1), radius=SR + BZ, fill=(24, 26, 25, 255))
    # polished titanium rim: bright towards the top-left light, darker bottom-right
    rim = Image.new("L", (fw, fh), 0)
    ImageDraw.Draw(rim).rounded_rectangle((1, 1, fw - 2, fh - 2), radius=SR + BZ - 1, outline=255, width=5)
    yy, xx = np.mgrid[0:fh, 0:fw].astype(np.float32)
    light = 0.35 + 0.65 * np.clip(1 - (xx / fw + yy / fh) / 2 * 1.3, 0, 1)
    rim_rgba = Image.new("RGBA", (fw, fh), (214, 222, 217, 0))
    rim_rgba.putalpha(Image.fromarray((np.asarray(rim) * light).astype(np.uint8)))
    fr.alpha_composite(rim_rgba)
    d.rounded_rectangle((8, 8, fw - 9, fh - 9), radius=SR + BZ - 8, outline=(56, 60, 58, 255), width=2)
    # status bar with the island
    st = Image.new("RGBA", (SW, STATUS), (0, 0, 0, 0))
    sd = ImageDraw.Draw(st)
    sd.text((52, 33), "9:41", font=SANS(29, "SemiBold"), fill=INK, anchor="lm")
    bx = SW - 46
    sd.rounded_rectangle((bx - 42, 23, bx, 43), radius=6, outline=INK, width=2)
    sd.rounded_rectangle((bx - 39, 26, bx - 10, 40), radius=3, fill=INK)
    for i in range(4):
        hh = 7 + i * 4
        sd.rounded_rectangle((bx - 106 + i * 9, 43 - hh, bx - 100 + i * 9, 43), radius=1, fill=INK)
    sd.rounded_rectangle((SW / 2 - 100, 12, SW / 2 + 100, 64), radius=26, fill=(0, 0, 0, 255))
    # a wide diagonal catch-light band (cropped per frame) and a static top-left sheen
    band = Image.new("L", (SW * 3, SH), 0)
    cx = SW * 1.5
    ImageDraw.Draw(band).polygon([(cx + 120, 0), (cx + 300, 0), (cx - 260, SH), (cx - 440, SH)], fill=95)
    band = band.filter(ImageFilter.GaussianBlur(46))
    sheen = Image.new("L", (SW, SH), 0)
    ImageDraw.Draw(sheen).polygon([(0, 0), (SW * 0.62, 0), (0, SH * 0.36)], fill=22)
    sheen = sheen.filter(ImageFilter.GaussianBlur(60))
    # floor-reflection fade (top of the flipped phone is brightest)
    fade = np.clip(1 - np.arange(fh) / (0.32 * fh), 0, 1) ** 1.6 * 0.17
    PHONE.update(frame=fr, status=st, band=band, sheen=sheen, fade=fade.astype(np.float32))
    return PHONE


def glass_phone(screen, glare):
    """screen: SWxSH RGB app frame. glare: 0..1 position of the sweeping catch-light (None = off)."""
    P = phone_parts()
    scr = Image.new("RGBA", (SW, SH), CREAM + (255,))
    body = screen.convert("RGBA")
    scr.alpha_composite(body.crop((0, 0, SW, SH - STATUS)), (0, STATUS))
    scr.alpha_composite(body.crop((0, 0, SW, 2)).resize((SW, STATUS)), (0, 0))
    scr.alpha_composite(P["status"])
    light = P["sheen"]
    if glare is not None and 0 < glare < 1:
        x = int(SW * 2 - glare * SW * 2.2)
        x = max(0, min(SW * 2, x))
        light = ImageChops.add(light, P["band"].crop((x, 0, x + SW, SH)))
    wl = Image.new("RGBA", (SW, SH), WHITE + (0,))
    wl.putalpha(light)
    scr.alpha_composite(wl)
    ph = P["frame"].copy()
    ph.paste(scr, (BZ, BZ), SMASK)
    return ph


def draw_phone(im, screen, cx, cy, ry, rx, scale, alpha=1.0, glare=None, reflect=True):
    P = phone_parts()
    ph = glass_phone(screen, glare)
    dst = project(ph.width, ph.height, cx, cy, ry, rx, 0, scale)
    if reflect:
        refl = ImageOps.flip(ph)
        a = np.asarray(refl.getchannel("A")).astype(np.float32) * P["fade"][:, None] * alpha
        refl.putalpha(Image.fromarray(a.astype(np.uint8)))
        TL, TR, BR, BL = dst
        g = 10
        rd = [(BL[0], BL[1] + g), (BR[0], BR[1] + g), (TR[0], 2 * BR[1] - TR[1] + g), (TL[0], 2 * BL[1] - TL[1] + g)]
        warp_into(im, refl, rd, fill=(255, 255, 255))
    soft_shadow(im, dst, 95 * alpha, 64, 74, 16)
    warp_into(im, ph, dst, alpha, fill=(24, 26, 25))
    return dst


# ---------------------------------------------------------------- real app cards
def rounded(img, r):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=r, fill=255)
    img.putalpha(m)
    return img


CARD_CROP = {"cashacct": (0, 118, 1050, 501), "lunch": (0, 0, 1050, 212), "banks": (0, 40, 1050, 603), "applehealth": (0, 0, 1050, 560),
             "budgets": (0, 0, 1050, 820), "available": (0, 0, 1050, 340), "available_pre": (0, 0, 1050, 340), "invest": (0, 0, 1050, 690)}
_cards = {}


def card(name, width):
    key = (name, width)
    if key not in _cards:
        c = Image.open(f"cards/{name}.png").convert("RGB")
        if name in CARD_CROP:
            c = c.crop(CARD_CROP[name])
        c = c.resize((width, int(c.height * width / c.width)), Image.LANCZOS)
        r = int(width * 0.05)
        c = rounded(c, r)
        ImageDraw.Draw(c).rounded_rectangle((1, 1, c.width - 2, c.height - 2), radius=r, outline=(255, 255, 255, 235), width=3)
        _cards[key] = c
    return _cards[key]


def pop_card(im, name, lt, dur, cy, width, origin, dx=0):
    """lt: seconds since the card started; dur: how long it stays out."""
    if lt < 0 or lt >= dur:
        return
    c = card(name, width)
    if lt < 1.1:  # one glass sheen across the card as it lands
        c = c.copy()
        x = -320 + eo(lt / 1.1) * (c.width + 700)
        sh = Image.new("L", c.size, 0)
        ImageDraw.Draw(sh).polygon([(x, 0), (x + 110, 0), (x - 170, c.height), (x - 280, c.height)], fill=85)
        sh = ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(24)), c.getchannel("A"))
        wl = Image.new("RGBA", c.size, WHITE + (0,))
        wl.putalpha(sh)
        c.alpha_composite(wl)
    k = eback(lt / 0.55, 1.5)
    ko = eio((lt - (dur - 0.32)) / 0.32)
    sc = (0.42 + 0.58 * k) * (1 - 0.4 * ko)
    lift = eo(lt / 0.5) * (1 - ko)
    ry = -18 * (1 - eo(lt / 0.75)) + 3.0 * math.sin(lt * 1.3)
    rx = 10 * (1 - eo(lt / 0.75)) + 2.2 * math.sin(lt * 1.05 + 0.6)
    ox, oy = origin
    cx = ox + (W / 2 + dx - ox) * lift
    cyy = oy + (cy - oy) * lift
    dst = project(c.width, c.height, cx, cyy, ry, rx, 0, sc)
    soft_shadow(im, dst, 45 + 105 * lift, 26 + 34 * lift, 30 + 56 * lift)
    warp_into(im, c, dst, clamp(lt / 0.1) * (1 - 0.7 * ko), fill=(250, 248, 243))


_badges = {}


def glass_pill(kind, text):
    key = (kind, text)
    if key in _badges:
        return _badges[key]
    if kind == "plaid":
        w, h = 800, 160
        b = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
        sh = Image.new("L", b.size, 0)
        ImageDraw.Draw(sh).rounded_rectangle((40, 58, 40 + w, 58 + h), radius=h // 2, fill=70)
        shadow = Image.new("RGBA", b.size, (20, 40, 30, 0))
        shadow.putalpha(sh.filter(ImageFilter.GaussianBlur(18)))
        b.alpha_composite(shadow)
        d = ImageDraw.Draw(b)
        d.rounded_rectangle((40, 40, 40 + w, 40 + h), radius=h // 2, fill=(253, 252, 249, 248), outline=(255, 255, 255, 255), width=3)
        sx, sy = 122, 120
        d.ellipse((sx - 50, sy - 50, sx + 50, sy + 50), fill=(232, 241, 235, 255))
        d.polygon([(sx - 26, sy - 30), (sx, sy - 40), (sx + 26, sy - 30), (sx + 23, sy + 6), (sx, sy + 32), (sx - 23, sy + 6)], fill=MOSS)
        d.line([(sx - 11, sy - 2), (sx - 2, sy + 8), (sx + 14, sy - 12)], fill=CREAM, width=6, joint="curve")
        d.text((196, 98), "Secured by Plaid", font=SANS(46, "SemiBold"), fill=INK, anchor="lm")
        d.text((197, 150), "Read-only. LifeFlow never sees your password.", font=SANS(27, "Regular"), fill=GRAY, anchor="lm")
    else:
        f = SANS(40, "Medium")
        tw = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(text, font=f)
        w, h = int(tw + 148), 98
        b = Image.new("RGBA", (w + 60, h + 60), (0, 0, 0, 0))
        sh = Image.new("L", b.size, 0)
        ImageDraw.Draw(sh).rounded_rectangle((30, 44, 30 + w, 44 + h), radius=h // 2, fill=60)
        shadow = Image.new("RGBA", b.size, (20, 40, 30, 0))
        shadow.putalpha(sh.filter(ImageFilter.GaussianBlur(14)))
        b.alpha_composite(shadow)
        d = ImageDraw.Draw(b)
        d.rounded_rectangle((30, 30, 30 + w, 30 + h), radius=h // 2, fill=(238, 245, 240, 250), outline=(255, 255, 255, 255), width=3)
        b.alpha_composite(LOGO.resize((58, 58), Image.LANCZOS), (30 + 22, 30 + 20))
        d.text((30 + 96, 30 + h / 2), text, font=f, fill=MOSS, anchor="lm")
    _badges[key] = b
    return b


def pop_pill(im, kind, text, lt, dur, cy):
    if lt < 0 or lt >= dur:
        return
    b = glass_pill(kind, text)
    k = eback(lt / 0.45, 1.7)
    ko = eio((lt - (dur - 0.28)) / 0.28)
    s = (0.72 + 0.28 * k) * (1 - 0.15 * ko)
    bb = b.resize((int(b.width * s), int(b.height * s)), Image.BICUBIC)
    im.alpha_composite(with_alpha(bb, clamp(lt / 0.12) * (1 - ko)), (int(W / 2 - bb.width / 2), int(cy - bb.height / 2 + 30 * (1 - eo(lt / 0.45)))))


# ---------------------------------------------------------------- typography
_words = {}


def word_img(text, f, col):
    key = (text, id(f), col)
    if key not in _words:
        bb = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=f)
        lay = Image.new("RGBA", (bb[2] + 30, int(f.size * 1.45)), (0, 0, 0, 0))
        ImageDraw.Draw(lay).text((0, 0), text, font=f, fill=col)
        _words[key] = lay
    return _words[key]


def tracked_layer(text, f, col, track):
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    ws = [d.textlength(c, font=f) for c in text]
    total = sum(ws) + track * (len(text) - 1)
    lay = Image.new("RGBA", (int(total) + 10, int(f.size * 1.5)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    x = 0
    for c, w in zip(text, ws):
        ld.text((x, 0), c, font=f, fill=col)
        x += w + track
    return lay


_eyebrows = {}


def headline(im, spec, lt, dur):
    """Eyebrow (tracked caps) + serif line + italic moss line, revealed word by word; fades out at the end of dur."""
    if not spec or lt < 0 or lt >= dur:
        return
    top = spec.get("top", 112)
    size = spec.get("size", 88)
    out = eio((lt - (dur - 0.26)) / 0.26) if spec.get("out", True) else 0.0
    y = top
    if spec.get("eyebrow"):
        key = spec["eyebrow"]
        if key not in _eyebrows:
            _eyebrows[key] = tracked_layer(key, SANS(28, "SemiBold"), MOSS, 5)
        e = _eyebrows[key]
        a = eo(lt / 0.35) * (1 - out)
        im.alpha_composite(with_alpha(e, a), (int(W / 2 - e.width / 2), int(y + 12 * (1 - eo(lt / 0.4)))))
        y += 66
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for li, (txt, f, col) in enumerate([(spec.get("l1"), SERIF(size), INK), (spec.get("l2"), SERIF_I(size), MOSS)]):
        if not txt:
            continue
        words = txt.split(" ")
        sp = d.textlength(" ", font=f)
        widths = [d.textlength(w_, font=f) for w_ in words]
        total = sum(widths) + sp * (len(words) - 1)
        x = (W - total) / 2
        for wi, (w_, ww) in enumerate(zip(words, widths)):
            st = 0.1 + li * 0.2 + wi * 0.065
            a = eo((lt - st) / 0.38) * (1 - out)
            if a > 0.004:
                im.alpha_composite(with_alpha(word_img(w_, f, col), a), (int(x), int(y + 30 * (1 - eo((lt - st) / 0.5)))))
            x += ww + sp
        y += int(size * 1.1)


_wordmarks = {}


def wordmark(sub):
    if sub not in _wordmarks:
        f = SERIF(132)
        d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        tw = d.textlength("LifeFlow", font=f)
        lg = 118
        w = int(lg + 26 + tw)
        lay = Image.new("RGBA", (W, 300), (0, 0, 0, 0))
        x0 = int(W / 2 - w / 2)
        lay.alpha_composite(LOGO.resize((lg, lg), Image.LANCZOS), (x0, 20))
        ImageDraw.Draw(lay).text((x0 + lg + 26, 79), "LifeFlow", font=f, fill=INK, anchor="lm")
        if sub:
            ImageDraw.Draw(lay).text((W / 2, 210), sub, font=SANS(40, "Medium"), fill=GRAY, anchor="mm")
        _wordmarks[sub] = lay
    return _wordmarks[sub]


_hazes = {}


def haze(cy, h, strength):
    key = (cy, h, strength)
    if key not in _hazes:
        s = 4
        m = Image.new("L", (W // s, H // s), 0)
        ImageDraw.Draw(m).ellipse((-W * 0.1 / s, (cy - h / 2) / s, W * 1.1 / s, (cy + h / 2) / s), fill=int(255 * strength))
        m = m.filter(ImageFilter.GaussianBlur(70 / s)).resize((W, H), Image.BILINEAR)
        lay = Image.new("RGBA", (W, H), WHITE + (0,))
        lay.putalpha(m)
        _hazes[key] = lay
    return _hazes[key]


def white_mix(im, k):
    if k <= 0.001:
        return im
    return Image.blend(im, Image.new("RGBA", (W, H), WHITE + (255,)), clamp(k))


# ---------------------------------------------------------------- scenes
def render_gloss(sc, lt, fr):
    dur = sc["end"] - sc["start"]
    im = fr.convert("RGBA")
    k = 1.0 + sc.get("push", 0.05) * lt / dur
    if k > 1.0005:
        nw, nh = int(W * k), int(H * k)
        im = im.resize((nw, nh), Image.BICUBIC).crop(((nw - W) // 2, (nh - H) // 2, (nw - W) // 2 + W, (nh - H) // 2 + H))
    for hz in sc.get("haze", []):
        a = eo((lt - hz.get("at", 0)) / 0.6)
        if a > 0:
            im.alpha_composite(with_alpha(haze(hz["cy"], hz["h"], hz.get("s", 0.8)), a))
    for tx in sc.get("texts", []):
        headline(im, dict(tx, out=False), lt - tx.get("at", 0), 99)
    wm = sc.get("wordmark")
    if wm:
        a = eo((lt - wm["at"]) / 0.6)
        if a > 0:
            im.alpha_composite(with_alpha(wordmark(wm.get("sub", "")), a), (0, int(wm["y"] + 26 * (1 - a))))
    if sc.get("note"):
        a = eo((lt - sc["note"]["at"]) / 0.5)
        if a > 0:
            lay = Image.new("RGBA", (W, 60), (0, 0, 0, 0))
            ImageDraw.Draw(lay).text((W / 2, 30), sc["note"]["text"], font=SANS(26, "Regular"), fill=(150, 154, 148), anchor="mm")
            im.alpha_composite(with_alpha(lay, a), (0, sc["note"].get("y", 1830)))
    fi, fo = sc.get("fade_in", 0), sc.get("fade_out", 0)
    if fi and lt < fi:
        im = white_mix(im, 1 - eio(lt / fi))
    if fo and lt > dur - fo:
        im = white_mix(im, eio((lt - (dur - fo)) / fo))
    return im


_stills = {}


def render_still(sc, lt):
    """The Reel opens on its grid post (the cover), then pushes in and dips to white."""
    if sc["image"] not in _stills:
        _stills[sc["image"]] = Image.open(sc["image"]).convert("RGBA").resize((W, H), Image.LANCZOS)
    dur = sc["end"] - sc["start"]
    im = _stills[sc["image"]]
    k = 1.0 + sc.get("push", 0.04) * eio(lt / dur)
    if k > 1.0005:
        nw, nh = int(W * k), int(H * k)
        im = im.resize((nw, nh), Image.BICUBIC).crop(((nw - W) // 2, (nh - H) // 2, (nw - W) // 2 + W, (nh - H) // 2 + H))
    fo = sc.get("fade_out", 0)
    if fo and lt > dur - fo:
        im = white_mix(im, eio((lt - (dur - fo)) / fo))
    return im


PHONE_CX, PHONE_CY, PHONE_SCALE = W / 2 + 30, 1150, 0.84


def render_phone(sc, si, lt, scr, t):
    dur = sc["end"] - sc["start"]
    im = BG.copy()
    orbs_layer(im, t, 0.5)
    enter, leave = sc.get("enter", False), sc.get("exit", False)
    ke = eo(lt / 0.85) if enter else 1.0
    kx = eio((lt - (dur - 0.5)) / 0.5) if leave else 0.0
    # every cut: a small swing of the phone and the catch-light sweeping across the glass
    sw = 0.0 if enter else (1 - eo(lt / 0.6)) * (1 if si % 2 else -1)
    ry = -10 + 3 * math.sin(t * 0.45) - 30 * (1 - ke) + 9 * sw + 26 * kx
    rx = 5 + 1.6 * math.sin(t * 0.37) + 8 * (1 - ke)
    cy = PHONE_CY + 640 * (1 - ke) + 90 * kx + 6 * math.sin(t * 0.8)
    scale = PHONE_SCALE * ((0.9 + 0.1 * eback(lt / 0.85, 1.2)) if enter else 1.0) * (1 + 0.025 * abs(sw)) * (1 - 0.12 * kx)
    glare = clamp(lt / 0.95) if lt < 0.95 else None
    draw_phone(im, scr, PHONE_CX, cy, ry, rx, scale, 1 - kx, glare)
    headline(im, sc.get("head"), lt, dur)
    origin = (PHONE_CX, cy)
    for pc in sc.get("pops", []):
        pop_card(im, pc["card"], lt - pc["at"], pc.get("dur", dur - pc["at"]), pc.get("y", 1130), pc.get("w", 820), origin, pc.get("dx", 0))
    fg_orb(im, t, 0.8)
    for pl in sc.get("pills", []):
        pop_pill(im, pl["kind"], pl.get("text", ""), lt - pl["at"], pl.get("dur", dur - pl["at"]), pl.get("y", 1660))
    if enter and lt < 0.4:
        im = white_mix(im, 1 - eio(lt / 0.4))
    if leave:
        im = white_mix(im, (kx - 0.55) / 0.45)
    return im


def scene_frames(sc):
    return int(round((sc["end"] - sc["start"]) * FPS)) + 3


def render(plan, out=None, preview=None):
    assets()
    T = plan["duration"]
    scenes = plan["scenes"]
    times = preview if preview is not None else [i / FPS for i in range(int(round(T * FPS)))]
    enc = None
    if preview is None:
        enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-c:v", "libx264", "-profile:v", "high", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
                               stdin=subprocess.PIPE)
    readers = {}
    for idx, t in enumerate(times):
        si = next(i for i, s in enumerate(scenes) if s["start"] <= t < s["end"] or i == len(scenes) - 1)
        sc = scenes[si]
        lt = t - sc["start"]
        if sc["kind"] == "still":
            im = render_still(sc, lt)
        elif sc["kind"] == "gloss":
            spd = sc.get("speed", 1.0)
            if preview is not None:
                fr = Clip(sc["clip"], sc.get("from", 0) + lt * spd, 1, W, H, cover=True).next()
            else:
                key = ("g", si)
                if key not in readers:
                    readers[key] = Clip(sc["clip"], sc.get("from", 0), scene_frames(sc), W, H, spd, cover=True)
                fr = readers[key].next()
            im = render_gloss(sc, lt, fr)
        else:
            acc, cur, ci, slt = 0.0, None, 0, 0.0
            for ci, s_ in enumerate(sc["src"]):
                if lt < acc + s_["dur"] or ci == len(sc["src"]) - 1:
                    cur, slt = s_, lt - acc
                    break
                acc += s_["dur"]
            spd = cur.get("speed", 1.0)
            path = f"rec/{cur['rec']}.mp4"
            if preview is not None:
                scr = Clip(path, cur.get("from", 0) + slt * spd, 1, SW, SH).next()
            else:
                key = ("p", si, ci)
                if key not in readers:
                    readers[key] = Clip(path, cur.get("from", 0), int(round(cur["dur"] * FPS)) + 3, SW, SH, spd)
                scr = readers[key].next()
            im = render_phone(sc, si, lt, scr, t)
        rgb = im.convert("RGB")
        if preview is not None:
            rgb.save(f"prev_{t:05.2f}.jpg", quality=88)
        else:
            enc.stdin.write(rgb.tobytes())
            if idx % 60 == 0:
                print("frame", idx, "of", len(times), flush=True)
    if enc:
        enc.stdin.close()
        enc.wait()


# ---------------------------------------------------------------- story photos (1080x1920)
def story_meet(out):
    assets()
    im = BG.copy()
    g1 = Image.open("g/g1.png").convert("RGB")
    g1 = g1.resize((900, int(900 * g1.height / g1.width)), Image.LANCZOS)
    mol = key_white(g1)
    fade = np.clip((g1.height * 0.80 - np.arange(g1.height)) / (g1.height * 0.08), 0, 1)  # drop the floor below the shadow
    mol.putalpha(Image.fromarray((np.asarray(mol.getchannel("A")) * fade[:, None]).astype(np.uint8)))
    im.alpha_composite(mol, (90, -400))
    headline(im, {"eyebrow": "INTRODUCING", "l1": "Meet LifeFlow.", "top": 850, "size": 128, "out": False}, 5, 9)
    f = SERIF_I(62)
    for i, s in enumerate(["The personal assistant", "for your whole life."]):
        im.alpha_composite(word_img(s, f, MOSS), (int(W / 2 - ImageDraw.Draw(im).textlength(s, font=f) / 2), 1072 + i * 72))
    d = ImageDraw.Draw(im)
    d.text((W / 2, 1268), "Classes · Work · Money · Health", font=SANS(36, "Medium"), fill=GRAY, anchor="mm")
    b = glass_pill("chip", "Launching today")
    im.alpha_composite(b, (int(W / 2 - b.width / 2), 1300))
    scr = Image.open("shots/sagechat.png").convert("RGB").resize((SW, SH), Image.LANCZOS)
    draw_phone(im, scr, W / 2, 2170, -8, 9, 0.92, reflect=False, glare=0.45)
    im.convert("RGB").save(out, quality=95)


def story_web(out):
    assets()
    im = BG.copy()
    orb = glass_ball("g/g4.png", 1024, 940, 930, 600)
    im.alpha_composite(orb, (W - 330, 1500))
    small = glass_ball("g/g2.png", 461, 650, 150, 210, blur=3)
    im.alpha_composite(small, (-40, 1190))
    headline(im, {"eyebrow": "AVAILABLE NOW", "l1": "LifeFlow is live", "l2": "on the web.", "top": 190, "size": 112, "out": False}, 5, 9)
    shot = Image.open("shots/desktop_today.png").convert("RGB")
    bw = 1000
    bh = int(bw * shot.height / shot.width)
    win = Image.new("RGBA", (bw, bh + 66), (0, 0, 0, 0))
    wd = ImageDraw.Draw(win)
    wd.rounded_rectangle((0, 0, bw - 1, bh + 65), radius=26, fill=(247, 247, 245, 255))
    for i, c in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
        wd.ellipse((26 + i * 32, 24, 44 + i * 32, 42), fill=c)
    wd.rounded_rectangle((bw / 2 - 220, 15, bw / 2 + 220, 51), radius=18, fill=(233, 233, 230, 255))
    wd.text((bw / 2, 33), "lifeflowweb.com", font=SANS(23, "Medium"), fill=(90, 92, 88), anchor="mm")
    win.paste(shot.resize((bw, bh), Image.LANCZOS), (0, 66))
    win = rounded(win, 26)
    ImageDraw.Draw(win).rounded_rectangle((1, 1, bw - 2, bh + 64), radius=26, outline=(255, 255, 255, 255), width=3)
    dst = project(win.width, win.height, W / 2, 860, -9, 6, 0, 1.0)
    soft_shadow(im, dst, 120, 56, 70)
    warp_into(im, win, dst, fill=(247, 247, 245))
    d = ImageDraw.Draw(im)
    d.text((W / 2, 1265), "No download. Any phone or computer.", font=SANS(40, "Medium"), fill=GRAY, anchor="mm")
    f = SANS(52, "SemiBold")
    tw = d.textlength("lifeflowweb.com", font=f)
    d.rounded_rectangle((W / 2 - tw / 2 - 70, 1350, W / 2 + tw / 2 + 70, 1470), radius=60, fill=MOSS)
    d.text((W / 2, 1410), "lifeflowweb.com", font=f, fill=CREAM, anchor="mm")
    fi = SERIF_I(54)
    im.alpha_composite(word_img("Tap the link below", fi, INK), (int(W / 2 - d.textlength("Tap the link below", font=fi) / 2), 1530))
    d.line([(W / 2, 1625), (W / 2, 1685)], fill=INK, width=4)
    d.polygon([(W / 2 - 15, 1678), (W / 2 + 15, 1678), (W / 2, 1702)], fill=INK)
    im.convert("RGB").save(out, quality=95)


if __name__ == "__main__":
    if sys.argv[1] == "photos":
        story_meet("story_1_meet.jpg")
        story_web("story_3_web.jpg")
        print("photos ok")
    else:
        plan = json.load(open(sys.argv[1]))
        if len(sys.argv) > 2 and sys.argv[2] == "preview":
            render(plan, preview=[float(x) for x in sys.argv[3:]])
        else:
            render(plan, out=sys.argv[2])
