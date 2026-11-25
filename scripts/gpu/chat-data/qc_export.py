"""A short, readable record of every recorded skyling turn, for a quality check by a reader (a person or an agent) before
training: what the person said, which tools the skyling called with which arguments, what the tools returned (shortened),
what it answered, and whether the automatic filter kept it. The 13,000-token prompt is left out: it is the same every time
and it is not what is being judged.

  python3 qc_export.py --meta "<gen>/meta-*.jsonl" --dump <gen>/dump.jsonl --details <details.jsonl> --out qc.jsonl
"""
import argparse, collections, glob, json

ap = argparse.ArgumentParser()
ap.add_argument("--meta", required=True)
ap.add_argument("--dump", required=True)
ap.add_argument("--details", default=None, help="filter.py --details output: adds the filter's verdict and reasons")
ap.add_argument("--out", required=True)
ap.add_argument("--result-chars", type=int, default=1400)
a = ap.parse_args()

meta = {}
for f in glob.glob(a.meta):
    for line in open(f):
        r = json.loads(line)
        if "conv" in r:
            meta[r["conv"]] = r
steps = collections.defaultdict(list)
for line in open(a.dump):
    r = json.loads(line)
    steps[r["conv"]].append(r)
verdict = {}
if a.details:
    for line in open(a.details):
        d = json.loads(line)
        verdict[d["conv"]] = d


def text_of(c):
    return c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)


n = 0
with open(a.out, "w") as out:
    for conv, rs in steps.items():
        life, k, t = conv.split("~")
        m = meta.get(f"{life}~{k}") or {}
        last = rs[-1]
        msgs = last["messages"]
        users = [i for i, x in enumerate(msgs) if x["role"] == "user"]
        start = users[-1] if users else 0
        said = [text_of(msgs[i]["content"])[:600] for i in users]
        calls = [{"tool": c["function"]["name"], "args": (c["function"].get("arguments") or "")[:400]}
                 for r in rs for c in (r["reply"].get("tool_calls") or [])]
        results = [text_of(x.get("content"))[: a.result_chars] for x in msgs[start + 1:] if x["role"] == "tool"]
        v = verdict.get(conv, {})
        out.write(json.dumps({
            "conv": conv, "life": m.get("persona"), "skill": (m.get("question") or {}).get("skill"), "kind": (m.get("question") or {}).get("source"),
            "now": m.get("nowLocal"), "said": said, "calls": calls, "results": results,
            "answer": text_of(last["reply"].get("content") or "")[:2500], "filter_kept": v.get("ok"), "filter_reasons": v.get("reasons", []),
        }, ensure_ascii=False) + "\n")
        n += 1
print(f"{n} turns written to {a.out}")
