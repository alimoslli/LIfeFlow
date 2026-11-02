"""'LifeFlow connects to' Story (1080x1920), in the LifeFlow account style, with the real logos.
Runs next to launch.py (needs g/, fonts/, shots/logo.png) and logos/*.png (rendered from the official SVGs).
Instagram covers the top ~250 px and bottom ~330 px of a Story, so the wordmark starts below the top bar and the
link sticker is meant to go in the clear space under the sign-up line."""
from PIL import Image, ImageDraw, ImageFilter
import launch as L

W, H = L.W, L.H
L.assets()
im = L.BG.copy()
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((-260, 700, 760, 1700), fill=L.SAGE + (56,))
gd.ellipse((520, 80, 1380, 900), fill=(246, 234, 214, 90))
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(150)))
d = ImageDraw.Draw(im)

# ---------------------------------------------------------------- wordmark (small, centred, below the top bar)
f_w = L.SERIF(60)
tw = d.textlength("LifeFlow", font=f_w)
lw = 64
x0 = int(W / 2 - (lw + 16 + tw) / 2)
im.alpha_composite(L.LOGO.resize((lw, lw), Image.LANCZOS), (x0, 262))
d.text((x0 + lw + 16, 294), "LifeFlow", font=f_w, fill=L.INK, anchor="lm")

# ---------------------------------------------------------------- headline
L.headline(im, {"eyebrow": "CONNECTORS", "l1": "LifeFlow connects to", "l2": "the tools you use.", "top": 372, "size": 94, "out": False}, 5, 9)

# ---------------------------------------------------------------- logo grid
LOGOS = [
    ("r_canvas_c", "Canvas"), ("r_g_google-calendar", "Google Calendar"), ("r_g_google-gmail", "Gmail"),
    ("health_icon", "Apple Health"), ("r_plaid_w", "Plaid"), ("r_g_openai-icon", "OpenAI"),
    ("r_g_stripe", "Stripe"), ("r_apple_c", "Sign in with Apple"), ("r_g_google-icon", "Sign in with Google"),
]
TW, TH, GX, GY = 300, 184, 30, 22
X0 = (W - (3 * TW + 2 * GX)) // 2
Y0 = 690
f_name = L.SANS(27, "SemiBold")
for i, (fn, name) in enumerate(LOGOS):
    c, r = i % 3, i // 3
    x, y = X0 + c * (TW + GX), Y0 + r * (TH + GY)
    L.soft_shadow(im, [(x, y), (x + TW, y), (x + TW, y + TH), (x, y + TH)], 56, 22, 16)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x, y, x + TW, y + TH), radius=40, fill=(255, 255, 255, 246), outline=(255, 255, 255, 255), width=3)
    lg = Image.open(f"logos/{fn}.png").convert("RGBA")
    flat = Image.new("RGBA", lg.size, (255, 255, 255, 255))
    flat.alpha_composite(lg)
    ink = flat.convert("L").point(lambda v: 255 if v < 244 else 0)
    lg = lg.crop(ink.getbbox() or (0, 0, lg.width, lg.height))
    lg = Image.alpha_composite(Image.new("RGBA", lg.size, (255, 255, 255, 255)), lg)
    box_w, box_h = (190, 78) if lg.width / lg.height > 1.6 else (100, 78)
    s = min(box_w / lg.width, box_h / lg.height)
    lg = lg.resize((max(1, int(lg.width * s)), max(1, int(lg.height * s))), Image.LANCZOS)
    im.alpha_composite(lg, (int(x + TW / 2 - lg.width / 2), int(y + 24 + (78 - lg.height) / 2)))
    d.text((x + TW / 2, y + 140), name, font=f_name, fill=L.INK, anchor="mm")

# ---------------------------------------------------------------- coming soon + call to action
grid_bottom = Y0 + 3 * TH + 2 * GY
chip = L.glass_pill("chip", "More connectors coming soon")
im.alpha_composite(chip, (int(W / 2 - chip.width / 2), grid_bottom + 18))
f = L.SERIF_I(64)
d = ImageDraw.Draw(im)
for i, s in enumerate(["Sign up and start", "connecting your life."]):
    im.alpha_composite(L.word_img(s, f, L.MOSS), (int(W / 2 - d.textlength(s, font=f) / 2), grid_bottom + 172 + i * 78))

# glass accents, kept off the text and the link-sticker zone
for (src, cx, cy, size, blur) in [(("g/g2.png", 461, 650, 150), 975, 380, 170, 2), (("g/g2.png", 1090, 1995, 175), 95, 600, 130, 3)]:
    b = L.glass_ball(src[0], src[1], src[2], src[3], size, blur)
    im.alpha_composite(b, (int(cx - size / 2), int(cy - size / 2)))

out = im.convert("RGB")
out.save("story_connectors.jpg", quality=95)
out.save("story_connectors.png")
print("story ok")
