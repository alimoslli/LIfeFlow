"""The owner's standard as a number. Scores answers against what the owner said when he graded real ones on 2026-11-26
(docs/research/2026-11-25-training-night/grading/owner-feedback-1.md). Made-up data only; no model and no network.

  python3 owner_score.py                              self-check: the probes' own good and bad answers, the eight answers he
                                                      graded, and a run answered the fake model's way. Exit code 1 on any miss.
  python3 owner_score.py run OUT/raw-local.json       score one run of `compare-models.ts run --exam owner`; writes
                                                      OUT/owner-score.json and prints the three lines the board keeps
  python3 owner_score.py recorded qc.jsonl [--drop drop.txt]
                                                      the shared checks alone over recorded answers (the quality-check export
                                                      of a generation): how many turns meet his standard, and why the rest do not

Two layers, both without a judgment call:
  1. the shared checks every answer gets (reality_checks.py: too long for a quick message, extras after a promise, too many
     questions, asking what a look would answer, "try again later", "items", a time already past, a change it did not make);
  2. each probe's own expectations in owner_exam.json (tools that must or must not be called, words, questions, what the
     answer must and must not say, steps, the done mark, how many things it saved).
A probe passes only when every check passes. The score is passes out of probes, with a count per rule.
"""
import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from reality_checks import owner_notes, reality_notes, word_limit  # noqa: E402

EXAM = json.load(open(os.path.join(HERE, "owner_exam.json"), encoding="utf-8"))
PROBES = {p["id"]: p for p in EXAM["probes"]}
GRADED = os.path.join(HERE, "..", "..", "..", "docs", "research", "2026-11-25-training-night", "grading", "graded-1.json")
# the same list compare-models.ts uses for "this tool changes something", plus a saved promise
WRITE_TOOL = re.compile(r"^(create|update|delete|add|remove|save|set|import|send|move|record|mark|log|sync|connect|cancel|rename|merge|split|undo|make|contribute)_")
# Left out of the shared layer on purpose: "said from nowhere" needs the person's saved memories and the tool results, and a
# run file has neither; "invented amount" needs the tool results. Both stay with the guard and the training filter.
SKIP_NOTES = {"said from nowhere", "invented amount"}
LIST_LINE = re.compile(r"(^|\n)\s*(-|\*|•|\d+[.)])\s")
INLINE_NUM = re.compile(r"(^|\s)\(?\d[.)]\s")


def norm(s):
    """As compare-models.ts reads an answer: lower case, 1,000 -> 1000, no dollar signs."""
    return re.sub(r"(\d),(?=\d{3}\b)", r"\1", (s or "").lower()).replace("$", "")


def patterns(items):
    return [EXAM["patterns"].get(x, x) for x in items or []]


def tool_sets(p):
    t = p.get("tools", [[]])
    return [[x] for x in EXAM["sets"][t]] if isinstance(t, str) else t


def names_list(p, key):
    v = p.get(key) or []
    return EXAM["sets"][v] if isinstance(v, str) else v


def as_call(t):
    return {"name": t, "args": {}} if isinstance(t, str) else {"name": t.get("name") or "", "args": t.get("args") or {}}


def as_turns(p, sample):
    """A probe's good or bad sample as turn records, shaped like a run file's."""
    return [{"user": u, "answer": s["answer"], "tools": [as_call(t) for t in s.get("tools", [])]} for u, s in zip(p["turns"], sample)]


def now_line(now=None, today=None):
    return f"# Right now\nUser: Maya. Now: {now or EXAM['now']} ({EXAM['tz']}). Today is {today or EXAM['today']}."


def chat_of(turns, system):
    """The chat as the model saw it at the last turn: (messages up to and including this turn's tool results, the answer)."""
    msgs = [{"role": "system", "content": system}]
    for i, t in enumerate(turns):
        msgs.append({"role": "user", "content": t["user"]})
        if t.get("tools"):
            msgs.append({"role": "assistant", "content": "", "tool_calls": [
                {"function": {"name": c["name"], "arguments": c["args"] if isinstance(c["args"], str) else json.dumps(c.get("args") or {})}} for c in t["tools"]]})
            msgs += [{"role": "tool", "content": r} for r in (t.get("results") or [""] * len(t["tools"]))]
        if i < len(turns) - 1:
            msgs.append({"role": "assistant", "content": t["answer"]})
    return msgs, turns[-1]["answer"]


def shared_notes(turns, system=None):
    """The checks every answer gets, as a list of codes. Empty = nothing wrong."""
    msgs, text = chat_of(turns, system or now_line())
    codes = [c for c, _ in reality_notes(msgs, {"content": text}) if c not in SKIP_NOTES]
    # a save for a time already gone (a check-in at 9 PM, saved at 11 PM), on any turn's own calls
    seen = [{"role": "system", "content": system or now_line()}]
    for t in turns:
        seen.append({"role": "user", "content": t["user"]})
        calls = [{"function": {"name": c["name"], "arguments": c["args"] if isinstance(c["args"], str) else json.dumps(c.get("args") or {})}} for c in t.get("tools") or []]
        if calls:
            codes += [c for c, _ in reality_notes(seen, {"content": "", "tool_calls": calls}) if c == "past save"]
        seen.append({"role": "assistant", "content": t["answer"]})
    return codes


def saved_count(turns):
    n = 0
    for t in turns:
        for c in t.get("tools") or []:
            a = c.get("args")
            if isinstance(a, str):
                try:
                    a = json.loads(a)
                except ValueError:
                    a = {}
            a = a or {}
            if c["name"] == "create_events":
                n += len(a.get("events") or [1])
            if c["name"] == "create_tasks":
                tasks = a.get("tasks") or [1]
                n += sum(1 + len(x.get("subtasks") or []) if isinstance(x, dict) else 1 for x in tasks)
    return n


def steps_of(turns):
    """How many steps an answer lays out: the most of what it saved, its list lines, its numbered points, and the parts of its
    longest run-on sentence ("pick sources, read each, find the threads, outline, then draft" is five). A floor, not a grade."""
    text = turns[-1]["answer"]
    parts = max((len([x for x in re.split(r",|;|\bthen\b", s) if len(x.split()) >= 2]) for s in re.split(r"[.!?\n]+", text)), default=0)
    return max(saved_count(turns), len(LIST_LINE.findall(text)), len(INLINE_NUM.findall(text)), parts)


def same_words(a, b):
    """True when two answers are the same line again: identical, or four words in five shared."""
    wa, wb = set(re.findall(r"[a-z']+", norm(a))), set(re.findall(r"[a-z']+", norm(b)))
    return not wa or not wb or len(wa & wb) / len(wa | wb) >= 0.8


def score_probe(p, turns, writes=None, others=None, system=None):
    """One probe against one attempt. Returns {"pass", "failed": [check names], "notes": [codes], "words", "missing"}."""
    answer = turns[-1]["answer"] or ""
    text = norm(answer)
    names = [c["name"] for t in turns for c in t.get("tools") or []]
    words, questions = len(answer.split()), answer.count("?")
    missing = [f for f in patterns(p.get("facts")) if not re.search(f, text, re.I)]
    said = [f for f in patterns(p.get("mustNot")) if re.search(f, text, re.I)]
    notes = shared_notes(turns, system)
    first_names = [c["name"] for c in turns[0].get("tools") or []]

    def done_ok(tool):
        for t in turns:
            for c in t.get("tools") or []:
                a = c.get("args")
                if isinstance(a, str):
                    try:
                        a = json.loads(a)
                    except ValueError:
                        a = {}
                if c["name"] == tool and (a or {}).get("status") == "done":
                    return True
        return False

    other = (others or {}).get(p.get("differsFrom") or "")
    ok = {
        "error": all((t.get("outcome") in (None, "ok")) and not t.get("uiError") and (t.get("answer") or "").strip() for t in turns),
        "tools": any(all(x in names for x in s) for s in tool_sets(p)),
        "budget": len(names) <= p.get("budget", 99),
        "never": not any(n in names for n in names_list(p, "never")) and not any(n in first_names for n in p.get("neverInTurn1") or []),
        "writes": not p.get("noWrites") or (not any(WRITE_TOOL.match(n) for n in names) and not (writes or {})),
        "facts": not missing,
        "mustNot": not said,
        "words": p.get("minWords", 0) <= words <= p.get("maxWords", 10 ** 6),
        "questions": questions <= p.get("maxQuestions", 10 ** 6),
        "steps": steps_of(turns) >= p.get("minSteps", 0),
        "done": all(done_ok(t) for t in p.get("done") or []),
        "saved": saved_count(turns) <= p.get("maxSaved", 10 ** 6),
        "differs": not (p.get("differsFromTurn1") and same_words(answer, turns[0]["answer"])) and not (other is not None and same_words(answer, other)),
        "notes": not notes,
    }
    failed = [k for k, v in ok.items() if not v]
    return {"pass": not failed, "failed": failed, "notes": notes, "words": words, "missing": missing}


def score_all(attempts, answers=None):
    """attempts: {probe id: (turns, writes)}. Probes without an attempt are listed as not run and are not in the total."""
    answers = answers or {i: t[-1]["answer"] for i, (t, _) in attempts.items()}
    rows, by_rule, note_counts = [], {}, {}
    for p in EXAM["probes"]:
        if p["id"] not in attempts:
            continue
        turns, writes = attempts[p["id"]]
        r = score_probe(p, turns, writes, answers)
        rows.append({"id": p["id"], "rule": p["rule"], "from": p["from"], **r, "answer": turns[-1]["answer"]})
        a = by_rule.setdefault(p["rule"], [0, 0])
        a[0] += r["pass"]
        a[1] += 1
        for c in r["notes"]:
            note_counts[c] = note_counts.get(c, 0) + 1
    points = sum(r["pass"] for r in rows)
    return {"exam": "owner", "points": points, "total": len(rows), "percent": round(100 * points / len(rows)) if rows else 0,
            "notRun": [p["id"] for p in EXAM["probes"] if p["id"] not in attempts], "byRule": by_rule, "notes": note_counts, "probes": rows}


def summary(s):
    """Three lines; runplan.sh keeps the first three on the board."""
    rules = ", ".join(f"{k} {v[0]}/{v[1]}" for k, v in s["byRule"].items())
    miss = "; ".join(f"{r['id'][4:]}({','.join(r['failed'])})" for r in s["probes"] if not r["pass"]) or "none"
    not_run = f" | {len(s['notRun'])} probes not run" if s["notRun"] else ""
    return [f"owner standard {s['points']} of {s['total']} ({s['percent']}%){not_run}", f"by rule: {rules}", f"misses: {miss}"]


def score_run(path):
    """A run file from compare-models.ts (raw-<model>.json): the first try of each probe."""
    results = json.load(open(path, encoding="utf-8"))["results"]
    attempts = {}
    for x in results:
        if x["qid"] in PROBES and x["qid"] not in attempts and x.get("attempt", 1) == 1:
            turns = [{"user": t["user"], "answer": t.get("answer") or "", "tools": [as_call(c) for c in t.get("tools") or []],
                      "outcome": t.get("outcome"), "uiError": t.get("uiError")} for t in x["turns"]]
            attempts[x["qid"]] = (turns, x.get("writes") or {})
    return score_all(attempts)


def print_run(s):
    for line in summary(s):
        print(line)
    for r in s["probes"]:
        why = "" if r["pass"] else f" failed={','.join(r['failed'])} notes={r['notes']} missing={r['missing']}"
        print(f"{r['id']:22} {'ok  ' if r['pass'] else 'FAIL'} {r['words']:3}w{why} | {r['answer'][:140]!r}")


# ---- recorded answers (a generation's quality-check export): the shared layer only
def recorded_turn(rec):
    said = rec["said"]
    system = "# Right now\nUser: Maya."   # a record without its time gets no clock check
    if rec.get("now"):
        when = dt.datetime.strptime(rec["now"], "%Y-%m-%dT%H:%M")
        hour = when.hour % 12 or 12
        system = now_line(f"{when.strftime('%A, %B')} {when.day}, {when.year} at {hour}:{when.minute:02d} {'AM' if when.hour < 12 else 'PM'}", when.strftime("%Y-%m-%d"))
    turns = [{"user": s, "answer": "(earlier answer not in the export)", "tools": []} for s in said[:-1]]
    turns.append({"user": said[-1], "answer": rec["answer"], "tools": [{"name": c["tool"], "args": c.get("args") or "{}"} for c in rec.get("calls") or []],
                  "results": rec.get("results") or []})
    return turns, system


def recorded_notes(rec, owner_only=False):
    turns, system = recorded_turn(rec)
    if owner_only:
        msgs, text = chat_of(turns, system)
        return [c for c, _ in owner_notes(msgs, text)]
    return shared_notes(turns, system)


def recorded(path, drop=None):
    recs = [json.loads(x) for x in open(path, encoding="utf-8") if x.strip()]
    dropped = {x.split()[0] for x in open(drop, encoding="utf-8") if x.strip()} if drop else set()
    groups = [("every recorded turn", recs), ("kept by the automatic filter", [r for r in recs if r.get("filter_kept")])]
    if drop:
        groups.append(("kept by the filter and the readers", [r for r in recs if r.get("filter_kept") and r["conv"] not in dropped]))
    out = []
    for label, rs in groups:
        for layer, owner_only in (("the owner's checks", True), ("the owner's checks and the clock checks", False)):
            counts, ok = {}, 0
            for r in rs:
                notes = recorded_notes(r, owner_only)
                ok += not notes
                for c in set(notes):
                    counts[c] = counts.get(c, 0) + 1
            out.append({"group": label, "layer": layer, "turns": len(rs), "pass": ok, "percent": round(100 * ok / len(rs)) if rs else 0,
                        "why": dict(sorted(counts.items(), key=lambda kv: -kv[1]))})
    words = sorted(len(r["answer"].split()) for r in recs)
    return {"file": os.path.basename(path), "middleWords": words[len(words) // 2] if words else 0, "rows": out}


# ---- self-check
FAKE_SAYS = [  # what fake_model.py answers (wrong on purpose), given to every probe: the exam must not pass a model like this
    {"answer": "Got it. Want me to block study time this evening?", "tools": []},
    {"answer": "You have a study block at 2:15 PM today. Want me to move it?", "tools": ["get_daily_briefing"]},
    {"answer": "That is looked up. I'll remind you tomorrow.", "tools": ["find_free_time", {"name": "create_events", "args": {"events": [{"title": "Study block", "date": "2026-11-02", "startTime": "08:00", "endTime": "09:00"}]}}]},
    {"answer": "Okay. Tell me what you would like to do next.", "tools": [{"name": "check_affordability", "args": {"amount": 777, "when": "this_week"}}]},
]
SHAPE = ("words", "questions", "mustNot", "steps")   # the parts of a probe that do not depend on whose life it is


def graded_rows():
    """The eight answers the owner graded, through the scorer: the shared checks, then the life-independent part of the probe
    made from that grade (length, questions, wording, steps). Facts and tools of the probe are about Maya, so they are not applied."""
    rows = []
    for g in json.load(open(GRADED, encoding="utf-8")):
        turns, system = recorded_turn(g)
        notes = shared_notes(turns, system)
        p = PROBES[g["probe"]]
        shape = [k for k in score_probe({**p, "facts": [], "tools": [[]], "never": [], "noWrites": False, "done": [], "budget": 99}, turns, system=system)["failed"] if k in SHAPE]
        rows.append({"id": g["id"], "verdict": g["verdict"], "why": g["why"], "notes": notes, "probe": g["probe"], "shape": shape,
                     "scorer": "fail" if notes or shape else "pass", "expect": g["scorer"]})
    return rows


def selfcheck():
    bad = 0

    def check(ok, label, detail=""):
        nonlocal bad
        bad += not ok
        print("ok  " if ok else "FAIL", label, detail if not ok else "")

    probes = EXAM["probes"]
    check(len(probes) >= 30, f"{len(probes)} probes (at least 30)")
    per_rule = {}
    for p in probes:
        per_rule[p["rule"]] = per_rule.get(p["rule"], 0) + 1
    check(set(per_rule) == set(EXAM["rules"]) and min(per_rule.values()) >= 2, f"every rule has at least two probes: {per_rule}")
    # the probe's own length rule and the shared one must agree on what kind of message it is
    for p in probes:
        limit = word_limit(p["turns"][-1])
        if p["rule"] == "depth":
            check(limit is None and p.get("minWords"), f"{p['id']}: read as a request for real help, with a floor and no ceiling", f"limit={limit}")
        elif p.get("maxWords"):
            check(p["maxWords"] <= 60, f"{p['id']}: a quick message, {p['maxWords']} words at most" + ("" if limit else " (the shared length check reads it as a request for help, so only the probe's own limit applies)"))
    goods = {p["id"]: as_turns(p, p["good"])[-1]["answer"] for p in probes}
    for p in probes:
        g = score_probe(p, as_turns(p, p["good"]), None, goods)
        check(g["pass"], f"{p['id']}: the good answer passes", f"failed={g['failed']} notes={g['notes']} missing={g['missing']} words={g['words']}")
        b = score_probe(p, as_turns(p, p["bad"]), None, goods)
        check(not b["pass"] and all(k in b["failed"] for k in p["expect"]), f"{p['id']}: the bad answer fails on {'+'.join(p['expect'])}", f"failed={b['failed']} notes={b['notes']}")
    clean = score_all({p["id"]: (as_turns(p, p["good"]), None) for p in probes})
    check(clean["points"] == clean["total"] == len(probes), f"a run of the good answers scores {clean['points']} of {clean['total']}")
    wrong = score_all({p["id"]: (as_turns(p, p["bad"]), None) for p in probes}, goods)
    check(wrong["points"] == 0, f"a run of the bad answers scores {wrong['points']} of {wrong['total']}")
    check(all(v[0] == 0 for v in wrong["byRule"].values()), "every rule catches its own bad answers")
    for i, f in enumerate(FAKE_SAYS):
        s = score_all({p["id"]: ([{"user": u, "answer": f["answer"], "tools": [as_call(t) for t in f["tools"]]} for u in p["turns"]], None) for p in probes})
        passed = [r["id"][4:] for r in s["probes"] if r["pass"]]
        check(s["points"] <= 4, f"the fake model's answer {i + 1} to every probe scores {s['points']} of {s['total']} {passed}: {f['answer'][:50]!r}")
    # the eight answers the owner graded
    agree = 0
    for r in graded_rows():
        same = r["scorer"] == r["expect"]["verdict"] and sorted(r["notes"]) == sorted(r["expect"]["notes"]) and sorted(r["shape"]) == sorted(r["expect"]["shape"])
        check(same, f"{r['id']} ({r['verdict']}): scorer says {r['scorer']} {r['notes'] + r['shape'] or ''}", f"expected {r['expect']}")
        agree += r["expect"]["agrees"]
    print(f"the owner's eight grades: the scorer agrees with his reason on {agree} of 8 (see graded-1.json for each)")
    print("SELF-CHECK", "FAILED" if bad else "passed", f"({bad} wrong)" if bad else "")
    return bad


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "selfcheck"
    if cmd == "run":
        score = score_run(sys.argv[2])
        json.dump(score, open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[2])), "owner-score.json"), "w", encoding="utf-8"), indent=1)
        print_run(score)
    elif cmd == "recorded":
        res = recorded(sys.argv[2], sys.argv[sys.argv.index("--drop") + 1] if "--drop" in sys.argv else None)
        if "--json" in sys.argv:
            json.dump(res, open(sys.argv[sys.argv.index("--json") + 1], "w", encoding="utf-8"), indent=1)
        print(f"{res['file']}: the middle answer is {res['middleWords']} words")
        for row in res["rows"]:
            print(f"{row['group']:36} | {row['layer']:40} | {row['pass']} of {row['turns']} pass ({row['percent']}%) | {row['why']}")
    else:
        raise SystemExit(1 if selfcheck() else 0)
