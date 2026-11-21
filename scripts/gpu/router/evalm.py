"""Step 5: score a model (untuned, or with the trained adapter) on the two test sets.
Usage on the box: python evalm.py <hf model id> <tag> [adapter dir]"""
import json, sys
from common import *
MODEL = sys.argv[1]; TAG = sys.argv[2]; ADAPTER = sys.argv[3] if len(sys.argv) > 3 else None
tok, model = load(MODEL, ADAPTER)
res = {"model": MODEL, "adapter": ADAPTER}
for name in ["heldout", "fresh"]:
    t = json.load(open(f"{D}/{name}.json"))
    p, raw = classify(tok, model, [x["text"] for x in t])
    res[name] = {"acc": sum(a == x["skill"] for a, x in zip(p, t)) / len(t), "n": len(t),
                 "rows": [{"text": x["text"], "gold": x["skill"], "pred": a, "raw": r} for x, a, r in zip(t, p, raw)]}
    print(TAG, name, res[name]["acc"], flush=True)
json.dump(res, open(f"{OUT}/eval-{TAG}.json", "w"), indent=1)
print("EVAL DONE", flush=True)
