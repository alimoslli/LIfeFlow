"""Turns the owner's grades of skyling answers into changes to the training set.

The owner grades a batch of answers on a page (Good, Almost, Bad, with his own wording where he would say it differently).
His verdicts are the standard: this script compares them with what the agent readers decided, and writes what the training
set needs.

  python3 apply_grades.py --grades grades.json --key key.json --out-dir <folder>

grades.json: a list of {"id": "g07", "verdict": "good|almost|bad", "rewrite": "...", "why": "..."} (the page's "Copy my
grades" text, or the page's saved documents gathered into one list). key.json: which recorded turn each id is, and what the
readers decided ("kept" or "dropped: <reason>"). Written to the folder:
  owner-drop.txt       turns to leave out (Bad, and Almost with no wording of his own), for make_trainset.py --drop (add to the readers' list)
  owner-rewrites.jsonl {"conv", "answer"}: his wording, for make_trainset.py --rewrites (it replaces the recorded final answer)
  owner-report.txt     where he and the readers disagree, and his reasons: what the readers' brief and the rules must learn
A rewrite is checked like any answer (the 100-word limit, an em dash, a banned word, a clock time already past is not
checkable here: no clock) and a failing one is listed in the report and not used.
"""
import argparse, json, os, re

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
BANNED = re.compile(r"\b(assistant|jarvis|companion)\b|—", re.I)

drop, rewrites, lines = [], [], []
agree = {"both keep": 0, "both drop": 0, "owner keeps, readers dropped": [], "owner drops, readers kept": []}
for g in grades:
    k = key.get(g.get("id"))
    verdict, text, why = str(g.get("verdict") or "").lower(), str(g.get("rewrite") or "").strip(), str(g.get("why") or "").strip()
    if not k or not (verdict or text):
        continue
    readers_kept = k["readers"] == "kept"
    problem = None
    if text:
        problem = "over 100 words" if len(text.split()) > 100 else "has a banned word or an em dash" if BANNED.search(text) else None
        if problem:
            lines.append(f"REWRITE NOT USED {g['id']} ({k['conv']}): {problem}")
        else:
            rewrites.append({"conv": k["conv"], "answer": text})
    owner_keeps = verdict == "good" or bool(text and not problem)
    if not owner_keeps:
        drop.append(f"{k['conv']} owner: {verdict or 'no verdict'}{', ' + why if why else ''}")
    if owner_keeps and readers_kept:
        agree["both keep"] += 1
    elif not owner_keeps and not readers_kept:
        agree["both drop"] += 1
    elif owner_keeps:
        agree["owner keeps, readers dropped"].append(f"{g['id']} {k['conv']}: readers said \"{k['readers'][9:]}\"" + (f"; owner: {why}" if why else ""))
    else:
        agree["owner drops, readers kept"].append(f"{g['id']} {k['conv']}: owner said {verdict}" + (f", {why}" if why else "") + (" (and gave his own wording)" if text else ""))
    if why:
        lines.append(f"WHY {g['id']} [{verdict}]: {why}")
open(os.path.join(a.out_dir, "owner-drop.txt"), "w").write("\n".join(drop) + ("\n" if drop else ""))
with open(os.path.join(a.out_dir, "owner-rewrites.jsonl"), "w") as o:
    for r in rewrites:
        o.write(json.dumps(r, ensure_ascii=False) + "\n")
n = agree["both keep"] + agree["both drop"] + len(agree["owner keeps, readers dropped"]) + len(agree["owner drops, readers kept"])
report = [f"{n} graded: the owner and the readers agree on {agree['both keep'] + agree['both drop']} ({agree['both keep']} keep, {agree['both drop']} drop).",
          f"The owner keeps what the readers dropped: {len(agree['owner keeps, readers dropped'])}. The readers were too strict here:"] + ["  " + x for x in agree["owner keeps, readers dropped"]]
report += [f"The owner drops what the readers kept: {len(agree['owner drops, readers kept'])}. The readers missed this; the brief and the rules must learn it:"] + ["  " + x for x in agree["owner drops, readers kept"]]
report += [f"His own wording for {len(rewrites)} answers (used as the answer to train on).", ""] + lines
open(os.path.join(a.out_dir, "owner-report.txt"), "w").write("\n".join(report) + "\n")
print("\n".join(report[:4 + len(agree["owner keeps, readers dropped"]) + len(agree["owner drops, readers kept"])]))
print(f"wrote {len(drop)} drops and {len(rewrites)} rewrites to {a.out_dir}")
