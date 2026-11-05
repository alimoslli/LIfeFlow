"""Crops logged element rects (CSS px) from the 3x frames for the 3D pops. Usage: python3 crop_rects.py log.json frames_dir out_prefix [key ...] [--after 0.4]"""
import json, sys, bisect
from PIL import Image, ImageDraw
L = json.load(open(sys.argv[1])); FR, PRE = sys.argv[2], sys.argv[3]
keys = [k for k in sys.argv[4:] if not k.startswith('--')] or list(L["rects"])
fr = sorted(L["frames"], key=lambda f: f[1]); ts = [f[1] for f in fr]
for k in keys:
    c = L["rects"][k]
    j = min(len(ts) - 1, bisect.bisect_left(ts, c["t"] + 0.3))
    im = Image.open(f"{FR}/{fr[j][0]}").convert("RGB")
    x, y, w, h = [v * 3 for v in c["r"]]
    y0, y1 = max(0, y), min(im.height - 3 * 96, y + h)  # keep above the bottom bar
    crop = im.crop((int(x), int(y0), int(x + w), int(y1)))
    # a clean card: the app's surface colour behind, rounded corners
    pad = 36
    bg = crop.getpixel((4, 4))
    card = Image.new("RGB", (crop.width + 2 * pad, crop.height + 2 * pad), bg)
    card.paste(crop, (pad, pad))
    m = Image.new("L", card.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=72, fill=255)
    out = Image.new("RGB", card.size, bg); out.paste(card, (0, 0), m)
    out.save(f"{PRE}_{k}.png"); print(k, out.size, "frame", fr[j][0])
