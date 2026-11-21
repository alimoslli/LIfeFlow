"""The question bank for the training examples: the router pilot's student messages (the 153 seed prompts plus the
5,284 teacher rewrites, all made up), with a short follow-up on some, so the model also learns two-turn chats.
The test questions are left out: the 20 of scripts/compare-models.ts (Jarvis eval plus hard ones) and the router's
held-out and fresh sets, so the after-training test stays fair.

  python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out /workspace/chatdata/questions.json
"""
import argparse, json, random, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
R = ROOT / "scripts/gpu/router/data"
ap = argparse.ArgumentParser()
ap.add_argument("--teacher", required=True, help="the router pilot's kept teacher rows (out/train.json)")
ap.add_argument("--out", required=True)
ap.add_argument("--follow-share", type=float, default=0.15)
a = ap.parse_args()
rng = random.Random(21)

norm = lambda t: re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()
test = set()
for f in ("heldout.json", "fresh.json"):
    test |= {norm(x["text"]) for x in json.load(open(R / f))}
test |= {norm(q) for q in re.findall(r'question: "([^"]+)"', (ROOT / "tests/fixtures/jarvis-eval.ts").read_text())}
cmp = (ROOT / "scripts/compare-models.ts").read_text()
for block in re.findall(r"turns: \[([^\]]+)\]", cmp):
    test |= {norm(q) for q in re.findall(r'"([^"]+)"', block)}

FOLLOW = [
    "ok do that", "can you add that for me?", "why?", "what about next week?", "and what's after that?",
    "thanks. anything else I should know?", "can you make it shorter?", "how much is that in total?",
    "what if I skip it?", "remind me tomorrow", "which one first?", "is that a lot?",
]
rows = [{"text": x["text"], "skill": x["skill"], "source": "seed"} for x in json.load(open(R / "seeds.json"))]
rows += [{"text": x["text"], "skill": x["skill"], "source": f"teacher-{x.get('kind', 'row')}"} for x in json.load(open(a.teacher))]
seen, out, dropped = set(), [], 0
for r in rows:
    n = norm(r["text"])
    if n in test or n in seen:
        dropped += 1
        continue
    seen.add(n)
    if rng.random() < a.follow_share:
        r["followUp"] = rng.choice(FOLLOW)
    out.append(r)
rng.shuffle(out)
json.dump(out, open(a.out, "w"), indent=0)
print(f"{len(out)} questions ({sum('followUp' in r for r in out)} with a follow-up); left out {dropped} (test questions or repeats); test set {len(test)}")
