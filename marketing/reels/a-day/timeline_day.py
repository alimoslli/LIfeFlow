# "A day, at its real time" (rough cut, 2026-11-12, main 2ea0619): Ali's real shots (marked gaps for now) cut with the
# real app filmed at the same minute of the day. Morning and night on "Changes with the sky" (Dawn at 7:10 AM, Dreamy at
# 10:40 PM); the afternoon ask is the real answer from "What's new" v4 (2:30 PM, Ray's moment either way).
import json
R = lambda a, b: list(range(a, b + 1))
SEGS = [
  dict(key="you_am", ph=dict(time="7:10 AM", l1="Your shot: just up, by a window.", l2="Reach for your phone."), frames=[1] * 66),
  dict(key="morning", src="/whatsnew/cap/day_morning", frames=R(1, 125) + R(140, 195),
       caps=[(4.45, None, "7:10 AM, and Dawn", "is up with you.", 1150)]),
  dict(key="you_pm", ph=dict(time="2:30 PM", l1="Your shot: between classes,", l2="typing on your phone."), frames=[1] * 66),
  dict(key="ask", src="/whatsnew/cap/ask",
       frames=R(8, 24) + [25] + R(26, 59) + R(60, 71) + [72] + R(73, 95) + R(136, 140) + R(141, 200) + [200] * 15 + R(257, 326),
       caps=[(0.05, 2.1, "Ask right under the sky.", None, 1830), (2.93, 5.45, "It finds the time around your shift.", None, 1830),
             (5.5, None, "It's on your day, right before work.", None, 1830)]),
  dict(key="you_night", ph=dict(time="10:40 PM", l1="Your shot: at your desk, lamp on.", l2="Tap the phone: done."), frames=[1] * 66),
  dict(key="tick", src="/whatsnew/cap/day_tick", frames=R(1, 30) + R(44, 124),
       caps=[(0.05, None, "10:40 PM. Done?", "Tick it off.", 190)]),
  dict(key="night", src="/whatsnew/cap/day_night", frames=R(1, 84),
       caps=[(0.1, None, "Now it's one of", "tonight's stars.", 1150)]),
  dict(key="end", src="/sting2/f_outro", frames=R(1, 105), end=True),
]
t = 0.0; out = []
for s in SEGS:
  d = len(s["frames"]) / 30
  s["start"], s["dur"] = round(t, 4), round(d, 4)
  s["caps"] = [(a, b if b is not None else d, l1, l2, y) for (a, b, l1, l2, y) in s.get("caps", [])]
  out.append(s); t += d
json.dump({"segs": out, "end": round(t, 4)}, open("timeline_day.json", "w"), indent=1)
for s in out: print(f'{s["key"]:9s} {s["start"]:6.2f} {s["dur"]:5.2f}')
print("end", round(t, 2))
