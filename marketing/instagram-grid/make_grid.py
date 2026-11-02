"""LifeFlow 9-post Instagram grid: one 3240x4320 image, split into nine 1080x1440 (3:4) posts."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

D = os.path.dirname(os.path.abspath(__file__)) + "/"
F = D + "../fonts/"
W, H = 3240, 4320
TW, TH = 1080, 1440
INK, GRAY, MOSS, SAGE = (23, 23, 21), (110, 112, 106), (40, 91, 69), (140, 203, 180)


def font(n, s, v=None):
    f = ImageFont.truetype(F + n, s)
    if v:
        f.set_variation_by_name(v)
    return f


SERIF = lambda s: font("Newsreader.woff2", s)
SERIF_I = lambda s: font("Newsreader-Italic.woff2", s)
SANS = lambda s, v="Medium": font("Geist.woff2", s, v)

# ---------------------------------------------------------------- background: white with a whisper of warmth
im = Image.new("RGBA", (W, H), (255, 255, 255, 255))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((W / 2 - 1100, 2650 - 1250, W / 2 + 1100, 2650 + 1250), fill=(140, 203, 180, 46))
g.ellipse((300, 2200, 1500, 3400), fill=(246, 236, 220, 60))
g.ellipse((1900, 1700, 3100, 2900), fill=(246, 236, 220, 50))
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(260)))
d = ImageDraw.Draw(im)


def center_text(y, txt, f, col, cx=W / 2):
    w = d.textlength(txt, font=f)
    d.text((cx - w / 2, y), txt, font=f, fill=col)
    return w


def rounded(img, r):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=r, fill=255)
    img.putalpha(m)
    return img


def shadow(size, r, blur=50, alpha=60, pad=150, dy=40):
    s = Image.new("RGBA", (size[0] + 2 * pad, size[1] + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle((pad, pad + dy, pad + size[0], pad + dy + size[1]), radius=r, fill=(25, 45, 35, alpha))
    return s.filter(ImageFilter.GaussianBlur(blur)), pad


def place_card(path, x, y, w, crop=None, r=54):
    c = Image.open(D + path).convert("RGBA")
    if crop:
        c = c.crop(crop)
    c = c.resize((w, int(c.height * w / c.width)), Image.LANCZOS)
    c = rounded(c, r)
    sh, pad = shadow(c.size, r, 46, 52)
    im.alpha_composite(sh, (int(x - pad), int(y - pad)))
    im.alpha_composite(c, (int(x), int(y)))
    return c.height


# ---------------------------------------------------------------- row 1: brand + headline
logo = Image.open(D + "../cap/logo.png").convert("RGBA").resize((150, 150), Image.LANCZOS)
im.alpha_composite(logo, (int(W / 2 - 75), 150))
center_text(330, "LIFEFLOW", SANS(46, "SemiBold"), MOSS)
d.text((0, 0), "", font=SANS(10))
# headline sized so the two grid gaps fall exactly in the spaces between words
size = 440
while True:
    f1 = SERIF(size)
    gap = d.textlength("whole ", font=f1) - d.textlength("whole", font=f1) + 0  # one space
    if d.textlength("whole", font=f1) + gap <= TW or size < 120:
        break
    size -= 2
sp = d.textlength(" ", font=f1)
ww = d.textlength("whole", font=f1)
# space centres at x=1080 and x=2160: "whole" starts sp/2 after 1080 and is centred in its column
x_whole = TW + (TW - ww) / 2
d.text((x_whole - sp - d.textlength("Your", font=f1), 430), "Your", font=f1, fill=INK)
d.text((x_whole, 430), "whole", font=f1, fill=INK)
d.text((x_whole + ww + sp, 430), "life,", font=f1, fill=INK)
print("headline size", size, "space", sp, "whole", ww)
f2 = SERIF_I(200)
center_text(800, "in one flow.", f2, MOSS)
sub_f = SANS(48, "Regular")
for size in range(52, 30, -1):
    sub_f = SANS(size, "Regular")
    if d.textlength("Your Finances, Classes, Work, and more,", font=sub_f) <= 960:
        break
center_text(1080, "Your Finances, Classes, Work, and more,", sub_f, GRAY)
center_text(1080 + int(sub_f.size * 1.45), "Synced to your personal assistant", sub_f, GRAY)
print("subtitle size", sub_f.size)

# ---------------------------------------------------------------- phone with the real Today screen (center column)
shot = Image.open(D + "today.png").convert("RGBA")
SW = 900
SH = int(shot.height * SW / shot.width)
STATUS = 92
screen = Image.new("RGBA", (SW, SH), (246, 242, 233, 255))
body = shot.resize((SW, SH), Image.LANCZOS)
screen.alpha_composite(body.crop((0, 0, SW, SH - STATUS)), (0, STATUS))
screen.alpha_composite(body.crop((0, 0, SW, 2)).resize((SW, STATUS)), (0, 0))
sd = ImageDraw.Draw(screen)
sd.text((68, 30), "8:35", font=SANS(40, "SemiBold"), fill=INK)
bx = SW - 60
sd.rounded_rectangle((bx - 58, 38, bx, 66), radius=8, outline=INK, width=3)
sd.rounded_rectangle((bx - 54, 42, bx - 14, 62), radius=5, fill=INK)
for i in range(4):
    h = 10 + i * 6
    sd.rounded_rectangle((bx - 150 + i * 12, 66 - h, bx - 142 + i * 12, 66), radius=2, fill=INK)
sd.rounded_rectangle((SW / 2 - 140, 22, SW / 2 + 140, 98), radius=38, fill=(0, 0, 0, 255))
SR = 118
screen = rounded(screen, SR)
B = 26
phone = Image.new("RGBA", (SW + 2 * B, SH + 2 * B), (0, 0, 0, 0))
pd = ImageDraw.Draw(phone)
pd.rounded_rectangle((0, 0, phone.width - 1, phone.height - 1), radius=SR + B, fill=(18, 19, 18, 255))
pd.rounded_rectangle((3, 3, phone.width - 4, phone.height - 4), radius=SR + B - 3, outline=(120, 126, 121, 255), width=4)
phone.alpha_composite(screen, (B, B))
PX, PY = int(W / 2 - phone.width / 2), 1485
sh, pad = shadow(phone.size, SR + B, 70, 80, 220, 70)
im.alpha_composite(sh, (PX - pad, PY - pad))
im.alpha_composite(phone, (PX, PY))
PHONE_BOTTOM = PY + phone.height

# ---------------------------------------------------------------- side columns: real cards + labels (each inside one tile)
def label(x, y, eyebrow, title, w=900):
    d.text((x, y), eyebrow, font=SANS(38, "SemiBold"), fill=MOSS)
    d.text((x, y + 62), title, font=SERIF(70), fill=INK)


LX, RX, CW = 90, 2160 + 90, 900
# left column
label(LX, 1700, "TODAY", "What's next, at a glance.")
place_card("el_next.png", LX, 1900, CW, r=58)
label(LX, 2960, "SAGE NOTICED", "Clashes, caught early.")
place_card("el_clash.png", LX, 3160, CW, r=46)
# right column
label(RX, 1700, "MONEY", "Know what you actually have.")
place_card("el_available.png", RX, 1900, CW, crop=(0, 0, 1050, 610), r=58)
label(RX, 2960, "SAGE, YOUR AI ASSISTANT", "It texts you first.")
place_card("el_sage.png", RX, 3160, CW, crop=(0, 0, 1050, 668), r=54)

# ---------------------------------------------------------------- bottom: call to action
d.text((LX, 3820), "Plan · School · Work · Money", font=SANS(48, "Medium"), fill=GRAY)
d.text((LX, 3900), "Never miss anything again.", font=SERIF_I(70), fill=INK)
cx = W / 2
pill_f = SANS(60, "SemiBold")
tw = d.textlength("Link in bio", font=pill_f)
pw, ph = tw + 170, 140
py = PHONE_BOTTOM + 150
d.rounded_rectangle((cx - pw / 2, py, cx + pw / 2, py + ph), radius=70, fill=MOSS)
d.text((cx - tw / 2, py + 34), "Link in bio", font=pill_f, fill=(246, 242, 233))
center_text(py + ph + 60, "Sign up now", SANS(44, "Medium"), GRAY)
rx2 = 2160 + 990
t1 = "Sign up on the web"
d.text((rx2 - d.textlength(t1, font=SANS(48, "Medium")), 3820), t1, font=SANS(48, "Medium"), fill=GRAY)
t2 = "lifeflowweb.com"
d.text((rx2 - d.textlength(t2, font=SERIF(76)), 3890), t2, font=SERIF(76), fill=MOSS)

# ---------------------------------------------------------------- export
out = D + "out/"
os.makedirs(out, exist_ok=True)
full = im.convert("RGB")
full.save(out + "LifeFlow_grid_full.png")
full.resize((W // 4, H // 4), Image.LANCZOS).save(out + "_preview.png")
# Instagram shows the newest post top-left, so post the bottom-right tile first.
order = [(r, c) for r in (2, 1, 0) for c in (2, 1, 0)]
for n, (r, c) in enumerate(order, 1):
    full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)).save(out + f"post_{n}_of_9.jpg", quality=95, subsampling=0)
# how it looks on the profile (with the small grid gaps)
gap = 12
prof = Image.new("RGB", (3 * TW + 2 * gap, 3 * TH + 2 * gap), "white")
for r in range(3):
    for c in range(3):
        prof.paste(full.crop((c * TW, r * TH, (c + 1) * TW, (r + 1) * TH)), (c * (TW + gap), r * (TH + gap)))
prof.resize((prof.width // 4, prof.height // 4), Image.LANCZOS).save(out + "profile_preview.png")
print("phone bottom", PHONE_BOTTOM, "pill y", py)
