"""Crops the tapped suggestion cards (with their note) from the raw 3x frames, for the 3D pops. Usage: python3 crop_cards.py log_try.json frames_try outdir"""
import json, sys, bisect
from PIL import Image
L = json.load(open(sys.argv[1])); FR, OUT = sys.argv[2], sys.argv[3]
fr = sorted(L["frames"], key=lambda f: f[1]); ts = [f[1] for f in fr]
for key, c in L["cards"].items():
    j = min(len(ts) - 1, bisect.bisect_left(ts, c["t"] + 0.3))
    x, y, w, h = [v * 3 for v in c["r"]]
    im = Image.open(f"{FR}/{fr[j][0]}").convert("RGB").crop((int(x), int(y), int(x + w), int(y + h)))
    im.save(f"{OUT}/try_{key}.png")
    print(key, im.size)
