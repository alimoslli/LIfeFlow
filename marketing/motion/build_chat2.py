"""Builds chat2_data.json for chat2.html from the continuous chat take (rec_chat.cjs).
Usage: python3 build_chat2.py <log_chat.json> <frames dir> <captions2.json> <notes.json>
The take plays straight through at 1x (no cuts, no speed ramps); the camera is one smooth path."""
import json, sys
import numpy as np

L = json.load(open(sys.argv[1])); FR = sys.argv[2]; CAPS = json.load(open(sys.argv[3])); NOTES = json.load(open(sys.argv[4]))
frames = L["frames"]; probes = L["probes"]; T = L["turns"]
# drop any frame whose timestamp is out of order (a capture that straddled a pause)
keep = [j for j in range(len(frames)) if (j + 1 >= len(frames) or frames[j][1] <= frames[j + 1][1]) and (j == 0 or frames[j][1] >= frames[j - 1][1])]
if len(keep) < len(frames): print("dropped frames:", [frames[j][0] for j in range(len(frames)) if j not in set(keep)])
frames = [frames[j] for j in keep]; probes = [probes[j] for j in keep]
FPS = 60
K = 722 / 390
APP_Y = 392 + 16 + 82          # canvas y of app css y=0 (phone top + bezel + status bar)
SCR_Y = 392 + 16               # canvas y of the screen top
ANCHOR = 1150                  # where the camera's focus point sits on the canvas

LOCK = {"noteAt": [0.4, 2.15, 2.5], "bigAt": 0.85, "bigOut": 2.05, "bigY": 860, "tapAt": 3.35, "openAt": 3.5}
OPEN = LOCK["openAt"]
clip0 = T[0]["sent"] + 0.02
E = lambda ct: OPEN + (ct - clip0)      # clip time -> edit time
end_clip = T[-1]["end"]
end_at = E(end_clip) + 0.1
total = end_at + 3.2

# captions: the lock line, then one per turn (from its tap to the next turn's tap)
caps = [{"a": 0.3, "b": OPEN, "lines": ["MONDAY, 8:22 AM.", "*IT* *TEXTS* *FIRST.*"]}]
for i, tr in enumerate(T):
    a = OPEN if i == 0 else E(tr["tap"]) - 0.05
    b = E(T[i + 1]["tap"]) - 0.05 if i + 1 < len(T) else end_at - 0.1
    caps.append({"a": a, "b": b, "lines": CAPS[i]["lines"]})

# per-frame probes, reduced to the marked phrases
marks = []
for i, tr in enumerate(T):
    for pick in CAPS[i].get("marks", []):
        marks.append({"turn": i, "pick": pick.lower()})
fr_t = np.array([f[1] for f in frames])
turn_of = np.searchsorted([tr["sent"] for tr in T], fr_t, side="right") - 1
red = []
for j, pr in enumerate(probes):
    if not pr or "s" not in pr:
        red.append({"sc": pr["sc"] if pr else None, "m": None}); continue
    m = []
    for mk in marks:
        hit = None
        if turn_of[j] == mk["turn"]:
            for text, rects in pr["s"]:
                if (text.lower() == mk["pick"][1:]) if mk["pick"].startswith("=") else (mk["pick"] in text.lower()):
                    hit = rects; break
        m.append(hit)
    red.append({"sc": pr["sc"], "m": m})
# when each mark first shows fully inside the chat area, and how long it stays
for k, mk in enumerate(marks):
    tr = T[mk["turn"]]
    first = None
    for j, r in enumerate(red):
        if r["m"] and r["m"][k] and r["sc"]:
            y0, y1 = r["sc"][1], r["sc"][1] + r["sc"][3]
            if all(y0 + 4 <= y and y + h <= y1 - 4 for (x, y, w, h) in r["m"][k]):
                first = frames[j][1]; break
    if first is None:
        mk["at"] = 1e9; mk["until"] = 0; print("mark never visible:", mk["pick"]); continue
    order = sum(1 for q in marks[:k] if q["turn"] == mk["turn"])
    mk["at"] = max(E(first) + 0.3, E(tr["replied"]) - 0.2 + 0.28 * order)
    nxt = T[mk["turn"] + 1]["tap"] if mk["turn"] + 1 < len(T) else end_clip
    mk["until"] = E(nxt) - 0.05

# finger taps inside the chat (after the take starts)
taps = [{"at": E(x["t"]), "x": x["x"], "y": x["y"]} for x in L["taps"] if x["t"] >= clip0]

# camera target per output frame, then a gaussian blur so it never jumps
n = int(total * FPS) + 2
ts = np.arange(n) / FPS
S = np.ones(n); F = np.full(n, float(ANCHOR))
list_center = SCR_Y + (300 + 165) * K
def mark_center(t):
    ct = clip0 + (t - OPEN); j = int(np.clip(np.searchsorted(fr_t, ct), 0, len(frames) - 1)); r = red[j]
    ys = []
    for k, mk in enumerate(marks):
        if r["m"] and r["m"][k] and mk["at"] - 0.2 <= t < mk["until"]:
            ys += [y + h / 2 for (x, y, w, h) in r["m"][k] if r["sc"] and r["sc"][1] <= y <= r["sc"][1] + r["sc"][3]]
    return float(np.mean(ys)) if ys else None
for q, t in enumerate(ts):
    if t < 2.0:
        s, fy = 1.0, ANCHOR
    elif t < OPEN + 0.25:
        s, fy = 1.2, list_center
    elif t >= end_at - 0.6:
        s, fy = 1.0, ANCHOR
    else:
        ct = clip0 + (t - OPEN)
        i = max(0, int(np.searchsorted([tr["tap"] for tr in T], ct, side="right")) - 1)
        tr = T[i]
        typing = i > 0 and tr["tap"] - 0.15 <= ct < tr["sent"] + 0.2
        if typing:
            s, fy = 1.27, 1285.0
        else:
            s, fy = 1.3, 1265.0
    S[q], F[q] = s, fy
def blur(x, sig):
    r = int(sig * FPS * 3); k = np.exp(-0.5 * (np.arange(-r, r + 1) / (sig * FPS)) ** 2); k /= k.sum()
    return np.convolve(np.pad(x, r, mode="edge"), k, mode="valid")
S2, F2 = blur(S, 0.35), blur(F, 0.35)
cam = [[round(float(a), 4), round(float(b), 1)] for a, b in zip(S2, F2)]

data = {"dir": FR, "frames": [[f[0], f[1]] for f in frames], "probes": red, "notes": NOTES, "lock": LOCK, "clip0": clip0,
        "caps": caps, "marks": [{"at": m["at"], "until": m["until"]} for m in marks], "taps": taps,
        "cam": cam, "camFps": FPS, "anchor": ANCHOR, "endAt": end_at, "total": total}
json.dump(data, open("chat2_data.json", "w"))
print("total", round(total, 2), "endAt", round(end_at, 2), "marks", len(marks), "taps", len(taps))
for c in caps: print(round(c["a"], 2), round(c["b"], 2), c["lines"])
for m in marks: print("mark", m["turn"], m["pick"], round(m["at"], 2), round(m["until"], 2))

# music plan for ../launch/music_launch.py: a tick on each new question, a soft pop on each highlight, a chime on the logo
scenes = [{"kind": "gloss", "start": 0.0, "end": OPEN}]
for i, c in enumerate(caps[1:]):
    pops = [{"at": round(m["at"] - c["a"], 2), "dur": 0.6} for m in marks if m["turn"] == i and m["at"] < 1e8]
    scenes.append({"kind": "phone", "start": round(c["a"], 2), "end": round(c["b"] if i + 1 < len(T) else end_at, 2), "pops": pops})
scenes.append({"kind": "gloss", "outro": True, "start": round(end_at, 2), "end": round(total, 2), "wordmark": {"at": 0.3}})
json.dump({"bpm": 100, "duration": round(total, 2), "vo": [], "scenes": scenes}, open("plan_chat2.json", "w"), indent=1)
