"""Crops readable parts of the conversation's replies (CSS px windows) from the 3x frames."""
import json, bisect
from PIL import Image, ImageDraw
L = json.load(open("log_convo.json"))
fr = sorted(L["frames"], key=lambda f: f[1]); ts = [f[1] for f in fr]
R, T = L["rects"], {i: t for i, t in enumerate(L["turns"])}
def crop(key, t, y0, y1):
    j = min(len(ts) - 1, bisect.bisect_left(ts, t))
    im = Image.open(f"frames_convo/{fr[j][0]}").convert("RGB")
    c = im.crop((16 * 3, int(y0 * 3), 374 * 3, int(y1 * 3)))
    bg = c.getpixel((4, 4)); pad = 36
    card = Image.new("RGB", (c.width + 2 * pad, c.height + 2 * pad), bg); card.paste(c, (pad, pad))
    m = Image.new("L", card.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=72, fill=255)
    out = Image.new("RGB", card.size, bg); out.paste(card, (0, 0), m); out.save(f"cards/cv_{key}.png"); print(key, out.size, fr[j][0])
bottom = 844 - 150  # above the message box and tab bar
def vis(k, extra=0.4):
    x, y, w, h = R[k]["r"]; t = R[k]["t"] + extra
    return t, max(y, 112), min(y + h, bottom)
crop("brief", 6.18, 186, 530)  # mid-stream: greeting, schedule, the overlap warning, the overdue lab report
for i, k in [(1, "remind"), (2, "money"), (3, "budget"), (4, "trip"), (5, "plan")]:
    t, a, b = vis("reply%d" % i)
    crop(k, t, a, b)
