"""Builds plan_p_act.json (launch.py format) from the scene logs. Usage: python3 plan_act.py"""
import json
M = {}
for s in ("today", "tour", "feed", "lab", "swap", "quiz"):
    L = json.load(open(f"log_{s}.json"))
    t0 = sorted(f[1] for f in L["frames"])[0]
    M[s] = {k: v - t0 for k, v in L["marks"].items()}
    for k, v in L["rects"].items():
        M[s]["rect_" + k] = v["t"] - t0
S, t = [], 0.0

def add(rec, parts, lines, size=100, pop=None, pop_at=1.4, pop_y=1150):
    """parts: [(from, clip_seconds, scene_seconds)] played back to back."""
    global t
    dur = round(sum(p[2] for p in parts), 2)
    src = [{"rec": f"act_{rec}", "from": round(a, 3), "dur": d, "speed": round(c / d, 3)} for a, c, d in parts]
    sc = {"kind": "phone", "start": round(t, 2), "end": round(t + dur, 2), "src": src, "head": None, "pops": [], "pills": [],
          "bold": {"lines": lines, "size": size, "top": 100}, "punch": True}
    for i, pp in enumerate(pop or []):
        name, at, d = pp
        sc["pops"].append({"card": name, "at": at, "dur": d, "y": pop_y, "w": 920})
    S.append(sc)
    t = round(t + dur, 2)

td, tr, fd, lb, sw, qz = M["today"], M["tour"], M["feed"], M["lab"], M["swap"], M["quiz"]
add("today", [(0.2, td["b"] + 0.4, 3.2)], ["REAL WEEK.", "*REAL MESS.*"], 120)
add("tour", [(tr["a"] + 0.4, tr["end"] - 0.6, 5.0)], ["IT SEES YOUR", "*WHOLE WEEK.*"], 110)
add("lab", [(lb["sent"] - 0.5, 2.1, 2.6)], ["JUST TELL IT", "*WHAT'S WRONG.*"], 104)
a = lb["sent"] + 1.6
add("lab", [(a, lb["replied"] - a, 1.8), (lb["replied"] + 0.02, 1.15, 2.6)], ["IT BLOCKS", "*THE TIME.*"], 116, [("act_lab_reply1", 1.8, 2.6)])
add("lab", [(lb["plan"] - 1.95, 2.95, 2.6)], ["ALREADY ON", "*YOUR CALENDAR.*"], 104)
a = sw["sent"] - 0.3
add("swap", [(a, sw["replied"] - a, 2.0), (sw["replied"] + 0.02, 1.25, 2.6)], ["IT WRITES", "*THE SWAP TEXT.*"], 108, [("act_swap_reply1", 2.0, 2.6)], pop_y=1180)
a = fd["card"] - 0.5
add("feed", [(a, fd["done"] + 0.05 - a, 2.4), (fd["done"] + 0.06, 0.9, 2.0)], ["IT CATCHES CLASHES", "*BEFORE YOU DO.*"], 92, [("act_feed_feedcard", 2.4, 2.0)])
q1 = qz["rect_reply1"]
add("quiz", [(q1 - 0.4, qz["sent"] + 0.2 - (q1 - 0.4), 3.4)], ["THEN IT", "*QUIZZES YOU.*"], 116, [("act_quiz_reply1", 0.3, 1.9)])
a = qz["sent"] + 0.2
add("quiz", [(a, qz["replied"] - a, 1.2), (qz["replied"] + 0.02, 1.4, 2.8)], ["AND CHECKS", "*YOUR ANSWER.*"], 108, [("act_quiz_reply2", 1.2, 2.8)])
S.append({"kind": "gloss", "outro": True, "start": t, "end": round(t + 4.0, 2), "clip": "m/molecule.mp4", "speed": 0.7, "push": 0.03, "fade_in": 0.3,
          "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
          "bold": {"lines": ["*YOUR PERSONAL*", "*ASSISTANT.*", "TAP THE LINK IN BIO."], "size": 86, "top": 1225, "at": 0.15, "out": False},
          "wordmark": {"at": 1.2, "y": 1600, "sub": "lifeflowweb.com"},
          "note": {"text": "Real app and real assistant replies, on a sample account.", "at": 1.3, "y": 1850}})
P = {"bpm": 100, "duration": S[-1]["end"], "vo": [], "scenes": S}
for x, y in zip(S, S[1:]):
    assert abs(x["end"] - y["start"]) < 1e-6
for s in S:
    if s["kind"] == "phone":
        assert abs(sum(p["dur"] for p in s["src"]) - (s["end"] - s["start"])) < 1e-6, s["start"]
json.dump(P, open("plan_p_act.json", "w"), indent=1)
for s in S:
    print(s["start"], s["end"], [(p["from"], p["dur"], p["speed"]) for p in s.get("src", [])], s["bold"]["lines"], [(p["card"], p["at"]) for p in s.get("pops", [])])
