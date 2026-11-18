"""Who Is Goldie? (fruit drama ad) — join the four takes, put the real app on the phone, captions, score, ending.
   python3 build.py            -> out/Who_Is_Goldie_v1.mp4
   python3 build.py phone      -> only the phone shot check sheet"""
import sys, os, json, subprocess, wave, math
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
sys.path.insert(0, f"{SP}/skit3"); sys.path.insert(0, f"{SP}/fire")
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
import skit3_compose as S
G = S.G; W, H, FPS, SR = 1080, 1920, 24, 48000
os.makedirs(f"{HERE}/out", exist_ok=True)

# ---------------------------------------------------------------- the cut (clip, first frame, last frame + 1)
PH0, PH1 = 149, 209                      # k3's over-the-shoulder phone shot
K3_END = 360                             # leave the sofa at 15.0 s
SEGS = [("k0", 0, 241), ("k1", 111, 284), ("k2", 0, 361), ("k3", 0, PH0), ("phone", 0, 119), ("k3", PH1, K3_END)]
START = {}; t = 0
for i, (k, a, b) in enumerate(SEGS): START[i] = t; t += b - a
BODY = t; XF = 10; END_LEN = int(4.2 * FPS); N = BODY + END_LEN
APP_T0 = 2.8                             # the app recording's time at the phone shot's first frame (tap at 3.83)

def frames(clip, a, b):
    cmd = ["ffmpeg", "-v", "error", "-i", f"{HERE}/clips/{clip}.mp4", "-vf", f"select='between(n\\,{a}\\,{b - 1})',setpts=N/FRAME_RATE/TB,scale={W}:{H}:flags=lanczos,unsharp=5:5:0.5",
           "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    while True:
        buf = p.stdout.read(W * H * 3)
        if len(buf) < W * H * 3: break
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)

# ---------------------------------------------------------------- the phone: the real app on the blank screen
def screen(im):
    r, g, b = [im[..., i].astype(np.int32) for i in range(3)]
    m = (((r > 185) & (g > 135) & (g - b > 10)) | ((r + g + b) / 3 > 200)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)
    hull = cv2.convexHull(c).reshape(-1, 2).astype(np.float32); peri = cv2.arcLength(hull, True); q = None
    for eps in np.linspace(0.01, 0.08, 29):
        a = cv2.approxPolyDP(hull, eps * peri, True)
        if len(a) == 4: q = a.reshape(4, 2).astype(np.float32); break
    if q is None: q = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float32)
    dense = []                                                         # the hull, a point every 2 px
    for i in range(len(hull)):
        p0, p1 = hull[i], hull[(i + 1) % len(hull)]; n = max(1, int(np.linalg.norm(p1 - p0) / 2)); dense += [p0 + (p1 - p0) * j / n for j in range(n)]
    pts = np.array(dense, np.float32); lines = []
    for i in range(4):                                                 # each side: a line through the hull's points along its straight middle
        p0, p1 = q[i], q[(i + 1) % 4]; L = np.linalg.norm(p1 - p0); d = (p1 - p0) / L; n = np.array([-d[1], d[0]])
        tt = (pts - p0) @ d; dist = np.abs((pts - p0) @ n); sel = pts[(tt > 0.22 * L) & (tt < 0.78 * L) & (dist < 14)]
        if len(sel) < 8: sel = np.array([p0, p1])
        vx, vy, x0, y0 = cv2.fitLine(sel, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel(); lines.append((np.array([x0, y0]), np.array([vx, vy])))
    def inter(a, b):
        (p, d), (q_, e) = a, b; s = np.linalg.solve(np.array([d, -e]).T, q_ - p); return p + s[0] * d
    cor = np.array([inter(lines[i - 1], lines[i]) for i in range(4)], np.float32)
    cor = cor[np.argsort(cor[:, 1])]; top = cor[:2][np.argsort(cor[:2, 0])]; bot = cor[2:][np.argsort(cor[2:, 0])]
    mask = np.zeros(im.shape[:2], np.uint8); cv2.drawContours(mask, [c], -1, 255, -1)
    return np.array([top[0], top[1], bot[1], bot[0]], np.float32), mask

def phone_shot():
    src = list(frames("k3", PH0, PH1)); QM = [screen(f) for f in src]
    Q = [np.mean([QM[j][0] for j in range(max(0, i - 3), min(len(src), i + 4))], 0) for i in range(len(src))]
    order = list(range(len(src))) + list(range(len(src) - 2, -1, -1))             # forward, then back: the hold is twice as long
    cmd = ["ffmpeg", "-v", "error", "-ss", str(APP_T0), "-i", f"{HERE}/app/app3.webm", "-vf", "fps=24", "-frames:v", str(len(order)), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout; aw, ah = 390, 878; app = np.frombuffer(raw, np.uint8).reshape(-1, ah, aw, 3)
    out = []
    for n, i in enumerate(order):
        im = src[i]; a = app[min(n, len(app) - 1)]
        Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]]), Q[i])
        wp = cv2.warpPerspective(a, Hm, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        m = cv2.dilate(QM[i][1], np.ones((5, 5), np.uint8)); m = cv2.GaussianBlur(m, (0, 0), 1.4).astype(np.float32)[..., None] / 255
        o = im.astype(np.float32); lum = cv2.GaussianBlur(o.mean(-1), (0, 0), 45); ref = np.median(lum[QM[i][1] > 0]); shade = np.clip(lum / ref, 0.955, 1.03)[..., None]
        scr = (wp * 0.97 + 6) * shade * np.array([1.015, 1.0, 0.965], np.float32)   # a lit screen in a warm room, with the glass's own soft shading
        out.append(np.clip(o * (1 - m) + scr * m, 0, 255).astype(np.uint8))
    return out, Q

# ---------------------------------------------------------------- the words (script text, the takes' own timing)
WJ = json.load(open(f"{HERE}/chk/words.json"))
def onset(clip, t0, t1):                                                # where the voice really starts between t0 and t1
    a = S.load(f"{HERE}/clips/{clip}.mp4")[int(t0 * SR): int(t1 * SR)].mean(1); n = int(0.02 * SR); e = np.sqrt((a[: len(a) // n * n].reshape(-1, n) ** 2).mean(1))
    hit = np.where(e > 0.25 * e.max())[0]; return t0 + (hit[0] * 0.02 if len(hit) else 0)
def words():
    out = []; off = lambda si, a: START[si] / FPS - a / FPS
    def take(clip, si, a, lo, hi, text, shift=0.0):
        ws = [w for w in WJ[clip] if lo <= w[1] < hi]; tx = text.split(); assert len(ws) == len(tx), (clip, text, ws)
        for (w, s, e), tw in zip(ws, tx): out.append([tw, round(s + off(si, a) + shift, 3), round(max(e, s + 0.12) + off(si, a) + shift, 3)])
    take("k0", 0, 0, 0, 20, "Who the hell is Goldie? Babe, wait. What?")
    take("k1", 1, 111, 5.0, 20, "Goldie has a star for you. Promise kept? What did you promise her?")
    take("k2", 2, 0, 0, 20, "It's not what you think. She texts you every single morning! She knows what's in your bank account! Because I told her!")
    o = onset("k3", 0.2, 2.2); k3 = [["Do", o, o + 0.2], ["you", o + 0.2, 2.08]] + WJ["k3"][2:]; WJ["k3"] = k3
    take("k3", 3, 0, 0, 7, "Do you love her? She's not a person! She's my skyling. Look.")
    take("k3", 5, PH1, 9, 20, "Send me the link.")
    for w in out:
        if w[0] == "Look.": w[2] = START[4] / FPS - 0.4                 # gone before the phone fills the frame
        if w[0] == "her?" and w[1] < 20: w[2] = max(w[2], w[1] + 0.5)
    return out
WORDS = words()

# ---------------------------------------------------------------- the ending
FB = lambda s: ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", s); FG = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 37)
def fit(text, maxw, s=92):
    while FB(s).getlength(text) > maxw: s -= 2
    return s
LSZ = fit("Everyone's got someone.", 900)
def end_card(i):
    tt = i / FPS; img = Image.fromarray(G.end_card(int(round(tt * 30)))).convert("RGBA"); lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    def line(parts, y, t0, font, rise=14):
        u = S.clamp((tt - t0) / 0.4)
        if u <= 0: return
        e = S.out3(u); x = 540 - sum(font.getlength(p) for p, _ in parts) / 2
        for p, col in parts:
            d.text((x, y + rise * (1 - e)), p, font=font, fill=tuple(col) + (int(255 * e),), anchor="ls", stroke_width=3, stroke_fill=(8, 14, 34, int(150 * e))); x += font.getlength(p)
    line([("LifeFlow", S.SOFT3)], 1262, 0.25, FB(70))
    line([("Everyone's got someone.", S.SOFT3)], 1420, 0.7, FB(LSZ))
    line([("Meet your ", S.SOFT3), ("skyling.", S.GOLD3)], 1420 + int(LSZ * 1.22), 1.25, FB(LSZ))
    line([("Get on the waitlist  ·  lifeflowweb.com", (214, 222, 240))], 1420 + int(LSZ * 1.22) + 112, 1.85, FG, rise=8)
    img.alpha_composite(lay); return np.array(img.convert("RGB"))

# ---------------------------------------------------------------- sound
def db(x): return 10 ** (x / 20)
def speech_rms(a):
    m = a.mean(1); n = int(0.05 * SR); e = np.sqrt((m[: len(m) // n * n].reshape(-1, n) ** 2).mean(1)); loud = e[e > 0.3 * np.percentile(e, 98)]; return float(np.sqrt((loud ** 2).mean()))
def fade(a, fi=0.03, fo=0.03):
    a = a.copy(); ni, no = int(fi * SR), int(fo * SR); a[:ni] *= np.linspace(0, 1, ni)[:, None]; a[-no:] *= np.linspace(1, 0, no)[:, None]; return a
def mix():
    T = N / FPS; n = int(T * SR) + SR; voice = np.zeros((n, 2), np.float32); mus = np.zeros((n, 2), np.float32); fx = np.zeros((n, 2), np.float32)
    def put(bus, a, at, g=0.0):
        i = int(at * SR); a = a[: max(0, n - i)]; bus[i: i + len(a)] += a * db(g)
    A = {k: S.load(f"{HERE}/clips/{k}.mp4", "highpass=f=70") for k in ("k0", "k1", "k2", "k3")}; TARGET = 0.11
    gain = {k: TARGET / speech_rms(v) for k, v in A.items()}; print("clip gains (dB)", {k: round(20 * math.log10(g), 1) for k, g in gain.items()})
    cut = lambda k, a, b: A[k][int(a * SR): int(b * SR)] * gain[k]
    put(voice, fade(cut("k0", 0, 241 / FPS)), START[0] / FPS)
    put(voice, fade(cut("k1", 111 / FPS, 284 / FPS + 0.3), 0.03, 0.25), START[1] / FPS)          # her last word rings a touch past the cut
    put(voice, fade(cut("k2", 0, 361 / FPS)), START[2] / FPS)
    put(voice, fade(cut("k3", 0, PH1 / FPS)), START[3] / FPS)
    tone = cut("k3", PH0 / FPS + 0.3, PH1 / FPS - 0.1); put(voice, fade(tone, 0.2, 0.2), START[4] / FPS + 2.3); put(voice, fade(tone[::-1].copy(), 0.2, 0.2), START[4] / FPS + 2.3 + 1.7)   # room tone under the longer hold
    put(voice, fade(cut("k3", PH1 / FPS, K3_END / FPS), 0.03, 0.4), START[5] / FPS)
    # the score: under the fight, up while she looks at the app, out under the logo
    M = S.load(f"{HERE}/score.mp3"); mm = M.mean(1); q = int(0.1 * SR); e = np.sqrt((mm[: len(mm) // q * q].reshape(-1, q) ** 2).mean(1)); body = np.sqrt((mm[SR * 14: SR * 40] ** 2).mean())
    RISE, THEME = 12.7, 43.6                                             # measured on the take: it builds from 12.7 s, its last hit is at 40.6, silence, then the soft theme from 43.6
    ph0, ph1 = START[4] / FPS, START[5] / FPS; tt = np.arange(n) / SR; E = BODY / FPS
    off = THEME - (ph0 + 0.6); M = M[int(off * SR):] * (TARGET / body); rise = RISE - off; print("score offset", round(off, 2), "| last hit lands at", round(40.6 - off, 2), "| soft theme at", round(THEME - off, 2))
    m1 = voice.mean(1); w = int(0.05 * SR); env = np.sqrt(np.convolve(m1 ** 2, np.ones(w) / w, "same")); talk = (env > 0.03).astype(np.float32)
    k = int(0.5 * SR); talk = np.minimum(1, np.convolve(talk, np.ones(k) / k, "same") * 2.5); k2 = int(0.25 * SR); talk = np.convolve(talk, np.ones(k2) / k2, "same")
    lvl = db(-13) * (1 - talk) + db(-19) * talk
    sec = np.ones(n, np.float32) * db(0); sec[tt < rise] = db(9); sec[tt >= ph0] = db(12)       # its quiet opening and its soft last part are lifted
    k3 = int(0.3 * SR); sec = np.convolve(sec, np.ones(k3) / k3, "same"); lvl = lvl * sec
    lift = np.clip((tt - ph0) / 0.5, 0, 1) * np.clip((ph1 + 0.3 - tt) / 0.5, 0, 1); lvl = lvl * (1 + lift * (db(7) - 1))
    up = np.clip((tt - (E - 1.2)) / 1.0, 0, 1); lvl = lvl * (1 - up) + db(-3 + 12) * up                 # the score carries the ending
    lvl *= np.clip((tt - 0.0) / 0.4, 0, 1) * np.clip((T - tt) / 1.3, 0, 1)
    L = min(len(M), n); mus[:L] = M[:L] * lvl[:L, None]
    tap = S.load(f"{SP}/editorpack/sfx/tap.wav"); put(fx, tap, ph0 + (3.83 - APP_T0), -16)
    out = (voice + mus + fx)[: int(T * SR)]; out = np.tanh(out * 1.0)
    with wave.open(f"{HERE}/out/mix_pre.wav", "wb") as wv:
        wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/out/mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", f"{HERE}/out/mix.wav"], check=True)

# ---------------------------------------------------------------- render
def mux():
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/out/silent.mp4", "-i", f"{HERE}/out/mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", f"{HERE}/out/Who_Is_Goldie_v1.mp4"], check=True)
def main():
    if len(sys.argv) > 1 and sys.argv[1] == "mix": mix(); mux(); return
    ph, Q = phone_shot()
    sheet = np.concatenate([cv2.resize(ph[i], (432, 768)) for i in (2, 30, 58, 85, 116)], 1); Image.fromarray(sheet).save(f"{HERE}/chk/phone_sheet.jpg", quality=90)
    Image.fromarray(ph[70][520:1500, 300:1020]).save(f"{HERE}/chk/phone_close.jpg", quality=93)
    print("screen corners", Q[0].round(1).tolist(), "drift px", float(np.abs(np.array(Q) - Q[0]).max().round(1)))
    if len(sys.argv) > 1 and sys.argv[1] == "phone": return
    json.dump({"words": WORDS, "starts": {str(k): v / FPS for k, v in START.items()}, "body": BODY / FPS, "total": N / FPS}, open(f"{HERE}/out/timeline.json", "w"), indent=1)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", f"{HERE}/out/silent.mp4"], stdin=subprocess.PIPE)
    i = 0; last = None
    def emit(fr, caps=True):
        nonlocal i, last
        img = Image.fromarray(fr).convert("RGBA")
        if caps: S.caption(img, WORDS, i / FPS, hold=0.35)
        last = fr; enc.stdin.write(np.array(img.convert("RGB")).tobytes()); i += 1
    for si, (k, a, b) in enumerate(SEGS):
        for fr in (ph if k == "phone" else frames(k, a, b)): emit(fr)
        assert i == START[si] + (b - a), (k, i, START[si], b - a)
    hold = last.astype(np.float32)
    for j in range(END_LEN):
        e = end_card(j).astype(np.float32); u = S.smooth((j + 1) / XF) if j < XF else 1.0
        enc.stdin.write((hold * (1 - u) + e * u).astype(np.uint8).tobytes()); i += 1
    enc.stdin.close(); enc.wait(); mix()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/out/silent.mp4", "-i", f"{HERE}/out/mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", f"{HERE}/out/Who_Is_Goldie_v1.mp4"], check=True)
    print("done", N / FPS, "s")
main()
