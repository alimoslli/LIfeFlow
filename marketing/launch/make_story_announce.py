"""Big-announcement Story (1080x1920). Runs next to launch.py (needs g/, fonts/, shots/).
Instagram covers the top ~250 px and bottom ~330 px of a Story, so nothing important sits there.
The glass panel at top-left is left empty on purpose, for the owner's own text sticker.
Writes story_announce.jpg / .png."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import launch as L

W, H = L.W, L.H
L.assets()
im = L.BG.copy()

# soft extra glow behind the hero and the lower half
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((-200, 80, 1000, 1000), fill=L.SAGE + (60,))
gd.ellipse((200, 1300, 1400, 2300), fill=L.SAGE + (46,))
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))

# ---------------------------------------------------------------- hero: the brand molecule, cropped to its own bounds
g1 = Image.open("g/g1.png").convert("RGB")
mol = L.key_white(g1)
bb = mol.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
mol = mol.crop(bb)
mw = 640
mol = mol.resize((mw, int(mol.height * mw / mol.width)), Image.LANCZOS)
im.alpha_composite(mol, (400, 150))

# ---------------------------------------------------------------- empty panel for the owner's text (top-mid-left)
bx0, by0, bx1, by1 = 56, 280, 410, 470
L.soft_shadow(im, [(bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1)], 70, 26, 18)
region = im.crop((bx0, by0, bx1, by1)).filter(ImageFilter.GaussianBlur(14))
panel = Image.new("RGBA", region.size, (255, 255, 255, 150))
region.alpha_composite(panel)
mask = Image.new("L", region.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, region.width - 1, region.height - 1), radius=44, fill=255)
im.paste(region, (bx0, by0), mask)
ImageDraw.Draw(im).rounded_rectangle((bx0, by0, bx1, by1), radius=44, outline=(255, 255, 255, 235), width=3)

# ---------------------------------------------------------------- the announcement
L.headline(im, {"eyebrow": "NOW LIVE ON THE WEB", "l1": "LifeFlow is", "l2": "finally here.", "top": 800, "size": 140, "out": False}, 5, 9)
f = L.SERIF_I(60)
d = ImageDraw.Draw(im)
for i, s in enumerate(["The personal assistant", "for your whole life."]):
    im.alpha_composite(L.word_img(s, f, L.MOSS), (int(W / 2 - d.textlength(s, font=f) / 2), 1190 + i * 74))
d.text((W / 2, 1362), "Classes  ·  Work  ·  Money  ·  Health", font=L.SANS(36, "Medium"), fill=L.GRAY, anchor="mm")
chip = L.glass_pill("chip", "Launching today")
im.alpha_composite(chip, (int(W / 2 - chip.width / 2), 1405))

# small glass accents (kept off the text and the link-sticker zone)
for (src, cx, cy, size, blur) in [(("g/g2.png", 461, 650, 150), 985, 905, 130, 2), (("g/g2.png", 1090, 1995, 175), 110, 1560, 190, 3)]:
    b = L.glass_ball(src[0], src[1], src[2], src[3], size, blur)
    im.alpha_composite(b, (int(cx - size / 2), int(cy - size / 2)))

out = im.convert("RGB")
out.save("story_announce.jpg", quality=95)
out.save("story_announce.png")
print("story ok")
