"""Three grid Reels (1080x1920). Each starts and ends on its grid tile (centre 1080x1440 = the post),
then turns into a phone playing a real recording of the app with step captions."""
import math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

D = os.path.dirname(os.path.abspath(__file__)) + "/"
S = D + "../"
F = S + "fonts/"
W, H, FPS = 1080, 1920, 30
TW, TH = 1080, 1440
INK, GRAY, MOSS = (23, 23, 21), (110, 112, 106), (40, 91, 69)
FULL = Image.open(D + "out/LifeFlow_grid_full.png").convert("RGB")


def font(n, s, v=None):
    f = ImageFont.truetype(F + n, s)
    if v:
        f.set_variation_by_name(v)
    return f


SERIF = lambda s: font("Newsreader.woff2", s)
SERIF_I = lambda s: font("Newsreader-Italic.woff2", s)
SANS = lambda s, v="Medium": font("Geist.woff2", s, v)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def eo(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def eio(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def eback(x, s=1.3):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def cover(row, col):
    """1080x1920 frame whose centre 1080x1440 is exactly the grid tile."""
    c = Image.new("RGB", (W, H), (255, 255, 255))
    y0 = row * TH - 240
    src = FULL.crop((col * TW, max(0, y0), (col + 1) * TW, min(FULL.height, y0 + H)))
    c.paste(src, (0, max(0, -y0)))
    if y0 + H > FULL.height:  # extend the last rows of the image downward softly
        strip = FULL.crop((col * TW, FULL.height - 2, (col + 1) * TW, FULL.height)).resize((W, y0 + H - FULL.height))
        c.paste(strip, (0, FULL.height - y0))
    return c


# background for the playing part: white with a whisper of sage
_bg = Image.new("RGBA", (W, H), (255, 255, 255, 255))
_g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(_g).ellipse((-200, 700, 1280, 2200), fill=(140, 203, 180, 50))
ImageDraw.Draw(_g).ellipse((500, -300, 1500, 700), fill=(246, 236, 220, 70))
_bg.alpha_composite(_g.filter(ImageFilter.GaussianBlur(220)))
BG = _bg.convert("RGB")

# ---------------------------------------------------------------- phone
SW = 660
SH = int(SW * 2338 / 1080)
B = 20
SR = 92
STATUS = 64
MASK = Image.new("L", (SW, SH), 0)
ImageDraw.Draw(MASK).rounded_rectangle((0, 0, SW - 1, SH - 1), radius=SR, fill=255)
FRAME = Image.new("RGBA", (SW + 2 * B, SH + 2 * B), (0, 0, 0, 0))
_d = ImageDraw.Draw(FRAME)
_d.rounded_rectangle((0, 0, FRAME.width - 1, FRAME.height - 1), radius=SR + B, fill=(18, 19, 18, 255))
_d.rounded_rectangle((3, 3, FRAME.width - 4, FRAME.height - 4), radius=SR + B - 3, outline=(120, 126, 121, 255), width=3)


def status_bar():
    s = Image.new("RGBA", (SW, STATUS), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.text((48, 18), "8:35", font=SANS(30, "SemiBold"), fill=INK)
    bx = SW - 44
    d.rounded_rectangle((bx - 42, 24, bx, 44), radius=6, outline=INK, width=2)
    d.rounded_rectangle((bx - 39, 27, bx - 10, 41), radius=3, fill=INK)
    for i in range(4):
        h = 7 + i * 4
        d.rounded_rectangle((bx - 108 + i * 9, 44 - h, bx - 102 + i * 9, 44), radius=1, fill=INK)
    d.rounded_rectangle((SW / 2 - 100, 14, SW / 2 + 100, 68), radius=27, fill=(0, 0, 0, 255))
    return s


STAT = status_bar()


def phone(frame):
    scr = Image.new("RGBA", (SW, SH), (246, 242, 233, 255))
    body = frame.resize((SW, SH), Image.LANCZOS).convert("RGBA")
    scr.alpha_composite(body.crop((0, 0, SW, SH - STATUS)), (0, STATUS))
    scr.alpha_composite(body.crop((0, 0, SW, 2)).resize((SW, STATUS)), (0, 0))
    scr.alpha_composite(STAT)
    ph = FRAME.copy()
    ph.paste(scr, (B, B), MASK)
    return ph


def homography(src, dst):
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        b += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def project(w, h, cx, cy, ry, rx, scale, f=2200.0):
    ry, rx = math.radians(ry), math.radians(rx)
    pts = []
    for (x, y) in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        x, y = x * scale, y * scale
        X, Z = x * math.cos(ry), x * math.sin(ry)
        Y, Z = y * math.cos(rx) - Z * math.sin(rx), y * math.sin(rx) + Z * math.cos(rx)
        k = f / (f + Z)
        pts.append((cx + X * k, cy + Y * k))
    return pts


def warp(img, dst):
    w, h = img.size
    return img.transform((W, H), Image.PERSPECTIVE, homography([(0, 0), (w, 0), (w, h), (0, h)], dst), Image.BICUBIC, fillcolor=(0, 0, 0, 0))


def shadow(dst, alpha):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).polygon([(x + 10, y + 60) for x, y in dst], fill=(25, 45, 35, int(alpha)))
    return lay.filter(ImageFilter.GaussianBlur(55))


# ---------------------------------------------------------------- recordings
class Reader:
    def __init__(self, path, start, speed, n):
        vf = f"setpts=PTS/{speed},fps={FPS}"
        self.p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", path, "-vf", vf, "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        b = self.p.stdout.read(1080 * 2338 * 3)
        if len(b) == 1080 * 2338 * 3:
            self.last = Image.frombuffer("RGB", (1080, 2338), b)
        return self.last


def caption(im, step, title, sub, a, dy):
    lay = Image.new("RGBA", (W, 330), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    y = 0
    if step:
        f = SANS(34, "SemiBold")
        tw = d.textlength(step, font=f)
        d.rounded_rectangle(((W - tw) / 2 - 26, 0, (W + tw) / 2 + 26, 58), radius=29, fill=(232, 241, 234, 255))
        d.text(((W - tw) / 2, 9), step, font=f, fill=MOSS)
        y = 84
    f1 = SERIF(76)
    w1 = d.textlength(title, font=f1)
    d.text(((W - w1) / 2, y), title, font=f1, fill=INK)
    if sub:
        f2 = SERIF_I(60)
        w2 = d.textlength(sub, font=f2)
        d.text(((W - w2) / 2, y + 98), sub, font=f2, fill=MOSS)
    if a < 1:
        lay.putalpha(lay.getchannel("A").point(lambda v: int(v * a)))
    im.alpha_composite(lay, (0, int(70 + dy)))


def render(name, row, col, segs, out_dir):
    """segs: [(rec_path, src_start, speed, dur, step, title, sub)]"""
    cov = cover(row, col)
    cov.save(out_dir + f"{name}_cover.jpg", quality=95)
    INTRO, OUTRO = 1.25, 1.3
    body = sum(s[3] for s in segs)
    T = INTRO + body + OUTRO
    n = int(round(T * FPS))
    ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest",
                           "-c:v", "libx264", "-profile:v", "high", "-level", "4.1", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out_dir + f"{name}.mp4"], stdin=subprocess.PIPE)
    readers = {}
    starts = []
    t0 = INTRO
    for s in segs:
        starts.append(t0)
        t0 += s[3]
    PH_CY = 1170
    for i in range(n):
        t = i / FPS
        # which recording frame
        if t < INTRO:
            si, lt = 0, 0.0
        elif t >= INTRO + body:
            si, lt = len(segs) - 1, segs[-1][3]
        else:
            si = max(k for k in range(len(segs)) if starts[k] <= t)
            lt = t - starts[si]
        path, st, sp, dur, step, title, sub = segs[si]
        key = si
        if key not in readers:
            readers[key] = Reader(path, st, sp, int(round(dur * FPS)) + 2)
        fr = readers[key].next() if INTRO <= t < INTRO + body else (readers[key].next() if readers[key].last is None else readers[key].last)
        im = BG.copy().convert("RGBA")
        # phone entrance / exit (3D settle)
        k_in = eback((t - 0.55) / 0.75)
        k_out = eio((t - (T - OUTRO)) / 0.42)
        ry = -28 * (1 - eo((t - 0.55) / 0.9)) + 1.5 * math.sin(t * 0.9) + 20 * k_out
        rx = 10 * (1 - eo((t - 0.55) / 0.9)) + 1.2 * math.sin(t * 0.7)
        scale = (0.52 + 0.41 * k_in) * (1 - 0.25 * k_out)
        cy = PH_CY + 500 * (1 - eo((t - 0.55) / 0.8)) + 60 * k_out
        ph = phone(fr)
        dst = project(ph.width, ph.height, W / 2, cy, ry, rx, scale)
        alpha = clamp((t - 0.5) / 0.25) * (1 - k_out)
        if alpha > 0:
            sh = shadow(dst, 110 * alpha)
            pw = warp(ph, dst)
            if alpha < 1:
                pw.putalpha(pw.getchannel("A").point(lambda v: int(v * alpha)))
            im.alpha_composite(sh)
            im.alpha_composite(pw)
        # captions per segment
        if INTRO - 0.1 <= t < INTRO + body:
            a = eo((lt - 0.05) / 0.35) * (1 - eo((lt - (dur - 0.25)) / 0.25)) if t >= INTRO else 0
            caption(im, step, title, sub, a, 20 * (1 - eo(lt / 0.35)))
        # outro: logo + link in bio
        if t >= T - OUTRO:
            lt2 = t - (T - OUTRO)
            a = eo((lt2 - 0.38) / 0.3) * (1 - eo((lt2 - 0.95) / 0.2))
            if a > 0:
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                d = ImageDraw.Draw(lay)
                lg = Image.open(S + "cap/logo.png").convert("RGBA").resize((150, 150), Image.LANCZOS)
                lay.alpha_composite(lg, (W // 2 - 75, 700))
                f = SERIF(120)
                tw = d.textlength("LifeFlow", font=f)
                d.text(((W - tw) / 2, 870), "LifeFlow", font=f, fill=INK)
                pf = SANS(50, "SemiBold")
                pw_ = d.textlength("Link in bio", font=pf)
                d.rounded_rectangle((W / 2 - pw_ / 2 - 70, 1080, W / 2 + pw_ / 2 + 70, 1200), radius=60, fill=MOSS)
                d.text((W / 2 - pw_ / 2, 1106), "Link in bio", font=pf, fill=(246, 242, 233))
                lay.putalpha(lay.getchannel("A").point(lambda v: int(v * a)))
                im.alpha_composite(lay)
        rgb = im.convert("RGB")
        # cover at the start, dissolving out; dissolving back in at the end for a seamless loop
        if t < 0.55:
            rgb = cov
        elif t < 0.95:
            k = eio((t - 0.55) / 0.4)
            c2 = cov.resize((int(W * (1 + 0.08 * k)), int(H * (1 + 0.08 * k))), Image.BICUBIC)
            c2 = c2.crop(((c2.width - W) // 2, (c2.height - H) // 2, (c2.width - W) // 2 + W, (c2.height - H) // 2 + H))
            rgb = Image.blend(c2, rgb, k)
        if t >= T - 0.4:
            rgb = Image.blend(rgb, cov, eio((t - (T - 0.4)) / 0.35))
        ff.stdin.write(rgb.tobytes())
    ff.stdin.close()
    ff.wait()
    print(name, "done", round(T, 2), "s")


if __name__ == "__main__":
    out = D + "out/"
    R = S + "tut/"
    which = sys.argv[1:] or ["tour", "money", "sage"]
    if "tour" in which:
        render("reel_post5_tour", 1, 1, [
            (R + "tour.mp4", 0.0, 1.15, 2.8, "TODAY", "What's next, at a glance.", None),
            (R + "tour.mp4", 3.2, 1.15, 2.6, "PLAN", "Classes and shifts,", "one calendar."),
            (R + "tour.mp4", 6.2, 1.15, 2.6, "MONEY", "Know what you", "actually have."),
            (R + "tour.mp4", 9.2, 1.0, 2.5, "SAGE", "Your assistant", "texts you first."),
        ], out)
    if "money" in which:
        render("reel_post4_money", 1, 2, [
            (R + "activity.mp4", 0.55, 1.3, 3.2, "STEP 1", "Every transaction,", "in one place."),
            (R + "search.mp4", 0.4, 1.2, 3.3, "STEP 2", "Search any spot.", "$12.52 at Starbucks."),
            (R + "where.mp4", 0.3, 1.1, 3.4, "STEP 3", "See where it went.", None),
            (R + "subs.mp4", 0.35, 1.25, 3.4, "STEP 4", "Catch forgotten", "subscriptions."),
        ], out)
    if "sage" in which:
        render("reel_post1_sage", 2, 2, [
            (R + "block.mp4", 0.0, 1.0, 2.2, "SAGE NOTICED", "Quiz vs. your shift?", "Block it."),
            (R + "block.mp4", 2.4, 1.25, 3.0, "DONE", "Study time,", "on your calendar."),
            (R + "remind.mp4", 0.0, 1.0, 3.0, "BILL DUE", "One tap.", "Reminder set."),
            (R + "move.mp4", 0.0, 1.0, 3.0, "SLIPPED TO-DO", "Moved to tomorrow.", None),
        ], out)
