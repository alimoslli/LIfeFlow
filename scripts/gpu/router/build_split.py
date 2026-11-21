"""Split the 196 skill eval prompts into seeds (training/paraphrasing) and a held-out test set.
Deterministic. About 1 in 4 per skill is held out and never used for training or paraphrasing."""
import json, glob, os, re, random
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")
OUT = os.path.join(os.path.dirname(__file__), "data")
rng = random.Random(23)
skills, seeds, held = [], [], []
for d in sorted(glob.glob(os.path.join(ROOT, "skills", "*", ""))):
    name = os.path.basename(d[:-1])
    md = open(d + "SKILL.md").read()
    skills.append({"name": name,
                   "title": re.search(r"^title: (.*)$", md, re.M).group(1),
                   "description": re.search(r"^description: (.*)$", md, re.M).group(1)})
    prompts = [e["prompt"] for e in json.load(open(d + "evals.json"))]
    rng.shuffle(prompts)
    k = max(1, round(len(prompts) / 4))
    held += [{"text": p, "skill": name} for p in prompts[:k]]
    seeds += [{"text": p, "skill": name} for p in prompts[k:]]
json.dump(skills, open(f"{OUT}/skills.json", "w"), indent=1)
json.dump(seeds, open(f"{OUT}/seeds.json", "w"), indent=1)
json.dump(held, open(f"{OUT}/heldout.json", "w"), indent=1)
print(len(skills), "skills", len(seeds), "seeds", len(held), "held out")
