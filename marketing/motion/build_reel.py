"""Builds reel_data.json + plan_reel.json for reel.html (the short, punchy cut of the real chat take).
Usage: python3 build_reel.py <log_chat2.json> <frames dir> <notes.json>
Hook: the real warning notifications, full screen, in the first frame. Then one clip per thing the assistant did,
each cut marked by a punch-in and a sound. Inside a clip the take plays continuously; the wait for the reply is
sped up on a smooth curve (never a jump)."""
import json, sys

L = json.load(open(sys.argv[1])); FR = sys.argv[2]; NOTES = json.load(open(sys.argv[3]))
frames, probes, T = L["frames"], L["probes"], L["turns"]
keep = [j for j in range(len(frames)) if (j + 1 >= len(frames) or frames[j][1] <= frames[j + 1][1]) and (j == 0 or frames[j][1] >= frames[j - 1][1])]
frames = [frames[j] for j in keep]; probes = [probes[j] for j in keep]

HOOK = 2.95
BEATS = [  # turn, hold after the reply lands, stream speed, highlighted bold phrase, setup caption, payoff caption
    (1, 1.5, 1.0, "3 stat 201 midterm study sessions", ["SO I SAID:", "*FIX IT.*"], ["STUDY TIME", "*BOOKED.*"]),
    (2, 1.7, 1.5, "=$100 from savings to checking", ["SHORT ON", "*CAR INSURANCE?*"], ["IT FOUND", "*THE FIX.*"]),
    (3, 1.7, 1.0, "3:00 pm instead of 1:00 pm this friday", ["SHIFT CLASHES", "*WITH CLASS?*"], ["TEXT TO MY BOSS:", "*WRITTEN.*"]),
    (4, 1.3, 1.0, "tomorrow, tue nov 10 at 9:00 am", ["REMIND ME", "*TOMORROW.*"], ["*DONE.*"]),
]
V_WAIT = 2.6
beats, caps, marks = [], [{"a": -0.5, "b": HOOK, "lines": ["MY ASSISTANT CAUGHT THIS", "*3 DAYS EARLY.*"]}], []
e = HOOK
for (ti, hold, vs, pick, setup, payoff) in BEATS:
    tr = T[ti]; p = tr["play"]
    text_start = tr["streamFrom"] + p["end"] - p["dur"] - 0.15
    c = [tr["sent"] - 0.06, text_start - 0.05, tr["replied"] + 0.05, tr["replied"] + hold]
    m = [V_WAIT, vs, 1.0, 1.0]
    d = [2 * (c[1] - c[0]) / (m[0] + m[1]), 2 * (c[2] - c[1]) / (m[1] + m[2]), c[3] - c[2]]
    keys = [{"e": e, "c": c[0], "m": m[0]}]
    for k in range(3):
        keys.append({"e": keys[-1]["e"] + d[k], "c": c[k + 1], "m": m[k + 1]})
    b = {"a": e, "b": keys[-1]["e"], "keys": keys}
    beats.append(b)
    land = keys[2]["e"] - 0.05  # reply has landed
    caps.append({"a": e, "b": land - 0.15, "lines": setup})
    caps.append({"a": land - 0.15, "b": b["b"], "lines": payoff})
    marks.append({"turn": ti, "pick": pick, "at": land + 0.05, "until": b["b"] + 0.01})
    e = b["b"]
END_AT = e
TOTAL = END_AT + 2.6

# per-frame rects of each beat's highlighted phrase (from the probes logged while filming)
sent = [tr["sent"] for tr in T]
mk = []
for j, pr in enumerate(probes):
    row = []
    for q in marks:
        hit = None
        tt = frames[j][1]
        if pr and pr.get("s") and sent[q["turn"]] <= tt < (sent[q["turn"] + 1] if q["turn"] + 1 < len(T) else 1e9):
            for text, rects in pr["s"]:
                tl = text.lower()
                if (tl == q["pick"][1:]) if q["pick"].startswith("=") else (q["pick"] in tl):
                    hit = rects; break
        row.append(hit)
    mk.append(row)
for q in marks:
    k = marks.index(q)
    if not any(r[k] for r in mk): print("WARNING: highlight never found:", q["pick"])

data = {"dir": FR, "frames": [[f[0], f[1]] for f in frames], "mk": mk, "sc": [0, 112, 390, 511.5], "notes": NOTES,
        "hook": {"n": [{"i": 1, "at": -0.16}, {"i": 2, "at": 1.25}], "tapAt": 2.55, "end": HOOK},
        "beats": beats, "caps": caps, "marks": [{"at": q["at"], "until": q["until"]} for q in marks], "endAt": END_AT, "total": TOTAL}
json.dump(data, open("reel_data.json", "w"))
scenes = [{"kind": "phone", "enter": True, "start": 0.0, "end": HOOK, "pops": [{"at": 0.0, "dur": 1.0}, {"at": 1.25, "dur": 1.0}]}]
for b, q in zip(beats, marks):
    scenes.append({"kind": "phone", "start": round(b["a"], 3), "end": round(b["b"], 3), "pops": [{"at": round(q["at"] - b["a"], 3), "dur": 0.6}]})
scenes.append({"kind": "gloss", "outro": True, "start": round(END_AT, 3), "end": round(TOTAL, 3), "wordmark": {"at": 0.25}})
json.dump({"bpm": 108, "duration": round(TOTAL, 2), "vo": [], "scenes": scenes}, open("plan_reel.json", "w"), indent=1)
print("total %.2f" % TOTAL)
for c in caps: print("%.2f-%.2f %s" % (c["a"], c["b"], c["lines"]))
