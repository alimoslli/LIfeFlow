"""Campus poster (18x24 in at 200 dpi = 3600x4800): Listen up, students. Runs next to launch.py.
Writes poster/LifeFlow_campus_poster.{png,jpg,pdf}. The QR code (shots/qr.png) opens https://lifeflowweb.com."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import launch as L

PW, PH = 3600, 4800
INK, GRAY, MOSS, SAGE, CREAM = L.INK, L.GRAY, L.MOSS, L.SAGE, L.CREAM
AMBER = (176, 92, 18)
SERIF, SERIF_I, SANS = L.SERIF, L.SERIF_I, L.SANS
L.assets()
os.makedirs("poster", exist_ok=True)

# ---------------------------------------------------------------- canvas
yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
col = np.full((PH, PW, 3), 255.0, np.float32)
for cx, cy, r, c, a in [(3000, 2400, 1300, SAGE, 0.22), (300, 1500, 1100, (246, 230, 206), 0.32), (600, 4300, 1200, SAGE, 0.16), (3200, 300, 900, (246, 230, 206), 0.3)]:
    k = a * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (r * 0.6) ** 2))
    col = col * (1 - k[..., None]) + np.array(c, np.float32) * k[..., None]
im = Image.fromarray(col.clip(0, 255).astype(np.uint8)).convert("RGBA")
del yy, xx, col
d = ImageDraw.Draw(im)


def paste(lay, x, y):
    x, y = int(x), int(y)
    sx, sy = max(0, -x), max(0, -y)
    crop = lay.crop((sx, sy, min(lay.width, PW - x), min(lay.height, PH - y)))
    im.alpha_composite(crop, (x + sx, y + sy))


def shadow(box, r, alpha=70, blur=40, dy=36):
    x0, y0, x1, y1 = box
    pad = blur * 3
    m = Image.new("L", (int(x1 - x0) + 2 * pad, int(y1 - y0) + 2 * pad), 0)
    ImageDraw.Draw(m).rounded_rectangle((pad, pad + dy, pad + x1 - x0, pad + dy + y1 - y0), radius=r, fill=alpha)
    lay = Image.new("RGBA", m.size, (22, 42, 32, 0))
    lay.putalpha(m.filter(ImageFilter.GaussianBlur(blur)))
    paste(lay, x0 - pad, y0 - pad)


def warp(img, dst, fill):
    xs, ys = [p[0] for p in dst], [p[1] for p in dst]
    x0, y0, x1, y1 = int(min(xs)) - 2, int(min(ys)) - 2, int(max(xs)) + 3, int(max(ys)) + 3
    w, h = img.size
    out = img.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, L.homography([(0, 0), (w, 0), (w, h), (0, h)], [(x - x0, y - y0) for x, y in dst]), Image.BICUBIC, fillcolor=fill + (0,))
    paste(out, x0, y0)


def ball(cx, cy, size, src=("g/g2.png", 461, 650, 150), blur=0):
    b = L.glass_ball(src[0], src[1], src[2], src[3], size, blur)
    paste(b, cx - size / 2, cy - size / 2)


# ---------------------------------------------------------------- glass accents
mol = Image.open("g/g1.png").convert("RGB")
mol = mol.resize((1180, int(1180 * mol.height / mol.width)), Image.LANCZOS)
mk = L.key_white(mol)
fade = np.clip((mol.height * 0.76 - np.arange(mol.height)) / (mol.height * 0.06), 0, 1)
mk.putalpha(Image.fromarray((np.asarray(mk.getchannel("A")) * fade[:, None]).astype(np.uint8)))
paste(mk, 2440, -360)
ball(3460, 1560, 300, blur=2)
ball(3480, 3240, 230, src=("g/g2.png", 1090, 1995, 175), blur=3)

# ---------------------------------------------------------------- header
paste(L.LOGO.resize((190, 190), Image.LANCZOS), 220, 200)
d.text((440, 295), "LifeFlow", font=SERIF(140), fill=INK, anchor="lm")
d.text((220, 520), "Listen up,", font=SERIF(500), fill=INK)
d.text((210, 1010), "students.", font=SERIF_I(500), fill=MOSS)
f = SANS(88, "Regular")
for i, line in enumerate(["LifeFlow is the personal assistant that plans your", "classes, shifts, money and goals, all in one app."]):
    d.text((226, 1640 + i * 124), line, font=f, fill=GRAY)

# ---------------------------------------------------------------- features (left) + phone (right)
y = 2020
for s in ["Plans your week", "Builds your budget", "Helps you save and invest", "Breaks overspending habits", "Warns you before bills hit"]:
    chip = L.glass_pill("chip", s)
    chip = chip.resize((int(chip.width * 1.9), int(chip.height * 1.9)), Image.LANCZOS)
    paste(chip, 170, y)
    y += 236
scr = Image.open("shots/today.png").convert("RGB").resize((L.SW, L.SH), Image.LANCZOS)
ph = L.glass_phone(scr, 0.4)
dst = L.project(ph.width, ph.height, 2760, 2640, -12, 6, -2, 1.02)
shadow((min(p[0] for p in dst), min(p[1] for p in dst), max(p[0] for p in dst), max(p[1] for p in dst)), 160, 90, 60, 70)
warp(ph, dst, (24, 26, 25))

# ---------------------------------------------------------------- testing era + coupon ticket (left) and QR (right)
tx0, ty0, tx1, ty1 = 220, 3420, 2330, 4330
shadow((tx0, ty0, tx1, ty1), 70, 80, 40, 40)
d.rounded_rectangle((tx0, ty0, tx1, ty1), radius=70, fill=(40, 91, 69, 255))
# ticket notches + perforation
for cx in (tx0, tx1):
    d.ellipse((cx - 60, (ty0 + ty1) / 2 - 60, cx + 60, (ty0 + ty1) / 2 + 60), fill=(250, 250, 248, 255))
eb = L.tracked_layer("TESTING ERA  ·  TESTERS WANTED", SANS(46, "SemiBold"), (198, 228, 210), 8)
paste(eb, tx0 + 110, ty0 + 90)
d.text((tx0 + 104, ty0 + 160), "15% off", font=SERIF(300), fill=CREAM)
d.text((tx0 + 112, ty0 + 520), "for Las Positas students who help us test.", font=SANS(60, "Regular"), fill=(214, 234, 222))
d.text((tx0 + 112, ty0 + 640), "Use code", font=SANS(56, "Medium"), fill=(198, 228, 210))
code = "LifeFlowLaspo"
cf = SANS(92, "Bold")
cw = d.textlength(code, font=cf)
d.rounded_rectangle((tx0 + 400, ty0 + 610, tx0 + 400 + cw + 120, ty0 + 780), radius=40, fill=CREAM)
d.text((tx0 + 460, ty0 + 695), code, font=cf, fill=MOSS, anchor="lm")

qx0, qy0, qx1, qy1 = 2530, 3380, 3380, 4330
shadow((qx0, qy0, qx1, qy1), 70, 80, 40, 40)
d.rounded_rectangle((qx0, qy0, qx1, qy1), radius=70, fill=(255, 255, 255, 255), outline=(225, 232, 227), width=4)
qr = Image.open("shots/qr.png").convert("RGBA").resize((640, 640), Image.NEAREST)
paste(qr, (qx0 + qx1) / 2 - 320, qy0 + 80)
d.text(((qx0 + qx1) / 2, qy0 + 790), "Scan to join", font=SANS(66, "SemiBold"), fill=INK, anchor="mm")
d.text(((qx0 + qx1) / 2, qy0 + 870), "lifeflowweb.com", font=SANS(50, "Medium"), fill=GRAY, anchor="mm")

# ---------------------------------------------------------------- urgency + credit
d.text((PW / 2, 4475), "Sign-ups may close soon. Only a few tester spots left.", font=SANS(78, "SemiBold"), fill=AMBER, anchor="mm")
d.text((PW / 2, 4630), "Built by Ali Moslli, a Las Positas College student.", font=SERIF_I(82), fill=INK, anchor="mm")

out = im.convert("RGB")
out.save("poster/LifeFlow_campus_poster.png")
out.save("poster/LifeFlow_campus_poster.jpg", quality=95)
out.save("poster/LifeFlow_campus_poster.pdf", resolution=200.0)
out.resize((900, 1200), Image.LANCZOS).save("poster/_preview.jpg", quality=85)
print("poster ok")
