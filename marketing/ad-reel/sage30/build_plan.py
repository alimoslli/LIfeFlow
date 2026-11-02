"""Build plan.json + words.json for render_sage.py from the three selfie clips' word timings.

Each pop-out is anchored to the word that triggers it, so the card lands on the line that mentions it.
Usage: python3 build_plan.py   (reads clips/*.mp4 durations and *_words.json)
"""
import json, subprocess


def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]))


def words(name, off):
    return [{"w": w, "s": round(s + off, 3), "e": round(e + off, 3)} for s, e, w in json.load(open(f"{name}_words.json"))]


def at(ws, word, nth=1):
    """Start time of the nth word matching (case-insensitive, punctuation ignored)."""
    k = 0
    for w in ws:
        if w["w"].lower().strip(".,!?") == word.lower():
            k += 1
            if k == nth:
                return w["s"]
    raise KeyError(word)


def last_end(ws):
    return ws[-1]["e"]


BOX = {
    "quiz": [40, 945, 1040, 1710],
    "blocked": [40, 945, 1040, 1700],
    "heads": [40, 370, 1040, 1050],
    "remind": [40, 395, 1040, 1085],
    "moved": [40, 395, 1040, 965],
    "brief": [40, 330, 1040, 1150],
}

order = ["maya", "alex", "jordan"]
clips, allw, t = [], [], 0.0
for n in order:
    ws = words(n, t)
    end = min(t + dur(f"clips/{n}.mp4") - 0.05, last_end(ws) + 0.28)
    clips.append({"name": n, "path": f"clips/{n}.mp4", "start": round(t, 3), "end": round(end, 3), "src": 0})
    allw += ws
    t = end
END = round(t, 3)
mw = [w for w in allw if clips[0]["start"] <= w["s"] < clips[0]["end"]]
aw = [w for w in allw if clips[1]["start"] <= w["s"] < clips[1]["end"]]
jw = [w for w in allw if clips[2]["start"] <= w["s"] < clips[2]["end"]]

m_sage = at(mw, "sage")
m_quiz = at(mw, "quiz")
m_blocked = at(mw, "blocked")
a_rent = at(aw, "rent")
a_reminded = at(aw, "reminded")
j_tap = at(jw, "tap")
j_morning = at(jw, "morning")

phones = [
    {"rec": "block", "t0": m_quiz - 0.35, "t1": clips[0]["end"] - 0.02, "side": "right", "y": 1110, "scale": 0.7,
     "src": [[0, 0.3], [m_blocked - (m_quiz - 0.35) - 0.4, 0.3], [m_blocked - (m_quiz - 0.35) + 0.2, 1.2], [9, 1.8]]},
    {"rec": "next30", "t0": a_rent - 0.45, "t1": a_reminded - 0.1, "side": "left", "y": 1110, "scale": 0.7, "src": [[0, 0.6], [1.2, 2.2], [9, 2.4]]},
    {"rec": "remind", "t0": a_reminded - 0.1, "t1": clips[1]["end"] - 0.02, "side": "right", "y": 1110, "scale": 0.7, "src": [[0, 0.4], [0.5, 0.75], [1.1, 1.6], [9, 2.8]]},
    {"rec": "move", "t0": jw[0]["s"] + 0.25, "t1": j_morning - 0.15, "side": "left", "y": 1110, "scale": 0.7, "src": [[0, 0.4], [j_tap - jw[0]["s"] - 0.35, 0.65], [j_tap - jw[0]["s"] + 0.3, 1.2], [9, 2.8]]},
    {"rec": "brief", "t0": j_morning - 0.15, "t1": clips[2]["end"] - 0.02, "side": "right", "y": 1110, "scale": 0.7, "src": [[0, 1.0], [9, 1.0]]},
]
pops = [
    {"rec": "block", "src_t": 0.3, "box": BOX["quiz"], "t0": m_quiz + 0.25, "t1": m_blocked - 0.15, "y": 1060, "from": [690, 1110], "width": 880},
    {"rec": "block", "src_t": 1.7, "box": BOX["blocked"], "t0": m_blocked + 0.45, "t1": clips[0]["end"] - 0.08, "y": 1060, "from": [690, 1110], "width": 880},
    {"rec": "next30", "src_t": 2.4, "box": BOX["heads"], "t0": a_rent + 0.25, "t1": a_reminded - 0.15, "y": 1060, "from": [390, 1110], "width": 880, "ry": 14},
    {"rec": "remind", "src_t": 2.8, "box": BOX["remind"], "t0": a_reminded + 0.6, "t1": clips[1]["end"] - 0.08, "y": 1060, "from": [690, 1110], "width": 880},
    {"rec": "move", "src_t": 2.8, "box": BOX["moved"], "t0": j_tap + 0.55, "t1": j_morning - 0.25, "y": 1060, "from": [390, 1110], "width": 880, "ry": 14},
    {"rec": "brief", "src_t": 1.0, "box": BOX["brief"], "t0": j_morning + 0.35, "t1": clips[2]["end"] - 0.08, "y": 1060, "from": [690, 1110], "width": 800},
]
chips = [{"t0": m_sage - 0.05, "t1": m_quiz - 0.3, "y": 860}]

# caption groups: 1-3 words, broken at punctuation and pauses
groups, cur = [], []
for w in allw:
    if cur and (len(cur) >= 3 or w["s"] - cur[-1]["e"] > 0.25):
        groups.append(cur)
        cur = []
    cur.append(w)
    if w["w"][-1] in ".,!?":
        groups.append(cur)
        cur = []
if cur:
    groups.append(cur)
cg = []
for i, g in enumerate(groups):
    s = g[0]["s"]
    e = groups[i + 1][0]["s"] if i + 1 < len(groups) else g[-1]["e"] + 0.3
    e = min(e, g[-1]["e"] + 0.5)
    cg.append({"s": round(s, 3), "e": round(e, 3)})

plan = {"duration": 30.0, "end": END, "clips": clips, "phones": phones, "pops": pops, "chips": chips, "caption_groups": cg, "caption_y": 1500}
for w in allw:
    if w["w"].upper() == w["w"] and w["w"].strip(".,!?").lower() == "sage":
        w["w"] = w["w"].replace("SAGE", "Sage")
json.dump(plan, open("plan.json", "w"), indent=1)
json.dump(allw, open("words.json", "w"))
print("end card at", END, "| clips", [(c["name"], c["start"], c["end"]) for c in clips])
