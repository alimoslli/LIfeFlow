"""The campfire ending, v3 (Ali, 2026-11-14: "keep the original one just change the voice and maybe the effects cover my mouth"):
his original last shot (only in his rough edit, 720p, the same framing as the 4K camera, so it runs through the same shots,
matte and grade, sharpened) with his re-recorded line. His words come out of his mouth as a cluster of pixel embers (it
covers his lips the whole time, so the old take's lip movement never shows) and stream into the app's pixel speech
bubble, phrase by phrase: YOU HEARD HIM, / JANUARY 2027 / GET ON THE WAITLIST / RIGHT NOW!  Then the bubble pops, the
picture flashes gold and the logo opens out of the gold (fire_render2's ending).
    python3 fire_end.py [--preview 0.5,2.0]  -> end3.mp4 (the line, then the logo)
"""
import json, math, os, sys, subprocess, wave
import numpy as np, cv2
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fire_render2 as G
from fire_render2 import F, W, H, FPS, crop_of, to_scr, grade, matte_full, matte_crop, clamp, smooth, back, out3, in3, smoothv, paste, PAL, heat_col, text_cells, light_comp, gold
ROUGH = f"{HERE}/src/{F.IDX[12]['file']}"; ROUGH_AT = 97.79       # where the new line starts in his rough edit (matched on the audio)
G.FONT5.update({",": ".....|.....|.....|.....|..#..|..#..|.#...", "!": "..#..|..#..|..#..|..#..|..#..|.....|..#.."})

# ---------------------------------------------------------------- the segment: his line (clip 4 audio) over the rough edit's picture
VO = G.SEGS[-1]; VO["nf"] = 141; VO["b"] = VO["a"] + VO["nf"] / FPS; VO["va"] = ROUGH_AT + VO["a"]; VO.pop("clip_video", None)
G.END_OUT = VO["out"] + VO["nf"] - G.XF; G.N = G.END_OUT + G.END_HOLD + 1 + G.HOLD
SHOT_A, SHOT_B = dict(z=1.22, cx=1090, cy=2090), dict(z=1.42, cx=990, cy=2110)
def shot(t): u = smoothv(clamp(t / (VO["nf"] / FPS))); return {k: SHOT_A[k] + (SHOT_B[k] - SHOT_A[k]) * u for k in SHOT_A}
class RoughReader:
    """the 720p rough edit, scaled up to the camera's 2160 x 3840 so every crop and the matte line up"""
    def __init__(self, skip=0):
        self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{VO['va'] + skip / FPS:.3f}", "-i", ROUGH, "-frames:v", str(VO["nf"] - skip + 2),
                                   "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE); self.last = None
    def next(self):
        b = self.p.stdout.read(720 * 1280 * 3)
        if len(b) == 720 * 1280 * 3: self.last = cv2.resize(np.frombuffer(b, np.uint8).reshape(1280, 720, 3), (2160, 3840), interpolation=cv2.INTER_CUBIC)
        return self.last

# ---------------------------------------------------------------- his mouth, from the matte model's face-skin class (fx/end/mouth_raw.json)
RAW = json.load(open(f"{HERE}/fx/end/mouth_raw.json"))
def _track():
    xs = np.array([r["x"] if r else np.nan for r in RAW]); ys = np.array([r["y"] if r else np.nan for r in RAW]); ws = np.array([min(r["w"], 125) if r else np.nan for r in RAW])
    out = []
    for j in range(len(RAW)):
        sl = slice(max(0, j - 4), j + 5); out.append((np.nanmedian(xs[sl]), np.nanmedian(ys[sl]), np.nanmedian(ws[sl])))
    return out
MOUTH = _track()
def mouth_at(t): j = int(clamp(round(t * FPS), 0, len(MOUTH) - 1)); return MOUTH[j]

# ---------------------------------------------------------------- how loud he is (the embers breathe with it)
with wave.open(f"{HERE}/wav/c4.wav") as w_:
    _a = np.frombuffer(w_.readframes(w_.getnframes()), np.int16).astype(np.float32).reshape(-1, w_.getnchannels()).mean(1) / 32768; _sr = w_.getframerate()
def loud(t):
    c = VO["a"] + t; i0 = int(max(0, c - 0.04) * _sr); i1 = int((c + 0.04) * _sr); e = np.sqrt((_a[i0:i1] ** 2).mean() + 1e-12) if i1 > i0 else 0
    return clamp((20 * math.log10(e + 1e-6) + 42) / 22)

# ---------------------------------------------------------------- the words, in the app's pixel speech bubble
PHRASES = [(0.10, ["YOU HEARD HIM,"]), (0.86, ["JANUARY 2027"]), (2.52, ["GET ON THE", "WAITLIST"]), (3.86, ["RIGHT NOW!"])]
INK = PAL["k"]
def bubble(lines, shown, px=5):
    """white bubble with an ink outline and rounded pixel corners, the tail at the bottom right (toward his mouth)"""
    cw = max(text_cells(l)[1] for l in lines); w, h = cw + 8, 8 * len(lines) + 5
    g = np.zeros((h + 4, w, 4), np.uint8); ink = INK + (255,); wh = (255, 255, 255, 255)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) and y in (0, h - 1): continue
            g[y, x] = ink if (x in (0, w - 1) or y in (0, h - 1) or (x in (1, w - 2) and y in (1, h - 2))) else wh
    tx = w - 9                                                     # the tail
    for j, (x0, x1) in enumerate([(tx, tx + 4), (tx + 1, tx + 4), (tx + 2, tx + 4), (tx + 3, tx + 4)]):
        yy = h - 1 + j
        for x in range(x0, x1): g[yy, x] = wh
        g[yy, x0 - 1] = ink; g[yy, min(w - 1, x1)] = ink
    g[h + 3, tx + 2:tx + 5] = ink
    n = 0
    for li, l in enumerate(lines):
        cells, lw = text_cells(l); ox = 4 + (cw - lw) // 2; oy = 3 + 8 * li
        for q, r in sorted(cells):
            if n >= shown: break
            g[oy + r, ox + q] = ink; n += 1
    return Image.fromarray(g).resize((w * px, (h + 4) * px), Image.NEAREST), (tx + 2) * px, (h + 4) * px

def effects_end(arr, t, c, T, m):
    k = W / c[2]
    arr, fx, top = G.effects(dict(tag="end_line"), arr, t, c, 62.47 + t, m)        # the fire's own embers keep rising
    d = ImageDraw.Draw(fx); dt = ImageDraw.Draw(top)
    mx, my, mw = mouth_at(t); X, Y = to_scr(c, mx, my + 6); fw = mw * k
    lv = loud(t); r = fw * (0.36 + 0.07 * lv)
    gone = clamp((t - 4.05) / 0.2)
    if gone < 1:
        # his words leave his mouth as a puff of pixel embers: solid over his lips (they never show), flame tongues rising off it
        cs = max(4, int(round(fw / 14))); rr = np.random.default_rng(int(t * FPS))
        rx, ry = fw * (0.34 + 0.05 * lv), fw * (0.2 + 0.03 * lv)
        g = G.glow_disc(int(rx * 2.4), G.GOLD3, (0.45 + 0.3 * lv) * (1 - gone)); paste(fx, g, int(X - g.width / 2), int(Y - g.height / 2))
        nx, ny = int(rx / cs) + 2, int(ry / cs) + 6
        for gy in range(-ny, int(ry / cs) + 2):
            for gx in range(-nx, nx + 1):
                dd = math.hypot(gx * cs / rx, gy * cs / ry)
                tongue = gy < 0 and dd > 1.0 and abs(gx * cs) < rx * 0.8 and rr.random() < 0.35 * (1 - (-gy * cs) / (ry * 3.2))
                if dd > 1.12 and not tongue: continue
                core = dd < 0.85
                if not core and not tongue and rr.random() < 0.5: continue
                h = 0.97 - 0.4 * min(1, dd) + 0.12 * math.sin(T * 19 + gx * 1.7 + gy * 2.3) + 0.12 * lv - (0.25 if tongue else 0)
                a = 1.0 if core else (0.75 if tongue else (1.12 - dd) / 0.27)
                x0, y0 = X + gx * cs - cs / 2, Y + gy * cs - cs / 2 - (rr.uniform(0, cs) if tongue else 0)
                dt.rectangle([x0, y0, x0 + cs - 1, y0 + cs - 1], fill=G.brand_col(clamp((h - 0.5) / 0.5), gold=True) + (int(255 * a * (1 - gone)),))   # v5: the launch gold and white
    # the phrase on screen, and the bubble that carries it
    cur = [p for p in PHRASES if t >= p[0]]
    if cur and gone < 1:
        ts, lines = cur[-1]; total = sum(len(text_cells(l)[0]) for l in lines)
        shown = int(total * clamp((t - ts) / 0.22)); px = 6
        im, tail_x, hb = bubble(lines, shown, px)
        u = (t - ts) / 0.22; s = (0.85 + 0.15 * back(u)) if u < 1 else 1
        if t > 4.0: s *= 1 + 0.25 * out3((t - 4.0) / 0.2)
        if s != 1: im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST); tail_x *= s; hb *= s
        bx = X - 70 * k / 0.6 - tail_x; by = Y - fw * 1.25 - hb                     # tail tip above and left of his mouth
        bx = clamp(bx, 24, W - 24 - im.width)
        if gone > 0: im.putalpha(im.getchannel("A").point(lambda v: int(v * (1 - gone))))
        paste(top, im, int(bx), int(by))
        tipx, tipy = bx + tail_x, by + hb
        for q in range(24):                                                       # sparks streaming from his mouth into the bubble
            ph = (t * 2.4 + q / 24) % 1; e = ph
            x = X + (tipx - X) * e + 18 * math.sin(q * 2.3 + t * 9) * math.sin(math.pi * e); y = Y + (tipy - Y) * e - 30 * math.sin(math.pi * e)
            s2 = max(4, int(cs * 1.1 * (1 - 0.5 * e))); a = (0.55 + 0.45 * lv) * (1 - e * 0.4) * (1 - gone)
            d.rectangle([x - s2 / 2, y - s2 / 2, x + s2 / 2, y + s2 / 2], fill=G.brand_col(0.7 - 0.6 * e, gold=True) + (int(255 * a),))
    if 4.05 <= t < 4.45:                                                          # the bubble pops into sparks
        v = (t - 4.05) / 0.4; rr2 = np.random.default_rng(77)
        for q in range(40):
            ang = rr2.uniform(0, 6.28); sp = rr2.uniform(250, 700) * k / 0.6; x = X - 60 + math.cos(ang) * sp * v; y = Y - 160 + math.sin(ang) * sp * v + 300 * v * v
            d.rectangle([x - 3, y - 3, x + 3, y + 3], fill=G.GOLD3 + (int(255 * (1 - v)),))
    return arr, fx, top

def end_card_img(j):
    """the logo ending (held once its sun is up) with the launch video's title style: one line, its last word in gold"""
    img = Image.fromarray(G.end_card(j)).convert("RGBA")
    G.R4.title(img, j / FPS, [(0.3, [("Get on the ", G.SOFT), ("waitlist.", G.GOLD)], 1380)], sub=(0.75, "lifeflowweb.com", 1462))
    return np.array(img.convert("RGB"))
def frame_end(i, rd):
    j = i - G.END_OUT
    if i - VO["out"] >= VO["nf"]: return end_card_img(j)
    t = (i - VO["out"]) / FPS; T = i / FPS
    src = rd.next(); c = crop_of(shot(t)); x0, y0, w, h = c
    m768 = matte_full(src); m = matte_crop(m768, c)
    arr = cv2.resize(src[int(y0):int(y0 + h), int(x0):int(x0 + w)], (W, H), interpolation=cv2.INTER_AREA if w > W else cv2.INTER_LANCZOS4)
    bl = cv2.GaussianBlur(arr, (0, 0), 1.6); arr = cv2.addWeighted(arr, 1.7, bl, -0.7, 0)              # the 720p picture, sharpened
    arr = grade(arr, m)
    arr, fx, top = effects_end(arr, t, c, T, m)
    arr = light_comp(arr, fx)
    img = Image.fromarray(arr).convert("RGBA"); img.alpha_composite(top); out = np.array(img.convert("RGB"))
    if j >= 0:                                                                  # dissolve into the logo
        u = smooth((j + 1) / G.XF); out = (out.astype(np.float32) * (1 - u) + end_card_img(j).astype(np.float32) * u).astype(np.uint8)
    return out

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--preview":
        os.makedirs(f"{HERE}/prev_end", exist_ok=True)
        for sv in args[1].split(","):
            t = float(sv); i = VO["out"] + int(round(t * FPS)); skip = min(i - VO["out"], VO["nf"] - 1); rd = RoughReader(skip); F._prev_m = None
            Image.fromarray(frame_end(i, rd)).save(f"{HERE}/prev_end/e_{t:04.2f}.jpg", quality=90); rd.p.kill()
        sys.exit()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", f"{HERE}/end3.mp4"], stdin=subprocess.PIPE)
    rd = RoughReader(0); F._prev_m = None
    for i in range(VO["out"], G.N):
        enc.stdin.write(frame_end(i, rd).tobytes())
    enc.stdin.close(); enc.wait(); rd.p.kill()
    json.dump(dict(vo_nf=VO["nf"], vo_b=VO["b"], end_frames=G.N - VO["out"], line_frames=G.END_OUT - VO["out"]), open(f"{HERE}/end3.json", "w"))
    print("ending", G.N - VO["out"], "frames (line", G.END_OUT - VO["out"], "+ logo", G.N - G.END_OUT, ")")
