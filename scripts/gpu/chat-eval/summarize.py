"""Summarizes one compare-models.ts run (raw-local.json): passes, checks, speed, and each question's first try."""
import json, statistics as st, sys

r = json.load(open(sys.argv[1]))["results"]
qs = []
for x in r:
    if x["qid"] not in qs:
        qs.append(x["qid"])
first = {x["qid"]: x for x in r if x["attempt"] == 1}
anyok = {q: any(not x["failed"] for x in r if x["qid"] == q) for q in qs}
c = lambda k: sum(first[q]["checks"][k] for q in qs)
print("questions", len(qs), "| pass first try", sum(not first[q]["failed"] for q in qs), "| pass in 2 tries", sum(anyok.values()))
print("facts ok", c("facts"), "| right tools", c("tools"), "| over budget", c("overBudget"), "| writes ok", c("writesOk"), "| no error", c("noError"), "| mustNot ok", c("mustNot"))
tt = [sum(t["totalMs"] for t in first[q]["turns"]) / 1000 for q in qs]
print("seconds per question median %.1f max %.1f" % (st.median(tt), max(tt)))
for q in qs:
    x = first[q]
    ch = x["checks"]
    tools = ",".join(t["name"] for tt in x["turns"] for t in tt["tools"]) or "-"
    print(f"{q:14} {'ok  ' if not x['failed'] else 'FAIL'} tools={tools} missing={ch['missingFacts']} | {x['answer'][:150]!r}")
