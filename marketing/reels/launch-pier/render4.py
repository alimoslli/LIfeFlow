"""LifeFlow launch video v7 (+ the 15 s cut): render3.py with a real hook and the cover's title as the ending.
  - Hook (IMG_4127 0.2 .. 2.3 s, Ali silent before he speaks): the wheel rises behind him and spins from morning to night,
    and the cover-style title comes up under him: "What if your day looked like this?". Then the whip to Tyler.
  - Ending (IMG_4126 "Be ready by January, 2027."): the cover comes alive. The wheel rises behind him and settles on Goldie,
    "Your day, drawn as the sky." comes up under him, then "LifeFlow · Early January 2027"; then the logo ending.
    python3 render4.py main|short [--preview 1.0,2.0] [--nocap]
"""
import json, math, os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render3 as R3
from render3 import R, clamp, smooth, back, out3, in3, smoothv, W, H, FPS, L, SP, GOLD, SOFT, wheel_tex, plane3d, matte_arr, lit_composite, pixel_star

R3.CUTS.update({
    "main": dict(segs=[("a", 6, 69, 1.0), ("t", 0, 352, 1.0), ("a", 69, 513, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                 trans=["whip", "whip", "cut", "cut"], hook_wheel=False, hold=20),
    # 15 s: the hook, then the answer: "showing all your classes, your work shifts, your schedules and all your finances,
    # with a very smart skyling by your side all day. Be ready by January, 2027." and the logo
    "short": dict(segs=[("a", 6, 69, 1.0), ("a", 378, 513, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                  trans=["whip", "cut", "cut"], hook_wheel=False, hold=6),
})
R.CAPS["k"] = []          # the ending's words are the title now (his "January 2027" is in its last line)

# ---------------------------------------------------------------- the title, as on the cover (Fraunces Bold under him, "sky" in gold)
F_T = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", 92); F_S = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 40)
_band = None
def title(img, t, lines, sub=None):
    """lines: [(start, [(text, colour), ...], baseline_y)], sub: (start, text, y). Each rises 24 px and fades in over 0.3 s."""
    global _band
    first = min([l[0] for l in lines] + ([sub[0]] if sub else []))
    if t < first: return
    if _band is None:
        b = Image.new("L", (W, H), 0); ImageDraw.Draw(b).rectangle([0, 1250, W, 1560], fill=150); _band = b.filter(ImageFilter.GaussianBlur(70))
    a = out3((t - first) / 0.4); dark = Image.new("RGBA", (W, H), (8, 14, 34, 0)); dark.putalpha(_band.point(lambda v: int(v * a))); img.alpha_composite(dark)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    def put(parts, y, font, u):
        if u <= 0: return
        al = int(255 * out3(u)); y = y + 24 * (1 - out3(u)); wsum = sum(font.getlength(s) for s, _ in parts); x = 540 - wsum / 2
        for s, c in parts:
            d.text((x + 3, y + 4), s, font=font, fill=(5, 10, 30, int(al * 0.6)), anchor="ls"); d.text((x, y), s, font=font, fill=c + (al,), anchor="ls"); x += font.getlength(s)
    for st, parts, y in lines: put(parts, y, F_T, (t - st) / 0.3)
    if sub: put([(sub[1], (201, 213, 238))], sub[2], F_S, (t - sub[0]) / 0.3)
    img.alpha_composite(layer)

# ---------------------------------------------------------------- the hook (IMG_4127 0.2 .. 2.3 s)
def hook(arr, t, z, n):
    S = lambda x, y: R.to_screen("a", t, z, x, y); hx, hy = S(*R.REF["a_horizon"])
    orig = arr.astype(np.float32)
    u = (t - 0.05) / 0.45; e = back(u, 1.2) if u < 1 else 1                       # already rising on the first frame
    k = 10 + (len(R.WHEEL) - 1 - 24) * smoothv(clamp((t - 0.35) / 1.5))          # morning to night
    plane3d(arr, wheel_tex(k), hx, hy + 80 * (1 - e), R.W_W * (0.7 + 0.3 * e), 62 * (1 - e) - 8, 11 * math.sin((t - 0.2) * 2.2),
            alpha=clamp(u * 2.5), glow=(150, 175, 240), anchor_y=R.W_HOR)
    m = matte_arr("a", n, z)
    if m is not None: arr[:] = lit_composite(arr, orig, m)
    img = Image.fromarray(arr).convert("RGBA")
    title(img, t, [(0.12, [("What if your day", SOFT)], 1350), (0.5, [("looked like ", SOFT), ("this?", GOLD)], 1452)])
    return img

# ---------------------------------------------------------------- the ending (IMG_4126 21.97 .. 23.73 s): the cover, alive
def ending(arr, t, z, n):
    S = lambda x, y: R.to_screen("k", t, z, x, y); hx, hy = S(*R3.REF_K["horizon"])
    orig = arr.astype(np.float32)
    u = (t - 21.9) / 0.5; e = back(u, 1.2) if u < 1 else 1
    k = 55 + 37 * smoothv(clamp((t - 21.95) / 1.25))                            # Ray to Goldie, then it stays golden (as on the cover)
    plane3d(arr, wheel_tex(k), hx, hy + 80 * (1 - e), R.W_W * (0.7 + 0.3 * e), 62 * (1 - e) - 8, 6 * math.sin((t - 21.9) * 1.6),
            alpha=clamp(u * 2.5), glow=(170, 170, 220), anchor_y=R.W_HOR)
    m = matte_arr("k", n, z)
    if m is not None: arr[:] = lit_composite(arr, orig, m)
    img = Image.fromarray(arr).convert("RGBA")
    title(img, t, [(22.02, [("Your day,", SOFT)], 1350), (22.32, [("drawn as the ", SOFT), ("sky.", GOLD)], 1452)],
          sub=(22.78, "LifeFlow  ·  Early January 2027", 1525))
    for ox, oy, ph in [(-330, 1290, 0.0), (350, 1330, 0.6), (-300, 1480, 1.2), (330, 1470, 0.3)]:
        if t > 22.5: pixel_star(img, 540 + ox, oy, 5, 0.85 * (0.5 + 0.5 * math.sin((t - 22.5) * 5 + ph * 6)) * clamp((t - 22.5) / 0.3))
    return img

_scene0 = R3.scene
def scene(seg, i, TL, captions=True):
    clip, z = seg["clip"], seg["zoom"]; n = seg["a"] + (i - seg["out"]); t = n / FPS
    if clip == "a" and t < 2.32:
        arr = np.array(R.load_bg(R3.src_path("a", n), z)); return np.array(hook(arr, t, z, n).convert("RGB")), clip, t
    if clip == "k" and t > 20:
        arr = np.array(R.load_bg(R3.src_path("k", n), z)); return np.array(ending(arr, t, z, n).convert("RGB")), clip, t
    return _scene0(seg, i, TL, captions)
R3.scene = scene

if __name__ == "__main__":
    cut = sys.argv[1]; TL = R3.build(cut); R3.init_refs_k(); args = sys.argv[2:]; caps = "--nocap" not in args
    json.dump(TL, open(f"{L}/timeline_{cut}.json", "w"))
    if args and args[0] == "--preview":
        os.makedirs(f"{L}/prev", exist_ok=True)
        for s in args[1].split(","):
            i = int(round(float(s) * FPS)); Image.fromarray(R3.frame(i, TL, caps)).save(f"{L}/prev/v7{cut}_{float(s):05.2f}.jpg", quality=92)
        sys.exit()
    out = f"{L}/{cut}_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(TL["n"]):
        enc.stdin.write(R3.frame(i, TL).tobytes())
        if i % 100 == 0: print(i, "/", TL["n"], flush=True)
    enc.stdin.close(); enc.wait(); print(cut, "frames", TL["n"], "seconds", round(TL["n"] / FPS, 2))
