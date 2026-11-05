"""Builds plan_p_try.json (launch.py format) from the try-it recording's marks. Usage: python3 plan_try.py marks_try.json"""
import json, sys
m = json.load(open(sys.argv[1]))
S, t = [], 0.0

def add(dur, a, b, lines, size=100, pop=None):
    global t
    sc = {"kind": "phone", "start": round(t, 2), "end": round(t + dur, 2), "src": [{"rec": "try", "from": round(a, 3), "dur": dur, "speed": round((b - a) / dur, 3)}],
          "head": None, "pops": [], "pills": [], "bold": {"lines": lines, "size": size, "top": 100}, "punch": True}
    if pop:
        sc["pops"] = [{"card": pop, "at": 0.85, "dur": round(dur - 0.85, 2), "y": 1180, "w": 900}]
    S.append(sc)
    t = round(t + dur, 2)

add(3.0, m["result"] - 0.05, m["result"] + 2.0, ["TEST-DRIVE YOUR", "*ASSISTANT.*"], 104)
add(3.2, m["week"], m["yours"], ["TELL IT ABOUT", "*YOUR CLASSES.*"], 100)
add(2.0, m["yours"] - 0.1, m["day"] + 0.4, ["GIVE IT", "*A NAME.*"], 112)
add(6.3, m["day"] + 0.4, m["result"] - 0.02, ["IT READS", "*YOUR WEEK.*"], 110)
add(2.6, m["result"] - 0.02, m["tap1"] - 0.05, ["IT TELLS YOU", "*WHAT IT WOULD DO.*"], 88)
add(3.0, m["tap1"] - 0.05, m["tap2"] - 0.05, ["ONE TAP", "*TO PLAN IT.*"], 108, "try_block")
add(3.0, m["tap2"] - 0.05, m["tap3"] - 0.05, ["IT CATCHES", "*DOUBLE CHARGES.*"], 96, "try_show")
add(3.0, m["tap3"] - 0.05, m["again"] - 0.05, ["IT QUIZZES YOU", "*BEFORE THE TEST.*"], 88, "try_quiz")
add(4.0, m["again"] - 0.05, m["result2"] + 2.2, ["SHOW ME", "*ANOTHER DAY.*"], 104)
S.append({"kind": "gloss", "outro": True, "start": t, "end": round(t + 4.0, 2), "clip": "m/molecule.mp4", "speed": 0.7, "push": 0.03, "fade_in": 0.3,
          "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
          "bold": {"lines": ["*TRY IT YOURSELF.*", "TAP THE LINK", "IN BIO."], "size": 90, "top": 1225, "at": 0.15, "out": False},
          "wordmark": {"at": 1.2, "y": 1600, "sub": "lifeflowweb.com"},
          "note": {"text": "Real app. The numbers shown are examples.", "at": 1.3, "y": 1850}})
P = {"bpm": 100, "duration": S[-1]["end"], "vo": [], "scenes": S}
json.dump(P, open("plan_p_try.json", "w"), indent=1)
for s in S:
    print(s["start"], s["end"], s.get("src", [{}])[0], s["bold"]["lines"], [p["card"] for p in s.get("pops", [])])
