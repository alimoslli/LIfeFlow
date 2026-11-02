"""'Works with' connector image (1080x1350, Instagram 4:5). Runs next to launch.py (needs g/, fonts/, shots/).
Only integrations that exist in the app are shown (src/server/integrations + sign-in). The icons are original
pictograms in the LifeFlow glass style, not the companies' own logos."""
import math
from PIL import Image, ImageDraw, ImageFilter
import launch as L

W, H = 1080, 1350
INK, GRAY, MOSS, SAGE, CREAM = L.INK, L.GRAY, L.MOSS, L.SAGE, L.CREAM
L.assets()

# ---------------------------------------------------------------- canvas
base = Image.new("RGBA", (W, H), (255, 255, 255, 255))
yy = Image.linear_gradient("L").resize((W, H))
base.paste(Image.new("RGBA", (W, H), (241, 244, 240, 255)), (0, 0), yy.point(lambda v: int(v * 0.8)))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((140, 420, 940, 1220), fill=SAGE + (70,))
gd.ellipse((600, -200, 1300, 400), fill=(246, 234, 214, 90))
base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(150)))
im = base


# ---------------------------------------------------------------- icons (drawn at 4x, cream on a glossy sage disc)
S = 4
CR = CREAM + (255,)


def icon(kind, size):
    s = size * S
    c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    u = s / 100.0
    if kind == "canvas":  # graduation cap
        d.polygon([(50 * u, 26 * u), (90 * u, 44 * u), (50 * u, 62 * u), (10 * u, 44 * u)], fill=CR)
        d.polygon([(26 * u, 56 * u), (50 * u, 67 * u), (74 * u, 56 * u), (74 * u, 72 * u), (50 * u, 82 * u), (26 * u, 72 * u)], fill=CR)
        d.line([(86 * u, 46 * u), (86 * u, 70 * u)], fill=CR, width=int(3.4 * u))
        d.ellipse((82 * u, 68 * u, 90 * u, 76 * u), fill=CR)
    elif kind == "gcal":  # calendar
        d.rounded_rectangle((18 * u, 24 * u, 82 * u, 82 * u), radius=9 * u, fill=CR)
        d.rectangle((18 * u, 24 * u, 82 * u, 40 * u), fill=CR)
        for x in (34, 66):
            d.rounded_rectangle(((x - 3) * u, 14 * u, (x + 3) * u, 32 * u), radius=3 * u, fill=CR)
        for r in range(2):
            for cc in range(3):
                x0, y0 = (28 + cc * 17) * u, (50 + r * 14) * u
                d.rounded_rectangle((x0, y0, x0 + 9 * u, y0 + 8 * u), radius=2 * u, fill=(60, 120, 92, 255))
    elif kind == "gmail":  # envelope
        d.rounded_rectangle((12 * u, 24 * u, 88 * u, 76 * u), radius=9 * u, fill=CR)
        d.line([(16 * u, 30 * u), (50 * u, 56 * u), (84 * u, 30 * u)], fill=(60, 120, 92, 255), width=int(5 * u), joint="curve")
    elif kind == "health":  # heart
        d.ellipse((16 * u, 22 * u, 52 * u, 58 * u), fill=CR)
        d.ellipse((48 * u, 22 * u, 84 * u, 58 * u), fill=CR)
        d.polygon([(18 * u, 46 * u), (82 * u, 46 * u), (50 * u, 82 * u)], fill=CR)
    elif kind == "plaid":  # bank
        d.polygon([(50 * u, 14 * u), (88 * u, 34 * u), (12 * u, 34 * u)], fill=CR)
        for x in (22, 42, 62):
            d.rounded_rectangle((x * u, 42 * u, (x + 14) * u, 72 * u), radius=3 * u, fill=CR)
        d.rounded_rectangle((12 * u, 76 * u, 88 * u, 86 * u), radius=4 * u, fill=CR)
    elif kind == "ai":  # sparkle
        def star(cx, cy, r):
            pts = []
            for i in range(8):
                a = math.pi / 4 * i - math.pi / 2
                rr = r if i % 2 == 0 else r * 0.28
                pts.append(((cx + math.cos(a) * rr) * u, (cy + math.sin(a) * rr) * u))
            d.polygon(pts, fill=CR)
        star(46, 54, 34)
        star(76, 24, 14)
    elif kind == "card":  # payment card
        d.rounded_rectangle((12 * u, 24 * u, 88 * u, 76 * u), radius=9 * u, fill=CR)
        d.rectangle((12 * u, 38 * u, 88 * u, 48 * u), fill=(60, 120, 92, 255))
        d.rounded_rectangle((22 * u, 60 * u, 44 * u, 67 * u), radius=3 * u, fill=(60, 120, 92, 255))
    elif kind == "key":  # sign-in key
        d.ellipse((14 * u, 30 * u, 50 * u, 66 * u), fill=CR)
        d.ellipse((24 * u, 40 * u, 40 * u, 56 * u), fill=(60, 120, 92, 255))
        d.rounded_rectangle((46 * u, 44 * u, 88 * u, 54 * u), radius=4 * u, fill=CR)
        d.rounded_rectangle((70 * u, 54 * u, 78 * u, 68 * u), radius=3 * u, fill=CR)
        d.rounded_rectangle((58 * u, 54 * u, 66 * u, 64 * u), radius=3 * u, fill=CR)
    return c.resize((size, size), Image.LANCZOS)


def disc(kind, size):
    s = size * S
    g = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for i in range(s // 2, 0, -2):  # radial gradient: deep moss edge, brighter sage core, off-centre
        t = i / (s / 2)
        col = (int(40 + (122 - 40) * (1 - t) ** 1.2), int(91 + (176 - 91) * (1 - t) ** 1.2), int(69 + (146 - 69) * (1 - t) ** 1.2), 255)
        cx, cy = s / 2 - s * 0.07 * (1 - t), s / 2 - s * 0.09 * (1 - t)
        gd.ellipse((cx - i, cy - i, cx + i, cy + i), fill=col)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    hl = Image.new("L", (s, s), 0)  # glossy highlight
    ImageDraw.Draw(hl).ellipse((s * 0.16, s * 0.08, s * 0.66, s * 0.38), fill=110)
    hl = hl.filter(ImageFilter.GaussianBlur(s * 0.03))
    white = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    white.putalpha(L.ImageChops.multiply(hl, mask))
    out.alpha_composite(white)
    ic = icon(kind, int(size * 0.62)).resize((int(s * 0.62), int(s * 0.62)), Image.LANCZOS)
    out.alpha_composite(ic, ((s - ic.width) // 2, (s - ic.height) // 2))
    ImageDraw.Draw(out).ellipse((2, 2, s - 3, s - 3), outline=(255, 255, 255, 120), width=S)
    return out.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- layout
TW, TH, GAPX, GAPY = 296, 262, 46, 38
X0 = (W - (3 * TW + 2 * GAPX)) // 2
Y0 = 438


def pos(col, row):
    return X0 + col * (TW + GAPX), Y0 + row * (TH + GAPY)


TILES = [
    ((0, 0), "canvas", "Canvas", "Classes and due dates"),
    ((1, 0), "gcal", "Google Calendar", "Events, always synced"),
    ((2, 0), "gmail", "Gmail", "Email help, you approve"),
    ((0, 1), "health", "Apple Health", "Sleep, steps, workouts"),
    ((2, 1), "plaid", "Plaid", "Your banks and cards"),
    ((0, 2), "ai", "OpenAI", "The AI behind the chat"),
    ((1, 2), "card", "Stripe", "Secure payments"),
    ((2, 2), "key", "Secure sign-in", "Apple, Google, passkeys"),
]

hx, hy = pos(1, 1)
hub_c = (hx + TW / 2, hy + TH / 2)

# connecting lines, behind everything
ln = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(ln)
for (c, r), *_ in TILES:
    x, y = pos(c, r)
    ld.line([hub_c, (x + TW / 2, y + TH / 2)], fill=SAGE + (255,), width=6)
glow_ln = ln.filter(ImageFilter.GaussianBlur(10))
im.alpha_composite(glow_ln)
im.alpha_composite(ln)

# tiles
f_name, f_sub = L.SANS(34, "SemiBold"), L.SANS(25, "Regular")
dd = ImageDraw.Draw(im)
for (c, r), kind, name, sub in TILES:
    x, y = pos(c, r)
    L.soft_shadow(im, [(x, y), (x + TW, y), (x + TW, y + TH), (x, y + TH)], 62, 24, 20)
    dd.rounded_rectangle((x, y, x + TW, y + TH), radius=44, fill=(255, 255, 255, 244), outline=(236, 241, 237, 255), width=3)
    dsc = disc(kind, 112)
    im.alpha_composite(dsc, (int(x + TW / 2 - 56), int(y + 28)))
    dd.text((x + TW / 2, y + 178), name, font=f_name, fill=INK, anchor="mm")
    dd.text((x + TW / 2, y + 216), sub, font=f_sub, fill=GRAY, anchor="mm")

# hub: LifeFlow logo in a glowing glass ring
hubr = 118
ring = Image.new("RGBA", (hubr * 2 + 120, hubr * 2 + 120), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring)
rd.ellipse((60, 60, 60 + hubr * 2, 60 + hubr * 2), fill=SAGE + (150,))
ring = ring.filter(ImageFilter.GaussianBlur(26))
im.alpha_composite(ring, (int(hub_c[0] - ring.width / 2), int(hub_c[1] - ring.height / 2)))
dd = ImageDraw.Draw(im)
dd.ellipse((hub_c[0] - hubr, hub_c[1] - hubr, hub_c[0] + hubr, hub_c[1] + hubr), fill=(255, 255, 255, 255), outline=(222, 236, 227, 255), width=6)
lg = L.LOGO.resize((170, 170), Image.LANCZOS)
im.alpha_composite(lg, (int(hub_c[0] - 85), int(hub_c[1] - 98)))
dd.text((hub_c[0], hub_c[1] + 76), "LifeFlow", font=L.SERIF(40), fill=INK, anchor="mm")

# ---------------------------------------------------------------- header + footer
L.headline(im, {"eyebrow": "WORKS WITH THE TOOLS YOU USE", "l1": "Plugs into", "l2": "your whole life.", "top": 70, "size": 108, "out": False}, 5, 9)
for (src, cx, cy, size, blur) in [(("g/g2.png", 461, 650, 150), 975, 150, 150, 2), (("g/g2.png", 1090, 1995, 175), 92, 380, 130, 3)]:
    b = L.glass_ball(src[0], src[1], src[2], src[3], size, blur)
    im.alpha_composite(b, (int(cx - size / 2), int(cy - size / 2)))
dd = ImageDraw.Draw(im)
dd.text((W / 2, 1296), "You choose what to connect.  lifeflowweb.com", font=L.SANS(30, "Medium"), fill=GRAY, anchor="mm")

im.convert("RGB").save("connectors.jpg", quality=95)
im.convert("RGB").save("connectors.png")
print("connectors ok")
