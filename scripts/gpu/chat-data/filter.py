"""Joins the generator's metadata (generate.ts) with the translator's chat dump (responses_shim.py --dump), keeps only
clean examples, and writes them in chat format for fine-tuning. Made-up data only (ADR 0023).

  python3 scripts/gpu/chat-data/filter.py --meta '/workspace/chatdata/meta-*.jsonl' --dump /workspace/chatdata/dump.jsonl \
      --out /workspace/chatdata/train.jsonl --report /workspace/chatdata/filter-report.json

Earlier runs can be added: an `also.txt` beside the dump lists "<run folder> <most per skill>" per line; their kept
examples fill each skill up to that number, after this run's own (so an earlier run skewed to a few skills can't
dominate).

An example is one skyling turn: the exact messages the model was sent on the turn's last step (system prompt, earlier
turns, its own tool calls and the tool results) plus its final answer, and the tools it was offered. Kept only if:
  - the turn finished cleanly (no error, a final answer, not cut off) and no tool failed;
  - every money amount and decimal in the answer is in the tool results or the person's own words (no invented numbers);
  - every weekday named next to a date is that date's real weekday;
  - it follows the skyling's own rules (src/server/jarvis/prompt.ts, "how you sound"): at most about 100 words, no
    headings, no app paths ("/work"), no drama words, no narrating ("Let me check"), no em dash, never "assistant",
    "companion" or "Jarvis". Bold markers are taken out rather than dropping the answer (the teacher overuses them).
"""
import argparse, collections, datetime as dt, glob, json, re

ap = argparse.ArgumentParser()
ap.add_argument("--meta", required=True)
ap.add_argument("--dump", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--report", required=True)
ap.add_argument("--details", default=None, help="also write one line per turn: its skill, question, tools, answer and why it was dropped (for a per-skill scorecard)")
ap.add_argument("--alive", action="store_true", help="the skyling may book calendar time and add to-dos on its own when the person describes a problem "
                "(create_events, create_tasks); every other change still needs them to ask (owner, 2026-11-22: do things for the user)")
ap.add_argument("--no-cap", action="store_true", help="keep every passing answer (for measuring a model, not for building a training set)")
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
# Not after a comma or a dollar sign: "$1,085.59" is one amount (MONEY reads it), not a stray "085.59". Until 2026-11-22 the
# comma was missing here, so every amount of $1,000 or more with cents was reported as a number that is in no tool result.
DECIMAL = re.compile(r"(?<![\d.,$])(\d+\.\d+)(?![\d.])")
DAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
DAY_DATE = re.compile(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b", re.I)
BANNED = [re.compile(p, re.I) for p in (r"\bassistant\b", r"\bjarvis\b", r"\bcompanion\b")]
DRAMA = re.compile(r"\b(surgical|bleeding|damage control|crisis|stabiliz\w*)\b", re.I)
NARRATE = re.compile(r"\b(let me (check|look|see|pull)|i'll (look|check) (that|it) up|one moment)\b", re.I)
APP_PATH = re.compile(r"(?<![\w.])/(finances|work|tasks|calendar|school|goals|money|plan|jarvis|settings|habits|milestones|today|health)\b")
WRITE_TOOL = re.compile(r"^(create|update|delete|add|set|move|mark|log|save|record|remember|make|resolve|complete|schedule|book|cancel|archive|contribute|shift|split)_")
ASKS_TO_ACT = re.compile(r"\b(add|create|make|put|schedule|book|block|move|reschedule|delete|remove|cancel|set|remind|log|save|track|mark|update|change|rename|plan|split|record|remember|note|enter|fill|sign me up|do (it|that)|go ahead|yes)\b")
RAW_MINUTES = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d{3,}|9\d)\s*(?:minutes|mins?)\b", re.I)
HEADING = re.compile(r"^\s*#{1,6}\s", re.M)


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
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text).replace("__", "")
    # The teacher writes em dashes; the skyling never does. A comma keeps the answer (361 of 1,620 were lost to this).
    text = re.sub(r"\s*\u2014\s*", ", ", text)
    # The teacher writes narrow no-break spaces and no-break hyphens; plain ones read the same and are what people type.
    text = text.replace("\u202f", " ").replace("\u00a0", " ").replace("\u2011", "-")
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
    # Never change things nobody asked for (the teacher once added a to-do for "any tips?").
    user_text = " ".join(m["content"] for m in msgs if m["role"] == "user" and isinstance(m["content"], str)).lower()
    wrote = [c["function"]["name"] for m in msgs if m["role"] == "assistant" for c in (m.get("tool_calls") or [])
             if WRITE_TOOL.match(c["function"]["name"])]
    if a.alive:
        wrote = [w for w in wrote if w not in ("create_events", "create_tasks")]
    if wrote and not ASKS_TO_ACT.search(user_text):
        reasons.append("unasked write")
    # "You have 1,249 minutes free" (the owner, 2026-11-22: "who wants to hear that"): lengths are said in hours and minutes.
    if RAW_MINUTES.search(text):
        reasons.append("raw minutes")
    if len(text.split()) > 100:
        reasons.append("too long")
    if HEADING.search(text):
        reasons.append("heading")
    if APP_PATH.search(text):
        reasons.append("app path")
    if DRAMA.search(text):
        reasons.append("drama word")
    if NARRATE.search(text):
        reasons.append("narrating")
    return reasons, text


kept, why = [], collections.Counter()
details = []
by_source = collections.Counter()
for conv_turn, rs in steps.items():
    life, k, t = conv_turn.split("~")
    m = meta.get(f"{life}~{k}")
    last = rs[-1]
    year = int((m or {}).get("nowLocal", "2026")[:4])
    reasons, text = check(m, last, year)
    if a.details and m:
        turn_text = m["turns"][int(t)]["text"] if int(t) < len(m["turns"]) else m["question"]["text"]
        calls = [c["function"]["name"] for r in rs for c in (r["reply"].get("tool_calls") or [])]
        details.append({"conv": conv_turn, "skill": m["question"].get("skill"), "persona": m["persona"], "question": turn_text, "tools": calls,
                        "ok": not reasons, "reasons": reasons, "words": len(text.split()), "answer": text})
    if reasons:
        why.update(r.split(":")[0] for r in reasons)
        continue
    meta_row = {"conv": conv_turn, "persona": m["persona"], "skill": m["question"].get("skill"), "source": m["question"]["source"], "steps": len(rs)}
    # Every step is its own example. The first steps are the short ones where the skyling decides which tools to call:
    # training on the last step alone (2026-11-21) left those out, and the tuned model stopped calling tools.
    for i, r in enumerate(rs[:-1]):
        calls = r["reply"].get("tool_calls") or []
        if not calls:
            continue
        reply = {"role": "assistant", "content": "", "tool_calls": calls}
        kept.append({"messages": list(r["messages"]) + [reply], "tools": r["tools"], "meta": {**meta_row, "step": i, "kind": "tool_call"}})
    msgs = [x for x in last["messages"]] + [{"role": "assistant", "content": text}]
    kept.append({"messages": msgs, "tools": last["tools"], "meta": {**meta_row, "step": len(rs) - 1, "kind": "answer" if len(rs) > 1 else "answer_no_tools"}})
    by_source[m["question"]["source"]] += 1

# Answers that call no tool are kept only for a small share: most skyling questions are about the person's own data,
# and half the first training set answered without looking (the tuned model then asked or guessed instead of calling).
NO_TOOL_SHARE = 0.12
no_tool = [r for r in kept if r["meta"]["kind"] == "answer_no_tools"]
others = [r for r in kept if r["meta"]["kind"] != "answer_no_tools"]
cap = len(no_tool) if a.no_cap else int(NO_TOOL_SHARE * len(others) / (1 - NO_TOOL_SHARE))
random_ = __import__("random").Random(3)
random_.shuffle(no_tool)
dropped_no_tool = max(0, len(no_tool) - cap)
kept = others + no_tool[:cap]
why["no-tool answer over the cap"] += dropped_no_tool

import os
also = os.path.join(os.path.dirname(a.dump), "also.txt")
added = collections.Counter()
if os.path.exists(also):
    for line in open(also):
        if not line.strip():
            continue
        run_dir, cap = line.split()[0], int(line.split()[1])
        sub = os.path.join(run_dir, "also-kept.jsonl")
        os.system(f'python3 "{__file__}" --meta "{run_dir}/meta-*.jsonl" --dump "{run_dir}/dump.jsonl" --out "{sub}" --report "{run_dir}/also-report.json" > /dev/null')
        have = collections.Counter(r["meta"]["skill"] for r in kept)
        for l2 in open(sub):
            r = json.loads(l2)
            sk = r["meta"]["skill"]
            if have[sk] < cap:
                have[sk] += 1
                added[sk] += 1
                r["meta"]["from"] = run_dir
                kept.append(r)
with open(a.out, "w") as f:
    for r in kept:
        f.write(json.dumps(r) + "\n")
if a.details:
    with open(a.details, "w") as f:
        for d in details:
            f.write(json.dumps(d) + "\n")
report = {"turns": len(steps), "kept": len(kept), "by_kind": collections.Counter(r["meta"]["kind"] for r in kept).most_common(), "added_from_earlier_runs": sum(added.values()), "dropped_reasons": why.most_common(), "kept_by_source": by_source.most_common(),
          "kept_by_persona": collections.Counter(r["meta"]["persona"] for r in kept).most_common()}
json.dump(report, open(a.report, "w"), indent=1)
print(json.dumps({k: report[k] for k in ("turns", "kept", "by_kind", "added_from_earlier_runs", "dropped_reasons")}, indent=1))
