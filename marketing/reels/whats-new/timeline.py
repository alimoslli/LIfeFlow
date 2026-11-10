# "What's new in LifeFlow": the edit as data. Each segment plays real frames from one capture; captions, spotlights,
# taps and sounds are placed on the same clock. Writes timeline.json for film.html and mix.py.
import json
R = lambda a, b: list(range(a, b + 1))
SEGS = [
  # key, folder (served path), frames, captions [(from, to, line1, line2, y)] in seconds from the segment start
  dict(key="hook", src="/whatsnew/cap/splash", frames=R(1, 45) + [45] * 20 + R(46, 64), hook=True),
  dict(key="sky", src="/appfilm/full", frames=R(1, 22) + R(241, 300),
       caps=[(0.15, None, "Your day,", "drawn as the sky.", 1490)]),
  dict(key="ask", src="/whatsnew/cap/ask",
       frames=R(10, 24) + [25] + R(26, 59) + R(60, 71) + [72] + R(73, 92) + R(116, 118) + R(143, 149) + [149] * 45 + [150] + R(151, 153) + R(163, 200) + [200] * 15,
       caps=[(0.05, 2.1, "Ask right under the sky.", None, 1830), (2.9, 4.6, "It finds the time around your shift.", None, 1830),
             (4.75, None, "One tap, and it's on your day.", None, 1830)]),
  dict(key="see", src="/whatsnew/cap/follow_see", frames=R(1, 30) + R(47, 93) + R(100, 140),
       caps=[(0.1, None, "There it is: 9 to 11 PM,", "right after work.", 1350)]),
  dict(key="tick", src="/whatsnew/cap/follow_tick", frames=R(1, 30) + R(47, 75) + R(84, 128),
       caps=[(0.05, None, "Studied? Tick it off,", "and a star pops up.", 190)]),
  dict(key="night", src="/whatsnew/cap/follow_night", frames=R(1, 78),
       caps=[(0.1, None, "Tonight it's one of", "the stars in your sky.", 1490)]),
  dict(key="goal", src="/whatsnew/cap/goal", frames=R(14, 41) + R(42, 112),
       caps=[(0.1, None, "Reach a goal,", "and the sun comes out.", 1560)], spot=dict(anchor="goal", until=0.9)),
  dict(key="money", src="/whatsnew/cap/tour", frames=R(36, 46) + R(47, 128),
       caps=[(0.1, None, "Money: what you", "have right now.", 1490)]),
  dict(key="school", src="/whatsnew/cap/tour", frames=R(150, 157) + R(158, 228),
       caps=[(0.05, None, "School: your classes", "and what's due next.", 1490)]),
  dict(key="more", src="/whatsnew/cap/tour", frames=R(262, 268) + R(269, 345),
       caps=[(0.05, None, "Everything else,", "one tap away.", 1580)]),
  dict(key="skylings", src="/appfilm/full_settings", frames=R(1, 151), settings=True,
       caps=[(0.1, 2.5, "Six skylings, one for", "each moment of the sky.", 1520), (2.5, None, "Pick yours,", "or let the sky choose.", 1520)]),
  dict(key="end", src="/sting/f_outro", frames=R(1, 105), end=True),
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
