"""Writes plan_money.json, plan_life.json and plan_story.json. Cuts sit on a 100 BPM grid (one beat = 0.6 s)."""
import json


def phone(start, end, src, head, pops=(), pills=(), enter=False, exit=False):
    s = {"kind": "phone", "start": start, "end": end, "src": list(src), "head": head, "pops": list(pops), "pills": list(pills)}
    if enter:
        s["enter"] = True
    if exit:
        s["exit"] = True
    return s


def rec(name, frm, dur, speed=1.0):
    return {"rec": name, "from": frm, "dur": dur, "speed": speed}


def head(eyebrow, l1, l2=None, size=88):
    return {"eyebrow": eyebrow, "l1": l1, "l2": l2, "size": size}


NOTE = {"text": "App shown with sample data.", "at": 1.2, "y": 1846}

money = {
    "bpm": 100,
    "duration": 38.4,
    "vo": [["vo/A1.wav", 2.55], ["vo/A2.wav", 6.75], ["vo/A3.wav", 13.35], ["vo/A4.wav", 19.95], ["vo/A5.wav", 22.95], ["vo/A6.wav", 26.55],
           ["vo/A7.wav", 31.35], ["vo/A8.wav", 34.6]],
    "scenes": [
        {"kind": "gloss", "start": 0.0, "end": 2.4, "clip": "m/orbs.mp4", "speed": 0.8, "push": 0.06, "fade_out": 0.3,
         "haze": [{"cy": 930, "h": 760, "s": 0.88}],
         "texts": [{"eyebrow": "INTRODUCING LIFEFLOW", "l1": "Your money,", "l2": "finally clear.", "top": 780, "size": 118, "at": 0.2}]},
        phone(2.4, 6.6, [rec("m_over", 0, 4.2, 0.7)], head("OVERVIEW", "All your money,", "in one place."),
              pops=[{"card": "available1842", "at": 1.2, "dur": 2.7, "y": 1130}], enter=True),
        phone(6.6, 13.2, [rec("m_bank", 0, 6.6, 0.69)], head("CONNECT YOUR BANK", "Linked in seconds.", "Secured by Plaid."),
              pops=[{"card": "bank", "at": 3.7, "dur": 2.6, "y": 1060}], pills=[{"kind": "plaid", "at": 1.9, "y": 1665}]),
        phone(13.2, 19.8, [rec("m_cash", 2.3, 2.5, 1.7), rec("m_cashtx", 1.3, 2.9, 1.6), rec("m_txlist", 0, 1.2)],
              head("CASH, TOO", "Paid in cash?", "Add it in a tap."),
              pops=[{"card": "cashacct", "at": 2.0, "dur": 1.5, "y": 1080}, {"card": "lunch", "at": 5.3, "dur": 1.3, "y": 1080}],
              pills=[{"kind": "chip", "text": "Or just tell Sage", "at": 2.6, "y": 1680}]),
        phone(19.8, 22.8, [rec("activity", 1.0, 3.0, 1.2)], head("ACTIVITY", "Every transaction,", "sorted for you.")),
        phone(22.8, 26.4, [rec("budget", 0.6, 3.6, 0.8)], head("BUDGETS", "Set a budget.", "See where you stand."),
              pops=[{"card": "budgets", "at": 1.3, "dur": 2.3, "y": 1130, "w": 780}]),
        phone(26.4, 31.2, [rec("next30", 0.6, 4.8, 0.9)], head("SAGE KEEPS WATCH", "Heads up,", "before it happens."),
              pops=[{"card": "headsup", "at": 1.7, "dur": 2.7, "y": 1110}]),
        phone(31.2, 34.2, [rec("subs", 0.55, 3.0, 1.15)], head("SUBSCRIPTIONS", "The ones you forgot,", "found."),
              pops=[{"card": "peryear", "at": 0.9, "dur": 1.6, "y": 1120, "w": 560}], exit=True),
        {"kind": "gloss", "start": 34.2, "end": 38.4, "clip": "m/molecule.mp4", "speed": 0.8, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1580, "h": 820, "s": 0.85}],
         "texts": [{"l1": "Money,", "l2": "handled.", "top": 1290, "size": 112, "at": 0.25}],
         "wordmark": {"at": 1.05, "y": 1555, "sub": "lifeflowweb.com"}, "note": NOTE},
    ],
}

life = {
    "bpm": 100,
    "duration": 31.2,
    "vo": [["vo/B1.wav", 0.3], ["vo/B2.wav", 3.75], ["vo/B3.wav", 8.55], ["vo/B4.wav", 11.55], ["vo/B5.wav", 16.95], ["vo/B6.wav", 22.35],
           ["vo/B7.wav", 26.7]],
    "scenes": [
        {"kind": "gloss", "start": 0.0, "end": 3.6, "clip": "m/ribbon.mp4", "speed": 0.9, "push": 0.06, "fade_out": 0.3,
         "haze": [{"cy": 470, "h": 640, "s": 0.85}],
         "texts": [{"eyebrow": "INTRODUCING LIFEFLOW", "l1": "Big goals.", "l2": "Small habits.", "top": 330, "size": 118, "at": 0.2}]},
        phone(3.6, 8.4, [rec("g_goals", 1.4, 4.8, 1.25)], head("GOALS", "Set a goal.", "Sage plans the steps."),
              pops=[{"card": "run5k", "at": 3.3, "dur": 1.5, "y": 1110}], enter=True),
        phone(8.4, 11.4, [rec("g_habit", 2.5, 3.0, 1.7)], head("HABITS", "Habits that", "actually stick."),
              pops=[{"card": "habits", "at": 1.5, "dur": 1.5, "y": 1110}]),
        phone(11.4, 16.8, [rec("g_health", 0, 5.4, 0.72)], head("HEALTH", "Sleep, steps, workouts.", "From Apple Health."),
              pops=[{"card": "sleep", "at": 1.3, "dur": 3.9, "y": 1120, "w": 470, "dx": -245}, {"card": "steps", "at": 1.65, "dur": 3.55, "y": 1120, "w": 470, "dx": 245}]),
        phone(16.8, 22.2, [rec("g_conn", 0, 1.2), rec("g_conn", 2.8, 4.2, 0.7)], head("CONNECTED", "Plug in", "the rest of your life."),
              pops=[{"card": "banks", "at": 3.3, "dur": 2.0, "y": 1100}]),
        phone(22.2, 26.4, [rec("tour", 0, 4.2, 0.55)], head("TODAY", "Every morning,", "it all comes together."),
              pops=[{"card": "next", "at": 1.3, "dur": 2.3, "y": 1110}], exit=True),
        {"kind": "gloss", "start": 26.4, "end": 31.2, "clip": "m/molecule.mp4", "speed": 0.75, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1580, "h": 820, "s": 0.85}],
         "texts": [{"l1": "Your whole life,", "l2": "in one flow.", "top": 1290, "size": 104, "at": 0.9}],
         "wordmark": {"at": 0.25, "y": 1555, "sub": "lifeflowweb.com"}, "note": NOTE},
    ],
}

story = {
    "bpm": 100,
    "duration": 12.0,
    "vo": [],
    "scenes": [
        {"kind": "gloss", "start": 0.0, "end": 2.4, "clip": "m/orbs.mp4", "speed": 0.8, "push": 0.06, "fade_out": 0.3,
         "haze": [{"cy": 930, "h": 760, "s": 0.88}],
         "texts": [{"eyebrow": "INTRODUCING", "l1": "Meet", "l2": "LifeFlow.", "top": 760, "size": 150, "at": 0.15}]},
        phone(2.4, 4.2, [rec("tour", 0.2, 1.8)], {"l1": "Your classes.", "size": 104}, pops=[{"card": "next", "at": 0.6, "dur": 1.2, "y": 1110}], enter=True),
        phone(4.2, 5.4, [rec("tour", 3.2, 1.2)], {"l1": "Your shifts.", "size": 104}, pops=[{"card": "week", "at": 0.15, "dur": 1.05, "y": 1120, "w": 760}]),
        phone(5.4, 6.6, [rec("tour", 6.2, 1.2)], {"l1": "Your money.", "size": 104}, pops=[{"card": "available1842", "at": 0.15, "dur": 1.05, "y": 1120}]),
        phone(6.6, 8.4, [rec("tour", 9.0, 1.8)], {"l1": "One assistant.", "l2": "Meet Sage.", "size": 104}, exit=True),
        {"kind": "gloss", "start": 8.4, "end": 12.0, "clip": "m/molecule.mp4", "speed": 0.8, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1580, "h": 820, "s": 0.85}],
         "texts": [{"eyebrow": "NOW LIVE", "l1": "Your whole life,", "l2": "in one flow.", "top": 1230, "size": 100, "at": 0.25}],
         "wordmark": {"at": 0.9, "y": 1560, "sub": "lifeflowweb.com"}},
    ],
}

for name, p in (("money", money), ("life", life), ("story", story)):
    for a, b in zip(p["scenes"], p["scenes"][1:]):
        assert abs(a["end"] - b["start"]) < 1e-6, (name, a["end"], b["start"])
    assert abs(p["scenes"][-1]["end"] - p["duration"]) < 1e-6
    for s in p["scenes"]:
        if s["kind"] == "phone":
            assert abs(sum(x["dur"] for x in s["src"]) - (s["end"] - s["start"])) < 1e-6, (name, s["start"])
    json.dump(p, open(f"plan_{name}.json", "w"), indent=1)
print("plans ok")
