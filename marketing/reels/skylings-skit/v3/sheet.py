"""contact sheet of the cut: python3 sheet.py t1,t2,... out.jpg [cols]"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ts = [float(x) for x in sys.argv[1].split(",")]; out = sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
sys.argv = sys.argv[:1]
import skit3_compose as C
from PIL import Image, ImageDraw
tiles = []
for t in ts:
    im = Image.fromarray(C.frame(int(round(t * C.FPS)))).resize((360, 640), Image.LANCZOS); ImageDraw.Draw(im).text((8, 6), f"{t:.2f}", fill=(255, 255, 0)); tiles.append(im)
rows = (len(tiles) + cols - 1) // cols; sh = Image.new("RGB", (cols * 360, rows * 640))
for i, im in enumerate(tiles): sh.paste(im, ((i % cols) * 360, (i // cols) * 640))
sh.save(out, quality=88); print(out, C.N / C.FPS, [(s["id"], round(s["out"] / C.FPS, 2), s["dur"]) for s in C.SHOTS])
