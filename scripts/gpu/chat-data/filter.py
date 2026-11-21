"""Joins the generator's metadata (generate.ts) with the translator's chat dump (responses_shim.py --dump), keeps only
clean examples, and writes them in chat format for fine-tuning. Made-up data only (ADR 0023).

  python3 scripts/gpu/chat-data/filter.py --meta '/workspace/chatdata/meta-*.jsonl' --dump /workspace/chatdata/dump.jsonl \
      --out /workspace/chatdata/train.jsonl --report /workspace/chatdata/filter-report.json

An example is one skyling turn: the exact messages the model was sent on the turn's last step (system prompt, earlier
turns, its own tool calls and the tool results) plus its final answer, and the tools it was offered. Kept only if:
  - the turn finished cleanly (no error, a final answer, not cut off) and no tool failed;
  - every money amount and decimal in the answer is in the tool results or the person's own words (no invented numbers);
  - every weekday named next to a date is that date's real weekday;
  - it follows the house rules users see: no em dash, never "assistant", "AI assistant" or "Jarvis";
  - it is short enough for a phone (at most 1,200 characters).
"""
import argparse, collections, datetime as dt, glob, json, re

ap = argparse.ArgumentParser()
ap.add_argument("--meta", required=True)
ap.add_argument("--dump", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--report", required=True)
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
    steps[r["conv"]].append(r)  # conv here is "<life>~<k>~<turn>"

MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d{1,2})?)")
DECIMAL = re.compile(r"(?<![\d.])(\d+\.\d+)(?![\d.])")
DAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
DAY_DATE = re.compile(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b", re.I)
BANNED = [re.compile(p, re.I) for p in (r"\bassistant\b", r"\bjarvis\b")]


def norm_num(s):
    s = s.replace(",", "")
    try:
        v = float(s)
    except ValueError:
        return None
    return f"{v:.2f}"


def numbers_in(text):
    out = set()
    for m in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", text):
        v = norm_num(m.group(0).lstrip("-"))
        if v:
            out.add(v)
    return out


def known_numbers(messages):
    """Numbers the model was given: tool results (cents become dollars too) and the person's own words."""
    seen = set()
    for m in messages:
        if m["role"] not in ("tool", "user"):
            continue
        text = m["content"] if isinstance(m["content"], str) else json.dumps(m["content"])
        seen |= numbers_in(text)
        for c in re.findall(r"[Cc]ents\"?:\s*(-?\d+)", text):
            seen.add(f"{abs(int(c)) / 100:.2f}")
    return seen


def check(meta_row, last, year):
    reasons = []
    turn = meta_row["turns"][-1] if meta_row else None
    if not meta_row or any(t["outcome"] != "ok" for t in meta_row["turns"]):
        reasons.append("turn error")
    reply = last["reply"]
    text = (reply.get("content") or "").split("</think>")[-1].strip()
    if reply.get("tool_calls") or not text:
        reasons.append("no final answer")
    if last.get("finish") not in (None, "stop"):
        reasons.append("cut off")
    msgs = last["messages"]
    for m in msgs:
        if m["role"] == "tool" and '"ok":false' in (m["content"] or "").replace(" ", ""):
            reasons.append("tool failed")
            break
    known = known_numbers(msgs)
    for m in MONEY.finditer(text):
        v = norm_num(m.group(1))
        if v and v not in known:
            reasons.append(f"number not in tools: ${m.group(1)}")
    for m in DECIMAL.finditer(text):
        v = norm_num(m.group(1))
        if v and v not in known:
            reasons.append(f"number not in tools: {m.group(1)}")
    for m in DAY_DATE.finditer(text):
        day, mon, d = DAYS[m.group(1)[:3].lower()], MONTHS[m.group(2)[:3].lower()], int(m.group(3))
        try:
            if dt.date(year, mon, d).weekday() != day:
                reasons.append(f"wrong weekday: {m.group(0)}")
        except ValueError:
            reasons.append(f"impossible date: {m.group(0)}")
    if "—" in text:
        reasons.append("em dash")
    if any(b.search(text) for b in BANNED):
        reasons.append("banned word")
    if len(text) > 1200:
        reasons.append("too long")
    return reasons, text


kept, why = [], collections.Counter()
by_source = collections.Counter()
for conv_turn, rs in steps.items():
    life, k, t = conv_turn.split("~")
    m = meta.get(f"{life}~{k}")
    last = rs[-1]
    year = int((m or {}).get("nowLocal", "2026")[:4])
    reasons, text = check(m, last, year)
    if reasons:
        why.update(r.split(":")[0] for r in reasons)
        continue
    msgs = [x for x in last["messages"]] + [{"role": "assistant", "content": text}]
    kept.append({"messages": msgs, "tools": last["tools"], "meta": {"conv": conv_turn, "persona": m["persona"], "skill": m["question"].get("skill"),
                                                                       "source": m["question"]["source"], "steps": len(rs)}})
    by_source[m["question"]["source"]] += 1

with open(a.out, "w") as f:
    for r in kept:
        f.write(json.dumps(r) + "\n")
report = {"turns": len(steps), "kept": len(kept), "dropped_reasons": why.most_common(), "kept_by_source": by_source.most_common(),
          "kept_by_persona": collections.Counter(r["meta"]["persona"] for r in kept).most_common()}
json.dump(report, open(a.report, "w"), indent=1)
print(json.dumps({k: report[k] for k in ("turns", "kept", "dropped_reasons")}, indent=1))
