"""LifeFlow launch video v9 (+ 15 s cut): render5.py with
  - the hook on Tyler's opening (no separate clip of Ali sitting): the wheel rises behind Tyler on the bridge line and spins
    from morning to night, "What if your day / looked like this?" under him; as the wheel flips away, Dreamy floats out of it
    into his sky; then his name, the logo, the date as before
  - a calmer last frame: the logo ending stops once its sun is up (before its own words), and only the title and
    "LifeFlow · Early January 2027" stay with it (no website line)
  - the 15 s cut opens on Tyler's "Hey guys, how's it going?" with the same hook, then Ali
    python3 render6.py main|short [--preview 1.0,2.0] [--nocap]
"""
import json, math, os, sys, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render5 as R5
from render5 import R4, R3, R
from render3 import clamp, smooth, back, out3, in3, smoothv, W, H, FPS, L, SP, GOLD, SOFT, paste, pose_frame, burst, pixel_star, cloud, draw_cloud, wheel_tex, plane3d

R3.CUTS.update({
    "main": dict(segs=[("t", 0, 352, 1.0), ("a", 57, 513, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                 trans=["whip", "cut", "cut"], hook_wheel=False, hold=72),
    "short": dict(segs=[("t", 0, 45, 1.0), ("a", 378, 513, 1.0), ("a", 585, 672, 1.06), ("k", 659, 712, 1.0)],
                  trans=["whip", "cut", "cut"], hook_wheel=False, hold=54),
})
END_HOLD = 18                    # the logo ending's frame with its sun fully up, before "Let's clear your sky." appears
def build(cut):
    c = R3.CUTS[cut]; tl = []; o = 0
    for s in c["segs"]: tl.append(dict(out=o, clip=s[0], a=s[1], b=s[2], zoom=s[3])); o += s[2] - s[1]
    end_out = o - R3.XF; n = end_out + END_HOLD + 1 + c["hold"]
    return dict(segs=tl, trans=c["trans"], end_out=end_out, n=n, hook_wheel=False)
R3.build = build

# ---------------------------------------------------------------- the calm last frame: the logo with its sun up, the title under it
def end_frame(j, hold_from=END_HOLD):
    if R3.END is None: R3.END = R.end_frames()
    return R3.END[min(j, hold_from)].copy()
R3.end_frame = end_frame

# ---------------------------------------------------------------- the hook on Tyler
HOOK_OUT = 1.95                  # the wheel flips away from here; the title fades out with it
def tyler_overlays(img, t, z, hx, hy):
    S = lambda x, y: R.to_screen("t", t, z, x, y)
    dx, dy = R.REF["t_dreamy"]
    if t >= HOOK_OUT:            # Dreamy, on top of the wheel at night, floats out into Tyler's sky as the wheel goes
        u = (t - HOOK_OUT) / 0.6; w = smooth(u)
        pose = "celebrate" if 3.9 <= t < 4.62 or 10.86 <= t < 11.4 else ("wave" if t < 3.2 else "idle")
        fy = 8 * math.sin(t * 2 * math.pi / 2.6)
        if t >= 11.36: fy -= 1500 * in3((t - 11.36) / 0.36)
        X, Y = S(dx, dy + fy); sx, sy = hx, hy - 453               # where the wheel's own Dreamy sits
        X = sx + (X - sx) * w; Y = sy + (Y - sy) * w - 90 * math.sin(math.pi * clamp(u))
        R.draw_skyling(img, pose_frame("Dreamy-night", pose, t), 11, X, Y, 0.5 + 0.5 * w, glow=(200, 215, 255))
        burst(img, X, Y, t - HOOK_OUT - 0.3, k=7, n=7, radius=170, seed=1)
    if 2.25 <= t < 4.6:
        u = (t - 2.25) / 0.28; v = (4.6 - t) / 0.2; s = back(u) if u < 1 else 1
        X, Y = S(*R.REF["t_name"]); draw_cloud(img, cloud("Tyler Kardy, CMO", 2.7, 2), X, Y, s * clamp(v * 1.2), clamp(v))
    if t >= 9.0:
        u = (t - 9.0) / 0.3; s = back(u) if u < 1 else 1; X, Y = S(*R.REF["t_date"])
        if t >= 11.36: Y -= 1500 * in3((t - 11.36) / 0.36)
        draw_cloud(img, cloud("Early January 2027", 3.2, 1), X, Y, s); burst(img, X, Y, t - 9.05, k=8, n=8, radius=300, seed=4)
        for ox, oy, ph in [(-290, -70, 0.0), (300, -50, 0.5), (-250, 80, 1.1), (270, 90, 0.8)]:
            if t > 9.25: pixel_star(img, int(X + ox), int(Y + oy), 5, 0.85 * (0.5 + 0.5 * math.sin((t - 9.2) * 5 + ph * 6)) * clamp((t - 9.25) / 0.2))
    if 3.92 <= t < 11.4:
        u = clamp((t - 3.92) / 0.35); v = clamp((11.4 - t) / 0.25)
        im = R.LOCK.copy(); im.putalpha(im.getchannel("A").point(lambda q: int(q * out3(u) * v))); paste(img, im, 540 - im.width // 2, int(262 - 18 * (1 - out3(u))))

def tyler_scene(seg, i, TL):
    z = seg["zoom"]; n = seg["a"] + (i - seg["out"]); t = n / FPS
    arr = np.array(R.load_bg(R3.src_path("t", n), z))
    S = lambda x, y: R.to_screen("t", t, z, x, y); hx, hy = S(*REF_TH)
    if t < HOOK_OUT + 0.4:
        orig = arr.astype(np.float32)
        u = (t + 0.15) / 0.45; e = back(u, 1.2) if u < 1 else 1                       # already rising on the first frame
        k = 10 + (len(R.WHEEL) - 1 - 24) * smoothv(clamp((t - 0.1) / 1.6))           # morning to night
        rx = 62 * (1 - e) - 8; al = clamp(u * 2.5); sc = 0.7 + 0.3 * e
        if t > HOOK_OUT: v = in3((t - HOOK_OUT) / 0.4); rx += 80 * v; al *= 1 - out3((t - HOOK_OUT) / 0.22); sc *= 1 - 0.2 * v
        plane3d(arr, wheel_tex(k), hx, hy + 80 * (1 - e), R.W_W * sc, rx, 11 * math.sin(t * 2.2), alpha=al, glow=(150, 175, 240), anchor_y=R.W_HOR)
        m = R5.matte_arr("t", n, z)
        if m is not None: arr[:] = R5.lit_composite(arr, orig, m)
    img = Image.fromarray(arr).convert("RGBA")
    tyler_overlays(img, t, z, hx, hy)
    if t < HOOK_OUT + 0.35:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        R4.title(layer, t, [(-0.2, [("What if your day", SOFT)], 1350), (0.3, [("looked like ", SOFT), ("this?", GOLD)], 1452)])
        if t > HOOK_OUT: layer.putalpha(layer.getchannel("A").point(lambda q: int(q * (1 - clamp((t - HOOK_OUT) / 0.3)))))
        img.alpha_composite(layer)
    return np.array(img.convert("RGB")), "t", t

_scene_prev = R3.scene
def scene(seg, i, TL, captions=True):
    if seg["clip"] == "t": return tyler_scene(seg, i, TL)
    n = seg["a"] + (i - seg["out"]); t = n / FPS
    if seg["clip"] == "a" and t < 2.32: return R4._scene0(seg, i, TL, captions)      # no Ali hook any more
    return _scene_prev(seg, i, TL, captions)
R3.scene = scene

_cap_prev = R3.draw_caption
def draw_caption(img, clip, t):
    if clip == "t" and t < HOOK_OUT + 0.3: return                                    # the hook's title is the words here
    return _cap_prev(img, clip, t)
R3.draw_caption = draw_caption

REF_TH = None
if __name__ == "__main__":
    REF_TH = R.ref_at("t", 30, 540, 960)
    cut = sys.argv[1]; TL = R3.build(cut); R3.init_refs_k(); args = sys.argv[2:]; caps = "--nocap" not in args
    json.dump(TL, open(f"{L}/timeline_{cut}.json", "w"))
    if args and args[0] == "--preview":
        os.makedirs(f"{L}/prev", exist_ok=True)
        for s in args[1].split(","):
            i = int(round(float(s) * FPS)); Image.fromarray(R3.frame(i, TL, caps)).save(f"{L}/prev/v9{cut}_{float(s):05.2f}.jpg", quality=92)
        sys.exit()
    out = f"{L}/{cut}_silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(TL["n"]):
        enc.stdin.write(R3.frame(i, TL).tobytes())
        if i % 100 == 0: print(i, "/", TL["n"], flush=True)
    enc.stdin.close(); enc.wait(); print(cut, "frames", TL["n"], "seconds", round(TL["n"] / FPS, 2))
