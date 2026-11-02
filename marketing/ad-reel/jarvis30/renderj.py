"""Render the 30 s 'texts first' Jarvis reel (1080x1920, 30 fps) in LifeFlow's brand style.

Needs render30.py next to it (shared helpers), clips/{a,b,d,e,k,campus}.mp4, rec/<name>.mp4 (1080x2338), fonts/, logo.png.
Timing lives in T below; music and voice use the same numbers. Output: video.mp4 (no audio).
Usage: python3 renderj.py [preview t1 t2 ...]
"""
import json, subprocess, sys, math
from PIL import Image, ImageDraw, ImageFilter
from render30 import (W, H, FPS, Clip, grade, vignette, punch, text_layer, place, caption, eo, eio, eback, clamp, interp,
                      SANS_B, SANS_X, SANS_M, SERIF, SERIF_I, font, MINT, CREAM)

INK = (23, 23, 21)
MOSS = (40, 91, 69)
DUR = 30.0
T = json.load(open("timeline.json"))  # shared with the music + mix scripts
DROP, REVEAL = T["drop"], T["reveal"]
SEG = T["segments"]  # [{"name","start","end"}...] after the drop

SANS_R = lambda s: font("Geist.ttf", s, "Regular")
SANS_S = lambda s: font("Geist.ttf", s, "SemiBold")

# ---------------------------------------------------------------- brand background
def make_bg():
    import numpy as np
    y = np.linspace(0, 1, H)[:, None, None]
    base = np.array([246, 242, 233]) * (1 - 0.06 * y)
    im = Image.fromarray(np.broadcast_to(base, (H, W, 3)).astype("uint8")).convert("RGBA")
    for (cx, cy, r, col, a) in [(160, 420, 520, (140, 203, 180), 120), (980, 1650, 560, (40, 91, 69), 55), (1000, 260, 420, (232, 201, 160), 110)]:
        pad = int(r * 1.3)
        blob = Image.new("L", (2 * r + 2 * pad, 2 * r + 2 * pad), 0)
        ImageDraw.Draw(blob).ellipse((pad, pad, pad + 2 * r, pad + 2 * r), fill=a)
        blob = blob.filter(ImageFilter.GaussianBlur(r * 0.55))
        layer = Image.new("RGBA", blob.size, col + (0,))
        layer.putalpha(blob)
        im.alpha_composite(layer, (cx - blob.width // 2, cy - blob.height // 2))
    return im


BG = None

# ---------------------------------------------------------------- app card
CARD_W, CARD_H = 900, 1400
CARD_X, CARD_Y = (W - CARD_W) // 2, 430
CARD_R = 56
SRC_W, SRC_H = 1080, 2338
MASK = Image.new("L", (CARD_W, CARD_H), 0)
ImageDraw.Draw(MASK).rounded_rectangle((0, 0, CARD_W - 1, CARD_H - 1), radius=CARD_R, fill=255)
SHADOW = Image.new("RGBA", (CARD_W + 240, CARD_H + 240), (0, 0, 0, 0))
ImageDraw.Draw(SHADOW).rounded_rectangle((120, 150, 120 + CARD_W, 150 + CARD_H), radius=CARD_R, fill=(30, 60, 45, 90))
SHADOW = SHADOW.filter(ImageFilter.GaussianBlur(46))
RIM = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
ImageDraw.Draw(RIM).rounded_rectangle((0, 0, CARD_W - 1, CARD_H - 1), radius=CARD_R, outline=(255, 255, 255, 170), width=3)

# per recording: source start, speed, zoom keys (t, zoom, cx, cy) in source px
REC = {
    "feed": dict(src=0.0, speed=1.6, keys=[(0, 1.0, 540, 880), (2.4, 1.05, 540, 920)]),
    "move": dict(src=0.0, speed=1.0, keys=[(0, 1.0, 540, 880), (0.6, 1.18, 540, 820), (3.6, 1.22, 540, 820)]),
    "remind": dict(src=0.0, speed=1.0, keys=[(0, 1.0, 540, 880), (0.6, 1.18, 540, 840), (3.6, 1.22, 540, 840)]),
    "block": dict(src=0.0, speed=1.4, keys=[(0, 1.12, 540, 1300), (1.6, 1.15, 540, 1300), (2.0, 1.0, 540, 896), (4.8, 1.08, 540, 980)]),
    "brief": dict(src=0.0, speed=1.0, keys=[(0, 1.05, 540, 900), (1.8, 1.2, 540, 860)]),
}

HEAD = {
    "feed": (None, "What he caught", "this week."),
    "move": ("3", "The to-do I forgot.", "One tap. Moved."),
    "remind": ("2", "A bill due Thursday.", "Reminder: set."),
    "block": ("1", "Quiz vs. my shift.", "Study time: blocked."),
    "brief": (None, "Every morning,", "the one thing that matters."),
}


def card_view(frame, z, cx, cy):
    ww = SRC_W / z
    hh = ww * CARD_H / CARD_W
    x0 = clamp(cx - ww / 2, 0, SRC_W - ww)
    y0 = clamp(cy - hh / 2, 0, SRC_H - hh)
    return frame.resize((CARD_W, CARD_H), Image.LANCZOS, box=(x0, y0, x0 + ww, y0 + hh))


def badge(n):
    s = 112
    b = Image.new("RGBA", (s + 40, s + 40), (0, 0, 0, 0))
    sh = Image.new("RGBA", b.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((20, 26, 20 + s, 26 + s), fill=(20, 50, 35, 90))
    b.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(b)
    d.ellipse((20, 20, 20 + s, 20 + s), fill=MOSS + (255,))
    f = SERIF_I(84)
    tw = d.textlength("#" + n, font=f)
    d.text((20 + (s - tw) / 2, 20 + 4), "#" + n, font=f, fill=CREAM + (255,))
    return b


def headline(im, name, t, t0, t1):
    num, a, b = HEAD[name]
    k_in = eo((t - t0 - 0.05) / 0.35)
    k_out = eo((t - (t1 - 0.18)) / 0.18)
    alpha = k_in * (1 - k_out)
    dy = 36 * (1 - k_in) - 24 * k_out
    lay = Image.new("RGBA", (W, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    y = 0
    if num:
        bg = badge(num)
        lay.alpha_composite(bg, ((W - bg.width) // 2, 0))
        y = bg.width - 14
    else:
        y = 40
    f1, f2 = SERIF(84), SANS_S(46)
    w1 = d.textlength(a, font=f1)
    d.text(((W - w1) / 2, y), a, font=f1, fill=INK + (255,))
    w2 = d.textlength(b, font=f2 if num else SERIF_I(80))
    if num:
        d.text(((W - w2) / 2, y + 104), b, font=f2, fill=MOSS + (255,))
    else:
        d.text(((W - w2) / 2, y + 96), b, font=SERIF_I(80), fill=MOSS + (255,))
    place(im, lay, 0, 40 + dy, alpha=alpha)


# ---------------------------------------------------------------- glass notification
LOGO = None


def wrap(d, text, f, width, lines=2):
    words, out, cur = text.split(), [], ""
    for w in words:
        nxt = (cur + " " + w).strip()
        if d.textlength(nxt, font=f) <= width:
            cur = nxt
        else:
            out.append(cur)
            cur = w
            if len(out) == lines:
                break
    if len(out) < lines and cur:
        out.append(cur)
    if len(out) == lines and " ".join(out) != text:
        while d.textlength(out[-1] + "…", font=f) > width:
            out[-1] = out[-1][:-1]
        out[-1] = out[-1].rstrip() + "…"
    return out


def notification(frame, title, body, y, k, when="now"):
    """Frosted-glass Jarvis notification over the live footage. k = 0..1 entrance."""
    nw, nh = 980, 236
    x = (W - nw) // 2
    yy = int(y - (nh + 80) * (1 - eback(k, 1.4)))
    if yy + nh < 0:
        return frame
    region = frame.crop((x, max(0, yy), x + nw, max(1, yy + nh))).filter(ImageFilter.GaussianBlur(28))
    glass = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    g = Image.new("RGBA", (nw, nh), (250, 248, 242, 205))
    if region.height == nh:
        glass.paste(region.convert("RGBA"), (0, 0))
    glass.alpha_composite(g)
    m = Image.new("L", (nw, nh), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, nw - 1, nh - 1), radius=48, fill=255)
    card = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    card.paste(glass, (0, 0), m)
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((0, 0, nw - 1, nh - 1), radius=48, outline=(255, 255, 255, 200), width=2)
    icon = Image.new("RGBA", (78, 78), (0, 0, 0, 0))
    ImageDraw.Draw(icon).rounded_rectangle((0, 0, 77, 77), radius=20, fill=(14, 32, 25, 255))
    lg = LOGO.resize((62, 62), Image.LANCZOS)
    icon.alpha_composite(lg, (8, 8))
    card.alpha_composite(icon, (34, 34))
    d.text((132, 34), "JARVIS", font=SANS_S(30), fill=(110, 110, 105, 255))
    tw = d.textlength(when, font=SANS_R(30))
    d.text((nw - 40 - tw, 34), when, font=SANS_R(30), fill=(130, 130, 125, 255))
    d.text((132, 74), title, font=SANS_B(38), fill=INK + (255,))
    for i, line in enumerate(wrap(d, body, SANS_R(34), nw - 172)):
        d.text((132, 124 + i * 44), line, font=SANS_R(34), fill=(55, 55, 52, 255))
    sh = Image.new("RGBA", (nw + 80, nh + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((40, 52, 40 + nw, 52 + nh), radius=48, fill=(0, 0, 0, 90))
    out = frame.convert("RGBA")
    place(out, sh.filter(ImageFilter.GaussianBlur(20)), x - 40, yy - 40, alpha=clamp(k * 3))
    place(out, card, x, yy, alpha=clamp(k * 3))
    return out


# real messages from LifeFlow's proactive engine on the demo account
N_BRIEF = ("Your morning brief", "Hey! 3 things on today's list, $1,842 available now. The one thing: Finish Chapter 6 reading response.")
N_GOAL = ("50% of the way to Emergency fund", "Nice! You're 50% of the way to Emergency fund.")
N_QUIZ = ("Research methods quiz vs. your shift", "Just so you know: Research methods quiz is due Friday and you work Thursday at 12:30. Want me to block 2 hours?")
N_BILL = ("City Utilities is due in 2 days", "Hey! City Utilities ($82) is due in 2 days. You have $1,842 in checking. Want a reminder?")
N_TODO = ("1 to-do slipped", "Hey! \"Return library books\" is past due. Move them to tomorrow?")

# hook shots: (clip, start, end, src_start, speed)
HOOK = T["hook"]


def live_frame(clip, lt, t, readers, preview, key, n, s0, sp):
    if preview:
        return Clip(clip, s0 + lt * sp, 1, W, H).next()
    if key not in readers:
        readers[key] = Clip(clip, s0, n, W, H, sp)
    return readers[key].next()


def end_card(t, t0):
    lt = t - t0
    im = BG.copy()
    a = eo((lt - 0.05) / 0.45)
    lw = int(220 * (0.8 + 0.2 * eback((lt - 0.05) / 0.55)))
    place(im, LOGO.resize((lw, lw), Image.LANCZOS), (W - lw) // 2, 560 - lw // 2 + 40, alpha=a)
    for txt, f, col, y, d0 in (("LifeFlow", SERIF(176), INK, 760, 0.15), ("Never miss anything again.", SERIF_I(68), MOSS, 990, 0.6)):
        lay = Image.new("RGBA", (W, 240), (0, 0, 0, 0))
        dd = ImageDraw.Draw(lay)
        tw = dd.textlength(txt, font=f)
        dd.text(((W - tw) / 2, 0), txt, font=f, fill=col + (255,))
        k = eo((lt - d0) / 0.5)
        place(im, lay, 0, y + 30 * (1 - k), alpha=k)
    if lt > 1.2:
        k = eback((lt - 1.2) / 0.45)
        f = SANS_S(44)
        tw = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength("Link in bio", font=f)
        pw, ph = int(tw + 110), 100
        pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        dd = ImageDraw.Draw(pill)
        dd.rounded_rectangle((0, 0, pw - 1, ph - 1), radius=50, fill=MOSS + (255,))
        dd.text(((pw - tw) / 2, 22), "Link in bio", font=f, fill=CREAM + (255,))
        place(im, pill, (W - pw) // 2, 1240, alpha=clamp((lt - 1.2) / 0.15), scale=0.7 + 0.3 * k)
    lay = Image.new("RGBA", (W, 120), (0, 0, 0, 0))
    dd = ImageDraw.Draw(lay)
    s = "Get you someone who texts first."
    f = SANS_M(40)
    tw = dd.textlength(s, font=f)
    dd.text(((W - tw) / 2, 0), s, font=f, fill=(90, 95, 88, 255))
    place(im, lay, 0, 1440, alpha=eo((lt - 1.6) / 0.5))
    return im


def render(preview=None):
    global BG, LOGO
    BG = make_bg()
    LOGO = Image.open("logo.png").convert("RGBA")
    times = preview if preview else [i / FPS for i in range(int(DUR * FPS))]
    out = None
    if not preview:
        out = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "video.mp4"], stdin=subprocess.PIPE)
    readers = {}
    for idx, t in enumerate(times):
        if t < DROP:
            h = next(s for s in HOOK if s["start"] <= t < s["end"])
            lt = t - h["start"]
            n = int(round((h["end"] - h["start"]) * FPS)) + 2
            fr = live_frame(h["clip"], lt, t, readers, preview, h["clip"] + str(h["start"]), n, h["src"], h.get("speed", 1.0))
            fr = grade(fr, warm=0.35, sat=1.04)
            if h["clip"].endswith("e.mp4"):  # the reveal: freeze, punch-in, desaturate
                frozen = lt < 0.55
                if frozen and not preview:
                    pass
                fr = punch(fr, 1.0 + 0.1 * eo(lt / 0.25), 0.5, 0.36)
                g = fr.convert("L").convert("RGB")
                fr = Image.blend(fr, g, 0.35)
            fr = vignette(fr, 0.4)
            im = fr.convert("RGBA")
            for nt in h.get("notes", []):
                k = clamp((t - nt["at"]) / 0.35)
                if t >= nt["at"]:
                    note = {"brief": N_BRIEF, "goal": N_GOAL, "quiz": N_QUIZ, "bill": N_BILL, "todo": N_TODO}[nt["n"]]
                    im = notification(im, note[0], note[1], nt["y"], k)
            for c in h.get("captions", []):
                caption(im, c["text"], t, c["start"], c["end"], accent=c.get("accent"))
            if h["clip"].endswith("e.mp4"):
                if t - REVEAL < 0.1:
                    im = Image.blend(im, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.8 * (1 - (t - REVEAL) / 0.1))
                lay = text_layer([("it's my AI assistant.", SANS_X(96), (255, 255, 255))], 0)
                k = eback((t - REVEAL - 0.15) / 0.22, 2.0)
                if t > REVEAL + 0.15:
                    place(im, lay, 0, 1180, alpha=clamp((t - REVEAL - 0.15) / 0.06), scale=0.7 + 0.3 * k)
                if t > REVEAL + 0.75:
                    sub = text_layer([("(his name is Jarvis)", SERIF_I(64), MINT)], 0)
                    place(im, sub, 0, 1320, alpha=eo((t - REVEAL - 0.75) / 0.3))
        elif t < T["callback"]["start"]:
            seg = next(s for s in SEG if s["start"] <= t < s["end"])
            lt = t - seg["start"]
            n = int(round((seg["end"] - seg["start"]) * FPS)) + 2
            if seg["name"] == "kitchen":
                fr = live_frame("clips/k.mp4", lt, t, readers, preview, "kitchen", n, 0.3, 1.0)
                im = vignette(grade(fr, warm=0.35), 0.35).convert("RGBA")
                im = notification(im, N_BRIEF[0], N_BRIEF[1], 150, clamp((lt - 0.25) / 0.35), when="8:02 AM")
            else:
                r = REC[seg["name"]]
                path = f"rec/{seg['name']}.mp4"
                if preview:
                    fr = Clip(path, r["src"] + lt * r["speed"], 1, SRC_W, SRC_H).next()
                else:
                    if path not in readers:
                        readers[path] = Clip(path, r["src"], n, SRC_W, SRC_H, r["speed"])
                    fr = readers[path].next()
                z, cx, cy = interp(r["keys"], lt)
                view = card_view(fr, z, cx, cy).convert("RGBA")
                view.alpha_composite(RIM)
                im = punch(BG, 1.0 + 0.03 * (t - DROP) / 20).copy()
                first = seg is SEG[0] or SEG[SEG.index(seg) - 1]["name"] == "kitchen"
                k = eo(lt / (0.45 if first else 0.25))
                dy, sk, a = (int(420 * (1 - k)), 0.92 + 0.08 * k, k) if first else (int(24 * (1 - k)), 0.985 + 0.015 * k, 1.0)
                place(im, SHADOW, CARD_X - 120, CARD_Y - 120 + dy, alpha=a)
                card = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
                card.paste(view, (0, 0), MASK)
                place(im, card, CARD_X, CARD_Y + dy, alpha=a, scale=sk)
                headline(im, seg["name"], t, seg["start"], seg["end"])
                if seg is SEG[0] and lt < 0.12:
                    im = Image.blend(im, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.6 * (1 - lt / 0.12))
        else:
            cb = T["callback"]
            if t < cb["end"]:
                lt = t - cb["start"]
                n = int(round((cb["end"] - cb["start"]) * FPS)) + 2
                fr = live_frame("clips/a.mp4", lt, t, readers, preview, "callback", n, cb["src"], 1.0)
                im = vignette(grade(fr, warm=0.35), 0.35).convert("RGBA")
                caption(im, "Get you someone who texts first.", t, cb["start"] + 0.05, cb["end"], accent="first.")
                k = eio((t - (cb["end"] - 0.35)) / 0.35)
                if k > 0:
                    im = Image.blend(im, BG, k)
            else:
                im = end_card(t, cb["end"])
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
