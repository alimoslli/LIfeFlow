"""Clean 'works with' logo wall (1080x1350, Instagram 4:5): the real logos, no LifeFlow branding.
Needs logos/*.png next to it (rendered from the official SVGs: simple-icons, gilbarbara/logos, Wikimedia Commons).
Only integrations that exist in the app are shown."""
from PIL import Image, ImageDraw, ImageFilter
import launch as L

W, H = 1080, 1350
INK, GRAY = (20, 22, 20), (112, 116, 110)

LOGOS = [  # file, name, what it does
    ("r_canvas_c", "Canvas", "Classes and due dates"),
    ("r_g_google-calendar", "Google Calendar", "Events, always synced"),
    ("r_g_google-gmail", "Gmail", "Email help, you approve"),
    ("health_icon", "Apple Health", "Sleep, steps, workouts"),
    ("r_plaid_w", "Plaid", "Your banks and cards"),
    ("r_g_openai-icon", "OpenAI", "The AI behind the chat"),
    ("r_g_stripe", "Stripe", "Secure payments"),
    ("r_apple_c", "Apple", "Sign in with Apple"),
    ("r_g_google-icon", "Google", "Sign in with Google"),
]

im = Image.new("RGBA", (W, H), (255, 255, 255, 255))
d = ImageDraw.Draw(im)

d.text((W / 2, 128), "Works with the tools", font=L.SANS(78, "SemiBold"), fill=INK, anchor="mm")
d.text((W / 2, 220), "you already use.", font=L.SANS(78, "SemiBold"), fill=INK, anchor="mm")

TW, TH, GX, GY = 306, 296, 33, 34
X0 = (W - (3 * TW + 2 * GX)) // 2
Y0 = 300
f_name, f_sub = L.SANS(34, "SemiBold"), L.SANS(25, "Regular")
for i, (fn, name, sub) in enumerate(LOGOS):
    c, r = i % 3, i // 3
    x, y = X0 + c * (TW + GX), Y0 + r * (TH + GY)
    sh = Image.new("L", (TW + 120, TH + 120), 0)
    ImageDraw.Draw(sh).rounded_rectangle((60, 70, 60 + TW, 70 + TH), radius=44, fill=34)
    lay = Image.new("RGBA", sh.size, (30, 40, 34, 0))
    lay.putalpha(sh.filter(ImageFilter.GaussianBlur(18)))
    im.alpha_composite(lay, (x - 60, y - 60))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x, y, x + TW, y + TH), radius=44, fill=(255, 255, 255, 255), outline=(232, 235, 233, 255), width=3)
    lg = Image.open(f"logos/{fn}.png").convert("RGBA")
    flat = Image.new("RGBA", lg.size, (255, 255, 255, 255))
    flat.alpha_composite(lg)
    ink = flat.convert("L").point(lambda v: 255 if v < 244 else 0)  # anything that isn't the white background
    lg = lg.crop(ink.getbbox() or (0, 0, lg.width, lg.height))
    lg = Image.alpha_composite(Image.new("RGBA", lg.size, (255, 255, 255, 255)), lg)
    box_w, box_h = (210, 112) if lg.width / lg.height > 1.6 else (130, 112)
    s = min(box_w / lg.width, box_h / lg.height)
    lg = lg.resize((max(1, int(lg.width * s)), max(1, int(lg.height * s))), Image.LANCZOS)
    im.alpha_composite(lg, (int(x + TW / 2 - lg.width / 2), int(y + 40 + (112 - lg.height) / 2)))
    d.text((x + TW / 2, y + 200), name, font=f_name, fill=INK, anchor="mm")
    d.text((x + TW / 2, y + 242), sub, font=f_sub, fill=GRAY, anchor="mm")

d.text((W / 2, 1296), "You choose what to connect.", font=L.SANS(30, "Medium"), fill=GRAY, anchor="mm")
im.convert("RGB").save("connectors_logos.jpg", quality=95)
im.convert("RGB").save("connectors_logos.png")
print("logo wall ok")
