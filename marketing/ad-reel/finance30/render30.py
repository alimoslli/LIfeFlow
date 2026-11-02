"""Render the 30 s LifeFlow finance reel (1080x1920, 30 fps) from live-action clips, real-app recordings and overlays.

Inputs (relative to the working directory): clips/s1..s8.mp4, tut/<name>.mp4 (1080x2338), fonts/, logo.png.
Output: video.mp4 (no audio). Usage: python3 render30.py [preview t1 t2 ...]
"""
import subprocess, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
DUR = 30.0
BEAT = 2.6 / 4
DROP = 7.15
SEG_BEATS = [4, 5, 6, 5, 4, 4, 2]
B = [DROP + BEAT * sum(SEG_BEATS[:i]) for i in range(len(SEG_BEATS) + 1)]  # scene starts after the drop
END = B[-1]  # 26.65

MOSS = (40, 91, 69)
MINT = (140, 203, 180)
CREAM = (246, 242, 233)
RED = (214, 52, 52)


def font(name, size, var=None):
    f = ImageFont.truetype("fonts/" + name, size)
    if var:
        f.set_variation_by_name(var)
    return f


SANS_B = lambda s: font("Geist.ttf", s, "Bold")
SANS_X = lambda s: font("Geist.ttf", s, "ExtraBold")
SANS_M = lambda s: font("Geist.ttf", s, "Medium")
SERIF = lambda s: font("Newsreader.ttf", s, "Regular")
SERIF_I = lambda s: font("Newsreader-Italic.ttf", s, "Italic")


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def eo(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def eio(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def eback(x, s=1.6):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


# ---------------------------------------------------------------- video readers
class Clip:
    """Streams frames of `path` from `start`, played at `speed`, scaled to (w, h)."""

    def __init__(self, path, start, n, w, h, speed=1.0):
        vf = f"setpts=PTS/{speed},fps={FPS},scale={w}:{h}:flags=lanczos" if speed != 1 else f"fps={FPS},scale={w}:{h}:flags=lanczos"
        self.w, self.h, self.n = w, h, n
        self.p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", path, "-vf", vf, "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                                  stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        buf = self.p.stdout.read(self.w * self.h * 3)
        if len(buf) == self.w * self.h * 3:
            self.last = Image.frombuffer("RGB", (self.w, self.h), buf)
        return self.last


def grade(im, warm=0.0, sat=1.05, contrast=1.06):
    a = np.asarray(im).astype(np.float32) / 255
    a = (a - 0.5) * contrast + 0.5
    g = a.mean(axis=2, keepdims=True)
    a = g + (a - g) * sat
    if warm:
        a[..., 0] *= 1 + 0.08 * warm
        a[..., 2] *= 1 - 0.10 * warm
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


VIGNETTE = None


def vignette(im, strength=0.55):
    global VIGNETTE
    if VIGNETTE is None:
        y, x = np.mgrid[0:H, 0:W]
        d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
        VIGNETTE = np.clip(1 - (d - 0.55) * 0.9, 0, 1)[..., None]
    a = np.asarray(im).astype(np.float32)
    v = 1 - strength * (1 - VIGNETTE)
    return Image.fromarray((a * v).astype(np.uint8))


def punch(im, scale, cx=0.5, cy=0.5):
    """Zoom into the frame around (cx, cy) by `scale` (>= 1)."""
    if scale <= 1.001:
        return im
    w, h = W / scale, H / scale
    x0 = clamp(cx * W - w / 2, 0, W - w)
    y0 = clamp(cy * H - h / 2, 0, H - h)
    return im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))


def shake(im, amt, t):
    if amt <= 0.2:
        return im
    dx = int(amt * math.sin(t * 91.0))
    dy = int(amt * math.cos(t * 77.0))
    return punch(im, 1 + 2 * amt / W).transform((W, H), Image.AFFINE, (1, 0, dx, 0, 1, dy), Image.BICUBIC)


# ---------------------------------------------------------------- text helpers
def text_layer(lines, top, align="center"):
    """lines: [(text, font, fill)] -> RGBA layer W x 400 with a soft shadow."""
    lay = Image.new("RGBA", (W, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    y = 0
    boxes = []
    for txt, f, col in lines:
        tw = d.textlength(txt, font=f)
        x = (W - tw) / 2 if align == "center" else 80
        boxes.append((x, y, txt, f, col))
        bb = d.textbbox((0, 0), txt, font=f)
        y += (bb[3] - bb[1]) + int(f.size * 0.32)
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for x, y, txt, f, col in boxes:
        sd.text((x, y + 4), txt, font=f, fill=(0, 0, 0, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(12))
    lay.alpha_composite(sh)
    for x, y, txt, f, col in boxes:
        d.text((x, y), txt, font=f, fill=col + (255,))
    return lay


def place(canvas, layer, x, y, alpha=1.0, scale=1.0):
    if alpha <= 0.01:
        return
    l = layer
    if abs(scale - 1) > 0.005:
        l = l.resize((max(1, int(l.width * scale)), max(1, int(l.height * scale))), Image.BICUBIC)
        x += (layer.width - l.width) // 2
        y += (layer.height - l.height) // 2
    if alpha < 0.999:
        l = l.copy()
        l.putalpha(l.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(l, (int(x), int(y)))


def caption(canvas, text, t, t0, t1, accent=None):
    """Hook subtitles: bold white words, the accent word in mint, pop in, cut out."""
    if not (t0 <= t < t1):
        return
    f = SANS_X(66)
    lay = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    words = text.split(" ")
    widths = [d.textlength(w + " ", font=f) for w in words]
    x = (W - sum(widths) + d.textlength(" ", font=f)) / 2
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for w, ww in zip(words, widths):
        sd.text((x, 64), w, font=f, fill=(0, 0, 0, 200), stroke_width=6, stroke_fill=(0, 0, 0, 200))
        x += ww
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    lay.alpha_composite(sh)
    x = (W - sum(widths) + d.textlength(" ", font=f)) / 2
    for w, ww in zip(words, widths):
        col = MINT if accent and accent in w else (255, 255, 255)
        d.text((x, 60), w, font=f, fill=col + (255,), stroke_width=3, stroke_fill=(0, 0, 0, 255))
        x += ww
    k = eback((t - t0) / 0.18, 2.2)
    place(canvas, lay, 0, 1380, alpha=clamp((t - t0) / 0.06), scale=0.85 + 0.15 * k)


def declined_layer():
    f = SANS_X(92)
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = d0.textlength("DECLINED", font=f)
    w, h = int(tw + 200), 170
    lay = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((40, 50, 40 + w, 50 + h), radius=40, fill=(0, 0, 0, 150))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((40, 40, 40 + w, 40 + h), radius=40, fill=RED + (255,))
    cx, cy, r = 40 + 85, 40 + h // 2, 34
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, 255), width=8)
    for s in (1, -1):
        d.line((cx - 15, cy - 15 * s, cx + 15, cy + 15 * s), fill=(255, 255, 255, 255), width=8)
    d.text((40 + 150, 40 + h // 2 - 52), "DECLINED", font=f, fill=(255, 255, 255, 255))
    return lay


def tag_layer(text, sub):
    f, fs = SANS_X(84), SANS_M(40)
    d0 = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    w = int(max(d0.textlength(text, font=f), d0.textlength(sub, font=fs)) + 100)
    h = 190
    lay = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((40, 52, 40 + w, 52 + h), radius=34, fill=(0, 0, 0, 140))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((40, 40, 40 + w, 40 + h), radius=34, fill=(255, 255, 255, 245))
    d.text((90, 58), text, font=f, fill=RED + (255,))
    d.text((92, 160), sub, font=fs, fill=(70, 70, 70, 255))
    return lay.rotate(-4, resample=Image.BICUBIC, expand=True)


DECLINED = None
TAGS = None

# ---------------------------------------------------------------- hook plan
# (clip, out_start, out_end, src_start, speed)
HOOK = [
    ("clips/s1.mp4", 0.00, 1.60, 0.30, 1.0),
    ("clips/s2.mp4", 1.60, 2.40, 0.40, 1.0),
    ("clips/s3.mp4", 2.40, 3.05, 0.90, 1.15),
    ("clips/s4.mp4", 3.05, 3.70, 0.80, 1.15),
    ("clips/s5.mp4", 3.70, 4.35, 0.90, 1.15),
    ("clips/s6.mp4", 4.35, 5.30, 0.70, 1.1),
    ("clips/s7.mp4", 5.30, DROP, 0.50, 1.0),
]
TAP = 0.62
DECL_T = TAP + 0.33

# ---------------------------------------------------------------- tutorial plan
CARD_W, CARD_H = 940, 1480
CARD_X, CARD_Y = (W - CARD_W) // 2, 360
CARD_R = 58
SRC_W, SRC_H = 1080, 2338
# zoom keys: (t_in_segment, zoom, cx, cy) in source px; cy of the window centre
TUT = [
    dict(clip="tut/activity.mp4", src=0.55, speed=1.5, keys=[(0, 1.0, 540, 896), (1.2, 1.0, 540, 896), (2.6, 1.12, 540, 1050)],
         head=("Every transaction.", "One place.")),
    dict(clip="tut/search.mp4", src=0.45, speed=1.15, keys=[(0, 1.0, 540, 896), (0.4, 1.25, 540, 760), (1.4, 1.25, 540, 760), (1.9, 1.75, 320, 1150), (3.25, 1.8, 320, 1150)],
         head=("Search any spot.", "$12.52 at Starbucks.")),
    dict(clip="tut/where.mp4", src=0.25, speed=1.0, keys=[(0, 1.0, 540, 896), (1.9, 1.0, 540, 896), (2.5, 1.2, 540, 1290), (3.9, 1.23, 540, 1300)],
         head=("$827 on food.", "In one month.")),
    dict(clip="tut/subs.mp4", src=0.70, speed=1.3, keys=[(0, 1.0, 540, 896), (0.45, 1.0, 540, 896), (0.8, 1.6, 770, 870), (1.55, 1.65, 770, 870), (1.9, 1.0, 540, 1169), (3.25, 1.05, 540, 1300)],
         head=("$330 a year", "on forgotten subscriptions.")),
    dict(clip="tut/next30.mp4", src=0.30, speed=1.4, keys=[(0, 1.0, 540, 896), (1.0, 1.0, 540, 896), (1.5, 1.2, 540, 900), (2.6, 1.23, 540, 900)],
         head=("Rent at risk?", "It warns you first.")),
    dict(clip="tut/tabs.mp4", src=0.20, speed=1.65, keys=[(0, 1.05, 540, 1000), (2.6, 1.0, 540, 896)],
         head=("Classes. Shifts. To-dos.", "An AI that plans it all.")),
]

CARD_MASK = Image.new("L", (CARD_W, CARD_H), 0)
ImageDraw.Draw(CARD_MASK).rounded_rectangle((0, 0, CARD_W - 1, CARD_H - 1), radius=CARD_R, fill=255)
CARD_SHADOW = Image.new("RGBA", (CARD_W + 240, CARD_H + 240), (0, 0, 0, 0))
ImageDraw.Draw(CARD_SHADOW).rounded_rectangle((120, 150, 120 + CARD_W, 150 + CARD_H), radius=CARD_R, fill=(0, 0, 0, 170))
CARD_SHADOW = CARD_SHADOW.filter(ImageFilter.GaussianBlur(50))
CARD_RIM = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
ImageDraw.Draw(CARD_RIM).rounded_rectangle((0, 0, CARD_W - 1, CARD_H - 1), radius=CARD_R, outline=(255, 255, 255, 60), width=3)


def interp(keys, t):
    if t <= keys[0][0]:
        return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= t <= b[0]:
            k = eio((t - a[0]) / (b[0] - a[0]))
            return tuple(x + (y - x) * k for x, y in zip(a[1:], b[1:]))
    return keys[-1][1:]


def card_view(frame, z, cx, cy):
    ww = SRC_W / z
    hh = ww * CARD_H / CARD_W
    x0 = clamp(cx - ww / 2, 0, SRC_W - ww)
    y0 = clamp(cy - hh / 2, 0, SRC_H - hh)
    return frame.resize((CARD_W, CARD_H), Image.LANCZOS, box=(x0, y0, x0 + ww, y0 + hh))


BG = None


def tut_bg(t):
    k = 1.0 + 0.04 * (t - DROP) / (END - DROP)
    return punch(BG, k).convert("RGBA")


def headline(canvas, head, t, t0, t1):
    a, b = head
    lay = text_layer([(a, SANS_X(76), (255, 255, 255)), (b, SERIF_I(70), MINT)], 0)
    k_in = eo((t - t0 - 0.05) / 0.35)
    k_out = eo((t - (t1 - 0.18)) / 0.18)
    place(canvas, lay, 0, 110 + 40 * (1 - k_in) - 30 * k_out, alpha=k_in * (1 - k_out))


# ---------------------------------------------------------------- end card
LOGO = None


def end_frame(t, campus):
    lt = t - END
    base = campus
    blur_k = eio(lt / 0.5)
    if blur_k > 0:
        b = base.filter(ImageFilter.GaussianBlur(4 + 36 * blur_k))
        tint = Image.new("RGB", (W, H), (14, 32, 25))
        base = Image.blend(b, tint, 0.72 * blur_k)
    im = vignette(base, 0.4).convert("RGBA")
    a = eo((lt - 0.15) / 0.5)
    lw = int(230 * (0.8 + 0.2 * eback((lt - 0.15) / 0.6)))
    if a > 0:
        lg = LOGO.resize((lw, lw), Image.LANCZOS)
        place(im, lg, (W - lw) // 2, 560 - lw // 2 + 60, alpha=a)
    for txt, f, col, y, t0 in (("LifeFlow", SERIF(176), CREAM, 800, 0.25), ("Know where your money goes.", SERIF_I(66), MINT, 1030, 0.9)):
        lay = text_layer([(txt, f, col)], 0)
        k = eo((lt - t0) / 0.5)
        place(im, lay, 0, y + 30 * (1 - k), alpha=k)
    # link in bio pill
    k = eback((lt - 1.5) / 0.45)
    if lt > 1.5:
        f = SANS_B(44)
        tw = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength("Link in bio", font=f)
        pw, ph = int(tw + 110), 100
        pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        d = ImageDraw.Draw(pill)
        d.rounded_rectangle((0, 0, pw - 1, ph - 1), radius=50, fill=CREAM + (255,))
        d.text(((pw - tw) / 2, 22), "Link in bio", font=f, fill=(20, 40, 32, 255))
        place(im, pill, (W - pw) // 2, 1290, alpha=clamp((lt - 1.5) / 0.15), scale=0.7 + 0.3 * k)
    return im


# ---------------------------------------------------------------- main
def render(preview=None):
    global DECLINED, TAGS, BG, LOGO
    DECLINED = declined_layer()
    TAGS = [tag_layer("-$6.45", "iced latte"), tag_layer("-$38.20", "food delivery"), tag_layer("-$129.99", "late-night order")]
    LOGO = Image.open("logo.png").convert("RGBA")
    # tutorial background: the car shot, heavily blurred and darkened toward brand green
    c = Clip("clips/s7.mp4", 2.2, 1, W, H)
    bgf = c.next().filter(ImageFilter.GaussianBlur(46))
    BG = Image.blend(bgf, Image.new("RGB", (W, H), (10, 26, 20)), 0.62)
    BG = vignette(BG, 0.5)

    times = preview if preview else [i / FPS for i in range(int(DUR * FPS))]
    out = None
    if not preview:
        out = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "video.mp4"], stdin=subprocess.PIPE)
    readers = {}

    def reader(key, make):
        if preview:
            return make(seek=True)
        if key not in readers:
            readers[key] = make(seek=False)
        return readers[key]

    for idx, t in enumerate(times):
        if t < DROP:  # ---------------- hook
            seg = next(s for s in HOOK if s[1] <= t < s[2])
            path, o0, o1, s0, sp = seg
            n = int(round((o1 - o0) * FPS)) + 2
            lt = t - o0
            if preview:
                fr = Clip(path, s0 + lt * sp, 1, W, H).next()
            else:
                r = reader(path, lambda seek: Clip(path, s0, n, W, H, sp))
                fr = r.next()
            memory = path in ("clips/s3.mp4", "clips/s4.mp4", "clips/s5.mp4")
            fr = grade(fr, warm=0.8 if memory else 0.0, sat=0.9 if memory else 1.04)
            if path == "clips/s2.mp4":
                fr = punch(fr, 1.0 + 0.16 * eo(lt / 0.8), 0.5, 0.42)
            if memory:
                fr = punch(fr, 1.04 + 0.05 * lt / 0.65)
                soft = fr.filter(ImageFilter.GaussianBlur(10))
                fr = Image.blend(fr, soft, 0.25)
            if path == "clips/s7.mp4":
                k = eio((t - (DROP - 0.3)) / 0.3)
                fr = punch(fr, 1 + 0.8 * k, 0.62, 0.48)
                if k > 0:
                    fr = Image.blend(fr, fr.filter(ImageFilter.GaussianBlur(14)), k)
            if path == "clips/s1.mp4":
                fr = shake(fr, 9 * max(0, 1 - (t - DECL_T) / 0.35) if t >= DECL_T else 0, t)
            fr = vignette(fr, 0.6 if memory else 0.45)
            im = fr.convert("RGBA")
            # white flash into each memory and out
            for fl in (2.40, 3.05, 3.70, 4.35):
                if fl - 0.02 <= t < fl + 0.1:
                    a = 0.85 * (1 - (t - fl + 0.02) / 0.12)
                    im = Image.blend(im, Image.new("RGBA", (W, H), (255, 255, 255, 255)), clamp(a))
            if DECL_T <= t < 1.62:
                k = eback((t - DECL_T) / 0.2, 2.4)
                place(im, DECLINED, (W - DECLINED.width) // 2, 840, alpha=clamp((t - DECL_T) / 0.05), scale=0.6 + 0.4 * k)
            for i, fl in enumerate((2.40, 3.05, 3.70)):
                if fl + 0.08 <= t < fl + 0.65:
                    k = eback((t - fl - 0.08) / 0.18, 2.0)
                    tg = TAGS[i]
                    place(im, tg, 600 - tg.width // 2 + (i - 1) * 50, 1060 + (i % 2) * 40, alpha=clamp((t - fl - 0.08) / 0.05), scale=0.6 + 0.4 * k)
            caption(im, "Declined?", t, 1.62, 2.40)
            caption(im, "I literally just got paid.", t, 2.45, 4.35)
            caption(im, "Where did it all go?", t, 4.45, 5.62)
            caption(im, "So I opened LifeFlow.", t, 5.75, DROP, accent="LifeFlow")
        elif t < B[6]:  # ---------------- tutorial
            si = max(i for i in range(6) if B[i] <= t)
            sc = TUT[si]
            lt = t - B[si]
            n = int(round((B[si + 1] - B[si]) * FPS)) + 2
            if preview:
                fr = Clip(sc["clip"], sc["src"] + lt * sc["speed"], 1, SRC_W, SRC_H).next()
            else:
                r = reader(sc["clip"], lambda seek: Clip(sc["clip"], sc["src"], n, SRC_W, SRC_H, sc["speed"]))
                fr = r.next()
            z, cx, cy = interp(sc["keys"], lt)
            view = card_view(fr, z, cx, cy).convert("RGBA")
            view.alpha_composite(CARD_RIM)
            im = tut_bg(t)
            # card entrance (first scene) and a small settle on every cut
            if si == 0:
                k = eo(lt / 0.45)
                dy, sc_k, a = int(380 * (1 - k)), 0.92 + 0.08 * k, k
            else:
                k = eo(lt / 0.25)
                dy, sc_k, a = int(26 * (1 - k)), 0.985 + 0.015 * k, 1.0
            place(im, CARD_SHADOW, CARD_X - 120, CARD_Y - 120 + dy, alpha=a)
            card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
            card.paste(view, (0, 0), CARD_MASK)
            place(im, card, CARD_X, CARD_Y + dy, alpha=a, scale=sc_k)
            headline(im, sc["head"], t, B[si], B[si + 1])
            if si == 0 and lt < 0.12:  # flash from the punch-in
                im = Image.blend(im, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.6 * (1 - lt / 0.12))
        else:  # ---------------- campus + end card
            lt = t - B[6]
            n = int(round((DUR - B[6]) * FPS)) + 2
            if preview:
                fr = Clip("clips/s8.mp4", min(3.9, 0.3 + lt), 1, W, H).next()
            else:
                fr = reader("clips/s8.mp4", lambda seek: Clip("clips/s8.mp4", 0.3, n, W, H)).next()
            fr = grade(fr, warm=0.3)
            if t < END:
                im = vignette(fr, 0.4).convert("RGBA")
                headline(im, ("Now I know", "where every dollar goes."), t, B[6], END + 0.2)
            else:
                im = end_frame(t, fr)
        rgb = im.convert("RGB")
        if preview:
            rgb.save(f"prev_{t:05.2f}.png")
        else:
            out.stdin.write(rgb.tobytes())
            if idx % 60 == 0:
                print("frame", idx, flush=True)
    if out:
        out.stdin.close()
        out.wait()


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "preview":
        render([float(x) for x in sys.argv[2:]])
    else:
        render()
