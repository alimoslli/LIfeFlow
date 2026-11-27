"""The training set for tonight: the examples the automatic filter kept, minus every turn a quality-check reader flagged.

  python3 make_trainset.py --kept gen1/train-new.jsonl --drop drop.txt --out night1/train.jsonl
drop.txt: one flagged turn per line ("<life>~<k>~<turn>", the "conv" of the quality-check record); anything after a space is the reason.
A flagged turn also takes every later turn of the same chat with it (2026-11-27, chats of 3 to 5 turns): their history holds
the flagged answer.
"""
import argparse, collections, json

ap = argparse.ArgumentParser()
ap.add_argument("--kept", required=True)
ap.add_argument("--drop", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
drop = {l.split()[0] for l in open(a.drop) if l.strip() and not l.startswith("#")}
rows = [json.loads(l) for l in open(a.kept)]
first_bad = {}
for c in drop:
    parts = c.split("~")
    if len(parts) == 3 and parts[2].isdigit():
        chat = f"{parts[0]}~{parts[1]}"
        first_bad[chat] = min(first_bad.get(chat, 99), int(parts[2]))


def flagged(conv):
    if conv in drop:
        return True
    parts = (conv or "").split("~")
    return len(parts) == 3 and parts[2].isdigit() and int(parts[2]) >= first_bad.get(f"{parts[0]}~{parts[1]}", 99)


keep = [r for r in rows if not flagged(r.get("meta", {}).get("conv"))]
with open(a.out + ".tmp", "w") as o:
    for r in keep:
        o.write(json.dumps(r) + "\n")
import os
os.replace(a.out + ".tmp", a.out)   # the trainer waits for this file: it appears whole or not at all
kinds = collections.Counter(r["meta"]["kind"] for r in keep)
print(f"{len(rows)} examples from the filter, {len(rows) - len(keep)} dropped by the quality check ({len(drop)} turns flagged), {len(keep)} to train on: {dict(kinds)}")
