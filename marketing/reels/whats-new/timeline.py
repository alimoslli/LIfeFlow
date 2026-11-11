# "What's new in LifeFlow" v4 (refilmed 2026-11-11 on main e84c411: five skylings, Today as one screen, the skyling's tab):
# the edit as data. Each segment plays real frames from one capture; captions, spotlights, taps and sounds share its clock.
import json
R = lambda a, b: list(range(a, b + 1))
SEGS = [
  dict(key="hook", src="/whatsnew/cap/splash", frames=R(1, 45) + [45] * 20 + R(46, 64), hook=True),
  dict(key="sky", src="/whatsnew/cap/sky", frames=R(1, 30) + R(76, 140),
       caps=[(0.15, None, "Your day,", "drawn as the sky.", 1150)]),
  dict(key="ask", src="/whatsnew/cap/ask",
       frames=R(8, 24) + [25] + R(26, 59) + R(60, 71) + [72] + R(73, 95) + R(136, 140) + R(141, 200) + [200] * 15 + R(257, 326),
       caps=[(0.05, 2.1, "Ask right under the sky.", None, 1830), (2.93, 5.45, "It finds the time around your shift.", None, 1830),
             (5.5, None, "It's on your day, right before work.", None, 1830)]),
  dict(key="tick", src="/whatsnew/cap/follow_tick", frames=R(5, 30) + R(47, 87) + R(104, 106) + R(107, 132) + R(143, 183),
       caps=[(0.05, None, "Done? Tick it off,", "and a star pops up.", 190)]),
  dict(key="night", src="/whatsnew/cap/follow_night", frames=R(1, 78),
       caps=[(0.1, None, "Tonight it's one of", "the stars in your sky.", 1150)]),
  dict(key="goal", src="/whatsnew/cap/goal", frames=R(14, 41) + R(42, 112),
       caps=[(0.1, None, "Reach a goal,", "and the sun comes out.", 1600)], spot=dict(anchor="goal", until=0.9)),
  dict(key="money", src="/whatsnew/cap/tour", frames=R(36, 46) + R(47, 128),
       caps=[(0.1, None, "Money: what you", "have right now.", 1490)]),
  dict(key="school", src="/whatsnew/cap/tour", frames=R(150, 157) + R(158, 228),
       caps=[(0.05, None, "School: your classes", "and what's due next.", 1490)]),
  dict(key="more", src="/whatsnew/cap/tour", frames=R(262, 268) + R(269, 345),
       caps=[(0.05, None, "Everything else,", "one tap away.", 1580)]),
  dict(key="skylings", src="/whatsnew/cap/pick", frames=R(1, 151), settings=True,
       caps=[(0.1, 2.5, "Five skylings, one for", "each part of the sky.", 1520), (2.5, None, "Pick yours,", "or let the sky choose.", 1520)]),
  dict(key="end", src="/sting2/f_outro", frames=R(1, 105), end=True),
]
t = 0.0; out = []
for s in SEGS:
  d = len(s["frames"]) / 30
  s["start"], s["dur"] = round(t, 4), round(d, 4)
  s["caps"] = [(a, b if b is not None else d, l1, l2, y) for (a, b, l1, l2, y) in s.get("caps", [])]
  out.append(s); t += d
json.dump({"segs": out, "end": round(t, 4)}, open("timeline.json", "w"), indent=1)
for s in out: print(f'{s["key"]:9s} {s["start"]:6.2f} {s["dur"]:5.2f}')
print("end", round(t, 2))
