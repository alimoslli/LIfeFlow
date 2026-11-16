"""The skylings skit, stage 2: the plates from skit_plates.py, the five skylings (the kit's frames of the app's own pixel art) on
the fire-pit rim, their voices (Kokoro, open model, made by make_voices.py), Tyler and Ali's real lines, the launch captions,
the fire, the launch score, the app's sounds, and the logo.
    python3 skit_compose.py [--preview 3.0,9.5]
"""
import json, math, os, sys, subprocess, wave
import numpy as np, cv2
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE); FIRE = f"{SP}/fire"
sys.path.insert(0, FIRE); _argv = sys.argv; sys.argv = sys.argv[:1]
import fire_render2 as G
sys.argv = _argv
F, R = G.F, G.R
from fire_render2 import W, H, FPS, clamp, smooth, back, out3, in3, to_scr, pose_frame, paste
SR = 48000

# ---------------------------------------------------------------- the cut
VO = {n: f"{HERE}/vo/{n}.wav" for n in ["dawn", "ray", "goldie", "twinkle", "dreamy", "ray_pick", "dreamy_sky"]}
def wav_len(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
FIVE = [("Dawn", "dawn", (255, 200, 170)), ("Ray", "ray", (255, 226, 160)), ("Goldie", "goldie", (255, 205, 130)), ("Twinkle-night", "twinkle", (200, 215, 255)), ("Dreamy-night", "dreamy", (200, 215, 255))]
RIM_X = [560, 760, 960, 1160, 1360]; RIM_Y = 2714                      # where the five sit on the front of the fire-pit rim (source px)
LEAD = 0.28                                                            # a beat before each skyling speaks
SHOTS = [  # plate, seconds, what happens (people's lines are their own audio from that clip)
    dict(plate="q_tyler", dur=4.5, people=[(6, 0.94, 5.44)], kind="wide"),
    dict(plate="a_oh", dur=1.16, people=[(8, 1.10, 2.26)], kind="wide", hop="Dawn"),
]
for nm, key, _ in FIVE:
    SHOTS.append(dict(plate=f"m_{key}", dur=round(LEAD + wav_len(VO[key]) + 0.32, 2), sky=nm, line=key, kind="macro"))
    if key == "ray": SHOTS.append(dict(plate="r_tyler", dur=1.2, kind="react"))
SHOTS += [dict(plate="a_dead", dur=3.33, people=[(8, 2.23, 5.56)], kind="wide"), dict(plate="a_day", dur=0.33, people=[(8, 5.98, 6.31)], kind="wide"),
          dict(plate="end_rim", dur=round(0.3 + wav_len(VO["ray_pick"]) + 0.25 + wav_len(VO["dreamy_sky"]) + 0.35, 2), kind="lineup",
               lines=[("ray_pick", 0.3, "Ray"), ("dreamy_sky", 0.3 + wav_len(VO["ray_pick"]) + 0.25, "Dreamy-night")]),
          dict(plate="end_sky", dur=3.1, kind="sky")]
END_HOLD, END_LEN, XF = 18, 2.6, 10
o = 0
for s in SHOTS: s["out"] = o; s["nf"] = int(round(s["dur"] * FPS)); o += s["nf"]
END_OUT = o - XF; N = END_OUT + int(END_LEN * FPS)
CROPS = {s["plate"]: json.load(open(f"{HERE}/plates/{s['plate']}.json"))["crops"] for s in SHOTS}

# ---------------------------------------------------------------- the voices' loudness, for talking
_env = {}
def env(key, t):
    if key not in _env:
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", VO[key], "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
        a = np.frombuffer(b, np.int16).astype(np.float32) / 32768; hop = 160
        e = np.array([np.sqrt((a[i:i + 640] ** 2).mean()) for i in range(0, max(1, len(a) - 640), hop)]); _env[key] = e / (e.max() + 1e-9)
    e = _env[key]; i = int(t * 100)
    return float(e[i]) if 0 <= i < len(e) else 0.0

# ---------------------------------------------------------------- a skyling: the kit frame, firelit, squashing as it talks
_spr = {}
def skyling(img, name, pose, T, X, Y, px, talk=0.0, alpha=1.0, glow=None, hop=0.0, shadow=True, warm=True, ph=0.0):
    a = pose_frame(name, pose, T, ph)
    key = (a.tobytes(), warm)
    if key not in _spr:
        arr = a.astype(np.float32)
        if warm: arr[..., :3] = np.clip(arr[..., :3] * np.array([1.06, 0.99, 0.92]), 0, 255)
        _spr[key] = Image.fromarray(arr.astype(np.uint8))
    im = _spr[key]; sx = 1 + 0.06 * talk; sy = 1 - 0.09 * talk
    w, h = max(1, int(26 * px * sx)), max(1, int(26 * px * sy))
    im = im.resize((w, h), Image.NEAREST)
    if alpha < 1: im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    Yb = Y - hop - 7 * talk * px / 9
    if shadow:
        sh_ = Image.new("RGBA", (int(w * 0.8), int(px * 4)), (0, 0, 0, 0)); ImageDraw.Draw(sh_).ellipse([0, 0, sh_.width - 1, sh_.height - 1], fill=(8, 6, 4, int(110 * alpha * (1 - clamp(hop / (60 * px / 9))))))
        paste(img, sh_, int(X - sh_.width / 2), int(Y - sh_.height / 2))
    if glow:
        g = G.glow_disc(int(26 * px * 0.75), glow, 0.32 * alpha); paste(img, g, int(X - g.width / 2), int(Yb - h * 0.5 - g.height / 2))
    paste(img, im, int(X - w / 2), int(Yb - h * 0.96))

# ---------------------------------------------------------------- captions: the launch style (fire_render.caption), every line
CAP = {101: [(0.0, 9, "")]}
LINES_TXT = {"dawn": "Mmm. Hi... I'm Dawn. I wake you up with today already planned.", "ray": "Ray! Classes, shifts, the quiz you forgot. I've got the daytime.",
             "goldie": "Goldie. Before you go out, I check what you've actually got.", "twinkle": "Twinkle. I'm the one who asks if you studied.",
             "dreamy": "Dreamy. Go to sleep. Tomorrow's handled.", "ray_pick": "Pick one.", "dreamy_sky": "Or let the sky pick."}
def sky_caption(img, key, t):
    d = wav_len(VO[key]); txt = LINES_TXT[key]
    parts = [p.strip() for p in txt.replace("! ", "!|").replace(". ", ".|").replace("? ", "?|").split("|") if p.strip()]
    lens = [len(p) for p in parts]; tot = sum(lens); acc = 0; chunks = []
    for p, l in zip(parts, lens): chunks.append((acc / tot * d, (acc + l) / tot * d, p)); acc += l
    F.CAPS[101] = chunks; F.caption(img, 101, t)

# ---------------------------------------------------------------- frames
_plates = {}
def plate_frames(name):
    if name not in _plates:
        b = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{HERE}/plates/{name}.mp4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        _plates.clear(); _plates[name] = np.frombuffer(b, np.uint8).reshape(-1, H, W, 3)
    return _plates[name]
def end_card(j):
    img = Image.fromarray(G.end_card(j)).convert("RGBA")
    G.R4.title(img, j / FPS, [(0.35, [("Changes with the ", G.SOFT), ("sky.", G.GOLD)], 1380)], sub=(0.8, "LifeFlow  ·  lifeflowweb.com", 1462))
    return np.array(img.convert("RGB"))
ARC = [(170 + 185 * j, 760 - 330 * math.sin(math.pi * (0.1 + 0.8 * j / 4))) for j in range(5)]
def frame(i):
    T = i / FPS
    k = max(j for j, s in enumerate(SHOTS) if s["out"] <= i) if i < SHOTS[-1]["out"] + SHOTS[-1]["nf"] else None
    if k is None: return end_card(i - END_OUT)
    s = SHOTS[k]; t = (i - s["out"]) / FPS; fr = plate_frames(s["plate"]); pi = min(len(fr) - 1, i - s["out"])
    arr = fr[pi].copy(); c = CROPS[s["plate"]][min(len(CROPS[s["plate"]]) - 1, pi)]; kk = W / c[2]
    if s["kind"] == "sky":                                             # "let the sky pick": the day runs through their sky
        mnt = 300 + 1000 * smooth(clamp((t - 0.45) / 1.7))
        G.sky_wash(arr, c, lambda xs: G.sky_cols(np.full_like(xs, float(mnt))), 0.82 * clamp(t / 0.35) * clamp((3.1 - t) / 0.5 + 0.4))
    img = Image.fromarray(arr).convert("RGBA")
    if s["kind"] in ("wide", "react"):                                 # the five, sitting on the rim
        if s["kind"] == "wide":
            for j, (nm, key, gl) in enumerate(FIVE):
                X, Y = to_scr(c, RIM_X[j], RIM_Y); px = (4.4 if s["plate"] == "q_tyler" else 2.9) * kk   # smaller in his close-ups, clear of the captions
                hop = 0.0
                if s.get("hop") == nm and t > s["dur"] - 0.45: hop = 60 * kk * math.sin(math.pi * clamp((t - (s["dur"] - 0.45)) / 0.45))
                pose = "idle" if s["plate"] != "a_dead" else ("think" if nm in ("Dawn", "Ray", "Goldie") and t > 1.0 else "idle")
                skyling(img, nm, pose, T, X, Y, px, hop=hop, glow=gl, ph=j * 0.37)
    if s["kind"] == "macro":                                           # one of them, up close, introducing itself
        nm = s["sky"]; key = s["line"]; gl = next(g for n_, k_, g in FIVE if n_ == nm)
        X, Y = to_scr(c, c[0] + c[2] / 2, 2716); px = 9.6 * kk
        tl = t - LEAD; talk = env(key, tl) if tl >= 0 else 0.0
        pose = ("think" if nm == "Dawn" and tl < 0.9 else ("wave" if 0 <= tl < 0.7 else "idle"))
        if nm.endswith("-night") and pose == "think": pose = "idle"
        skyling(img, nm, pose, T, X, Y, px, talk=talk, glow=gl, hop=8 * kk * math.sin(T * 2.4) if tl < 0 else 0)
        if tl >= 0: sky_caption(img, key, tl)
    if s["kind"] == "lineup":                                          # all five: "Pick one." "Or let the sky pick."
        talking = {who: (key, t0) for key, t0, who in s["lines"]}
        for j, (nm, key, gl) in enumerate(FIVE):
            X, Y = to_scr(c, 620 + 150 * j, 2716); px = 5.4 * kk; talk = 0.0
            if nm in talking:
                k2, t0 = talking[nm]; talk = env(k2, t - t0) if t >= t0 else 0
            look = "wave" if (nm == "Ray-x") else "idle"
            skyling(img, nm, "celebrate" if t > s["dur"] - 0.35 else look, T, X, Y, px, talk=talk, glow=gl, ph=j * 0.31)
        for key, t0, who in s["lines"]:
            if t0 <= t < t0 + wav_len(VO[key]) + 0.2: sky_caption(img, key, t - t0)
    if s["kind"] == "sky":                                             # they rise into the sky and light up in their own hour
        mnt = 300 + 1000 * smooth(clamp((t - 0.45) / 1.7)); fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for j, (nm, key, gl) in enumerate(FIVE):
            u = clamp((t - 0.05 * j) / 0.6); x, y = ARC[j]; Y = 2100 + (y - 2100) * out3(u)
            mine = [398, 700, 1035, 1130, 1300][j]; lit = math.exp(-((mnt - mine) / 120) ** 2) if t > 0.45 else 0
            g = G.glow_disc(int(95 + 40 * lit), gl, 0.25 + 0.6 * lit); paste(fx, g, int(x - g.width / 2), int(Y - 60 - g.height / 2))
            skyling(img, nm, "celebrate" if lit > 0.6 else "idle", T, x, Y, 4.6 + 1.2 * lit, glow=None, shadow=False, warm=False, ph=j * 0.4)
        img = Image.fromarray(G.light_comp(np.array(img.convert("RGB")), fx)).convert("RGBA")
    for (n, a, b) in s.get("people", []):                              # their own words, the launch captions
        F.CAPS = G.CAPS2; F.caption(img, n, a + t)
    out = np.array(img.convert("RGB"))
    if i >= END_OUT:
        u = smooth((i - END_OUT + 1) / XF); out = (out.astype(np.float32) * (1 - u) + end_card(i - END_OUT).astype(np.float32) * u).astype(np.uint8)
    return out

# ---------------------------------------------------------------- sound
def load(path, filt=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-af", filt] if filt else []) + ["-ac", "2", "-ar", str(SR), "-f", "s16le", "-"]
    return (np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.int16).reshape(-1, 2) / 32768.).astype(np.float32)
def db(x): return 10 ** (x / 20)
def mix():
    NS = int(N / FPS * SR); voice, bed, fx, amb = (np.zeros((NS, 2), np.float32) for _ in range(4))
    def put(buf, a, t, g=0., fi=0.006, fo=0.02):
        if t < 0: a = a[int(-t * SR):]; t = 0
        a = a.copy() * db(g); i0, i1 = int(fi * SR), int(fo * SR)
        if i0: a[:i0] *= np.linspace(0, 1, i0)[:, None]
        if i1: a[-i1:] *= np.linspace(1, 0, i1)[:, None]
        i = int(t * SR); j = min(NS, i + len(a))
        if j > i: buf[i:j] += a[: j - i]
    VOICE = "highpass=f=90,afftdn=nr=8:nf=-50,equalizer=f=3300:t=q:w=1.2:g=2.5,acompressor=threshold=-24dB:ratio=2.8:attack=5:release=130:makeup=2,loudnorm=I=-16:TP=-2"
    SKY = "highpass=f=120,equalizer=f=4000:t=q:w=1:g=1.5,aecho=1.0:0.85:14|27:0.12|0.08,loudnorm=I=-16:TP=-2"
    raw = {}
    for s in SHOTS:
        for (n, a, b) in s.get("people", []):
            if n not in raw: raw[n] = load(f"{FIRE}/wav/c{n}.wav", VOICE)
            put(voice, raw[n][int(a * SR): int(b * SR)], s["out"] / FPS, 0, 0.01, 0.03)
        if s["kind"] == "macro": put(voice, load(VO[s["line"]], SKY), s["out"] / FPS + LEAD, 1.0)
        if s["kind"] == "lineup":
            for key, t0, who in s["lines"]: put(voice, load(VO[key], SKY), s["out"] / FPS + t0, 1.0)
    rng = np.random.default_rng(5); t_ = np.arange(NS) / SR                 # the fire under everything
    br = np.cumsum(rng.normal(0, 1, NS)).astype(np.float32); br -= np.convolve(br, np.ones(4800) / 4800, mode="same"); br /= np.abs(br).max() + 1e-9
    crk = np.zeros(NS, np.float32)
    for tt in rng.uniform(0, NS / SR, int(NS / SR * 9)):
        L = int(SR * rng.uniform(0.004, 0.03)); i = int(tt * SR)
        if i + L < NS: crk[i:i + L] += np.diff(np.r_[0, rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.15, 1.0) ** 2]).astype(np.float32)
    fire = np.convolve(br, np.ones(60) / 60, mode="same") * 0.5 * db(-30) + crk * db(-35); amb[:, 0] = fire; amb[:, 1] = np.roll(fire, 37)
    M = load(f"{SP}/launch/music_el.mp3"); E = END_OUT / FPS                   # the launch score, its last chord on the logo
    end_at = len(M) / SR - 6.0; off = E - 0.25 - end_at; put(bed, M, off, -9, 0.0, 0.6)
    bed[: int(0.5 * SR)] *= np.linspace(0.2, 1, int(0.5 * SR))[:, None]
    e = np.convolve(np.abs(voice[:, 0]), np.ones(9600) / 9600, mode="same"); bed *= (1 - 0.6 * np.clip(e / 0.035, 0, 1))[:, None]
    sfx = f"{SP}/editorpack/sfx"; S = lambda n: load(f"{sfx}/{n}.wav")
    pop = S("skylings_pop_up")[: int(0.11 * SR)]
    for s in SHOTS:
        if s["kind"] == "macro": put(fx, pop, s["out"] / FPS + 0.02, -9)
        if s.get("hop"): put(fx, S("tap"), (s["out"] + s["nf"]) / FPS - 0.4, -9)
        if s["kind"] == "sky":
            put(fx, S("sky_turns"), s["out"] / FPS + 0.4, -6); put(fx, S("night_stars_twinkle"), s["out"] / FPS + 1.9, -12)
            for j in range(5): put(fx, pop, s["out"] / FPS + 0.45 + 1.7 * (j / 4.2), -12)
    put(fx, load(f"{SP}/kit/lifeflow-brand/assets/logo/LifeFlow_Logo_Ending.mp4"), E, -3, 0.01, 0.2)
    out = voice + fx + bed + amb; out[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))[:, None] ** 2
    with wave.open(f"{HERE}/skit_mix_pre.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/skit_mix_pre.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9", "-ar", "48000", f"{HERE}/skit_mix.wav"], check=True)

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--preview":
        os.makedirs(f"{HERE}/prev", exist_ok=True)
        for sv in args[1].split(","): Image.fromarray(frame(int(round(float(sv) * FPS)))).save(f"{HERE}/prev/s_{float(sv):05.2f}.jpg", quality=90)
        sys.exit()
    json.dump(dict(shots=[{k: v for k, v in s.items()} for s in SHOTS], end_out=END_OUT, n=N), open(f"{HERE}/skit_timeline.json", "w"), default=str)
    mix()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{HERE}/skit_silent.mp4"], stdin=subprocess.PIPE)
    for i in range(N): enc.stdin.write(frame(i).tobytes())
    enc.stdin.close(); enc.wait()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/skit_silent.mp4", "-i", f"{HERE}/skit_mix.wav", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest",
                    "-movflags", "+faststart", f"{HERE}/LifeFlow_Skylings_Skit.mp4"], check=True)
    print("skit", N, "frames", round(N / FPS, 2), "s")
