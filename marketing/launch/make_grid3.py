"""LifeFlow Instagram grid v3: nine connected 3:4 posts (1080x1440) plus 9:16 Reel covers for the middle column.

Same idea as v2 (posts that stand alone but connect to their neighbours), refined: real app screens with
the new demo data, sage-glass 3D (keyed renders of the brand molecule and glass orbs) sitting on the seams,
and copy that never names the assistant. Runs next to launch.py (same fonts/, g/, shots/, cards/).
Writes grid/post_N_of_9.jpg (N = posting order), grid/cover_r{0,1,2}.png (1080x1920), grid/profile_preview.png.
"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import launch as L

GW, GH, TW, TH = 3240, 4320, 1080, 1440
INK, GRAY, MOSS, SAGE, CREAM = L.INK, L.GRAY, L.MOSS, L.SAGE, L.CREAM
SERIF, SERIF_I, SANS = L.SERIF, L.SERIF_I, L.SANS
L.assets()
os.makedirs("grid", exist_ok=True)

# ---------------------------------------------------------------- background: a pure function of canvas position
GLOWS = [(2160, 760, 700, SAGE, 0.16), (1080, 2160, 760, SAGE, 0.14), (2160, 3560, 700, SAGE, 0.15),
         (420, 560, 620, (246, 230, 206), 0.30), (2860, 2140, 620, (246, 230, 206), 0.28), (520, 3700, 620, (246, 230, 206), 0.26)]


def background(x0, y0, w, h):
    yy, xx = np.mgrid[y0:y0 + h, x0:x0 + w].astype(np.float32)
    col = np.full((h, w, 3), 255.0, np.float32)
    for cx, cy, r, c, a in GLOWS:
        k = a * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (r * 0.62) ** 2))
        col = col * (1 - k[..., None]) + np.array(c, np.float32) * k[..., None]
    return Image.fromarray(col.clip(0, 255).astype(np.uint8)).convert("RGBA")


im = background(0, 0, GW, GH)


# ---------------------------------------------------------------- drawing helpers (canvas-size aware)
def warp_onto(img, dst, fill=(0, 0, 0), alpha=1.0):
    xs, ys = [p[0] for p in dst], [p[1] for p in dst]
    x0, y0 = max(0, int(min(xs)) - 2), max(0, int(min(ys)) - 2)
    x1, y1 = min(GW, int(max(xs)) + 3), min(GH, int(max(ys)) + 3)
    w, h = img.size
    local = [(x - x0, y - y0) for x, y in dst]
    out = img.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, L.homography([(0, 0), (w, 0), (w, h), (0, h)], local), Image.BICUBIC, fillcolor=fill + (0,))
    im.alpha_composite(L.with_alpha(out, alpha), (x0, y0))


def shadow_onto(dst, alpha, blur, dy, dx=0):
    xs, ys = [p[0] for p in dst], [p[1] for p in dst]
    pad = int(blur * 3 + abs(dy) + abs(dx))
    x0, y0 = int(min(xs)) - pad, int(min(ys)) - pad
    w, h = int(max(xs) - min(xs)) + 2 * pad, int(max(ys) - min(ys)) + 2 * pad
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon([(x - x0 + dx, y - y0 + dy) for x, y in dst], fill=int(alpha))
    m = m.filter(ImageFilter.GaussianBlur(blur))
    lay = Image.new("RGBA", (w, h), (22, 42, 32, 0))
    lay.putalpha(m)
    canvas_paste(lay, x0, y0)


def canvas_paste(lay, x, y):
    """alpha_composite that tolerates negative offsets / overflow."""
    x, y = int(x), int(y)
    sx, sy = max(0, -x), max(0, -y)
    if sx >= lay.width or sy >= lay.height:
        return
    crop = lay.crop((sx, sy, min(lay.width, GW - x), min(lay.height, GH - y)))
    im.alpha_composite(crop, (x + sx, y + sy))


def phone(shot, cx, cy, scale, ry=-10, rx=6, rz=0, glare=0.4):
    scr = Image.open(f"shots/{shot}.png").convert("RGB").resize((L.SW, L.SH), Image.LANCZOS)
    ph = L.glass_phone(scr, glare)
    dst = L.project(ph.width, ph.height, cx, cy, ry, rx, rz, scale)
    shadow_onto(dst, 110, 46, 70, 18)
    warp_onto(ph, dst, fill=(24, 26, 25))
    return dst


def card(name, cx, cy, width, ry=-8, rx=5, rz=0, crop=None, sheen=0.45):
    c = Image.open(f"cards/{name}.png").convert("RGB")
    if crop:
        c = c.crop(crop)
    c = c.resize((width, int(c.height * width / c.width)), Image.LANCZOS)
    r = int(width * 0.05)
    c = L.rounded(c, r)
    ImageDraw.Draw(c).rounded_rectangle((1, 1, c.width - 2, c.height - 2), radius=r, outline=(255, 255, 255, 235), width=3)
    if sheen:  # one soft glass sheen
        sh = Image.new("L", c.size, 0)
        x = c.width * sheen
        ImageDraw.Draw(sh).polygon([(x, 0), (x + 120, 0), (x - 160, c.height), (x - 280, c.height)], fill=46)
        sh = L.ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(30)), c.getchannel("A"))
        wl = Image.new("RGBA", c.size, (255, 255, 255, 0))
        wl.putalpha(sh)
        c.alpha_composite(wl)
    dst = L.project(c.width, c.height, cx, cy, ry, rx, rz, 1.0)
    shadow_onto(dst, 70, 34, 44, 10)
    warp_onto(c, dst, fill=(250, 248, 243))
    return dst


def text(x, y, s, f, col, anchor="la"):
    ImageDraw.Draw(im).text((x, y), s, font=f, fill=col, anchor=anchor)


def eyebrow(x, y, s, center=False):
    lay = L.tracked_layer(s, SANS(32, "SemiBold"), MOSS, 6)
    canvas_paste(lay, x - (lay.width / 2 if center else 0), y)


def wrap(s, f, width):
    d = ImageDraw.Draw(im)
    lines, cur = [], ""
    for w in s.split(" "):
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def body(x, y, s, width=820, size=42, col=GRAY, lh=1.42):
    f = SANS(size, "Regular")
    for i, line in enumerate(wrap(s, f, width)):
        text(x, y + i * size * lh, line, f, col)
    return y + len(wrap(s, f, width)) * size * lh


def ball(cx, cy, size, src=("g/g2.png", 461, 650, 150), blur=0):
    b = L.glass_ball(src[0], src[1], src[2], src[3], size, blur)
    sh = Image.new("L", (size * 2, size), 0)
    ImageDraw.Draw(sh).ellipse((size * 0.45, size * 0.38, size * 1.55, size * 0.62), fill=90)
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.09))
    lay = Image.new("RGBA", sh.size, (22, 52, 38, 0))
    lay.putalpha(sh)
    canvas_paste(lay, cx - size, cy + size * 0.32)
    canvas_paste(b, cx - size / 2, cy - size / 2)


def pill(cx, cy, s, size=52, padx=78, h=128):
    f = SANS(size, "SemiBold")
    d = ImageDraw.Draw(im)
    tw = d.textlength(s, font=f)
    d.rounded_rectangle((cx - tw / 2 - padx, cy - h / 2, cx + tw / 2 + padx, cy + h / 2), radius=h / 2, fill=MOSS)
    text(cx, cy, s, f, CREAM, "mm")


# ---------------------------------------------------------------- the connecting line (as v2, refined) with glass beads
def rounded_path(pts, r, steps=20):
    out = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        rr = min(r, math.dist(a, b) / 2, math.dist(b, c) / 2)
        p0 = (b[0] + (a[0] - b[0]) * rr / math.dist(a, b), b[1] + (a[1] - b[1]) * rr / math.dist(a, b))
        p2 = (b[0] + (c[0] - b[0]) * rr / math.dist(b, c), b[1] + (c[1] - b[1]) * rr / math.dist(b, c))
        for k in range(steps + 1):
            t = k / steps
            out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]))
    out.append(pts[-1])
    return out


LINE = rounded_path([(150, 1330), (3176, 1330), (3176, 2770), (64, 2770), (64, 4250), (2330, 4250)], 150)
glow = Image.new("L", (GW, GH), 0)
ImageDraw.Draw(glow).line(LINE, fill=120, width=22, joint="curve")
gl = Image.new("RGBA", (GW, GH), SAGE + (0,))
gl.putalpha(glow.filter(ImageFilter.GaussianBlur(14)))
im.alpha_composite(gl)
ImageDraw.Draw(im).line(LINE, fill=(122, 176, 146), width=7, joint="curve")

# ================================================================= ROW 1
# (0,0) hero
logo = L.LOGO.resize((150, 150), Image.LANCZOS)
im.alpha_composite(logo, (104, 118))
text(276, 193, "LifeFlow", SERIF(92), INK, "lm")
g1 = Image.open("g/g1.png").convert("RGB")
g1 = g1.resize((560, int(560 * g1.height / g1.width)), Image.LANCZOS)
mol = L.key_white(g1)
fade = np.clip((g1.height * 0.78 - np.arange(g1.height)) / (g1.height * 0.07), 0, 1)
mol.putalpha(Image.fromarray((np.asarray(mol.getchannel("A")) * fade[:, None]).astype(np.uint8)))
canvas_paste(mol, 600, -200)
text(104, 400, "Your whole", SERIF(150), INK)
text(104, 568, "life, in", SERIF(150), INK)
text(104, 736, "one flow.", SERIF_I(150), MOSS)
body(110, 980, "Your finances, classes, work and more, synced to your personal assistant.", width=800, size=44, col=GRAY)
ball(150, 1330, 96)

# (0,1) Reel cover: your day (phone fully inside the post)
phone("today", 1620, 700, 0.74, ry=-12, rx=6, rz=-2)
card("next", 1560, 1010, 700, ry=-6, rx=4)
ball(1080, 300, 170, blur=1)

# (0,2) your day
eyebrow(2270, 190, "YOUR DAY")
text(2264, 262, "Your day,", SERIF(108), INK)
text(2264, 388, "already planned.", SERIF_I(108), MOSS)
body(2270, 560, "Classes, shifts and deadlines in one calendar. Open the app and know exactly what's next.", width=820)
card("week", 2700, 1000, 820, ry=-7, rx=5)

# ================================================================= ROW 2
# (1,0) money
eyebrow(130, 1630, "MONEY")
text(124, 1702, "See where", SERIF(108), INK)
text(124, 1828, "every dollar", SERIF(108), INK)
text(124, 1954, "goes.", SERIF_I(108), MOSS)
body(130, 2130, "Every account and every purchase, in one clear view.", width=800)
plaid = L.glass_pill("plaid", "")
plaid = plaid.resize((int(plaid.width * 1.08), int(plaid.height * 1.08)), Image.LANCZOS)
canvas_paste(plaid, 540 - plaid.width / 2, 2440)

# (1,1) Reel cover: money
phone("budgets", 1640, 2140, 0.74, ry=12, rx=6, rz=2)
card("available", 1500, 2560, 640, ry=8, rx=5, crop=(0, 0, 1050, 340))
ball(2160, 1700, 150, src=("g/g2.png", 1090, 1995, 175), blur=1)

# (1,2) money coach
eyebrow(2290, 1630, "YOUR MONEY COACH")
text(2284, 1702, "Budget smarter.", SERIF(100), INK)
text(2284, 1820, "Save faster.", SERIF(100), INK)
text(2284, 1938, "Invest more.", SERIF_I(100), MOSS)
body(2290, 2100, "Your assistant spots overspending and helps you turn it into savings.", width=800)
card("invest", 2700, 2560, 700, ry=-7, rx=5, crop=(0, 0, 1050, 690))
ball(2930, 2880, 200)

# ================================================================= ROW 3
# (2,0) your assistant
eyebrow(200, 3020, "YOUR PERSONAL ASSISTANT")
text(194, 3092, "One assistant.", SERIF(108), INK)
text(194, 3218, "Your whole life.", SERIF_I(108), MOSS)
y = 3420
for s in ["Plans your week", "Builds your budget", "Grows your savings", "Helps you invest more", "Breaks overspending habits"]:
    chip = L.glass_pill("chip", s)
    canvas_paste(chip, 170, y)
    y += 150
ball(860, 2880, 150, blur=1)

# (2,1) Reel cover: meet your assistant
phone("assistant", 1640, 3570, 0.74, ry=-12, rx=6, rz=-2)

# (2,2) call to action
eyebrow(2700, 3010, "AVAILABLE NOW", center=True)
text(2700, 3150, "Live on", SERIF(124), INK, "mm")
text(2700, 3290, "the web.", SERIF_I(124), MOSS, "mm")
shot = Image.open("shots/desktop_today.png").convert("RGB")
bw = 760
bh = int(bw * shot.height / shot.width)
win = Image.new("RGBA", (bw, bh + 52), (0, 0, 0, 0))
wd = ImageDraw.Draw(win)
wd.rounded_rectangle((0, 0, bw - 1, bh + 51), radius=22, fill=(247, 247, 245, 255))
for i, c in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
    wd.ellipse((20 + i * 26, 19, 34 + i * 26, 33), fill=c)
wd.rounded_rectangle((bw / 2 - 170, 11, bw / 2 + 170, 41), radius=15, fill=(233, 233, 230, 255))
wd.text((bw / 2, 26), "lifeflowweb.com", font=SANS(19, "Medium"), fill=(90, 92, 88), anchor="mm")
win.paste(shot.resize((bw, bh), Image.LANCZOS), (0, 52))
win = L.rounded(win, 22)
ImageDraw.Draw(win).rounded_rectangle((1, 1, bw - 2, bh + 50), radius=22, outline=(255, 255, 255, 255), width=3)
dst = L.project(win.width, win.height, 2700, 3700, -8, 5, 0, 1.0)
shadow_onto(dst, 100, 40, 56)
warp_onto(win, dst, fill=(247, 247, 245))
pill(2700, 4060, "Link in bio")
text(2700, 4170, "lifeflowweb.com  ·  No download needed", SANS(34, "Medium"), GRAY, "mm")
ball(2330, 4250, 96)
text(2700, 4268, "App shown with sample data.", SANS(24, "Regular"), (160, 162, 156), "mm")

# ---------------------------------------------------------------- export
full = im.convert("RGB")
full.save("grid/grid_full.png")
order = [(r, c) for r in (2, 1, 0) for c in (2, 1, 0)]  # Instagram shows the newest post top-left
for n, (r, c) in enumerate(order, 1):
    full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)).save(f"grid/post_{n}_of_9.jpg", quality=95, subsampling=0)
for r in range(3):  # 9:16 Reel covers: the post in the middle, the same background above and below
    cov = background(TW, r * TH - 240, TW, 1920)
    cov.alpha_composite(im.crop((TW, r * TH, 2 * TW, (r + 1) * TH)), (0, 240))
    cov.convert("RGB").save(f"grid/cover_r{r}.png")
gap = 12
prof = Image.new("RGB", (3 * TW + 2 * gap, 3 * TH + 2 * gap), "white")
for r in range(3):
    for c in range(3):
        prof.paste(full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)), (c * (TW + gap), r * (TH + gap)))
prof.resize((prof.width // 4, prof.height // 4), Image.LANCZOS).save("grid/profile_preview.png")
print("grid ok")
