"""Writes the timelines for the three grid Reels (posts 8, 5 and 2). Each opens on its grid post (the cover),
then plays the app. Cuts sit on a 100 BPM grid (one beat = 0.6 s). The assistant is never named."""
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


def cover(img):
    return {"kind": "still", "start": 0.0, "end": 1.2, "image": img, "push": 0.035, "fade_out": 0.3}


NOTE = {"text": "App shown with sample data.", "at": 1.2, "y": 1846}

life = {
    "bpm": 100, "duration": 32.4,
    "vo": [["vo/N_B1.wav", 1.4], ["vo/N_B2.wav", 4.95], ["vo/N_B3.wav", 9.75], ["vo/B3.wav", 14.55], ["vo/B4.wav", 17.55], ["vo/N_B6.wav", 22.95], ["vo/B7.wav", 27.9]],
    "scenes": [
        cover("grid/cover_r0.png"),
        phone(1.2, 4.8, [rec("tour", 0, 3.6, 0.8)], head("YOUR DAY", "Every morning,", "your day is planned."),
              pops=[{"card": "next", "at": 1.3, "dur": 2.1, "y": 1110}], enter=True),
        phone(4.8, 9.6, [rec("tour", 3.45, 4.8, 0.5)], head("ONE CALENDAR", "Classes, shifts", "and deadlines."),
              pops=[{"card": "week", "at": 1.0, "dur": 2.4, "y": 1120, "w": 780}]),
        phone(9.6, 14.4, [rec("g_goals", 1.4, 4.8, 1.25)], head("GOALS", "Set a goal.", "Get a plan."),
              pops=[{"card": "run5k", "at": 3.3, "dur": 1.5, "y": 1110}]),
        phone(14.4, 17.4, [rec("g_habit", 2.5, 3.0, 1.7)], head("HABITS", "Habits that", "actually stick."),
              pops=[{"card": "habits", "at": 1.5, "dur": 1.5, "y": 1110}]),
        phone(17.4, 22.8, [rec("g_health", 0, 5.4, 0.72)], head("HEALTH", "Sleep, steps, workouts.", "From Apple Health."),
              pops=[{"card": "sleep", "at": 1.3, "dur": 3.9, "y": 1120, "w": 470, "dx": -245}, {"card": "steps", "at": 1.65, "dur": 3.55, "y": 1120, "w": 470, "dx": 245}]),
        phone(22.8, 27.6, [rec("g_conn", 0, 1.2, 0.75), rec("g_conn", 4.0, 3.6, 0.5)], head("CONNECTED", "Plug in", "the rest of your life."),
              pops=[{"card": "banks", "at": 2.6, "dur": 2.0, "y": 1100}], exit=True),
        {"kind": "gloss", "outro": True, "start": 27.6, "end": 32.4, "clip": "m/molecule.mp4", "speed": 0.75, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1580, "h": 820, "s": 0.85}],
         "texts": [{"l1": "Your whole life,", "l2": "in one flow.", "top": 1290, "size": 104, "at": 0.9}],
         "wordmark": {"at": 0.25, "y": 1555, "sub": "lifeflowweb.com"}, "note": NOTE},
    ],
}

money = {
    "bpm": 100, "duration": 44.4,
    "vo": [["vo/A1.wav", 1.35], ["vo/A2.wav", 5.55], ["vo/N_A3.wav", 12.15], ["vo/A5.wav", 18.15], ["vo/N_A6.wav", 21.75], ["vo/N_A7.wav", 25.95],
           ["vo/N_A9.wav", 30.15], ["vo/N_A10.wav", 33.75], ["vo/N_A8.wav", 38.7]],
    "scenes": [
        cover("grid/cover_r1.png"),
        phone(1.2, 5.4, [rec("m_over", 0, 4.2, 0.7)], head("OVERVIEW", "All your money,", "in one place."),
              pops=[{"card": "available_pre", "at": 1.2, "dur": 2.7, "y": 1130, "w": 760}], enter=True),
        phone(5.4, 12.0, [rec("m_bank", 0, 6.6, 0.69)], head("CONNECT YOUR BANK", "Linked in seconds.", "Secured by Plaid."),
              pops=[{"card": "bank", "at": 3.7, "dur": 2.6, "y": 1060}], pills=[{"kind": "plaid", "at": 1.9, "y": 1665}]),
        phone(12.0, 18.0, [rec("m_cash", 2.3, 2.4, 1.75), rec("m_cashtx", 1.3, 2.5, 1.85), rec("m_txlist", 0, 1.1)],
              head("CASH, TOO", "Paid in cash?", "Add it in a tap."),
              pops=[{"card": "cashacct", "at": 1.9, "dur": 1.5, "y": 1080}, {"card": "lunch", "at": 4.9, "dur": 1.1, "y": 1080}],
              pills=[{"kind": "chip", "text": "Or just tell your assistant", "at": 2.4, "y": 1680}]),
        phone(18.0, 21.6, [rec("budget", 0.6, 3.6, 0.8)], head("BUDGETS", "Set a budget.", "See where you stand."),
              pops=[{"card": "budgets", "at": 1.2, "dur": 2.2, "y": 1130, "w": 780}]),
        phone(21.6, 25.8, [rec("next30", 0.6, 4.2, 1.0)], head("EARLY WARNINGS", "Heads up,", "before it happens."),
              pops=[{"card": "headsup", "at": 1.5, "dur": 2.5, "y": 1110}]),
        phone(25.8, 30.0, [rec("subs", 0.55, 4.2, 0.85)], head("OVERSPENDING", "The ones you forgot,", "found."),
              pops=[{"card": "peryear", "at": 1.4, "dur": 1.9, "y": 1120, "w": 560}]),
        phone(30.0, 33.6, [rec("m_save", 1.6, 3.6, 1.0)], head("SAVINGS GOALS", "Saving for something?", "Get there sooner."),
              pops=[{"card": "whatif", "at": 2.0, "dur": 1.6, "y": 1130, "w": 800}]),
        phone(33.6, 38.4, [rec("m_invest", 1.4, 4.8, 1.0)], head("INVESTING", "Invest a little more.", "See what it could become."),
              pops=[{"card": "invest", "at": 2.3, "dur": 2.0, "y": 1130, "w": 760}], exit=True),
        {"kind": "gloss", "outro": True, "start": 38.4, "end": 44.4, "clip": "m/molecule.mp4", "speed": 0.6, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1560, "h": 900, "s": 0.88}],
         "texts": [{"l1": "Budget smarter.", "top": 1250, "size": 92, "at": 0.3}, {"l1": "Save faster.", "top": 1355, "size": 92, "at": 1.8},
                   {"l2": "Invest more.", "top": 1460, "size": 92, "at": 3.0}],
         "wordmark": {"at": 4.4, "y": 1580, "sub": "lifeflowweb.com"}, "note": dict(NOTE, at=4.6, y=1850)},
    ],
}

launch = {
    "bpm": 100, "duration": 20.4,
    "vo": [["vo/N_C1.wav", 1.4], ["vo/N_C3.wav", 9.75], ["vo/B7.wav", 15.9]],
    "scenes": [
        cover("grid/cover_r2.png"),
        {"kind": "gloss", "start": 1.2, "end": 5.4, "clip": "m/orbs.mp4", "speed": 0.8, "push": 0.06, "fade_in": 0.3, "fade_out": 0.3,
         "haze": [{"cy": 930, "h": 760, "s": 0.88}],
         "texts": [{"eyebrow": "INTRODUCING", "l1": "Meet", "l2": "LifeFlow.", "top": 760, "size": 150, "at": 0.15}]},
        phone(5.4, 7.2, [rec("tour", 0.2, 1.8)], {"l1": "Your classes.", "size": 104}, pops=[{"card": "next", "at": 0.6, "dur": 1.2, "y": 1110}], enter=True),
        phone(7.2, 8.4, [rec("tour", 3.45, 1.2, 0.8)], {"l1": "Your shifts.", "size": 104}, pops=[{"card": "week", "at": 0.15, "dur": 1.05, "y": 1120, "w": 760}]),
        phone(8.4, 9.6, [rec("tour", 6.25, 1.2, 0.9)], {"l1": "Your money.", "size": 104}, pops=[{"card": "available_pre", "at": 0.15, "dur": 1.05, "y": 1120, "w": 760}]),
        phone(9.6, 15.6, [rec("tour", 9.2, 2.4, 0.25), rec("tour", 10.1, 3.6, 0.4)], head("YOUR PERSONAL ASSISTANT", "One assistant.", "For all of it."),
              pops=[{"card": "budgets", "at": 0.55, "dur": 0.85, "y": 1130, "w": 720}, {"card": "whatif", "at": 1.3, "dur": 0.85, "y": 1130, "w": 760},
                    {"card": "invest", "at": 2.1, "dur": 1.1, "y": 1130, "w": 720}, {"card": "peryear", "at": 3.4, "dur": 1.8, "y": 1120, "w": 560}], exit=True),
        {"kind": "gloss", "outro": True, "start": 15.6, "end": 20.4, "clip": "m/molecule.mp4", "speed": 0.8, "push": 0.03, "fade_in": 0.4,
         "haze": [{"cy": 1580, "h": 820, "s": 0.85}],
         "texts": [{"eyebrow": "NOW LIVE ON THE WEB", "l1": "Your whole life,", "l2": "in one flow.", "top": 1230, "size": 100, "at": 0.25}],
         "wordmark": {"at": 0.9, "y": 1560, "sub": "lifeflowweb.com  ·  Link in bio"}},
    ],
}

for name, p in (("reel_life", life), ("reel_money", money), ("reel_launch", launch)):
    for a, b in zip(p["scenes"], p["scenes"][1:]):
        assert abs(a["end"] - b["start"]) < 1e-6, (name, a["end"], b["start"])
    assert abs(p["scenes"][-1]["end"] - p["duration"]) < 1e-6
    for s in p["scenes"]:
        if s["kind"] == "phone":
            assert abs(sum(x["dur"] for x in s["src"]) - (s["end"] - s["start"])) < 1e-6, (name, s["start"])
    json.dump(p, open(f"plan_{name}.json", "w"), indent=1)
print("plans ok")
