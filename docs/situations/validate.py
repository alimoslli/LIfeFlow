#!/usr/bin/env python3
"""Validate the situation library: format, references, dates, money in cents, no em dashes.

Run: python3 docs/situations/validate.py
Exit code 0 when every case is valid. Also prints coverage counts.
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "cases"

KINDS = {"student", "student who works", "shift worker", "night shift", "parent", "single parent", "freelancer", "gig worker", "two jobs",
         "salaried", "caregiver", "lives with family", "roommates", "far from home", "new to the country", "chronic condition", "retired", "between jobs"}
STATES = {"asleep", "class", "study", "work", "commute", "home", "with people", "away", "day off", "care", "appointment", "other"}
PARTS = {"money", "school", "work", "health", "life"}
CHECKS = {"afford", "time", "rest", "pattern", "drift", "heavy stretch", "real life squeezed", "collision", "late fact"}
ACTIONS = {"none", "just so you know", "reminder", "move block", "plan", "ask", "draft for them"}
REQUIRED = ["id", "title", "life", "now", "known", "timeline", "attached", "money", "dev_must_notice", "best_fix", "must_not", "stay_quiet", "tags"]
ID_RE = re.compile(r"^s\d{4}-[a-z0-9-]+$")


def when(value, where, errors):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        errors.append(f"{where}: not an ISO date-time: {value!r}")
        return None


def check_case(path):
    errors = []
    raw = path.read_text(encoding="utf-8")
    if "—" in raw:
        errors.append("contains an em dash")
    try:
        c = json.loads(raw)
    except json.JSONDecodeError as e:
        return [f"invalid JSON: {e}"], None
    for f in REQUIRED:
        if f not in c:
            errors.append(f"missing field: {f}")
    if errors:
        return errors, None
    if not ID_RE.match(c["id"]):
        errors.append(f"id must look like s0001-short-slug: {c['id']!r}")
    if path.stem != c["id"]:
        errors.append(f"file name {path.name} does not match id {c['id']}")
    life = c["life"]
    for k in life.get("kinds", []):
        if k not in KINDS:
            errors.append(f"life.kinds: unknown kind {k!r}")
    if not life.get("kinds"):
        errors.append("life.kinds is empty")
    if not life.get("time_zone"):
        errors.append("life.time_zone missing")
    now = when(c["now"], "now", errors)
    ids = set()
    for k in c["known"]:
        ids.add(k.get("id"))
        if not k.get("fact") or not k.get("source"):
            errors.append(f"known {k.get('id')}: needs fact and source")
    for t in c["timeline"]:
        tid = t.get("id")
        if tid in ids:
            errors.append(f"duplicate id {tid}")
        ids.add(tid)
        s, e = when(t.get("start"), f"timeline {tid}.start", errors), when(t.get("end"), f"timeline {tid}.end", errors)
        if s and e and e <= s:
            errors.append(f"timeline {tid}: end is not after start")
        if t.get("state") not in STATES:
            errors.append(f"timeline {tid}: unknown state {t.get('state')!r}")
        for f in ("label", "source"):
            if not t.get(f):
                errors.append(f"timeline {tid}: missing {f}")
        if not isinstance(t.get("expected"), bool):
            errors.append(f"timeline {tid}: expected must be true or false")
    if not c["timeline"]:
        errors.append("timeline is empty: real life is the backbone")
    for a in c["attached"]:
        aid = a.get("id")
        if aid in ids:
            errors.append(f"duplicate id {aid}")
        ids.add(aid)
        when(a.get("at"), f"attached {aid}.at", errors)
        if a.get("part") not in PARTS:
            errors.append(f"attached {aid}: unknown part {a.get('part')!r}")
        amt = a.get("amount_cents")
        if amt is not None and not isinstance(amt, int):
            errors.append(f"attached {aid}: amount_cents must be an integer or null")
        if not isinstance(a.get("expected"), bool):
            errors.append(f"attached {aid}: expected must be true or false")
        for f in ("kind", "label", "source"):
            if not a.get(f):
                errors.append(f"attached {aid}: missing {f}")
    for k, v in c["money"].items():
        if v is not None and not isinstance(v, int):
            errors.append(f"money.{k} must be integer cents")
    notices = c["dev_must_notice"]
    if c["stay_quiet"] and any(n.get("check") for n in notices if n.get("what")) and c["best_fix"].get("action") not in ("none", "just so you know"):
        errors.append("stay_quiet case must have best_fix.action none or just so you know")
    if not c["stay_quiet"] and not notices:
        errors.append("dev_must_notice is empty but stay_quiet is false")
    for i, n in enumerate(notices):
        if n.get("check") not in CHECKS:
            errors.append(f"dev_must_notice[{i}]: unknown check {n.get('check')!r}")
        if not n.get("what"):
            errors.append(f"dev_must_notice[{i}]: missing what")
        when(n.get("by_when"), f"dev_must_notice[{i}].by_when", errors)
        for ref in n.get("facts", []):
            if ref not in ids:
                errors.append(f"dev_must_notice[{i}]: fact {ref!r} does not exist")
        if not n.get("facts"):
            errors.append(f"dev_must_notice[{i}]: name the facts that collide")
    bf = c["best_fix"]
    if bf.get("action") not in ACTIONS:
        errors.append(f"best_fix.action unknown: {bf.get('action')!r}")
    for f in ("what", "why"):
        if not bf.get(f):
            errors.append(f"best_fix: missing {f}")
    if not isinstance(c["stay_quiet"], bool):
        errors.append("stay_quiet must be true or false")
    return errors, c


def main():
    files = sorted(CASES.glob("*.json")) if CASES.exists() else []
    if not files:
        print("No cases yet in docs/situations/cases/.")
        return 0
    bad = 0
    kinds, checks, quiet = Counter(), Counter(), 0
    seen = set()
    for p in files:
        errors, c = check_case(p)
        if c and c["id"] in seen:
            errors.append("duplicate id across files")
        if errors:
            bad += 1
            print(f"FAIL {p.name}")
            for e in errors:
                print(f"  - {e}")
            continue
        seen.add(c["id"])
        kinds.update(c["life"]["kinds"])
        checks.update(n["check"] for n in c["dev_must_notice"])
        quiet += c["stay_quiet"]
    ok = len(files) - bad
    print(f"\n{ok} of {len(files)} cases valid.")
    if ok:
        print(f"Stay-quiet share: {quiet}/{ok} ({round(100 * quiet / ok)}%)")
        print("Kinds:", ", ".join(f"{k} {n}" for k, n in kinds.most_common()))
        print("Checks:", ", ".join(f"{k} {n}" for k, n in checks.most_common()))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
