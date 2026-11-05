"""Builds plan_p_jordan.json: Monday morning notifications -> the app -> the chat (Jordan's week)."""
import json
def marks(log):
    L = json.load(open(log)); t0 = sorted(f[1] for f in L["frames"])[0]
    return L, t0, {k: v - t0 for k, v in L["marks"].items()}
Ll, _, lk = marks("log_lock.json")
Lo, _, op = marks("log_open.json")
Lc, c0, _ = marks("log_convo.json")
T = [{k: (v - c0 if isinstance(v, float) else v) for k, v in t.items()} for t in Lc["turns"]]
taps = sorted(x["t"] - c0 for x in Lc["taps"])
def input_tap(sent): return [x for x in taps if x < sent - 0.05][-2]
S, t = [], 0.0
def add(parts, lines, size, pops=(), status=("8:23", False)):
    global t
    dur = round(sum(p[3] for p in parts), 2)
    src = [{"rec": rec, "from": round(a, 3), "dur": d, "speed": round(c / d, 3)} for rec, a, c, d in parts]
    S.append({"kind": "phone", "start": round(t, 2), "end": round(t + dur, 2), "src": src, "head": None, "pills": [], "punch": True,
              "pops": [{"card": n, "at": at, "dur": d, "y": y, "w": w} for n, at, d, y, w in pops],
              "bold": {"lines": lines, "size": size, "top": 100}, "status_time": status[0], "status_light": status[1]})
    t = round(t + dur, 2)
LOCK = ("8:22", True)
add([("act_lock", 0.2, lk["n1"] - 0.25, 3.0)], ["MONDAY MORNING.", "*IT* *TEXTS* *FIRST.*"], 100, [("jl_n0", 0.9, 2.1, 1120, 960)], LOCK)
a = lk["n1"] - 0.05
add([("act_lock", a, lk["tap"] - 0.15 - a, 3.6)], ["IT WARNS YOU", "*DAYS* *AHEAD.*"], 110, [("jl_n1", 0.25, 1.55, 1100, 960), ("jl_n2", 1.85, 1.75, 1100, 960)], LOCK)
add([("act_lock", lk["tap"] - 0.15, 0.6, 0.5), ("act_open", 0.15, op["feed"] - 1.6, 2.3)], ["FRIDAY'S CLASH", "*ALREADY* *FLAGGED.*"], 100)
a = op["feed"] - 0.1
add([("act_open", a, op["done"] + 0.05 - a, 2.4), ("act_open", op["done"] + 0.06, 0.7, 1.8)], ["ONE TAP:", "*STUDY* *TIME* *BLOCKED.*"], 92, [("jo_feedcard", 2.4, 1.8, 1150, 920)])
add([("act_open", op["plan"] - 1.9, op["end"] - (op["plan"] - 1.9), 3.0)], ["TUESDAY 11:15.", "*TWO* *DAYS* *EARLY.*"], 108)
def turn(i, typing, wait, hold, lines, size, pop):
    a = input_tap(T[i]["sent"]) - 0.1
    s, r = T[i]["sent"], T[i]["replied"]
    add([("act_jconvo", a, s - a, typing), ("act_jconvo", s, r - s, wait), ("act_jconvo", r + 0.02, 0.9, hold)], lines, size,
        [(pop, round(typing + wait, 2), hold, 1150, 920)])
turn(0, 1.5, 1.0, 2.6, ["SHORT FOR", "*CAR* *INSURANCE?*"], 108, "jc_insure")
turn(1, 1.4, 0.9, 3.0, ["ANYTHING ELSE", "*THIS* *WEEK?*"], 112, "jc_week")
turn(2, 1.5, 0.8, 2.2, ["TEXT MY MANAGER", "*ABOUT* *FRIDAY.*"], 100, "jc_reply2")
turn(3, 1.4, 0.8, 1.8, ["REMIND ME", "*TOMORROW* *AT* *9.*"], 112, "jc_reply3")
S.append({"kind": "gloss", "outro": True, "start": t, "end": round(t + 4.0, 2), "clip": "m/molecule.mp4", "speed": 0.7, "push": 0.03, "fade_in": 0.3,
          "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
          "bold": {"lines": ["*YOUR* *PERSONAL*", "*ASSISTANT.*", "TAP THE LINK IN BIO."], "size": 86, "top": 1225, "at": 0.15, "out": False},
          "wordmark": {"at": 1.2, "y": 1600, "sub": "lifeflowweb.com"},
          "note": {"text": "Real app and real replies, on a sample account.", "at": 1.3, "y": 1850}})
P = {"bpm": 100, "duration": S[-1]["end"], "vo": [], "scenes": S}
for x, y in zip(S, S[1:]):
    assert abs(x["end"] - y["start"]) < 1e-6
json.dump(P, open("plan_p_jordan.json", "w"), indent=1)
for s in S:
    print(s["start"], s["end"], [(p["rec"][4:], p["from"], p["speed"]) for p in s.get("src", [])], s["bold"]["lines"], [p["card"] for p in s.get("pops", [])])
