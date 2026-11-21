"""Step 2: an open teacher model writes varied student-style rewrites of each seed prompt,
plus new requests per skill from the skill's description. Made-up data only."""
import json, re, sys, random
from collections import Counter
from common import *

TEACHER = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen2.5-14B-Instruct"
seeds = json.load(open(f"{D}/seeds.json"))
by = {s["name"]: s for s in SKILLS}
STYLES = [
    "very short, all lowercase, texting style, with a typo or two and no punctuation",
    "casual and chatty, with specific made-up details (a course name, an amount, a day, a place)",
    "polite full sentences, the way a careful student writes",
    "stressed and rushed, a bit rambling, the request buried in the middle",
    "indirect: describe the situation or problem without naming the feature, so the app has to infer the need",
]
SYS = "You write realistic messages that college students send to a personal assistant app. Output only a numbered list, one message per line, no extra text."
prompts, meta = [], []
for s in seeds:
    sk = by[s["skill"]]
    for st in STYLES:
        u = (f"The app has a skill called \"{sk['title']}\": {sk['description']}\n"
             f"A student message that this skill handles: \"{s['text']}\"\n\n"
             f"Write 8 different messages a real student could send that mean the same kind of request and must still be handled by this same skill. "
             f"Vary the wording, the subject and the details; do not copy the original phrasing. Style: {st}.")
        prompts.append((SYS, u)); meta.append((s["skill"], "rewrite"))
rng = random.Random(5)
for sk in SKILLS:
    ex = [s["text"] for s in seeds if s["skill"] == sk["name"]]
    for st in STYLES:
        for _ in range(2):
            rng.shuffle(ex)
            u = (f"The app has a skill called \"{sk['title']}\": {sk['description']}\n"
                 f"Examples of messages it handles: " + "; ".join(f'\"{e}\"' for e in ex[:3]) + "\n\n"
                 f"Write 10 NEW messages from different students in different situations that this skill, and no other part of the app, should handle. "
                 f"Cover different needs within the skill, not just the examples. Style: {st}.")
            prompts.append((SYS, u)); meta.append((sk["name"], "new"))

tok, model = load(TEACHER)
texts = [chat(tok, a, b) for a, b in prompts]
print(len(texts), "teacher calls", flush=True)
print(texts[0], flush=True)
raw = generate(tok, model, texts, bs=96, max_new_tokens=420, do_sample=True, temperature=0.9, top_p=0.95, repetition_penalty=1.05)
rows = []
for (skill, kind), r in zip(meta, raw):
    for line in r.split("\n"):
        m = re.match(r"^\s*\d+[.)]\s*(.+)$", line)
        if m:
            t = m.group(1).strip().strip('"\u201c\u201d').strip()
            if 4 <= len(t) <= 300:
                rows.append({"text": t, "skill": skill, "kind": kind})
json.dump(rows, open(f"{OUT}/raw.json", "w"), indent=0)
print("raw rows", len(rows), flush=True)

# drop exact and near duplicates (same words ignoring case/punctuation, or very high word overlap within a skill)
def norm(t): return re.sub(r"[^a-z0-9 ]", "", t.lower()).split()
held = {" ".join(norm(x["text"])) for x in json.load(open(f"{D}/heldout.json")) + json.load(open(f"{D}/fresh.json"))}
kept, seen = [], {}
for r in rows:
    w = norm(r["text"]); key = " ".join(w)
    if key in held: continue
    ws = set(w); dup = False
    for o in seen.setdefault(r["skill"], []):
        if len(ws & o) / max(1, len(ws | o)) > 0.8: dup = True; break
    if not dup:
        seen[r["skill"]].append(ws); kept.append(r)
json.dump(kept, open(f"{OUT}/dedup.json", "w"), indent=0)
print("after dedup", len(kept), flush=True)

# drop drift: the teacher, shown only the skill list, must pick the same skill for the row
pred, _ = classify(tok, model, [r["text"] for r in kept], bs=128)
final = [r for r, p in zip(kept, pred) if p == r["skill"]]
json.dump(final, open(f"{OUT}/train.json", "w"), indent=0)
c = Counter(r["skill"] for r in final)
print("after drift filter", len(final), "min/max per skill", min(c.values()), max(c.values()), flush=True)

# teacher zero-shot on the two test sets, as a reference point
res = {}
for name in ["heldout", "fresh"]:
    t = json.load(open(f"{D}/{name}.json"))
    p, _ = classify(tok, model, [x["text"] for x in t])
    res[name] = {"acc": sum(a == x["skill"] for a, x in zip(p, t)) / len(t), "n": len(t), "pred": p}
    print("teacher zero-shot", name, res[name]["acc"], flush=True)
json.dump({"teacher": TEACHER, "calls": len(texts), "raw": len(rows), "dedup": len(kept), "final": len(final),
           "per_skill": c, "teacher_zero_shot": res}, open(f"{OUT}/gen_stats.json", "w"), indent=1)
print("GEN DONE", flush=True)
