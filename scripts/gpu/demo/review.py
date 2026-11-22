"""Reads a test session's transcript (demo-transcript-*.jsonl, written by the translator's --dump) and prints every
question with the tools the skyling called, its answer, and what our automatic checks say is wrong with it. This is the
first pass before a person reads the answers: it catches made-up figures, raw minutes, answers over 100 words, a claimed
save with no saving tool, a cut sentence. It cannot tell whether the advice was good.

  python3 scripts/gpu/demo/review.py /workspace/ownmodel/demo-transcript-20261122-0715.jsonl
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "..", "chat-eval", "responses_shim.py")).read().split("class H(")[0]
argv, sys.argv = sys.argv, ["shim", "--guard"]
shim = {}
exec(src, shim)  # the same checks the live model runs behind, without starting its server
sys.argv = argv
CLOCK24 = re.compile(r"\b(1[3-9]|2[0-3]):[0-5]\d\b")

rows = [json.loads(l) for l in open(sys.argv[1])]
n = bad = 0
for r in rows:
    reply = r["reply"]
    if reply.get("tool_calls"):
        continue  # a step on the way; the answer comes later
    msgs = r["messages"]
    question = shim["last_user"](msgs)
    tools = shim["used_calls"](msgs)
    text = (reply.get("content") or "").strip()
    notes = shim["guard_notes"](msgs, {"content": text})
    if CLOCK24.search(text):
        notes.append("24-hour clock time in the answer")
    n += 1
    bad += bool(notes)
    print(f"--- {n}. {'CHECK' if notes else 'ok   '} | tools: {', '.join(tools) or 'none'} | {r.get('usage', {}).get('completion_tokens', '?')} tokens out")
    print("Q:", question.strip()[:400])
    print("A:", text[:1500])
    for x in notes:
        print("  !", x[:200])
print(f"\n{n} answers, {bad} flagged by the automatic checks")
