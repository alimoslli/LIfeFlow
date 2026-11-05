"""Builds chat_data.json for chat.html from the chat recording log. Usage: python3 build_chat.py <log_convo.json> <frames_dir> <captions.json>"""
import json, sys
L = json.load(open(sys.argv[1])); FR = sys.argv[2]; CAPS = json.load(open(sys.argv[3]))
t0 = sorted(f[1] for f in L["frames"])[0]
frames = sorted(([f, t - t0] for f, t in L["frames"]), key=lambda x: x[1])
T = [{k: (v - t0 if isinstance(v, float) else v) for k, v in t.items()} for t in L["turns"]]
taps = sorted(((x["t"] - t0), x["x"], x["y"]) for x in L["taps"])
strongs = {k: {"t": v["t"] - t0, "items": v["items"]} for k, v in L.get("strongs", {}).items()}
rects = {k: {"t": v["t"] - t0, "r": v["r"]} for k, v in L["rects"].items()}
LOCK_UNTIL = 3.4
segs, caps, marks, rings, cams, ftaps = [], [], [], [], [], []
t = LOCK_UNTIL
TOP, BOTTOM = 96, 690  # visible chat area (CSS px): below the header, above the message box
for i, tr in enumerate(T):
    c = CAPS[i] if i < len(CAPS) else None
    if c is None: break
    before = [x for x in taps if x[0] < tr["sent"] - 0.05]
    a = before[-2][0] - 0.1 if len(before) >= 2 else tr["sent"] - 2.0
    s, r = tr["sent"], tr["replied"]
    if c.get("skip_typing"):  # start once the message bubble is up (the empty chat shows a "connect" banner)
        a = s + 0.3
        s = a + 0.001
    dt, dw, dh = c.get("type", 1.5), c.get("wait", 0.9), c.get("hold", 2.8)
    ea = t
    segs += [{"ca": a, "cb": s, "ea": t, "eb": t + dt}, {"ca": s, "cb": r, "ea": t + dt, "eb": t + dt + dw}, {"ca": r + 0.02, "cb": r + 0.9, "ea": t + dt + dw, "eb": t + dt + dw + dh}]
    for (tt, x, y) in taps:
        if a <= tt < s: ftaps.append({"at": t + (tt - a) / (s - a) * dt, "x": x, "y": y})
    h0 = t + dt + dw
    caps.append({"a": ea, "b": h0 + dh, "lines": c["lines"]})
    key = f"reply{i}"
    picks = c.get("marks", [])
    if key in strongs:
        n = 0
        for it in strongs[key]["items"]:
            if picks and not any(p.lower() in it["text"].lower() for p in picks): continue
            for (x, y, w, h) in it["rects"]:
                if TOP <= y and y + h <= BOTTOM and w > 4:
                    marks.append({"x": x, "y": y, "w": w, "h": h, "at": h0 + 0.35 + 0.3 * n, "until": h0 + dh})
            n += 1
    if key in rects and c.get("ring", True):
        x, y, w, h = rects[key]["r"]
        y0, y1 = max(y, TOP), min(y + h, BOTTOM)
        if y1 - y0 > 40: rings.append({"x": x, "y": y0, "w": w, "h": y1 - y0, "at": h0 + 0.05, "until": h0 + dh})
        cy = 392 + 16 + 82 + (y0 + y1) / 2 * 722 / 390
        cams.append({"a": h0, "d": 0.7, "b": h0 + dh - 0.2, "s": c.get("zoom", 1.06), "ox": 540, "oy": cy, "ty": 0})
    t = h0 + dh
end_at = t + 0.2
data = {"dir": FR, "frames": frames, "segs": segs, "caps": [{"a": 0.25, "b": LOCK_UNTIL, "lines": ["MONDAY, 8:22 AM.", "*IT* *TEXTS* *FIRST.*"]}] + caps,
        "marks": marks, "rings": rings, "taps": ftaps, "cams": cams, "lock": {"n": 197, "fps": 30, "from": 0.3, "popAt": 1.0, "until": LOCK_UNTIL},
        "endAt": end_at, "total": end_at + 3.4}
json.dump(data, open("chat_data.json", "w"))
print("total", round(data["total"], 2), "marks", len(marks), "rings", len(rings), "taps", len(ftaps))
for c in data["caps"]: print(round(c["a"], 2), round(c["b"], 2), c["lines"])
