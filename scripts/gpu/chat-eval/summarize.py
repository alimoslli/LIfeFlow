"""Summarizes one compare-models.ts run (raw-local.json): passes, checks, speed, and each question's first try."""
import json, statistics as st, sys

r = json.load(open(sys.argv[1]))["results"]
if r and all(x["qid"].startswith("own-") for x in r):
    # the owner exam (--exam owner) has its own scorer: length, questions, steps and wording, on top of facts and tools.
    # Its first three lines go on the board like any other exam's; the score is also saved as owner-score.json.
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import owner_score
    score = owner_score.score_run(sys.argv[1])
    json.dump(score, open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), "owner-score.json"), "w", encoding="utf-8"), indent=1)
    owner_score.print_run(score)
    raise SystemExit(0)
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
