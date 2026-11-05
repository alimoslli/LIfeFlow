"""Slow-motion capture -> 30 fps clip (1080x2338) with a finger mark on every tap.
Usage: python3 build_rec.py <dir with log.json + frames/> out.mp4"""
import json, subprocess, sys, bisect
from PIL import Image, ImageDraw, ImageFilter

D, OUT = sys.argv[1], sys.argv[2]
L = json.load(open(f"{D}/log.json"))
fr = sorted(L["frames"], key=lambda f: f[1])
ts = [f[1] for f in fr]
W, H, FPS, K = 1080, 2338, 60, 1080 / 390  # CSS px -> output px
T0, T1 = ts[0], ts[-1]
n = int((T1 - T0) * FPS)

R = int(23 * K)
def finger(scale, alpha):
    s = int(R * 2 * scale) + 40
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c, r = s / 2, R * scale
    sh = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((c - r, c - r + 4, c + r, c + r + 4), fill=(0, 0, 0, int(70 * alpha)))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.ellipse((c - r, c - r, c + r, c + r), fill=(40, 40, 40, int(78 * alpha)), outline=(255, 255, 255, int(235 * alpha)), width=max(2, int(2 * K * 0.8)))
    return im

def env(dt):
    # dt = time since the tap was logged (the touch lands at +0.12)
    if dt < 0 or dt > 0.5:
        return None
    if dt < 0.12:
        k = dt / 0.12
        return 1.3 - 0.3 * k, k
    if dt < 0.22:
        return 1.0 - 0.08 * (dt - 0.12) / 0.1, 1.0
    k = (dt - 0.22) / 0.28
    return 0.92 + 0.5 * k, 1 - k

enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)
cache = {}
for i in range(n):
    t = T0 + i / FPS
    j = max(0, bisect.bisect_right(ts, t) - 1)
    if j + 1 < len(ts) and abs(ts[j + 1] - t) < abs(ts[j] - t):
        j += 1
    im = Image.open(f"{D}/frames/{fr[j][0]}").convert("RGB").resize((W, H), Image.LANCZOS).convert("RGBA")
    for tp in L["taps"]:
        e = env(t - tp["t"])
        if e:
            f = finger(*e)
            im.alpha_composite(f, (int(tp["x"] * K - f.width / 2), int(tp["y"] * K - f.height / 2)))
    enc.stdin.write(im.convert("RGB").tobytes())
enc.stdin.close(); enc.wait()
print("ok", OUT, n, "frames; marks (clip time):", {k: round(v - T0, 2) for k, v in L["marks"].items()})
