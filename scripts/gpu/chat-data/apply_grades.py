"""Turns the owner's grades of skyling answers into changes to the training set and a list of what the next round must learn.

The owner grades a batch of answers on a page: Good, Almost or Bad, with a few words of feedback where something is off.
His verdicts are the standard. His words are feedback, never the answer itself (owner, 2026-11-26: "what I write won't be
the new answer, I will just give feedback and I will trust the next generation"): they go into the rules, the checks and the
readers' brief, and the next generation is written by the teacher under those.

  python3 apply_grades.py --grades grades.json --key key.json --out-dir <folder>

grades.json: a list of {"id": "g07", "verdict": "good|almost|bad", "why": "..."} (the page's "Copy my grades" text, or the
page's saved documents gathered into one list). key.json: which recorded turn each id is, and what the readers decided
("kept" or "dropped: <reason>"). Written to the folder:
  owner-drop.txt     turns to leave out of training (Bad and Almost), for make_trainset.py --drop (add them to the readers' list)
  owner-report.txt   his feedback by verdict, and where he and the readers disagree: what the rules and the brief must learn
A turn the readers dropped stays dropped even when he marks it Good: he sees the answer, not the tool results it must match.
"""
import argparse, json, os

ap = argparse.ArgumentParser()
ap.add_argument("--grades", required=True)
ap.add_argument("--key", required=True)
ap.add_argument("--out-dir", required=True)
a = ap.parse_args()
grades = json.load(open(a.grades))
if isinstance(grades, dict):   # {"g01": {...}} is accepted too
    grades = [{"id": k, **v} for k, v in grades.items()]
key = json.load(open(a.key))
os.makedirs(a.out_dir, exist_ok=True)

drop, feedback = [], {"good": [], "almost": [], "bad": []}
both_keep = both_drop = 0
too_strict, missed = [], []
for g in grades:
    k = key.get(g.get("id"))
    verdict = str(g.get("verdict") or "").lower()
    said = " ".join(x for x in (str(g.get("why") or "").strip(), str(g.get("rewrite") or "").strip()) if x)
    if not k or verdict not in feedback:
        continue
    readers_kept = k["readers"] == "kept"
    if said:
        feedback[verdict].append(f"{g['id']} ({k['conv']}): {said}")
    if verdict != "good":
        drop.append(f"{k['conv']} owner: {verdict}{', ' + said if said else ''}")
    if verdict == "good" and readers_kept:
        both_keep += 1
    elif verdict != "good" and not readers_kept:
        both_drop += 1
    elif verdict == "good":
        too_strict.append(f"{g['id']} {k['conv']}: readers said \"{k['readers'][9:]}\"")
    else:
        missed.append(f"{g['id']} {k['conv']}: owner said {verdict}" + (f": {said}" if said else ""))
open(os.path.join(a.out_dir, "owner-drop.txt"), "w").write("\n".join(drop) + ("\n" if drop else ""))
n = both_keep + both_drop + len(too_strict) + len(missed)
report = [f"{n} graded. The owner and the readers agree on {both_keep + both_drop} ({both_keep} keep, {both_drop} drop).",
          f"The owner likes what the readers dropped: {len(too_strict)} (check each: the readers may have seen a wrong fact he could not see)"]
report += ["  " + x for x in too_strict]
report += [f"The owner rejects what the readers kept: {len(missed)} (the readers' brief and the rules must learn these)"] + ["  " + x for x in missed]
for v, title in (("bad", "His feedback on answers marked Bad"), ("almost", "His feedback on answers marked Almost"), ("good", "His notes on answers marked Good")):
    report += ["", f"{title}: {len(feedback[v])}"] + ["  " + x for x in feedback[v]]
open(os.path.join(a.out_dir, "owner-report.txt"), "w").write("\n".join(report) + "\n")
print("\n".join(report))
print(f"\nwrote {len(drop)} turns to leave out to {a.out_dir}/owner-drop.txt")
