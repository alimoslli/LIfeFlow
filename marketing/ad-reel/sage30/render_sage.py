"""Render the 30 s 'Our apartment runs on one assistant' reel: UGC selfie clips + 3D phone + pop-out cards.

Needs render30.py (shared helpers), plan.json (timeline), words.json (word timings of the selfie audio),
clips/<name>.mp4, rec/<name>.mp4 (1080x2338 app recordings), fonts/, logo.png.
Writes video.mp4 (no audio). Usage: python3 render_sage.py [preview t1 t2 ...]
"""
import json, math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from render30 import W, H, FPS, Clip, punch, place, eo, eio, eback, clamp, SANS_X, SANS_B, SANS_M, SERIF, SERIF_I, font, CREAM, MINT

INK = (23, 23, 21)
MOSS = (40, 91, 69)
SAGE = (152, 196, 168)
P = json.load(open("plan.json"))
WORDS = json.load(open("words.json"))  # [{"w","s","e"}] on the final timeline
DUR = P["duration"]
SRC_W, SRC_H = 1080, 2338
SANS_S = lambda s: font("Geist.ttf", s, "SemiBold")


# ---------------------------------------------------------------- 3D math
def homography(src, dst):
    """Coefficients for PIL's PERSPECTIVE transform mapping output(dst) -> input(src)."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        b += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def project(w, h, cx, cy, ry, rx, rz=0.0, scale=1.0, f=1700.0):
    """Corners of a w x h plane centred at (cx, cy), rotated (degrees) and projected."""
    ry, rx, rz = map(math.radians, (ry, rx, rz))
    pts = []
    for (x, y) in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        x, y = x * scale, y * scale
        x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
        X, Z = x * math.cos(ry), x * math.sin(ry)
        Y, Z = y * math.cos(rx) - Z * math.sin(rx), y * math.sin(rx) + Z * math.cos(rx)
        k = f / (f + Z)
        pts.append((cx + X * k, cy + Y * k))
    return pts


def warp(img, dst):
    """Draw img (RGBA) into a full-frame RGBA layer at the 4 destination corners."""
    w, h = img.size
    coeffs = homography([(0, 0), (w, 0), (w, h), (0, h)], dst)
    return img.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(0, 0, 0, 0))


# ---------------------------------------------------------------- phone
PW = 520
PH = int(PW * SRC_H / SRC_W)
BEZ = 16
SCR_R = 70
SMASK = Image.new("L", (PW, PH), 0)
ImageDraw.Draw(SMASK).rounded_rectangle((0, 0, PW - 1, PH - 1), radius=SCR_R, fill=255)
FRAME = Image.new("RGBA", (PW + 2 * BEZ, PH + 2 * BEZ), (0, 0, 0, 0))
_d = ImageDraw.Draw(FRAME)
_d.rounded_rectangle((0, 0, FRAME.width - 1, FRAME.height - 1), radius=SCR_R + BEZ, fill=(16, 17, 16, 255))
_d.rounded_rectangle((2, 2, FRAME.width - 3, FRAME.height - 3), radius=SCR_R + BEZ - 2, outline=(105, 110, 106, 255), width=3)


def phone_img(screen):
    ph = FRAME.copy()
    s = screen.resize((PW, PH), Image.LANCZOS).convert("RGBA")
    ph.paste(s, (BEZ, BEZ), SMASK)
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle((ph.width / 2 - 62, BEZ + 12, ph.width / 2 + 62, BEZ + 46), radius=17, fill=(0, 0, 0, 255))
    return ph


def shadow_layer(dst, blur=40, alpha=120, off=(30, 50)):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).polygon([(x + off[0], y + off[1]) for x, y in dst], fill=(0, 0, 0, alpha))
    return lay.filter(ImageFilter.GaussianBlur(blur))


def card_img(frame, box, radius=48, width=None):
    x0, y0, x1, y1 = box
    c = frame.crop((x0, y0, x1, y1)).convert("RGBA")
    m = Image.new("L", c.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, c.width - 1, c.height - 1), radius=radius, fill=255)
    c.putalpha(m)
    if width:
        c = c.resize((width, int(c.height * width / c.width)), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    d.rounded_rectangle((0, 0, c.width - 1, c.height - 1), radius=int(radius * c.width / (x1 - x0)), outline=(255, 255, 255, 200), width=3)
    return c


def interp_src(keys, lt):
    """Recording time for phone-local time lt. keys: [[lt, src_t], ...] piecewise linear, held outside."""
    if isinstance(keys, (int, float)):
        return keys + lt
    if lt <= keys[0][0]:
        return keys[0][1]
    for (a, sa), (b, sb) in zip(keys, keys[1:]):
        if a <= lt <= b:
            return sa + (sb - sa) * (lt - a) / (b - a)
    return keys[-1][1]


# ---------------------------------------------------------------- captions (word by word)
def captions(im, t):
    groups = P["caption_groups"]
    for g in groups:
        if g["s"] <= t < g["e"]:
            ws = [w for w in WORDS if g["s"] - 0.01 <= w["s"] < g["e"]]
            if not ws:
                return
            f = SANS_X(70)
            lay = Image.new("RGBA", (W, 220), (0, 0, 0, 0))
            d = ImageDraw.Draw(lay)
            txt = [w["w"] for w in ws]
            widths = [d.textlength(x + " ", font=f) for x in txt]
            x = (W - sum(widths) + d.textlength(" ", font=f)) / 2
            for w, ww in zip(ws, widths):
                active = w["s"] <= t < w["e"] + 0.08
                col = SAGE if active else (255, 255, 255)
                d.text((x, 70), w["w"], font=f, fill=col + (255,), stroke_width=7, stroke_fill=(10, 14, 12, 255))
                x += ww
            k = eback((t - g["s"]) / 0.14, 2.0)
            place(im, lay, 0, P.get("caption_y", 1440), scale=0.9 + 0.1 * k)
            return


# ---------------------------------------------------------------- end card
def make_bg():
    y = np.linspace(0, 1, H)[:, None, None]
    base = np.array([246, 242, 233]) * (1 - 0.06 * y)
    im = Image.fromarray(np.broadcast_to(base, (H, W, 3)).astype("uint8")).convert("RGBA")
    for (cx, cy, r, col, a) in [(160, 420, 520, (140, 203, 180), 120), (980, 1650, 560, (40, 91, 69), 55), (1000, 260, 420, (232, 201, 160), 110)]:
        pad = int(r * 1.3)
        blob = Image.new("L", (2 * r + 2 * pad,) * 2, 0)
        ImageDraw.Draw(blob).ellipse((pad, pad, pad + 2 * r, pad + 2 * r), fill=a)
        blob = blob.filter(ImageFilter.GaussianBlur(r * 0.55))
        layer = Image.new("RGBA", blob.size, col + (0,))
        layer.putalpha(blob)
        im.alpha_composite(layer, (cx - blob.width // 2, cy - blob.height // 2))
    return im


BG, LOGO = None, None


def end_card(t, t0):
    lt = t - t0
    im = BG.copy()
    a = eo((lt - 0.05) / 0.45)
    lw = int(210 * (0.8 + 0.2 * eback((lt - 0.05) / 0.55)))
    place(im, LOGO.resize((lw, lw), Image.LANCZOS), (W - lw) // 2, 470 - lw // 2, alpha=a)
    rows = [("Meet Sage.", SERIF_I(120), MOSS, 620, 0.15), ("Your LifeFlow assistant.", SANS_S(52), INK, 790, 0.45),
            ("Never miss anything again.", SERIF(64), INK, 1010, 0.9)]
    for txt, f, col, y, d0 in rows:
        lay = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
        dd = ImageDraw.Draw(lay)
        tw = dd.textlength(txt, font=f)
        dd.text(((W - tw) / 2, 0), txt, font=f, fill=col + (255,))
        k = eo((lt - d0) / 0.45)
        place(im, lay, 0, y + 30 * (1 - k), alpha=k)
    if lt > 1.3:
        k = eback((lt - 1.3) / 0.45)
        f = SANS_S(46)
        tw = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength("Link in bio", font=f)
        pw, ph = int(tw + 120), 104
        pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        dd = ImageDraw.Draw(pill)
        dd.rounded_rectangle((0, 0, pw - 1, ph - 1), radius=52, fill=MOSS + (255,))
        dd.text(((pw - tw) / 2, 24), "Link in bio", font=f, fill=CREAM + (255,))
        place(im, pill, (W - pw) // 2, 1230, alpha=clamp((lt - 1.3) / 0.15), scale=0.7 + 0.3 * k)
    lay = Image.new("RGBA", (W, 60), (0, 0, 0, 0))
    dd = ImageDraw.Draw(lay)
    s = "Dramatization. AI-generated actors. App shown with demo data."
    f = SANS_M(28)
    tw = dd.textlength(s, font=f)
    dd.text(((W - tw) / 2, 0), s, font=f, fill=(120, 124, 116, 255))
    place(im, lay, 0, 1800, alpha=eo((lt - 0.8) / 0.5))
    return im


# ---------------------------------------------------------------- name chip ("Sage")
def chip(text, sub):
    f, fs = SANS_X(52), SANS_M(30)
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w = int(max(d0.textlength(text, font=f), d0.textlength(sub, font=fs)) + 190)
    h = 150
    lay = Image.new("RGBA", (w + 60, h + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((30, 42, 30 + w, 42 + h), radius=75, fill=(0, 0, 0, 110))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((30, 30, 30 + w, 30 + h), radius=75, fill=(250, 248, 242, 245))
    ic = Image.new("RGBA", (104, 104), (0, 0, 0, 0))
    ImageDraw.Draw(ic).ellipse((0, 0, 103, 103), fill=(14, 32, 25, 255))
    ic.alpha_composite(LOGO.resize((84, 84), Image.LANCZOS), (10, 10))
    lay.alpha_composite(ic, (52, 53))
    d.text((176, 50), text, font=f, fill=INK + (255,))
    d.text((178, 112), sub, font=fs, fill=MOSS + (255,))
    return lay


# ---------------------------------------------------------------- main
def render(preview=None):
    global BG, LOGO
    BG = make_bg()
    LOGO = Image.open("logo.png").convert("RGBA")
    CHIP = chip("Sage", "your LifeFlow assistant")
    times = preview if preview else [i / FPS for i in range(int(DUR * FPS))]
    out = None
    if not preview:
        out = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "video.mp4"], stdin=subprocess.PIPE)
    readers = {}
    rec_cache = {}

    def rec_frame(name, st):
        key = (name, round(st * FPS))
        if key not in rec_cache:
            if len(rec_cache) > 40:
                rec_cache.clear()
            rec_cache[key] = Clip(f"rec/{name}.mp4", max(0, st), 1, SRC_W, SRC_H).next()
        return rec_cache[key]

    for idx, t in enumerate(times):
        if t < P["end"]:
            c = next(c for c in P["clips"] if c["start"] <= t < c["end"])
            lt = t - c["start"]
            if preview:
                fr = Clip(c["path"], c.get("src", 0) + lt, 1, W, H).next()
            else:
                if c["path"] not in readers:
                    readers[c["path"]] = Clip(c["path"], c.get("src", 0), int(round((c["end"] - c["start"]) * FPS)) + 2, W, H)
                fr = readers[c["path"]].next()
            im = fr.convert("RGBA")
            # name chip
            for ch in P.get("chips", []):
                if ch["t0"] <= t < ch["t1"]:
                    k = eback((t - ch["t0"]) / 0.3, 1.8)
                    ko = eo((t - (ch["t1"] - 0.2)) / 0.2)
                    place(im, CHIP, (W - CHIP.width) // 2, ch["y"] - 40 * (1 - k), alpha=clamp((t - ch["t0"]) / 0.08) * (1 - ko), scale=0.7 + 0.3 * k)
            # 3D phone
            for ph in P["phones"]:
                if not (ph["t0"] <= t < ph["t1"]):
                    continue
                lt2 = t - ph["t0"]
                st = interp_src(ph["src"], lt2)
                scr = rec_frame(ph["rec"], st)
                phn = phone_img(scr)
                k_in = eback(lt2 / 0.55, 1.2)
                k_out = eio((t - (ph["t1"] - 0.35)) / 0.35)
                side = 1 if ph.get("side", "right") == "right" else -1
                cx = W / 2 + side * (150 + 700 * (1 - k_in) + 700 * k_out)
                cy = ph.get("y", 820)
                ry = side * (-(16 + 40 * (1 - k_in)) - 30 * k_out) + 3 * math.sin(lt2 * 1.3)
                rx = 6 + 2 * math.sin(lt2 * 0.9)
                rz = side * (4 * (1 - k_in))
                dst = project(phn.width, phn.height, cx, cy, ry, rx, rz, scale=ph.get("scale", 1.0))
                im.alpha_composite(shadow_layer(dst, 45, 120, (side * -40, 60)))
                im.alpha_composite(warp(phn, dst))
            # pop-out cards
            for pc in P["pops"]:
                if not (pc["t0"] <= t < pc["t1"]):
                    continue
                lt3 = t - pc["t0"]
                scr = rec_frame(pc["rec"], pc["src_t"])
                card = card_img(scr, pc["box"], width=pc.get("width", 900))
                k = eback(lt3 / 0.45, 1.5)
                ko = eio((t - (pc["t1"] - 0.3)) / 0.3)
                sc = 0.45 + 0.55 * k - 0.4 * ko
                ry = pc.get("ry", -14) * (1 - eo(lt3 / 0.6)) + 4 * math.sin(lt3 * 1.6) * (1 - ko)
                rx = 8 * (1 - eo(lt3 / 0.6)) + 2 * math.sin(lt3 * 1.1)
                x0, y0 = pc.get("from", (W / 2 + 150, 820))
                tx, ty = W / 2, pc.get("y", 700)
                cx = x0 + (tx - x0) * eo(lt3 / 0.5) * (1 - ko) + (x0 - tx) * 0
                cy = y0 + (ty - y0) * eo(lt3 / 0.5) * (1 - ko)
                dst = project(card.width, card.height, cx, cy, ry, rx, 0, scale=sc)
                lift = eo(lt3 / 0.5) * (1 - ko)
                im.alpha_composite(shadow_layer(dst, 30 + 25 * lift, int(150 * lift + 30), (0, 40 + 50 * lift)))
                im.alpha_composite(warp(card, dst))
            captions(im, t)
            # white flash on clip cuts
            for c2 in P["clips"][1:]:
                if 0 <= t - c2["start"] < 0.08:
                    im = Image.blend(im, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.5 * (1 - (t - c2["start"]) / 0.08))
            # last beat: zoom-punch into the end card
            k = eio((t - (P["end"] - 0.35)) / 0.35)
            if k > 0:
                im = Image.blend(punch(im.convert("RGB"), 1 + 0.5 * k).convert("RGBA"), BG, k)
        else:
            im = end_card(t, P["end"])
        rgb = im.convert("RGB")
        if preview:
            rgb.save(f"prev_{t:05.2f}.png")
        else:
            out.stdin.write(rgb.tobytes())
            if idx % 90 == 0:
                print("frame", idx, flush=True)
    if out:
        out.stdin.close()
        out.wait()


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "preview":
        render([float(x) for x in sys.argv[2:]])
    else:
        render()
