"""LifeFlow 9-post grid v2: nine posts that each stand alone but connect to their neighbours
(phones and lines crossing post edges). Canvas 3240x4320 -> nine 1080x1440 posts."""
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

D = os.path.dirname(os.path.abspath(__file__)) + "/"
F = D + "../fonts/"
W, H, TW, TH = 3240, 4320, 1080, 1440
INK, GRAY, MOSS, SAGE, CREAM = (23, 23, 21), (108, 110, 104), (40, 91, 69), (150, 196, 166), (246, 242, 233)


def font(n, s, v=None):
    f = ImageFont.truetype(F + n, s)
    if v:
        f.set_variation_by_name(v)
    return f


SERIF = lambda s: font("Newsreader.woff2", s)
SERIF_I = lambda s: font("Newsreader-Italic.woff2", s)
SANS = lambda s, v="Medium": font("Geist.woff2", s, v)

im = Image.new("RGBA", (W, H), (255, 255, 255, 255))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
for (cx, cy, r, col) in [(2160, 720, 760, (150, 196, 166, 46)), (1080, 2160, 760, (150, 196, 166, 40)), (2160, 3600, 760, (150, 196, 166, 46)),
                         (500, 600, 600, (246, 232, 212, 70)), (2700, 2100, 600, (246, 232, 212, 70)), (500, 3600, 600, (246, 232, 212, 60))]:
    g.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(240)))
d = ImageDraw.Draw(im)

# ---------------------------------------------------------------- the connecting line (snake through all nine posts)
def rounded_path(pts, r):
    out = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        for k in range(0, 11):  # quarter arc approximated with a quadratic bezier
            t = k / 10
            p0 = (b[0] + (a[0] - b[0]) * r / max(1, math.dist(a, b)), b[1] + (a[1] - b[1]) * r / max(1, math.dist(a, b)))
            p2 = (b[0] + (c[0] - b[0]) * r / max(1, math.dist(b, c)), b[1] + (c[1] - b[1]) * r / max(1, math.dist(b, c)))
            out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]))
    out.append(pts[-1])
    return out


line = rounded_path([(110, 1330), (3130, 1330), (3130, 2770), (110, 2770), (110, 4200), (2520, 4200)], 150)
d.line(line, fill=SAGE, width=9, joint="curve")
for p in [(110, 1330), (2520, 4200)]:
    d.ellipse((p[0] - 18, p[1] - 18, p[0] + 18, p[1] + 18), fill=MOSS)

# ---------------------------------------------------------------- helpers
def rounded(img, r):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=r, fill=255)
    img.putalpha(m)
    return img


def drop(layer, x, y, r, blur=50, alpha=60, dy=40, angle=0):
    pad = 160
    s = Image.new("RGBA", (layer.width + 2 * pad, layer.height + 2 * pad), (0, 0, 0, 0))
    s.paste((25, 45, 35, alpha), (pad, pad + dy), layer.getchannel("A"))
    s = s.filter(ImageFilter.GaussianBlur(blur))
    im.alpha_composite(s, (int(x - pad), int(y - pad)))
    im.alpha_composite(layer, (int(x), int(y)))


def card(path, x, y, w, crop=None, r=52):
    c = Image.open(D + path).convert("RGBA")
    if crop:
        c = c.crop(crop)
    c = rounded(c.resize((w, int(c.height * w / c.width)), Image.LANCZOS), r)
    drop(c, x, y, r, 44, 50)
    return c.height


def phone(path, sw, angle=0, hide_status=False):
    shot = Image.open(D + path).convert("RGBA")
    sh = int(shot.height * sw / shot.width)
    st = int(sw * 0.1)
    scr = Image.new("RGBA", (sw, sh), CREAM + (255,))
    body = shot.resize((sw, sh), Image.LANCZOS)
    scr.alpha_composite(body.crop((0, 0, sw, sh - st)), (0, st))
    scr.alpha_composite(body.crop((0, 0, sw, 2)).resize((sw, st)), (0, 0))
    s = ImageDraw.Draw(scr)
    k = sw / 900
    s.text((68 * k, 30 * k), "8:35", font=SANS(int(40 * k), "SemiBold"), fill=INK)
    bx = sw - 60 * k
    s.rounded_rectangle((bx - 58 * k, 38 * k, bx, 66 * k), radius=8 * k, outline=INK, width=max(2, int(3 * k)))
    s.rounded_rectangle((bx - 54 * k, 42 * k, bx - 14 * k, 62 * k), radius=5 * k, fill=INK)
    for i in range(4):
        hh = (10 + i * 6) * k
        s.rounded_rectangle((bx - 150 * k + i * 12 * k, 66 * k - hh, bx - 142 * k + i * 12 * k, 66 * k), radius=2, fill=INK)
    s.rounded_rectangle((sw / 2 - 140 * k, 22 * k, sw / 2 + 140 * k, 98 * k), radius=38 * k, fill=(0, 0, 0, 255))
    rr = int(118 * k)
    scr = rounded(scr, rr)
    b = int(24 * k)
    ph = Image.new("RGBA", (sw + 2 * b, sh + 2 * b), (0, 0, 0, 0))
    pd = ImageDraw.Draw(ph)
    pd.rounded_rectangle((0, 0, ph.width - 1, ph.height - 1), radius=rr + b, fill=(18, 19, 18, 255))
    pd.rounded_rectangle((3, 3, ph.width - 4, ph.height - 4), radius=rr + b - 3, outline=(120, 126, 121, 255), width=4)
    ph.alpha_composite(scr, (b, b))
    if angle:
        ph = ph.rotate(angle, resample=Image.BICUBIC, expand=True)
    return ph


def place_phone(ph, cx, cy):
    drop(ph, cx - ph.width / 2, cy - ph.height / 2, 0, 70, 85, 70)


def text(x, y, s, f, col, anchor="la"):
    d.text((x, y), s, font=f, fill=col, anchor=anchor)


def eyebrow(x, y, s, anchor="la"):
    text(x, y, s, SANS(40, "SemiBold"), MOSS, anchor)


def pill(cx, cy, s, fill=MOSS, col=CREAM, size=56, padx=80, h=130):
    f = SANS(size, "SemiBold")
    tw = d.textlength(s, font=f)
    d.rounded_rectangle((cx - tw / 2 - padx, cy - h / 2, cx + tw / 2 + padx, cy + h / 2), radius=h / 2, fill=fill)
    text(cx, cy, s, f, col, "mm")


def chip(x, y, s):
    f = SANS(46, "Medium")
    tw = d.textlength(s, font=f)
    d.rounded_rectangle((x, y, x + tw + 84, y + 100), radius=50, fill=(240, 245, 241), outline=(214, 228, 219), width=3)
    d.ellipse((x + 30, y + 42, x + 46, y + 58), fill=MOSS)
    text(x + 62, y + 50, s, f, INK, "lm")
    return y + 124


# ================================================================= ROW 1
# post: brand (top left)
logo = Image.open(D + "../cap/logo.png").convert("RGBA").resize((170, 170), Image.LANCZOS)
im.alpha_composite(logo, (110, 150))
text(310, 235, "LifeFlow", SERIF(96), INK, "lm")
text(110, 470, "Your whole", SERIF(150), INK)
text(110, 640, "life, in", SERIF(150), INK)
text(110, 810, "one flow.", SERIF_I(150), MOSS)
for i, s in enumerate(["Your Finances, Classes, Work, and more,", "Synced to your personal assistant"]):
    text(110, 1060 + i * 66, s, SANS(46, "Regular"), GRAY)
# spread: Today (top middle + top right), phone straddles the edge
place_phone(phone("today.png", 520, angle=-6), 1930, 700)
eyebrow(2330, 250, "TODAY")
text(2330, 320, "What's next,", SERIF(100), INK)
text(2330, 440, "at a glance.", SERIF_I(100), MOSS)
card("el_next.png", 2330, 640, 760, r=44)
text(2330, 940, "Your next class, your shift", SANS(44, "Regular"), GRAY)
text(2330, 1004, "and what's due, the moment", SANS(44, "Regular"), GRAY)
text(2330, 1068, "you open the app.", SANS(44, "Regular"), GRAY)

# ================================================================= ROW 2
# spread: Money (middle left + middle centre), phone straddles the edge
eyebrow(110, 1640, "MONEY")
text(110, 1710, "Know what", SERIF(104), INK)
text(110, 1840, "you actually", SERIF(104), INK)
text(110, 1970, "have.", SERIF_I(104), MOSS)
text(110, 2200, "Checking + cash, spent,", SANS(44, "Regular"), GRAY)
text(110, 2264, "came in. One clear view.", SANS(44, "Regular"), GRAY)
place_phone(phone("money.png", 520, angle=6), 1310, 2160)
card("el_peryear.png", 1640, 1760, 460, r=44)
text(1640, 2020, "Forgotten", SERIF(72), INK)
text(1640, 2110, "subscriptions,", SERIF(72), INK)
text(1640, 2200, "found.", SERIF_I(72), MOSS)
text(1640, 2340, "And how to", SANS(42, "Regular"), GRAY)
text(1640, 2400, "cancel them.", SANS(42, "Regular"), GRAY)
# post: Plan (middle right)
eyebrow(2270, 1640, "PLAN")
text(2270, 1710, "Classes, shifts,", SERIF(96), INK)
text(2270, 1830, "deadlines.", SERIF(96), INK)
text(2270, 1950, "One calendar.", SERIF_I(96), MOSS)
card("el_week.png", 2240, 2170, 900, r=50)

# ================================================================= ROW 3
# post: Meet Sage (bottom left)
eyebrow(260, 3000, "YOUR PERSONAL ASSISTANT")
text(260, 3070, "Meet Sage.", SERIF(140), INK)
text(260, 3240, "Just ask.", SERIF_I(110), MOSS)
y = 3440
for s in ["Plans your day", "Catches clashes", "Reminds you of bills", "Knows your money"]:
    y = chip(260, y, s)
# spread: Sage (bottom middle + bottom right), phone straddles the edge
place_phone(phone("sagechat.png", 520, angle=-6), 1930, 3580)
text(2860, 3200, "Sign up now", SANS(50, "Medium"), GRAY, "mm")
text(2860, 3320, "lifeflowweb.com", SERIF(84), INK, "mm")
pill(2860, 3520, "Link in bio")
text(2860, 3720, "Never miss", SERIF_I(70), MOSS, "mm")
text(2860, 3810, "anything again.", SERIF_I(70), MOSS, "mm")

# ---------------------------------------------------------------- export
out = D + "out2/"
os.makedirs(out, exist_ok=True)
full = im.convert("RGB")
full.save(out + "grid_full.png")
order = [(r, c) for r in (2, 1, 0) for c in (2, 1, 0)]
for n, (r, c) in enumerate(order, 1):
    full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)).save(out + f"post_{n}_of_9.jpg", quality=95, subsampling=0)
gap = 12
prof = Image.new("RGB", (3 * TW + 2 * gap, 3 * TH + 2 * gap), "white")
for r in range(3):
    for c in range(3):
        prof.paste(full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)), (c * (TW + gap), r * (TH + gap)))
prof.resize((prof.width // 4, prof.height // 4), Image.LANCZOS).save(out + "profile_preview.png")
print("ok")
