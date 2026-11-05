"""Builds plan_p_convo.json: the chat with the assistant, one scene per turn (what you ask as the caption, its real answer as the pop)."""
import json
L = json.load(open("log_convo.json"))
t0 = sorted(f[1] for f in L["frames"])[0]
T = [{k: (v - t0 if isinstance(v, float) else v) for k, v in t.items()} for t in L["turns"]]
taps = sorted(x["t"] - t0 for x in L["taps"])
def input_tap(sent):  # the tap on the message box: the second-to-last tap before the message was sent
    before = [x for x in taps if x < sent - 0.05]
    return before[-2]
S, t = [], 0.0
def add(parts, lines, size, pop=None, pop_at=None):
    global t
    dur = round(sum(p[2] for p in parts), 2)
    src = [{"rec": "act_convo", "from": round(a, 3), "dur": d, "speed": round(c / d, 3)} for a, c, d in parts]
    sc = {"kind": "phone", "start": round(t, 2), "end": round(t + dur, 2), "src": src, "head": None, "pops": [], "pills": [],
          "bold": {"lines": lines, "size": size, "top": 100}, "punch": True}
    if pop:
        sc["pops"] = [{"card": pop, "at": pop_at, "dur": round(dur - pop_at, 2), "y": 1150, "w": 920}]
    S.append(sc); t = round(t + dur, 2)
def turn(i, typing, wait, hold, lines, size, pop):
    a = input_tap(T[i]["sent"]) - 0.1
    s, r = T[i]["sent"], T[i]["replied"]
    add([(a, s - a, typing), (s, r - s, wait), (r + 0.02, 0.9, hold)], lines, size, pop, round(typing + wait, 2))

s0, r0 = T[0]["sent"], T[0]["replied"]
add([(s0 - 0.25, 2.25, 2.6)], ["ONE CHAT.", "*MY* *WHOLE* *DAY.*"], 116)  # starts on the sent message: the empty chat shows a "connect" banner
add([(s0 + 2.0, r0 - s0 - 2.0, 3.0), (r0 + 0.02, 1.0, 2.6)], ["WHAT DOES", "*TODAY* *LOOK* *LIKE?*"], 104, "cv_brief", 2.6)
turn(1, 1.5, 0.8, 1.7, ["REMIND ME", "*AT* *NOON.*"], 116, "cv_remind")
turn(2, 1.4, 1.2, 2.4, ["WHERE'S MY", "*MONEY* *GOING?*"], 108, "cv_money")
turn(3, 1.5, 1.0, 1.9, ["SET A", "*COFFEE* *BUDGET.*"], 112, "cv_budget")
turn(4, 1.4, 1.0, 2.4, ["AM I ON TRACK", "*FOR* *MY* *TRIP?*"], 104, "cv_trip")
turn(5, 1.2, 0.8, 1.8, ["YES,", "*SET* *THAT* *UP.*"], 116, "cv_plan")
S.append({"kind": "gloss", "outro": True, "start": t, "end": round(t + 4.0, 2), "clip": "m/molecule.mp4", "speed": 0.7, "push": 0.03, "fade_in": 0.3,
          "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
          "bold": {"lines": ["*YOUR* *PERSONAL*", "*ASSISTANT.*", "TAP THE LINK IN BIO."], "size": 86, "top": 1225, "at": 0.15, "out": False},
          "wordmark": {"at": 1.2, "y": 1600, "sub": "lifeflowweb.com"},
          "note": {"text": "Real app and real replies, on a sample account.", "at": 1.3, "y": 1850}})
P = {"bpm": 100, "duration": S[-1]["end"], "vo": [], "scenes": S}
for x, y in zip(S, S[1:]):
    assert abs(x["end"] - y["start"]) < 1e-6
json.dump(P, open("plan_p_convo.json", "w"), indent=1)
for s in S:
    print(s["start"], s["end"], [(p["from"], round(p["dur"], 2), p["speed"]) for p in s.get("src", [])], s["bold"]["lines"], [(p["card"], p["at"]) for p in s.get("pops", [])])
