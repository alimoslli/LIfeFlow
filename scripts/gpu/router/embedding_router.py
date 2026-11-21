"""Step 1 of the own-model plan: can a small embedding model pick the skill as well as the tuned 3B model, on a plain CPU?

ADR 0023: use the simplest method that passes its tests first. This scores three simple methods on the same two test
sets as the pilot (data/heldout.json, data/fresh.json), for each embedding model:
  - describe: nearest skill description (no training rows at all);
  - knn: vote of the 5 nearest training messages (cosine);
  - logreg: a small linear classifier on the embeddings.
Training rows: the 153 seeds, and (if data/train.json.gz exists) the seeds plus the pilot's 5,284 teacher rows.
Never trains on the held-out or fresh sets. CPU only.

  python3 -m venv .venv && .venv/bin/pip install sentence-transformers scikit-learn
  .venv/bin/python scripts/gpu/router/embedding_router.py
"""
import gzip, json, os, time
from collections import Counter

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data")
MODELS = ["sentence-transformers/all-MiniLM-L6-v2", "BAAI/bge-small-en-v1.5"]

skills = json.load(open(f"{D}/skills.json"))
seeds = json.load(open(f"{D}/seeds.json"))
tests = {n: json.load(open(f"{D}/{n}.json")) for n in ("heldout", "fresh")}
train_sets = {"seeds": seeds}
if os.path.exists(f"{D}/train.json.gz"):
    teacher = json.load(gzip.open(f"{D}/train.json.gz"))
    train_sets["seeds+teacher"] = seeds + [{"text": r["text"], "skill": r["skill"]} for r in teacher]


def score(pred, rows):
    return sum(p == r["skill"] for p, r in zip(pred, rows))


def confusions(pred, rows):
    return Counter((r["skill"], p) for p, r in zip(pred, rows) if p != r["skill"]).most_common(6)


results = []
for model_id in MODELS:
    m = SentenceTransformer(model_id, device="cpu")
    enc = lambda xs: m.encode([x for x in xs], normalize_embeddings=True, batch_size=64, show_progress_bar=False)
    test_emb = {n: enc([r["text"] for r in rows]) for n, rows in tests.items()}

    # speed: one message at a time, like a real request
    t0 = time.perf_counter()
    for r in tests["fresh"][:40]:
        enc([r["text"]])
    ms_per_msg = (time.perf_counter() - t0) / 40 * 1000

    # describe: nearest skill description
    desc = enc([f"{s['title']}: {s['description']}" for s in skills])
    names = [s["name"] for s in skills]
    for n, rows in tests.items():
        pred = [names[i] for i in (test_emb[n] @ desc.T).argmax(1)]
        results.append({"model": model_id, "method": "describe", "train": "none", "test": n, "right": score(pred, rows), "n": len(rows), "ms": ms_per_msg, "conf": confusions(pred, rows)})

    for tname, rows_tr in train_sets.items():
        t0 = time.perf_counter()
        X = enc([r["text"] for r in rows_tr])
        y = np.array([r["skill"] for r in rows_tr])
        enc_secs = time.perf_counter() - t0
        clf = LogisticRegression(max_iter=2000, C=10).fit(X, y)
        for n, rows in tests.items():
            sims = test_emb[n] @ X.T
            top = np.argsort(-sims, axis=1)[:, :5]
            knn = [Counter(y[i] for i in row).most_common(1)[0][0] for row in top]
            lr = list(clf.predict(test_emb[n]))
            for meth, pred in (("knn", knn), ("logreg", lr)):
                results.append({"model": model_id, "method": meth, "train": tname, "train_rows": len(rows_tr), "embed_secs": round(enc_secs, 1),
                                "test": n, "right": score(pred, rows), "n": len(rows), "ms": ms_per_msg, "conf": confusions(pred, rows),
                                "rows": [{"text": r["text"], "gold": r["skill"], "pred": p} for p, r in zip(pred, rows)]})

for r in results:
    print(f"{r['model'].split('/')[1]:22} {r['method']:8} {r['train']:14} {r['test']:8} {r['right']:3}/{r['n']:<3} {100*r['right']/r['n']:5.1f}%  {r['ms']:.1f} ms/msg")
json.dump(results, open(os.path.join(HERE, "embedding_router_results.json"), "w"), indent=1)
