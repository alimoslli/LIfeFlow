"""How many different bank messages reach each skill, by the app's own routing rule (src/server/jarvis/skills/index.ts:
trigger phrases at the start of a word, longer phrases count more, the best two within half of the best score).

It reads the skills of this branch (skills/*/SKILL.md) and the skills on the latest main (git show origin/main:skills/...),
so a skill that exists only on main is counted too and marked "main only": the app side of this branch cannot run it until
the branch is rebased, and generate.ts skips its messages until then (the "needsSkill" tag).

  python3 scripts/gpu/chat-data/skill_coverage.py --bank /tmp/bank.json [--low 12] [--json out.json]
"""
import argparse, collections, json, re
from pathlib import Path

from skill_route import load_skills, router

ROOT = Path(__file__).resolve().parents[3]
ap = argparse.ArgumentParser()
ap.add_argument("--bank", required=True)
ap.add_argument("--low", type=int, default=12, help="a skill with fewer different messages than this is listed as thin")
ap.add_argument("--json", default=None)
a = ap.parse_args()


here, skills = load_skills(ROOT)
route = router(skills)

bank = json.load(open(a.bank))
seen, first, anyhit, none = set(), collections.Counter(), collections.Counter(), 0
for q in bank:
    key = re.sub(r"[^a-z0-9 ]", "", q["text"].lower()).strip()
    if key in seen:
        continue
    seen.add(key)
    r = route(q["text"])
    if not r:
        none += 1
        continue
    first[r[0]] += 1
    for s in r:
        anyhit[s] += 1
print(f"{len(bank)} messages, {len(seen)} different; {none} reach no skill (the skyling answers those from its own rules)")
print("skill: different messages that reach it (first choice)")
for s in sorted(skills, key=lambda s: (anyhit[s], s)):
    print(f"  {s:24s} {anyhit[s]:4d} ({first[s]:4d}){'  main only' if s not in here else ''}{'  THIN' if anyhit[s] < a.low else ''}")
thin = [s for s in skills if anyhit[s] < a.low]
print(f"{len(skills)} skills, {len(thin)} with fewer than {a.low}: {', '.join(sorted(thin)) or 'none'}")
if a.json:
    json.dump({"messages": len(bank), "different": len(seen), "no_skill": none, "reach": dict(anyhit), "first": dict(first), "main_only": sorted(set(skills) - set(here)),
               "thin": sorted(thin)}, open(a.json, "w"), indent=1)
