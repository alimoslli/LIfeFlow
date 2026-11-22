"""Jordan's UGC reel: cold open (wheel on his phone), setup (the list that falls apart), the app (narrated, with
skyling animations), payoff and sign-off, end card. 1080x1920, 25 fps.
   python3 jordan_reel.py [sheet]"""
import sys, os, json, subprocess, wave, math
HERE = os.path.dirname(os.path.abspath(__file__)); UGC = os.path.dirname(HERE); SP = os.path.dirname(UGC)
sys.path.insert(0, f"{SP}/skit3"); sys.path.insert(0, f"{SP}/fire"); sys.path.insert(0, f"{SP}/hour/shorts")
_argv = sys.argv; sys.argv = [sys.argv[0], "x"]
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import skit3_compose as S
import short as K
sys.argv = _argv
G = S.G; W, H, FPS, SR = 1080, 1920, 25, 48000
WORDS = json.load(open(f"{HERE}/words.json"))
FB = lambda s: ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", s); FG = lambda s: ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-SemiBold.ttf", s)
SOFT, GOLD, INK = tuple(S.SOFT3), tuple(S.GOLD3), (8, 14, 34)
CLOUD = Image.open(f"{SP}/kit/lifeflow-brand/assets/clouds/pixel-cloud-1-day.png").convert("RGBA")
CLOUD2 = Image.open(f"{SP}/kit/lifeflow-brand/assets/clouds/pixel-cloud-2-day.png").convert("RGBA")
_F0 = Image.open(f"{SP}/drama/app/seq/f0000.jpg").convert("RGB"); WHEEL = _F0.crop((0, 0, 780, 520))   # the wheel (local demo; replace with production)
def phone_wheel():
    """the phone's screen for the cold open: the wheel big and centred on the app's night sky"""
    c = Image.new("RGB", (780, 1690), WHEEL.getpixel((10, 10))); w = WHEEL.resize((780, 520)); c.paste(w, (0, 470)); return c
APP_SHOT = phone_wheel()
APP_TAP = json.load(open(f"{SP}/drama/app/seq/times.json"))["tap"]                       # tap on the wheel in the recording
def clip_frames(path, n=None, vf=None):
    vf = vf or f"scale={W}:{H}:flags=lanczos,fps={FPS}"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    return fr[:n] if n else fr
def grain(a, s=3.0, seed=0):
    r = np.random.default_rng(seed); return np.clip(a.astype(np.float32) + r.normal(0, s, a.shape[:2])[..., None], 0, 255).astype(np.uint8)
def shake(a, i, amp=4.0):
    dx = amp * (math.sin(i * 0.37) + 0.5 * math.sin(i * 0.91 + 1.3)); dy = amp * (math.sin(i * 0.29 + 2.1) + 0.5 * math.sin(i * 0.73)); z = 1.02
    M = np.float32([[z, 0, W / 2 * (1 - z) + dx], [0, z, H / 2 * (1 - z) + dy]]); return cv2.warpAffine(a, M, (W, H), borderMode=cv2.BORDER_REFLECT)
# ---------------------------------------------------------------- scene 1: the real Today screen on his phone
def screen_quad(im):
    g = im.mean(-1); m = (g > 215).astype(np.uint8) * 255; m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs: return None, None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 40000: return None, None
    r = cv2.minAreaRect(c); box = cv2.boxPoints(r).astype(np.float32)
    box = box[np.argsort(box[:, 1])]; top = box[:2][np.argsort(box[:2, 0])]; bot = box[2:][np.argsort(box[2:, 0])]
    mask = np.zeros(im.shape[:2], np.uint8); cv2.drawContours(mask, [c], -1, 255, -1)
    return np.array([top[0], top[1], bot[1], bot[0]], np.float32), mask
def put_screen(fr, quads, i, app):
    q, mask = quads[i]
    if q is None: return fr
    ah, aw = app.shape[:2]; Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]]), q)
    wp = cv2.warpPerspective(app, Hm, (W, H), flags=cv2.INTER_AREA).astype(np.float32)
    m = cv2.GaussianBlur(cv2.dilate(mask, np.ones((3, 3), np.uint8)), (0, 0), 1.2).astype(np.float32)[..., None] / 255
    return np.clip(fr * (1 - m) + (wp * 0.96 + 6) * m, 0, 255).astype(np.uint8)
# ---------------------------------------------------------------- scene 2: the to-do list that falls apart
TODO = ["Email Prof. Diaz", "Laundry!!", "Chem lab report", "Call the bank", "Shift swap?", "Gym", "Read ch. 7", "Pay phone bill",
        "Group project slides", "Groceries", "Return library book", "Study for quiz", "Text mom back", "Fix resume", "Dentist???", "Clean room"]
def todo_card(n_lines=16):
    f = FG(30); lh = 50; w, h = 400, 120 + lh * n_lines
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], 26, fill=(250, 250, 246, 236)); d.text((30, 34), "To do", font=FG(40), fill=(30, 34, 50, 255))
    for k, t in enumerate(TODO[:n_lines]):
        y = 104 + k * lh; d.rounded_rectangle([30, y + 6, 58, y + 34], 7, outline=(150, 156, 175, 255), width=3); d.text((76, y + 2), t, font=f, fill=(40, 44, 60, 255))
    return im
CARD = todo_card()
def list_overlay(img, t, gone_at):
    """the list scrolls up beside him; when he says "gone" it breaks into the app's clouds and drifts off"""
    if t < 0.2: return
    a_in = S.clamp((t - 0.2) / 0.35); x0, y0 = 50, 300; vis_h = 720; scroll = 46 * max(0, t - 0.4)
    if t < gone_at:
        crop = CARD.crop((0, int(scroll) % max(1, CARD.height - vis_h), CARD.width, int(scroll) % max(1, CARD.height - vis_h) + vis_h))
        crop.putalpha(crop.getchannel("A").point(lambda v: int(v * a_in))); fade = Image.new("L", crop.size, 255); dd = ImageDraw.Draw(fade)
        for k in range(80): dd.line([(0, vis_h - 80 + k), (crop.width, vis_h - 80 + k)], fill=int(255 * (1 - k / 80)))
        crop.putalpha(Image.fromarray(np.minimum(np.asarray(crop.getchannel("A")), np.asarray(fade)).astype(np.uint8))); img.alpha_composite(crop, (x0, y0)); return
    u = S.clamp((t - gone_at) / 1.1)
    for k, (dx, dy, sc, cl) in enumerate([(10, 60, 2, CLOUD), (150, 230, 2, CLOUD2), (20, 430, 2, CLOUD2), (170, 600, 2, CLOUD), (80, 330, 2, CLOUD)]):
        cw = 90 * sc; c = cl.resize((cw, max(1, int(cw * cl.height / cl.width))), Image.NEAREST); a = (1 - u) * min(1, u * 6)
        if a <= 0.02: continue
        c.putalpha(c.getchannel("A").point(lambda v, a=a: int(v * a))); img.alpha_composite(c, (int(x0 + dx - 160 * u * (1 + k * 0.3)), int(y0 + dy - 120 * u)))
# ---------------------------------------------------------------- scene 3: the real app, big, with the skyling
PW = 820; PH = int(PW * 1756 / 780); PX0 = (W - PW) // 2; PY0 = (H - PH) // 2 + 20; RAD = 54
SEQ = f"{SP}/drama/app/seq"; SEQT = json.load(open(f"{SEQ}/times.json"))
def app_frames(t0, n):
    ts = np.array(SEQT["shots"]); out = []; cache = {}
    for j in range(n):
        k = int(max(0, np.searchsorted(ts, t0 + j / FPS, side="right") - 1))
        if k not in cache: cache[k] = np.asarray(Image.open(f"{SEQ}/f{k:04d}.jpg").convert("RGB").resize((PW, PH), Image.LANCZOS))
        out.append(cache[k])
    return out
def app_bg():
    top, mid, hor = G.sky_cols(np.array([700.0]))[0]; t = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    col = np.where(t < 0.55, top + (mid - top) * (t / 0.55), mid + (hor - mid) * ((t - 0.55) / 0.45)); bg = np.repeat(col[:, None, :], W, 1).astype(np.uint8)
    im = Image.fromarray(bg).convert("RGBA"); sh = Image.new("L", (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle([PX0 - 10, PY0 + 18, PX0 + PW + 10, PY0 + PH + 40], RAD + 10, fill=140)
    dk = Image.new("RGBA", (W, H), (2, 6, 20, 0)); dk.putalpha(sh.filter(ImageFilter.GaussianBlur(34))); im.alpha_composite(dk)
    ImageDraw.Draw(im).rounded_rectangle([PX0 - 9, PY0 - 9, PX0 + PW + 9, PY0 + PH + 9], RAD + 9, fill=(16, 20, 36, 255))
    m = Image.new("L", (PW, PH), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, PW - 1, PH - 1], RAD, fill=255); return im, m
def label(img, text, x, y, a, col=GOLD, size=58):
    if a <= 0: return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay); f = FB(size)
    w = f.getlength(text); d.rounded_rectangle([x - w / 2 - 26, y - size * 0.75, x + w / 2 + 26, y + size * 0.65], 30, fill=INK + (int(215 * a),))
    d.text((x, y), text, font=f, fill=col + (int(255 * a),), anchor="mm"); img.alpha_composite(lay)
# ---------------------------------------------------------------- build
def caption(img, key, t, off=0.0):
    S.caption(img, [tuple(w[:1]) + (w[1] + off, w[2] + off) for w in WORDS[key]], t, hold=0.3, CAP_Y=1560)
def wt(key, word, n=0):
    hits = [w for w in WORDS[key] if w[0].strip(".,?!").lower() == word.lower()]; return hits[n][1]
def build(sheet=False):
    s1 = clip_frames(f"{UGC}/shot1.mp4"); s2 = clip_frames(f"{UGC}/shot2.mp4")
    s3 = clip_frames(f"{UGC}/shot3.mp4", vf=f"scale={W}:{H}:flags=lanczos,fps={FPS},colorbalance=rs=-0.04:gs=-0.01:bs=0.03:rm=-0.03:bm=0.02,eq=saturation=0.93")
    n3 = int(round(10.88 * FPS)) + 6; t_tap = wt("n3", "tap"); app = app_frames(APP_TAP - t_tap, n3)
    quads = [screen_quad(f) for f in s1]; q0 = next((q for q in quads if q[0] is not None), (None, None)); quads = [q if q[0] is not None else q0 for q in quads]
    shot_app = np.asarray(APP_SHOT)
    bg, pmask = app_bg(); t_sky = wt("n3", "skyling"); t_now = wt("n3", "what's", 0); t_next = wt("n3", "next")
    segs = [("s1", len(s1)), ("s2", len(s2)), ("n3", n3), ("s3", len(s3))]; starts = {}; o = 0
    for k, n in segs: starts[k] = o; o += n
    body = o; END = int(3.0 * FPS); XF = 7; N = body + END
    enc = None if sheet else subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", f"{HERE}/_silent.mp4"], stdin=subprocess.PIPE)
    picks = []; last = None
    for i in range(N):
        if i < starts["s2"]:
            j = i; t = j / FPS; fr = put_screen(s1[j], quads, j, shot_app)
            q = quads[j][0]; top = (q[0] + q[1]) / 2 if q is not None else np.array([W / 2, H / 2]); bot = (q[3] + q[2]) / 2 if q is not None else top; cx, cy = top + (bot - top) * 0.43
            u = S.smooth(S.clamp((t - 1.1) / 0.6)); z = 4.0 + (1.0 - 4.0) * u; tx = cx + (W / 2 - cx) * u; ty = cy + (H / 2 - cy) * u
            M = np.float32([[z, 0, W / 2 - z * tx], [0, z, H / 2 - z * ty]]); fr = cv2.warpAffine(fr, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            img = Image.fromarray(grain(shake(fr, j, 2.0 * u), seed=j)).convert("RGBA"); caption(img, "s1", t)
        elif i < starts["n3"]:
            j = i - starts["s2"]; t = j / FPS; img = Image.fromarray(grain(s2[j], seed=j)).convert("RGBA"); list_overlay(img, t, wt("s2", "gone")); caption(img, "s2", t)
        elif i < starts["s3"]:
            j = i - starts["n3"]; t = j / FPS; im = bg.copy(); im.paste(Image.fromarray(app[min(j, len(app) - 1)]), (PX0, PY0), pmask)
            t_w0 = wt("n3", "wheel") - 0.5; t_u0 = t_sky - 1.0; t_u1 = t_sky - 0.2
            zw = S.smooth(S.clamp((t - t_w0) / 0.45)) * (1 - S.smooth(S.clamp((t - t_u0) / (t_u1 - t_u0))))   # push into the wheel on "one wheel", back out before "my skyling"
            z0 = 1 + 0.03 * j / n3; z = z0 + (1.34 - z0) * zw; wcx, wcy = PX0 + PW / 2, PY0 + PH * 0.15; tx = W / 2 + (wcx - W / 2) * zw; ty = H / 2 + (wcy + 260 / 1.34 - H / 2) * zw
            arr = cv2.warpAffine(np.array(im.convert("RGB")), np.float32([[z, 0, W / 2 - z * tx], [0, z, H / 2 - z * ty]]), (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            if j < 6: arr = (arr.astype(np.float32) * (j + 1) / 6 + 255 * (1 - (j + 1) / 6)).astype(np.uint8)   # flash in
            a = arr.astype(np.float32)
            u = S.clamp((t - t_sky + 0.1) / 0.3)
            if u > 0:                                                                       # Goldie pops up beside the phone as he says "my skyling"
                lift = 60 * (1 - S.out3(u)) + 6 * math.sin(t * 3); pose = "celebrate" if t - t_sky < 1.6 else None
                S.put_skyling(a, S.face("goldie", t, pose=pose), W - 140, 1440, 10.5, lift=lift, glow=S.CAST["goldie"][3], fire=False, shadow=False, alpha=min(1, u * 2))
            if t_tap - 0.15 <= t < t_tap + 0.5:                                             # the tap
                uu = (t - t_tap + 0.15) / 0.65; cx, cy = PX0 + PW * 0.5, PY0 + PH * 0.22; rr = 30 + 60 * uu
                cv2.circle(a, (int(cx), int(cy)), int(rr), (255, 255, 255), 6)
            img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")
            ph = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dph = ImageDraw.Draw(ph); dph.rounded_rectangle([140, 64, 940, 128], 20, fill=(200, 40, 40, 230))
            dph.text((540, 96), "PLACEHOLDER: production app recording goes here", font=FG(28), fill=(255, 255, 255, 255), anchor="mm"); img.alpha_composite(ph)
            label(img, "Now", 230, 300, S.clamp((t - t_now) / 0.25)); label(img, "Next", 850, 300, S.clamp((t - t_next) / 0.25))
            caption(img, "n3", t)
        elif i < body:
            j = i - starts["s3"]; t = j / FPS; img = Image.fromarray(grain(shake(s3[j], j, 1.5), seed=j)).convert("RGBA"); caption(img, "s3", t)
        else:
            j = i - body; e = K.end_card(int(j * 30 / FPS)).astype(np.float32); u = S.smooth((j + 1) / XF) if j < XF else 1.0
            img = Image.fromarray(((last.astype(np.float32)) * (1 - u) + e * u).astype(np.uint8)).convert("RGBA")
        out = np.array(img.convert("RGB"))
        if i < body: last = out
        if sheet:
            if i % 25 == 12: picks.append(cv2.resize(out, (216, 384)))
        else: enc.stdin.write(out.tobytes())
    if sheet:
        rows = [np.concatenate(picks[k:k + 12] + [np.zeros((384, 216, 3), np.uint8)] * (12 - len(picks[k:k + 12])), 1) for k in range(0, len(picks), 12)]
        Image.fromarray(np.concatenate(rows, 0)).save(f"{HERE}/sheet.jpg", quality=86); print("sheet", N / FPS); return
    enc.stdin.close(); enc.wait()
    # ---- sound
    T = N / FPS; ns = int(T * SR); voice = np.zeros((ns + SR, 2), np.float32); bed = np.zeros_like(voice)
    def put(bus, x, at, g=0.0):
        q = int(max(0, at) * SR); x = x[: max(0, len(bus) - q)]; bus[q:q + len(x)] += x * 10 ** (g / 20)
    put(voice, S.load(f"{UGC}/op1.wav"), starts["s1"] / FPS); put(voice, S.load(f"{UGC}/shot2.mp4"), starts["s2"] / FPS)
    put(voice, S.load(f"{UGC}/line3b.mp3"), starts["n3"] / FPS); put(voice, S.load(f"{UGC}/shot3.mp4"), starts["s3"] / FPS)
    r = np.sqrt((voice[np.abs(voice).max(1) > 0.01] ** 2).mean()) + 1e-9; voice *= 0.12 / r
    rng = np.random.default_rng(1); room = rng.normal(0, 1, (len(voice), 2)).astype(np.float32); room = np.cumsum(room, 0); room -= np.convolve(room[:, 0], np.ones(2400) / 2400, "same")[:, None]
    room *= 0.0025 / (np.sqrt((room ** 2).mean()) + 1e-9); voice[: starts["n3"] * SR // FPS] += room[: starts["n3"] * SR // FPS]
    sfx = lambda q: S.load(f"{SP}/editorpack/sfx/{q}.wav")
    put(bed, sfx("whoosh_scene_change"), starts["s2"] / FPS - 0.12, -12); put(bed, sfx("whoosh_scene_change"), starts["n3"] / FPS - 0.12, -10); put(bed, sfx("whoosh_scene_change"), starts["s3"] / FPS - 0.12, -12)
    put(bed, sfx("skylings_pop_up"), starts["n3"] / FPS + t_sky - 0.05, -9); put(bed, sfx("tap"), starts["n3"] / FPS + t_tap, -6)
    put(bed, sfx("answer_lands"), starts["n3"] / FPS + t_now, -13); put(bed, sfx("answer_lands"), starts["n3"] / FPS + t_next, -13)
    put(bed, sfx("logo_ending_sound"), body / FPS - 0.1, -7)
    M = S.load(f"{SP}/launch/music_el.mp3"); tt = np.arange(len(voice)) / SR; E = body / FPS
    lvl = 10 ** (-24 / 20) + (10 ** (-10 / 20) - 10 ** (-24 / 20)) * np.clip((tt - (E - 0.3)) / 0.8, 0, 1); lvl *= np.clip(tt / 0.3, 0, 1) * np.clip((T - tt) / 1.2, 0, 1)
    m0 = 3 * SR; L = min(len(M) - m0, len(voice)); bed[:L] += M[m0:m0 + L] * lvl[:L, None]
    mix = np.tanh(voice + bed)[:ns]
    with wave.open(f"{HERE}/_pre.wav", "wb") as wv: wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{HERE}/_mix.wav"], check=True)
    out = f"{HERE}/Jordan_Reel_v4.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/_silent.mp4", "-i", f"{HERE}/_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "224k", "-shortest", "-movflags", "+faststart", out], check=True)
    print("done", out, round(T, 2), "s", {k: round(v / FPS, 2) for k, v in starts.items()}, flush=True)
build(sheet=len(sys.argv) > 1 and sys.argv[1] == "sheet")
