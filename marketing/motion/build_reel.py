"""Builds reel_data.json + plan_reel.json for reel.html (the short, punchy cut of the real chat take).
Usage: python3 build_reel.py <log_chat.json> <frames dir> <notes.json>
Hook: the real warning notifications, full screen, in the first frame. Then one clip per thing the assistant did,
each cut marked by a punch-in and a sound. Inside a clip the take plays continuously; waits and typing run faster on a
smooth curve (Hermite keys through clip time, never a jump)."""
import json, sys

L = json.load(open(sys.argv[1])); FR = sys.argv[2]; NOTES = json.load(open(sys.argv[3]))
frames, probes, T = L["frames"], L["probes"], L["turns"]
keep = [j for j in range(len(frames)) if (j + 1 >= len(frames) or frames[j][1] <= frames[j + 1][1]) and (j == 0 or frames[j][1] >= frames[j - 1][1])]
frames = [frames[j] for j in keep]; probes = [probes[j] for j in keep]

HOOK = 2.95
V_WAIT = 2.6
def text_start(tr):
    p = tr["play"]; return tr["streamFrom"] + p["end"] - p["dur"] - 0.15
def ask(tr, vs=1.0):  # from the message going out to the reply landing
    return [(tr["sent"] - 0.06, V_WAIT), (text_start(tr) - 0.05, vs), (tr["replied"] + 0.05, 1.0)]

# turn indexes in the take: 0 week, 1 study time, 2 car insurance, 3 email preview, 4 "send it" + Confirm, 5 reminder
t1, t2, t3, t4, t5 = T[1], T[2], T[3], T[4], T[5]
CLIPS = [
    {"keys": ask(t1) + [(t1["replied"] + 1.5, 1.0)],
     "caps": [(None, ["SO I SAID:", "*FIX IT.*"]), (t1["replied"] - 0.1, ["STUDY TIME", "*BOOKED.*"])],
     "marks": [(1, "today, mon nov 9:")]},
    {"keys": ask(t2, 1.5) + [(t2["replied"] + 1.7, 1.0)],
     "caps": [(None, ["SHORT ON", "*CAR INSURANCE?*"]), (t2["replied"] - 0.1, ["MOVE $100", "*FROM SAVINGS.*"])],
     "marks": [(2, "=$100 from savings to checking today")]},
    {"keys": ask(t3) + [(t3["replied"] + 1.2, 1.0), (t4["tap"] - 0.05, 3.0), (t4["sent"] - 0.06, 3.0), (text_start(t4) - 0.05, 1.4),
             (t4["replied"] + 0.05, 1.6), (t4["confirmTap"] - 0.1, 1.0), (t4["confirmed"] + 0.25, 1.0)],
     "caps": [(None, ["EMAIL MY MANAGER", "*FORMALLY.*"]), (t3["replied"] - 0.1, ["IT SHOWS ME", "*THE EMAIL FIRST.*"]),
              (t4["replied"] - 0.1, ["SENDS ONLY", "*WHEN I APPROVE.*"])],
     "marks": [(4, "=confirm")], "fingers": [t4["confirmTap"]]},
    {"keys": ask(t5) + [(t5["replied"] + 1.3, 1.0)],
     "caps": [(None, ["REMIND ME", "*TOMORROW.*"]), (t5["replied"] - 0.1, ["*DONE.*"])],
     "marks": [(5, "tomorrow, tue nov 10")]},
]

def herm(keys, e):
    for k in range(len(keys) - 1):
        a, b = keys[k], keys[k + 1]
        if e < b["e"] or k == len(keys) - 2:
            dt = b["e"] - a["e"]; s = min(1.0, max(0.0, (e - a["e"]) / dt)); s2, s3 = s * s, s * s * s
            return (2 * s3 - 3 * s2 + 1) * a["c"] + (s3 - 2 * s2 + s) * dt * a["m"] + (-2 * s3 + 3 * s2) * b["c"] + (s3 - s2) * dt * b["m"]
def edit_of(keys, c):  # invert the (monotonic) clip-time curve
    lo, hi = keys[0]["e"], keys[-1]["e"]
    for _ in range(60):
        mid = (lo + hi) / 2
        if herm(keys, mid) < c: lo = mid
        else: hi = mid
    return lo

beats, caps, marks, taps = [], [{"a": -0.5, "b": HOOK, "lines": ["MY ASSISTANT CAUGHT THIS", "*3 DAYS EARLY.*"]}], [], []
e = HOOK
for cl in CLIPS:
    keys = [{"e": e, "c": cl["keys"][0][0], "m": cl["keys"][0][1]}]
    for (c, m) in cl["keys"][1:]:
        p = keys[-1]; keys.append({"e": p["e"] + 2 * (c - p["c"]) / (p["m"] + m), "c": c, "m": m})
    b = {"a": e, "b": keys[-1]["e"], "keys": keys}; beats.append(b)
    starts = [e if c is None else edit_of(keys, c) for c, _ in cl["caps"]]
    for k, (c, lines) in enumerate(cl["caps"]):
        caps.append({"a": starts[k], "b": starts[k + 1] if k + 1 < len(starts) else b["b"], "lines": lines})
    for (ti, pick) in cl["marks"]:
        marks.append({"turn": ti, "pick": pick, "at": edit_of(keys, T[ti]["replied"]) + 0.05, "until": b["b"] + 0.01})
    for ft in cl.get("fingers", []):
        x = min(L["taps"], key=lambda q: abs(q["t"] - ft)); taps.append({"at": edit_of(keys, ft + 0.1), "x": x["x"], "y": x["y"]})
    e = b["b"]
END_AT = e
TOTAL = END_AT + 2.6

sent = [tr["sent"] for tr in T]
mk = []
for j, pr in enumerate(probes):
    row = []
    for q in marks:
        hit = None; tt = frames[j][1]
        if pr and pr.get("s") and sent[q["turn"]] <= tt < (sent[q["turn"] + 1] if q["turn"] + 1 < len(T) else 1e9):
            for text, rects in pr["s"]:
                tl = text.lower()
                if (tl == q["pick"][1:]) if q["pick"].startswith("=") else (q["pick"] in tl):
                    hit = rects; break
        row.append(hit)
    mk.append(row)
# a probe is read just after its screenshot, so when the layout jumps in between (a card changing state), one frame can
# show the highlight at the next position: hide it on a frame where it steps by itself (still before, still after)
def y0(r): return r[0][1] if r else None
for k in range(len(marks)):
    ys = [y0(r[k]) for r in mk]
    for j in range(2, len(mk) - 1):
        if None in (ys[j - 2], ys[j - 1], ys[j], ys[j + 1]): continue
        if abs(ys[j] - ys[j - 1]) > 8 and abs(ys[j + 1] - ys[j]) < 2 and abs(ys[j - 1] - ys[j - 2]) < 2:
            mk[j][k] = None
for k, q in enumerate(marks):
    if not any(r[k] for r in mk): print("WARNING: highlight never found:", q["pick"])

data = {"dir": FR, "frames": [[f[0], f[1]] for f in frames], "mk": mk, "sc": [0, 112, 390, 511.5], "notes": NOTES,
        "hook": {"n": [{"i": 1, "at": -0.16}, {"i": 2, "at": 1.25}], "tapAt": 2.55, "end": HOOK},
        "beats": beats, "caps": caps, "marks": [{"at": q["at"], "until": q["until"]} for q in marks], "taps": taps, "endAt": END_AT, "total": TOTAL}
json.dump(data, open("reel_data.json", "w"))
scenes = [{"kind": "phone", "enter": True, "start": 0.0, "end": HOOK, "pops": [{"at": 0.0, "dur": 1.0}, {"at": 1.25, "dur": 1.0}]}]
for b in beats:
    pops = [{"at": round(q["at"] - b["a"], 3), "dur": 0.6} for q in marks if b["a"] <= q["at"] < b["b"]]
    pops += [{"at": round(f["at"] - b["a"], 3), "dur": 0.5} for f in taps if b["a"] <= f["at"] < b["b"]]
    scenes.append({"kind": "phone", "start": round(b["a"], 3), "end": round(b["b"], 3), "pops": sorted(pops, key=lambda x: x["at"])})
scenes.append({"kind": "gloss", "outro": True, "start": round(END_AT, 3), "end": round(TOTAL, 3), "wordmark": {"at": 0.25}})
json.dump({"bpm": 108, "duration": round(TOTAL, 2), "vo": [], "scenes": scenes}, open("plan_reel.json", "w"), indent=1)
print("total %.2f" % TOTAL, "clips", [round(b["b"] - b["a"], 2) for b in beats])
for c in caps: print("%.2f-%.2f %s" % (c["a"], c["b"], c["lines"]))
for f in taps: print("finger %.2f" % f["at"])
