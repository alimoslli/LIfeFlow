"""Flags instant scroll jumps in a chat take (a one-frame scroll step after a still frame). Usage: python3 check_jumps.py log.json"""
import json, sys
L = json.load(open(sys.argv[1])); fr = L["frames"]; pr = L["probes"]
st = [p["st"] if p else None for p in pr]
bad = []
for j in range(2, len(st)):
    if None in (st[j], st[j - 1], st[j - 2]): continue
    if abs(st[j] - st[j - 1]) > 12 and abs(st[j - 1] - st[j - 2]) < 2:
        bad.append((round(fr[j][1], 2), st[j - 1], st[j]))
print("instant scroll jumps:", bad if bad else "none")
