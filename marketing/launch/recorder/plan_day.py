"""Builds plan_p_day.json (launch.py format) from the recording's marks. Usage: python3 plan_day.py marks.json"""
import json, sys
m = json.load(open(sys.argv[1]))

def rec(frm, dur, speed):
    return {"rec": "day", "from": round(frm, 3), "dur": round(dur, 3), "speed": speed}

def phone(start, end, frm, speed, lines, size=100, counter=None):
    b = {"lines": lines, "size": size, "top": 100}
    if counter:
        b["counter"] = counter
    return {"kind": "phone", "start": start, "end": end, "src": [rec(frm, end - start, speed)], "head": None, "pops": [], "pills": [], "bold": b, "punch": True}

def fit(a, b, dur):
    """speed so that clip span a..b plays in dur seconds"""
    return round((b - a) / dur, 3)

S = []
t = 0.0
def add(dur, frm, to, lines, size=100, counter=None, speed=None):
    global t
    sp = speed or fit(frm, to, dur)
    S.append(phone(round(t, 2), round(t + dur, 2), frm, sp, lines, size, counter))
    t = round(t + dur, 2)

add(3.0, m["result"] + 0.1, m["result"] + 2.1, ["IT SPOTS WHAT", "*YOU'D MISS.*"], 108)
add(3.0, m["hello"] + 0.95, m["details"] + 0.05, ["TELL IT WHAT", "*FILLS YOUR WEEK.*"], 96, "1 / 4")
add(3.4, m["details"] + 0.05, m["yours"] + 0.05, ["ADD *ONE CLASS*", "AND YOUR JOB."], 100, "2 / 4")
add(2.8, m["yours"] + 0.05, m["day"] - 0.1, ["NAME IT. PICK", "*HOW IT TALKS.*"], 100, "3 / 4")
add(7.0, m["day"] - 0.1, m["result"] - 0.02, ["WATCH IT *READ*", "YOUR WEEK."], 104, "4 / 4")
add(4.0, m["result"] + 2.1, m["end"] - 0.1, ["THEN IT TELLS YOU", "*WHAT TO DO.*"], 92)
S.append({"kind": "gloss", "outro": True, "start": t, "end": round(t + 4.0, 2), "clip": "m/molecule.mp4", "speed": 0.7, "push": 0.03, "fade_in": 0.3,
          "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
          "bold": {"lines": ["*TRY IT TODAY.*", "TAP THE LINK", "IN BIO."], "size": 92, "top": 1225, "at": 0.15, "out": False},
          "wordmark": {"at": 1.2, "y": 1600, "sub": "lifeflowweb.com"},
          "note": {"text": "Real app. The numbers shown are examples.", "at": 1.3, "y": 1850}})
P = {"bpm": 100, "duration": S[-1]["end"], "vo": [], "scenes": S}
for a, b in zip(S, S[1:]):
    assert abs(a["end"] - b["start"]) < 1e-6
json.dump(P, open("plan_p_day.json", "w"), indent=1)
for s in S:
    print(s["start"], s["end"], s.get("src", [{}])[0], s["bold"]["lines"])
