"""The show open, v2 (Ali: the pixel intro "is a bit cheap and not good with the vid", "the Q&A text isn't as good as the
rest", "users aren't sure if this is a LifeFlow video"). Stage 2: everything on top of the slow-motion plate.
  - the real yard, the real fire, in slow motion (the breath between Tyler's question and Ali's answer)
  - the LifeFlow lockup (the app icon and the wordmark) first, then the title in the launch type (Fraunces Bold, soft white, gold)
  - the sky over the fence runs one whole day in the app's own sky colours, and each skyling lands on the title in its hour
  - night again, the app's stars; the camera pushes in to Ali and the cut to his answer is invisible
    python3 open2_compose.py ["Campfire|Q&A"] [--preview 1.0,2.5]   -> intro_silent.mp4, intro.wav (the show's own sound)
"""
import json, math, os, subprocess, sys, wave
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
sys.path.insert(0, HERE); sys.path.insert(0, f"{SP}/skit3"); _argv = sys.argv; sys.argv = sys.argv[:1]
import fire_render2 as G
import sprites as SPR
sys.argv = _argv
F = G.F; W, H, FPS = 1080, 1920, 30
clamp, smooth, out3, back = G.clamp, G.smooth, G.out3, G.back
TITLE = next((a for a in sys.argv[1:] if "|" in a), "Campfire |Q&A").split("|")          # soft white | gold
PL = json.load(open(f"{HERE}/open2/plate.json")); NF = PL["nf"]; FR = PL["frames"]; S0 = FR[0]["crop"]; PUSH_T = PL["push0"] / FPS
KIT = f"{SP}/kit/lifeflow-brand/assets"; FONT = f"{SP}/editorpack/fonts/Fraunces-Bold.ttf"
SOFT, GOLD, INK = G.SOFT3, G.GOLD3, (8, 14, 34)

# ---------------------------------------------------------------- the day in the sky, and who lands when
CAST = [("Dawn", 398, (255, 200, 170)), ("Ray", 700, (255, 226, 160)), ("Goldie", 1035, (255, 205, 130)), ("Twinkle-night", 1130, (200, 215, 255)), ("Dreamy-night", 1300, (200, 215, 255))]
EDGE, RAMP = -2.0, 8.0
POP = [1.05, 1.55, 2.05, 2.55, 3.05]                                  # one every half second: calm
def minute(t): return float(np.interp(t, [0.0, 0.7] + POP + [3.4], [330, 345] + [c[1] for c in CAST] + [1320]))
def wash_alpha(t): return 0.84 * smooth(clamp((t - 0.25) / 0.6)) * (1 - smooth(clamp((t - PUSH_T) / 0.75)))
def lum(c): return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
def daylight(m):
    top, mid, hor = G.sky_cols(np.array([float(m)]))[0]; return clamp((lum(mid) - 0.16) / 0.42), hor

# ---------------------------------------------------------------- the overlay canvas: the first frame's screen, at 2x, top part
CS = 2; CW, CH = W * CS, 900 * CS
def warp_of(c):
    """canvas px -> screen px for the shot c (the overlay is fixed in the scene, so it moves with the camera)"""
    a = S0[2] / (CS * c[2]); return np.float32([[a, 0, (S0[0] - c[0]) * W / c[2]], [0, a, (S0[1] - c[1]) * W / c[2]]])
F_T = ImageFont.truetype(FONT, 114 * CS)
TW_ = [F_T.getlength(s) for s in TITLE]; TX0 = CW / 2 - sum(TW_) / 2; TBASE = 572 * CS              # the title's baseline (canvas px)
_tm = Image.new("L", (CW, CH), 0); ImageDraw.Draw(_tm).text((TX0, TBASE), "".join(TITLE), font=F_T, fill=255, anchor="ls"); TMASK = np.asarray(_tm) > 128
LOCK = Image.open(f"{KIT}/logo/logo_lockup_white_text.png").convert("RGBA"); LOCK = LOCK.crop(LOCK.getbbox()); LOCK = LOCK.resize((int(430 * CS), int(430 * CS * LOCK.height / LOCK.width)), Image.LANCZOS)
LOCK_Y = 186 * CS
PXS = 5.6 * CS                                                        # canvas px per art pixel
SEAT_X = [TX0 + sum(TW_) * f for f in (0.085, 0.30, 0.50, 0.71, 0.915)]
def seat_y(x):
    cols = TMASK[:, int(x - 3.2 * PXS):int(x + 3.2 * PXS)]; rows = np.where(cols.any(1))[0]; return int(rows.min()) if len(rows) else TBASE - 100 * CS
SEAT_Y = [seat_y(x) for x in SEAT_X]
rng = np.random.default_rng(11)
STARS = []
while len(STARS) < 56:
    x, y = rng.uniform(30, W - 30), rng.uniform(24, 700)
    X = S0[0] + x * S0[2] / W; yr = (G.roof(np.array([X]))[0] - S0[1]) * W / S0[2]
    if y > yr - 90 or (x > 520 and y > 560): continue                # not behind the roof, not in the string lights
    if 110 < y < 540 and 60 < x < W - 60 and rng.uniform() < 0.8: continue   # few behind the words
    STARS.append((x * CS, y * CS, rng.uniform(0, 6.28), rng.uniform(0.45, 1.0), rng.choice([1, 1, 1, 2])))
def shadow_of(layer, blur, k):
    a = layer.getchannel("A").filter(ImageFilter.GaussianBlur(blur)); dk = Image.new("RGBA", layer.size, INK + (0,)); dk.putalpha(a.point(lambda v: int(min(255, v * k)))); return dk
def put_art(cv, art, cx, feet, px, sx=1.0, sy=1.0, alpha=1.0):
    w, h = max(2, int(26 * px * sx)), max(2, int(26 * px * sy)); im = Image.fromarray(art).resize((w, h), Image.NEAREST)
    if alpha < 1: im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    cv.alpha_composite(im, (int(cx - w / 2), int(feet - h * 0.962)))
def overlay(t):
    cv = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); d = ImageDraw.Draw(cv); m = minute(t); day, _ = daylight(m)
    night = (1 - day) * smooth(clamp((t - 2.7) / 0.9))                # the app's stars come out when the day is done
    if night > 0.02:
        for (x, y, ph, br, sz) in STARS:
            a = night * br * (0.55 + 0.45 * math.sin(t * 5.2 + ph)); s = sz * CS * 1.5
            d.rectangle([x - s, y - s, x + s, y + s], fill=(255, 246, 222, int(235 * a)))
            if sz == 2: d.rectangle([x - 3 * s, y - s / 2, x + 3 * s, y + s / 2], fill=(255, 246, 222, int(120 * a))); d.rectangle([x - s / 2, y - 3 * s, x + s / 2, y + 3 * s], fill=(255, 246, 222, int(120 * a)))
    txt = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); dt = ImageDraw.Draw(txt)
    u = clamp((t - 0.12) / 0.55)                                       # LifeFlow first
    if u > 0:
        lk = LOCK.copy(); lk.putalpha(lk.getchannel("A").point(lambda v: int(v * out3(u)))); txt.alpha_composite(lk, (int(CW / 2 - LOCK.width / 2), int(LOCK_Y + 22 * CS * (1 - out3(u)))))
    x = TX0
    for k, (s, col) in enumerate(zip(TITLE, (SOFT, GOLD))):           # then the title, a word at a time, rising like the launch titles
        u = clamp((t - 0.42 - 0.2 * k) / 0.5)
        if u > 0: dt.text((x, TBASE + 26 * CS * (1 - out3(u))), s, font=F_T, fill=col + (int(255 * out3(u)),), anchor="ls", stroke_width=3 * CS, stroke_fill=INK + (int(215 * out3(u)),))
        x += TW_[k]
    cv.alpha_composite(shadow_of(txt, 16 * CS, 1.5)); cv.alpha_composite(txt)
    for j, (nm, hour, glow) in enumerate(CAST):                       # each one lands in its own hour
        tj = t - POP[j]
        if tj < 0: continue
        fall = out3(clamp(tj / 0.26)); land = clamp((tj - 0.26) / 0.2); sq = math.sin(math.pi * land) * 0.16 if 0 < land < 1 else 0
        hover = (11 + 5 * math.sin(t * 1.7)) * CS if j == 4 else 0     # Dreamy, the moon, doesn't quite sit
        feet = SEAT_Y[j] + 2 * CS - (1 - fall) * 120 * CS - hover
        pose = "wave" if 0.3 < tj < 1.05 else "idle"; fr = SPR.kit(nm, pose)
        art = fr[int(tj / 0.16) % len(fr)] if pose == "wave" else (fr[1] if ((t + j * 0.53) % 2.6) < 0.13 and len(fr) > 1 else fr[0])
        g = G.glow_disc(int(26 * PXS * 0.85), glow, 0.30 * clamp(tj / 0.2) * (1 + 0.8 * math.exp(-max(0, tj - 0.26) / 0.25)) / 1.8)
        cv.alpha_composite(g, (int(SEAT_X[j] - g.width / 2), int(feet - 13 * PXS - g.height / 2)))
        put_art(cv, art, SEAT_X[j], feet, PXS, sx=1 + sq, sy=1 - sq, alpha=clamp(tj / 0.1))
        if 0.24 < tj < 0.7:                                            # a few sparks where it lands
            v = (tj - 0.24) / 0.46
            for q in range(7):
                ang = math.pi * (1.08 + 0.84 * q / 6); r = (16 + 44 * out3(v)) * CS; s = 2.2 * CS * (1 - v)
                px_, py_ = SEAT_X[j] + r * math.cos(ang), SEAT_Y[j] + 0.5 * r * math.sin(ang) + 30 * CS * v * v
                d2 = ImageDraw.Draw(cv); d2.rectangle([px_ - s, py_ - s, px_ + s, py_ + s], fill=GOLD + (int(255 * (1 - v)),))
    return cv

# ---------------------------------------------------------------- frames
_plate = None
def plate(i):
    global _plate
    if _plate is None:
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{HERE}/open2/plate.mp4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        _plate = np.frombuffer(b, np.uint8).reshape(-1, H, W, 3)
    return _plate[i]
_ys = np.arange(H, dtype=np.float32)[:, None]; _noise = np.random.default_rng(2).normal(0, 1.3, (H, W, 1)).astype(np.float32)
def frame(i):
    t = i / FPS; fr = FR[i]; c = fr["crop"]; arr = plate(i).copy(); m = minute(t); al = wash_alpha(t); day, hor = daylight(m)
    a = arr.astype(np.float32)
    if al > 0.01:                                                     # the app's sky, with the real string lights shining on top of it
        xs, ys, rf, above, r1 = G.sky_geom(c)
        if r1 > 0:
            above = np.clip((rf[None, :] - EDGE - ys[:, None]) / RAMP, 0, 1).astype(np.float32)   # a tighter edge on the roof than the body's wash
            cols = G.sky_cols(np.full_like(xs, m)); top, mid, hor = cols[None, :, 0], cols[None, :, 1], cols[None, :, 2]
            tt = np.clip((ys[:, None] - 150) / (rf[None, :] - 150), 0, 1)[..., None]
            col = np.where(tt < 0.55, top + (mid - top) * (tt / 0.55), mid + (hor - mid) * ((tt - 0.55) / 0.45)) * (0.86 + 0.14 * tt)
            col = col + _noise[:r1]                                    # no banding
            sub = a[:r1]; faint = np.clip((sub.max(-1, keepdims=True) - 26) / 60, 0, 1)                 # the night's own faint trees and noise don't show through
            a[:r1] = sub + (np.clip(col, 0, 255) * (1 - sub * faint / 255) - sub * (1 - faint)) * (above[..., None] * al / 0.84)
    k = day * al / 0.84
    if k > 0.01:                                                      # daylight reaches the yard a little (a time lapse, not a second sun)
        xs = c[0] + (np.arange(W) + 0.5) * c[2] / W; ry = (G.roof(xs) - c[1]) * W / c[2]
        below = np.clip((_ys - ry[None, :] + 30) / 120, 0, 1)[..., None]
        a = a * (1 + 0.42 * k * below) + hor * (0.075 * k) * below
    cv = np.asarray(overlay(t)).astype(np.float32); cv[..., :3] *= cv[..., 3:4] / 255             # premultiplied
    acc = np.zeros((H, W, 4), np.float32)
    sa, sb = np.array(fr["subs"][0]), np.array(fr["subs"][-1]); ns = 1 if len(fr["subs"]) == 1 else 18          # the words blur with the camera, finely
    for v in np.linspace(0, 1, ns): acc += cv2.warpAffine(cv, warp_of(sa + (sb - sa) * v), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    acc /= ns
    a = a * (1 - acc[..., 3:4] / 255) + acc[..., :3]
    return np.clip(a, 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- its sound (the app's own sounds, and a few made here)
SR = 48000
def sound():
    DUR = NF / FPS; n = int((DUR + 0.9) * SR); mix = np.zeros((n, 2), np.float32); R2 = np.random.default_rng(3)
    def band(x, lo, hi):
        X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x)).astype(np.float32)
    def norm(x): return x / (np.abs(x).max() + 1e-9)
    def put(x, t, g):
        x = np.asarray(x, np.float32); x = np.stack([x, x], -1) if x.ndim == 1 else x; i = int(t * SR); j = min(n, i + len(x))
        if j > i: mix[i:j] += x[: j - i] * 10 ** (g / 20)
    def load(p):
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "2", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True).stdout
        return np.frombuffer(b, np.int16).reshape(-1, 2).astype(np.float32) / 32768
    sfx = f"{SP}/editorpack/sfx"
    L = int(0.9 * SR); tt = np.arange(L) / SR                                                     # time slows: a soft falling breath
    put(norm(band(R2.normal(0, 1, L), 180, 2400) * np.exp(-tt / 0.32) * np.minimum(1, tt / 0.03)), 0.0, -17)
    put(load(f"{sfx}/sky_turns.wav"), 0.72, -9)                                                    # the sky starts to turn
    for k, f0 in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5]):                              # a chime as each one lands (rising)
        Lc = int(0.7 * SR); tc = np.arange(Lc) / SR; tone = (np.sin(2 * np.pi * f0 * tc) + 0.3 * np.sin(4 * np.pi * f0 * tc) + 0.08 * np.sin(6 * np.pi * f0 * tc)) * np.exp(-tc / 0.2) * np.minimum(1, tc / 0.004)
        put(norm(tone), POP[k] + 0.24, -17); put(load(f"{sfx}/skylings_pop_up.wav")[: int(0.11 * SR)], POP[k] + 0.02, -15)
    put(load(f"{sfx}/night_stars_twinkle.wav"), 3.15, -14)
    Lw = int(1.15 * SR); tw = np.linspace(0, 1, Lw)                                               # the push-in: air, rising to the cut
    put(norm(band(R2.normal(0, 1, Lw), 140, 3200) * tw ** 2.2 * np.minimum(1, (1 - tw) / 0.04)), DUR - 1.15, -15)
    Lb = int(0.8 * SR); tb = np.arange(Lb) / SR; put(norm(np.sin(2 * np.pi * (64 * tb - 14 * tb * tb)) * np.exp(-tb / 0.2)), DUR - 0.03, -10)   # it lands on Ali's first frame
    return mix

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--preview" in args:
        os.makedirs(f"{HERE}/open2/prev", exist_ok=True); ts = [float(x) for x in args[args.index("--preview") + 1].split(",")]; tiles = []
        for tv in ts:
            im = Image.fromarray(frame(min(NF - 1, int(round(tv * FPS))))); im.save(f"{HERE}/open2/prev/o_{tv:04.2f}.jpg", quality=92); tiles.append(im.resize((432, 768), Image.LANCZOS))
        sh = Image.new("RGB", (432 * min(5, len(tiles)), 768 * ((len(tiles) + 4) // 5)))
        for q, im in enumerate(tiles): sh.paste(im, ((q % 5) * 432, (q // 5) * 768))
        sh.save(f"{HERE}/open2/prev/sheet.jpg", quality=88); sys.exit()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "13", "-pix_fmt", "yuv420p", f"{HERE}/intro_silent.mp4"], stdin=subprocess.PIPE)
    for i in range(NF): enc.stdin.write(frame(i).tobytes())
    enc.stdin.close(); enc.wait()
    mix = sound()
    with wave.open(f"{HERE}/intro.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    print("show open v2:", NF, "frames", "title", TITLE)
