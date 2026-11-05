#!/usr/bin/env python3
"""Validate the situation library.

A case is either
  - a focused case: one JSON file in cases/ (the original format: format, references, dates, money in cents, no em dashes), or
  - a full case: a folder cases/<id>/ (or examples/<id>/) with persona.json, scenario.json and the files
    simulate.py generated (connections/, timeline.json, truth.json). See simulator/scenario.schema.md.

For full cases it checks: files and fields; that the connections are exactly what simulate.py makes from the
persona and scenario; balances reconcile; pay matches hours; the timeline has no gaps or overlaps and valid
dates and weekdays; nothing posted after now and pending only near now; every id the scenario names exists;
volume targets; routine rates in the history; every timed placement in best_fix fits its routine window or
says why not; no em dashes; no real-looking personal identifiers.

Run: python3 docs/situations/validate.py            (every case in cases/ and examples/)
     python3 docs/situations/validate.py <path>...  (just these files or folders)
Exit code 0 when every case is valid. Also prints coverage counts for cases/.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "cases"
EXAMPLES = ROOT / "examples"
SIMULATOR = ROOT / "simulator"

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


# =============================================================== full cases (persona + scenario + connections)

FOLDER_ID_RE = {"cases": re.compile(r"^s\d{4}-[a-z0-9-]+$"), "examples": re.compile(r"^e\d{4}-[a-z0-9-]+$")}
PERSONA_ID_RE = re.compile(r"^p\d{4}-[a-z0-9-]+$")
CONNECTION_FILES = ["bank", "calendar", "school", "work", "health", "email", "memories"]
ACTIVITIES = {"study", "workout", "call", "family", "care", "meal", "keep free", "deep work", "chores", "groceries", "sleep", "appointment"}
RECORDS_AS = {"calendar", "calendar_recurring", "health_workout", "health_sleep", "bank", "none"}
FIRMNESS = {"fixed", "firm", "usual", "loose"}
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
CHANGE_TYPES = {"purchase", "refund", "duplicate_charge", "price_change", "bill_add", "late_paycheck", "shift_add", "shift_cancel", "schedule_posted_late", "sick_day",
                "exam_move", "class_cancel", "assignment_add", "routine_suspend", "habit_change", "memory", "calendar_event", "trip", "email"}
BEHAVIOUR_ONLY = {"routine_suspend", "habit_change"}
TXN_KINDS = {"income", "expense", "transfer", "refund", "reimbursement", "investment", "adjustment"}
HARD_STATES = {"class", "work", "appointment", "away", "care", "with people", "asleep"}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<![\w-])\(?(\d{3})\)?[-. ](\d{3})[-. ](\d{4})(?![\w-])")
SSN_RE = re.compile(r"(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])")
LONG_DIGITS_RE = re.compile(r"(?<![A-Za-z0-9])\d{12,}(?![A-Za-z0-9])")

# Fields each generated record must carry, with the types they may have (None means null is allowed).
S, I, B, N, L_, O = str, int, bool, type(None), list, dict
SHAPES = {
    "account": {"id": S, "name": S, "type": S, "subtype": (S, N), "mask": (S, N), "opening_balance_cents": I, "opening_balance_date": S, "current_balance_cents": I,
                "available_balance_cents": (I, N), "credit_limit_cents": (I, N), "source": S},
    "transaction": {"id": S, "account_id": S, "date": S, "authorized_date": (S, N), "description": S, "merchant_name": (S, N), "amount_cents": I, "currency": S, "kind": S,
                    "category": (S, N), "pending": B, "source": S, "provider_transaction_id": S, "pending_transaction_id": (S, N), "personal_finance_category": O,
                    "recurring_id": (S, N), "balance_after_cents": (I, N), "excluded": B},
    "recurring": {"id": S, "name": S, "amount_cents": I, "frequency": S, "next_due_date": (S, N), "kind": S, "account_id": S, "status": S, "source": S},
    "event": {"id": S, "title": S, "starts_at": S, "ends_at": S, "all_day": B, "kind": S, "recurrence": (O, N), "source": S},
    "course": {"id": S, "name": S, "code": (S, N), "source": S},
    "assignment": {"id": S, "course_id": S, "title": S, "kind": S, "due_at": (S, N), "status": S, "grade": (S, N), "points_possible": (I, float)},
    "announcement": {"id": S, "course_id": S, "title": S, "posted_at": S},
    "employer": {"id": S, "name": S, "pay_type": S, "hourly_rate_cents": (I, N)},
    "shift": {"id": S, "employer_id": S, "starts_at": S, "ends_at": S, "break_minutes": I, "break_paid": B, "recorded_start": (S, N), "recorded_end": (S, N), "status": S, "posted_at": S},
    "paycheck": {"id": S, "employer_id": S, "pay_date": S, "scheduled_pay_date": S, "period_start": S, "period_end": S, "gross_cents": I, "net_cents": I, "hours": (I, float),
                 "transaction_id": S, "shift_ids": L_},
    "daily": {"id": S, "metric": S, "day": S, "value": (I, float), "source": S},
    "sleep": {"id": S, "start": S, "end": S, "hours": (I, float), "day": S},
    "workout": {"id": S, "type": S, "start": S, "end": S, "minutes": I},
    "email": {"id": S, "gmail_message_id": S, "from_address": S, "sender_type": S, "subject": S, "received_at": S, "unread": B, "labels": L_},
    "memory": {"id": S, "content": S, "category": S, "source": S, "status": S, "created_at": S},
    "segment": {"id": S, "start": S, "end": S, "weekday": S, "state": S, "label": S, "source": S, "sources": L_, "expected": B},
}


def shape(rec, kind, where, errors):
    for k, t in SHAPES[kind].items():
        if k not in rec:
            errors.append(f"{where}: missing field {k}")
        elif not isinstance(rec[k], t) or (t is I and isinstance(rec[k], bool)):
            errors.append(f"{where}: {k} has the wrong type ({type(rec[k]).__name__})")


def local_dt(s):
    """An ISO time with or without an offset, as local wall time."""
    return datetime.fromisoformat(s[:19]) if len(s) > 16 else datetime.fromisoformat(s)


def aware(s):
    return datetime.fromisoformat(s)


def span(day, w):
    h1, m1 = (int(x) for x in w["start"].split(":"))
    h2, m2 = (int(x) for x in w["end"].split(":"))
    s = datetime(day.year, day.month, day.day, h1, m1)
    e = datetime(day.year, day.month, day.day, h2, m2)
    if e <= s:
        e += timedelta(days=1)
    return s, e


def nth_weekday(y, m, weekday, n):
    if n > 0:
        d = date(y, m, 1)
        return d + timedelta(days=(weekday - d.weekday()) % 7) + timedelta(weeks=n - 1)
    last = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def holidays(y):
    fixed = [date(y, 1, 1), date(y, 6, 19), date(y, 7, 4), date(y, 11, 11), date(y, 12, 25)]
    fixed = [d + timedelta(days=1) if d.weekday() == 6 else d for d in fixed]
    return set(fixed + [nth_weekday(y, 1, 0, 3), nth_weekday(y, 2, 0, 3), nth_weekday(y, 5, 0, -1), nth_weekday(y, 9, 0, 1), nth_weekday(y, 10, 0, 2), nth_weekday(y, 11, 3, 4)])


def prev_business(d):
    while d.weekday() >= 5 or d in holidays(d.year):
        d -= timedelta(days=1)
    return d


def round_half_up(f):
    return int(f + Fraction(1, 2)) if f >= 0 else -int(-f + Fraction(1, 2))


def load_simulator():
    sys.path.insert(0, str(SIMULATOR))
    try:
        import simulate  # noqa: PLC0415
    finally:
        sys.path.pop(0)
    return simulate


def check_text(folder, errors):
    for p in sorted(folder.rglob("*.json")):
        raw = p.read_text(encoding="utf-8")
        rel = p.relative_to(folder)
        if "—" in raw:
            errors.append(f"{rel}: contains an em dash")
        bad = sorted({m for m in EMAIL_RE.findall(raw) if not m.lower().endswith("@example.com")})
        if bad:
            errors.append(f"{rel}: email addresses must be @example.com: {', '.join(bad[:3])}")
        for m in PHONE_RE.finditer(raw):
            if m.group(2) != "555" or not 100 <= int(m.group(3)) <= 199:
                errors.append(f"{rel}: phone numbers must be 555-01xx: {m.group(0)!r}")
                break
        if SSN_RE.search(raw):
            errors.append(f"{rel}: looks like a social security number: {SSN_RE.search(raw).group(0)!r}")
        m = LONG_DIGITS_RE.search(raw)
        if m:
            errors.append(f"{rel}: a {len(m.group(0))}-digit number looks like a card or account number")


def check_persona(p, errors):
    for f in ("id", "summary", "kinds", "time_zone", "accounts", "routines"):
        if f not in p:
            errors.append(f"persona: missing field {f}")
    if errors:
        return
    if not PERSONA_ID_RE.match(p["id"]):
        errors.append(f"persona.id must look like p0001-short-slug: {p['id']!r}")
    for k in p["kinds"]:
        if k not in KINDS:
            errors.append(f"persona.kinds: unknown kind {k!r}")
    mems = {m["id"] for m in p.get("memories", [])}
    acts = set()
    if not any(r.get("activity") == "sleep" for r in p["routines"]):
        errors.append("persona.routines: needs a sleep routine")
    for r in p["routines"]:
        rid = r.get("id")
        if r.get("activity") not in ACTIVITIES:
            errors.append(f"routine {rid}: unknown activity {r.get('activity')!r}")
        acts.add(r.get("activity"))
        if r.get("records_as", "none") not in RECORDS_AS:
            errors.append(f"routine {rid}: records_as must be one of {sorted(RECORDS_AS)}")
        if r.get("keep_rate") is not None and not 0 <= r["keep_rate"] <= 1:
            errors.append(f"routine {rid}: keep_rate must be between 0 and 1")
        if r.get("not_after") and not TIME_RE.match(r["not_after"]):
            errors.append(f"routine {rid}: not_after must be HH:MM")
        if r.get("source_memory") and r["source_memory"] not in mems:
            errors.append(f"routine {rid}: source_memory {r['source_memory']!r} is not a persona memory")
        if not r.get("windows"):
            errors.append(f"routine {rid}: needs at least one window")
        for w in r.get("windows", []):
            for f in ("start", "end"):
                if not TIME_RE.match(str(w.get(f))):
                    errors.append(f"routine {rid} window {w.get('id')}: {f} must be HH:MM")
            if r.get("activity") != "sleep":
                if not w.get("days") or any(d not in DAYS for d in w["days"]):
                    errors.append(f"routine {rid} window {w.get('id')}: days must be from {DAYS}")
            elif w.get("day_type") not in ("early_next_day", "free_next_day", "after_night_shift"):
                errors.append(f"routine {rid} window {w.get('id')}: sleep windows need day_type early_next_day, free_next_day or after_night_shift")
            if w.get("firmness") and w["firmness"] not in FIRMNESS:
                errors.append(f"routine {rid} window {w.get('id')}: firmness must be one of {sorted(FIRMNESS)}")
    accs = {a["id"] for a in p["accounts"]}
    for a in p["accounts"]:
        if not isinstance(a.get("opening_balance_cents"), int):
            errors.append(f"account {a.get('id')}: opening_balance_cents must be integer cents")
    for b in p.get("bills", []):
        if not isinstance(b.get("amount_cents"), int) or b["amount_cents"] <= 0:
            errors.append(f"bill {b.get('id')}: amount_cents is the price, a positive integer")
        if b.get("account", next(iter(accs))) not in accs:
            errors.append(f"bill {b.get('id')}: account {b.get('account')!r} does not exist")
    for h in p.get("spending", []):
        if h.get("routine") and h["routine"] not in {r["id"] for r in p["routines"]}:
            errors.append(f"spending {h.get('id')}: routine {h['routine']!r} does not exist")
    for m in p.get("memories", []):
        if "told_at" not in m or "content" not in m:
            errors.append(f"memory {m.get('id')}: needs content and told_at")


def check_expected(sc, now, end, ids, errors):
    """The focused format's expected-output fields, as used in a scenario."""
    notices = sc["dev_must_notice"]
    if sc["stay_quiet"] is not True and sc["stay_quiet"] is not False:
        errors.append("stay_quiet must be true or false")
    if not sc["stay_quiet"] and not notices:
        errors.append("dev_must_notice is empty but stay_quiet is false")
    nids = set()
    for i, n in enumerate(notices):
        where = f"dev_must_notice[{i}]"
        if n.get("id"):
            nids.add(n["id"])
        if n.get("check") not in CHECKS:
            errors.append(f"{where}: unknown check {n.get('check')!r}")
        if not n.get("what"):
            errors.append(f"{where}: missing what")
        bw = when(n.get("by_when"), f"{where}.by_when", errors)
        if bw and now and bw < now:
            errors.append(f"{where}: by_when is before now")
        if not n.get("facts"):
            errors.append(f"{where}: name the facts that collide")
        for ref in n.get("facts", []):
            if ref not in ids:
                errors.append(f"{where}: fact {ref!r} does not exist in the generated data")
    fixes = sc["best_fix"] if isinstance(sc["best_fix"], list) else [sc["best_fix"]]
    for i, bf in enumerate(fixes):
        where = f"best_fix[{i}]" if isinstance(sc["best_fix"], list) else "best_fix"
        if bf.get("action") not in ACTIONS:
            errors.append(f"{where}.action unknown: {bf.get('action')!r}")
        for f in ("what", "why"):
            if not bf.get(f):
                errors.append(f"{where}: missing {f}")
        if bf.get("for") and bf["for"] not in nids:
            errors.append(f"{where}.for: no dev_must_notice has id {bf['for']!r}")
        if bf.get("send_at"):
            sa = when(bf["send_at"], f"{where}.send_at", errors)
            if sa and now and sa < now:
                errors.append(f"{where}: send_at is before now")
        if sc["stay_quiet"] and bf.get("action") not in ("none", "just so you know") and notices:
            errors.append("stay_quiet case must have best_fix.action none or just so you know")
    if not isinstance(sc["must_not"], list) or not all(isinstance(x, str) and x for x in sc["must_not"]):
        errors.append("must_not must be a list of sentences")
    return [p for bf in fixes for p in bf.get("placements", [])]


def check_routine_fit(sc, persona, placements, segs, health, now, ids, errors):
    routines = {r["id"]: r for r in persona["routines"]}
    rf = sc.get("routine_fit") or {}
    entries = {e.get("placement"): e for e in rf.get("placements", [])}
    pids = set()
    for p in placements:
        pid = p.get("id")
        where = f"placement {pid}"
        if not pid or pid in pids:
            errors.append(f"{where}: placements need a unique id")
        pids.add(pid)
        s, e = when(p.get("start"), f"{where}.start", errors), when(p.get("end"), f"{where}.end", errors)
        if not s or not e:
            continue
        if e <= s:
            errors.append(f"{where}: end is not after start")
        if s < now:
            errors.append(f"{where}: starts before now")
        fit = entries.get(pid)
        if not fit:
            errors.append(f"{where}: carries a time, so routine_fit.placements must say which routine window it uses (or why it leaves one)")
            continue
        reason = (fit.get("reason") or "").strip()
        if fit.get("fits") is False:
            if not reason or "\n" in reason or len(reason) > 140:
                errors.append(f"{where}: breaks a routine, so it needs a one-line reason the person would accept")
        rid = fit.get("routine")
        if rid is None:
            same = [r["id"] for r in persona["routines"] if r["activity"] == p.get("activity")]
            if same:
                errors.append(f"{where}: {p.get('activity')!r} has a routine ({', '.join(same)}); name it in routine_fit")
        elif rid not in routines:
            errors.append(f"{where}: routine {rid!r} is not in the persona")
        elif fit.get("fits") is True:
            r = routines[rid]
            w = next((x for x in r["windows"] if x.get("id") == fit.get("window")), None)
            if not w:
                errors.append(f"{where}: routine {rid} has no window {fit.get('window')!r}")
            else:
                ws, we = span(s.date(), w)
                if DAYS[s.weekday()] not in w.get("days", DAYS) or not (ws <= s and e <= we):
                    errors.append(f"{where}: {p['start']} to {p['end']} is outside {rid} window {w['id']} ({'/'.join(w.get('days', []))} {w['start']} to {w['end']}); move it or give a reason")
                if r.get("not_after"):
                    h, m = (int(x) for x in r["not_after"].split(":"))
                    if (e.hour, e.minute) > (h, m) and e.date() == s.date():
                        errors.append(f"{where}: ends after {rid}'s not_after {r['not_after']}")
        breaks_ok = fit.get("fits") is False and reason
        for sg in segs:
            if sg["state"] in HARD_STATES and local_dt(sg["start"]) < e and local_dt(sg["end"]) > s and not breaks_ok:
                errors.append(f"{where}: collides with {sg['state']} ({sg['label']}, {sg['id']}) on the timeline")
                break
        for r in persona["routines"]:
            if r["activity"] != "keep free" or breaks_ok:
                continue
            for w in r["windows"]:
                ws, we = span(s.date(), w)
                if DAYS[s.weekday()] in w["days"] and ws < e and we > s:
                    errors.append(f"{where}: lands in {r['id']} ({r['label']}); give a reason or move it")
        if p.get("activity") == "workout" and not breaks_ok:
            done = [w for w in health["workouts"] if w["start"][:10] == p["start"][:10] and local_dt(w["start"]) < s]
            if done:
                errors.append(f"{where}: suggests a workout on a day one is already done ({done[0]['id']})")
    for pid in entries:
        if pid not in pids:
            errors.append(f"routine_fit.placements: {pid!r} is not a placement in best_fix")
    must = [m.lower() for m in sc["must_not"]]
    for i, t in enumerate(rf.get("tempting", [])):
        where = f"routine_fit.tempting[{i}]"
        for f in ("suggestion", "routine", "why_wrong"):
            if not t.get(f):
                errors.append(f"{where}: missing {f}")
        if t.get("routine") and t["routine"] not in routines:
            errors.append(f"{where}: routine {t['routine']!r} is not in the persona")
        if t.get("suggestion") and not any(t["suggestion"].lower() in m for m in must):
            errors.append(f"{where}: the tempting suggestion must also be in must_not")
        for ref in t.get("facts", []):
            if ref not in ids:
                errors.append(f"{where}: fact {ref!r} does not exist in the generated data")
    return bool(rf.get("placements") or rf.get("tempting"))


def check_bank(bank, now, errors):
    accts = {a["id"]: a for a in bank["accounts"]}
    for a in bank["accounts"]:
        shape(a, "account", f"bank account {a.get('id')}", errors)
    bal = {k: a["opening_balance_cents"] for k, a in accts.items()}
    pending_out = defaultdict(int)
    last_date = {}
    for t in bank["transactions"]:
        where = f"transaction {t.get('id')}"
        shape(t, "transaction", where, errors)
        if errors and len(errors) > 40:
            return
        a = accts.get(t["account_id"])
        if not a:
            errors.append(f"{where}: account {t['account_id']!r} does not exist")
            continue
        if t["kind"] not in TXN_KINDS:
            errors.append(f"{where}: unknown kind {t['kind']!r}")
        d = date.fromisoformat(t["date"])
        if t["pending"]:
            auth = date.fromisoformat(t["authorized_date"] or t["date"])
            if auth > now.date() or (now.date() - auth).days > 6:
                errors.append(f"{where}: pending, but authorized {auth}, not within 6 days before now")
            if t["balance_after_cents"] is not None:
                errors.append(f"{where}: a pending transaction has no running balance")
            if t["amount_cents"] < 0:
                pending_out[t["account_id"]] += t["amount_cents"]
            continue
        if d > now.date():
            errors.append(f"{where}: posted on {d}, after now")
        if t["authorized_date"] and date.fromisoformat(t["authorized_date"]) > d:
            errors.append(f"{where}: authorized after it posted")
        if last_date.get(t["account_id"]) and d < last_date[t["account_id"]]:
            errors.append(f"{where}: posted transactions must be listed in date order")
        last_date[t["account_id"]] = d
        bal[t["account_id"]] += -t["amount_cents"] if a["type"] == "credit" else t["amount_cents"]
        if t["balance_after_cents"] != bal[t["account_id"]]:
            errors.append(f"{where}: running balance {t['balance_after_cents']} but opening plus posted transactions give {bal[t['account_id']]}")
            return
    for k, a in accts.items():
        if a["current_balance_cents"] != bal[k]:
            errors.append(f"account {k}: current balance {a['current_balance_cents']} does not equal opening plus posted transactions ({bal[k]})")
        if a["type"] == "credit":
            avail = (a["credit_limit_cents"] or 0) - bal[k] + pending_out[k]
        else:
            avail = bal[k] + pending_out[k]
        if a["available_balance_cents"] != avail:
            errors.append(f"account {k}: available {a['available_balance_cents']} is not current plus pending charges ({avail})")
    for r in bank["recurring"]:
        shape(r, "recurring", f"recurring {r.get('id')}", errors)


def check_pay(work, bank, persona, scenario, errors):
    jobs = {j["id"]: j for j in persona.get("work", {}).get("jobs", [])}
    incs = {i["job"]: i for i in persona.get("income", []) if i["type"] == "hourly"}
    shifts = {s["id"]: s for s in work["shifts"]}
    txns = {t["id"]: t for t in bank["transactions"]}
    late = {(c["income"], c["pay_date"]): c for c in scenario.get("changes", []) if c["type"] == "late_paycheck"}
    for s in work["shifts"]:
        shape(s, "shift", f"shift {s.get('id')}", errors)
    for p in work["paychecks"]:
        shape(p, "paycheck", f"paycheck {p.get('id')}", errors)
    if errors:
        return
    for jid, job in jobs.items():
        inc = incs.get(jid)
        if not inc:
            continue
        ws = DAYS.index(job.get("workweek_starts", "Sun"))
        thr = Fraction(str(job.get("overtime_threshold_hours", 40))) * 60
        mult = Fraction(str(job.get("overtime_multiplier", 1.5)))
        worked = sorted((s for s in work["shifts"] if s["employer_id"] == jid and s["status"] == "worked"), key=lambda s: aware(s["recorded_start"]))
        cum, split = defaultdict(int), {}
        for s in worked:
            m = round((aware(s["recorded_end"]) - aware(s["recorded_start"])).total_seconds() / 60) - (0 if s["break_paid"] else s["break_minutes"])
            d = local_dt(s["starts_at"]).date()
            wk = d - timedelta(days=(d.weekday() - ws) % 7)
            reg = int(max(0, min(m, thr - cum[wk])))
            split[s["id"]] = (reg, m - reg)
            cum[wk] += m
        for p in (x for x in work["paychecks"] if x["employer_id"] == jid):
            where = f"paycheck {p['id']}"
            ps, pe = date.fromisoformat(p["period_start"]), date.fromisoformat(p["period_end"])
            reg = ot = 0
            for sid in p["shift_ids"]:
                s = shifts.get(sid)
                if not s or s["status"] != "worked":
                    errors.append(f"{where}: shift {sid} is not a worked shift")
                    continue
                if not ps <= local_dt(s["starts_at"]).date() <= pe:
                    errors.append(f"{where}: shift {sid} is outside the pay period")
                reg, ot = reg + split[sid][0], ot + split[sid][1]
            in_period = {s["id"] for s in worked if ps <= local_dt(s["starts_at"]).date() <= pe}
            if in_period != set(p["shift_ids"]):
                errors.append(f"{where}: does not cover exactly the worked shifts in its period")
            gross = round_half_up(Fraction(reg * inc["rate_cents"], 60) + Fraction(ot * inc["rate_cents"], 60) * mult)
            net = round_half_up(gross * (1 - Fraction(str(inc["tax_share"]))))
            if abs(gross - p["gross_cents"]) > 2 or abs(net - p["net_cents"]) > 2:
                errors.append(f"{where}: hours times rate gives gross {gross} and net {net}, not {p['gross_cents']} and {p['net_cents']}")
            if abs(round((reg + ot) / 60, 2) - p["hours"]) > 0.011:
                errors.append(f"{where}: hours {p['hours']} do not match the shifts ({round((reg + ot) / 60, 2)})")
            sched = prev_business(pe + timedelta(days=inc.get("days_after_period_end", 5)))
            if p["scheduled_pay_date"] != sched.isoformat():
                errors.append(f"{where}: payday should be {sched} ({inc.get('days_after_period_end', 5)} days after the period, moved to a business day)")
            if p["pay_date"] != p["scheduled_pay_date"] and (inc["id"], p["scheduled_pay_date"]) not in late:
                errors.append(f"{where}: landed {p['pay_date']}, not on payday, and no late_paycheck change explains it")
            t = txns.get(p["transaction_id"])
            if not t or t["amount_cents"] != p["net_cents"] or t["date"] != p["pay_date"] or t["pending"]:
                errors.append(f"{where}: no posted deposit of {p['net_cents']} on {p['pay_date']} ({p['transaction_id']})")


def check_timeline(tl, now, refs_ok, errors):
    segs = tl["segments"]
    if not segs:
        errors.append("timeline.json: no stretches")
        return
    if segs[0]["start"] != tl["start"] or segs[-1]["end"] != tl["end"]:
        errors.append("timeline.json: stretches must run from start to end")
    seen = set()
    prev = None
    for sg in segs:
        where = f"timeline {sg.get('id')}"
        shape(sg, "segment", where, errors)
        if sg["id"] in seen:
            errors.append(f"{where}: duplicate id")
        seen.add(sg["id"])
        s, e = when(sg["start"], f"{where}.start", errors), when(sg["end"], f"{where}.end", errors)
        if not s or not e:
            continue
        if e <= s:
            errors.append(f"{where}: end is not after start")
        if prev is not None and sg["start"] != prev:
            errors.append(f"{where}: {'gap' if sg['start'] > prev else 'overlap'} before it ({prev} to {sg['start']})")
        prev = sg["end"]
        if sg["state"] not in STATES:
            errors.append(f"{where}: unknown state {sg['state']!r}")
        if sg["weekday"] != DAYS[s.weekday()]:
            errors.append(f"{where}: weekday {sg['weekday']} but {sg['start'][:10]} is a {FULL_DAYS[s.weekday()]}")
        named = [i for i, d in enumerate(FULL_DAYS) if re.search(rf"\b{d}\b", sg["label"])]
        if named and not set(named) & {s.weekday(), (e - timedelta(minutes=1)).weekday()}:
            errors.append(f"{where}: label says {FULL_DAYS[named[0]]} but the stretch is on {FULL_DAYS[s.weekday()]}")
        if sg["expected"] != (s >= now):
            errors.append(f"{where}: expected must be true exactly for stretches that start at or after now")
        for r in sg["sources"]:
            if r != "derived" and not refs_ok(r):
                errors.append(f"{where}: source {r!r} does not exist")
        if len(errors) > 60:
            return


def check_dates(conns, now, errors):
    def lim(s):
        return local_dt(s) <= now

    for m in conns["email"]["messages"]:
        shape(m, "email", f"email {m.get('id')}", errors)
        if not lim(m["received_at"]):
            errors.append(f"email {m['id']}: received after now")
    for s in conns["health"]["sleep_sessions"]:
        shape(s, "sleep", f"sleep {s.get('id')}", errors)
        if not lim(s["end"]):
            errors.append(f"sleep {s['id']}: ends after now")
    for w in conns["health"]["workouts"]:
        shape(w, "workout", f"workout {w.get('id')}", errors)
        if not lim(w["end"]):
            errors.append(f"workout {w['id']}: ends after now")
    for d in conns["health"]["daily"]:
        shape(d, "daily", f"health {d.get('id')}", errors)
        if d["day"] > now.date().isoformat():
            errors.append(f"health {d['id']}: a day after now")
    for m in conns["memories"]["memories"]:
        shape(m, "memory", f"memory {m.get('id')}", errors)
        if not lim(m["created_at"]):
            errors.append(f"memory {m['id']}: told after now")
    for s in conns["work"]["shifts"]:
        if not lim(s["posted_at"]):
            errors.append(f"shift {s['id']}: shown before its schedule was posted ({s['posted_at']})")
        if s["status"] == "worked" and not lim(s["recorded_end"]):
            errors.append(f"shift {s['id']}: worked, but it ends after now")
    for a in conns["school"].get("announcements", []):
        if not lim(a["posted_at"]):
            errors.append(f"announcement {a['id']}: posted after now")
    for e in conns["calendar"]["events"]:
        shape(e, "event", f"event {e.get('id')}", errors)
        if e.get("created_at") and not lim(e["created_at"]):
            errors.append(f"event {e['id']}: created after now")


def check_volume(conns, persona, sc, now, errors):
    hist = sc.get("history_days", 90)
    d0 = now.date() - timedelta(days=hist)
    txns = [t for t in conns["bank"]["transactions"] if (t["authorized_date"] or t["date"]) >= d0.isoformat()]
    need = 250 if "parent" in persona["kinds"] or "single parent" in persona["kinds"] else 150
    need = round(need * hist / 90)
    if len(txns) < need:
        errors.append(f"volume: {len(txns)} transactions in {hist} days; a real account like this has at least {need}")
    if len(txns) > 1500 * hist / 90:
        errors.append(f"volume: {len(txns)} transactions in {hist} days is more than any real account")
    nights = {d["day"] for d in conns["health"]["daily"] if d["metric"] == "sleep_hours"}
    missing = [d for d in (d0 + timedelta(days=i) for i in range(hist + 1)) if d.isoformat() not in nights]
    if missing:
        errors.append(f"volume: no sleep for {len(missing)} day(s), first {missing[0]}; every night is recorded")
    per_day = Counter(m["received_at"][:10] for m in conns["email"]["messages"])
    days = [d0 + timedelta(days=i) for i in range(hist)]
    avg = sum(per_day[d.isoformat()] for d in days) / max(1, len(days))
    if not 3 <= avg <= 15:
        errors.append(f"volume: {avg:.1f} emails a day; real inboxes get 3 to 15")
    empty = [d for d in days if per_day[d.isoformat()] == 0]
    if len(empty) > hist // 15:
        errors.append(f"volume: {len(empty)} days without any email")
    sch = persona.get("school")
    if sch:
        events = conns["calendar"]["events"]
        term = sch["term"]
        t0, t1 = date.fromisoformat(term["start"]), date.fromisoformat(term["end"])
        off = set()
        for b in term.get("breaks", []):
            d = date.fromisoformat(b["start"])
            while d <= date.fromisoformat(b["end"]):
                off.add(d)
                d += timedelta(days=1)
        off |= {date.fromisoformat(h["date"]) for h in term.get("no_class_days", [])}
        d1 = now.date() + timedelta(days=sc.get("future_days", 60) + 1)
        cancels = {(c["course"], c["date"]) for c in sc.get("changes", []) if c["type"] == "class_cancel" and datetime.fromisoformat(c["announced_at"]) <= now}
        for c in sch["courses"]:
            exam_days = {e.get("date") for e in c.get("exams", []) if e.get("mode", "in_person") == "in_person"}
            exam_days |= {m.get("date") for m in sc.get("changes", []) if m["type"] == "exam_move" and m["course"] == c["code"] and datetime.fromisoformat(m["announced_at"]) <= now}
            want = 0
            d = max(d0, t0)
            while d < min(d1, t1 + timedelta(days=1)):
                if d not in off and d.isoformat() not in exam_days:
                    want += sum(DAYS[d.weekday()] in m["days"] for m in c.get("meetings", [])) - ((c["code"], d.isoformat()) in cancels)
                d += timedelta(days=1)
            got = sum(1 for e in events if e["kind"] == "class" and e["title"].startswith(c["code"] + " "))
            if got != want:
                errors.append(f"volume: {c['code']} has {got} class meetings in the calendar; its schedule gives {want}")
            cadence = 0
            for rule in c.get("assignments", []):
                d = date.fromisoformat(rule["start"])
                while DAYS[d.weekday()] != rule["weekday"]:
                    d += timedelta(days=1)
                while d <= date.fromisoformat(rule["end"]):
                    cadence += d not in off
                    d += timedelta(weeks=rule.get("every_weeks", 1))
            want_items = cadence + len(c.get("items", [])) + len(c.get("exams", []))
            code_id = "course-" + re.sub(r"[^a-z0-9]+", "-", c["code"].lower()).strip("-")
            got_items = sum(1 for a in conns["school"]["assignments"] if a["course_id"] == code_id)
            if got_items < want_items:
                errors.append(f"volume: {c['code']} has {got_items} assignments and exams; the term has {want_items}")


def check_routine_rates(truth, persona, ids, errors):
    routines = {r["id"]: r for r in persona["routines"]}
    for r in truth["routines"]:
        p = routines.get(r["id"])
        if not p:
            errors.append(f"truth.json: routine {r['id']} is not in the persona")
            continue
        firm = {w.get("firmness") for w in p["windows"]}
        if p["activity"] == "keep free" or firm == {"fixed"} or p.get("keep_rate") == 1:
            continue
        c = Counter(e["outcome"] for e in r["log"])
        judged = c["kept"] + c["moved"] + c["skipped"]
        if judged >= 8:
            share = c["kept"] / judged
            if not 0.55 <= share <= 0.97:
                errors.append(f"routine {r['id']}: kept {share:.0%} of the time in the history; a learnable routine with real slippage keeps 55 to 97%")
            if p.get("keep_rate") is not None and abs(share - p["keep_rate"]) > 0.2:
                errors.append(f"routine {r['id']}: kept {share:.0%} but the persona says {p['keep_rate']:.0%}")
            if judged >= 15 and c["kept"] == judged:
                errors.append(f"routine {r['id']}: never moved or skipped in {judged} times; real routines slip")
        for e in r["log"]:
            rec = e.get("record")
            if e["outcome"] in ("kept", "moved") and rec and p.get("records_as") not in ("bank", "none"):
                if rec not in ids and rec.split("@")[0] not in ids:
                    errors.append(f"routine {r['id']}: {e['date']} record {rec} is missing from the connections")
            if e["outcome"] == "kept" and e.get("start") and p["activity"] != "sleep" and p.get("records_as") != "calendar_recurring":
                w = next((x for x in p["windows"] if x.get("id") == e["window"]), None)
                s, en = datetime.fromisoformat(e["start"]), datetime.fromisoformat(e["end"])
                ws, we = span(date.fromisoformat(e["date"]), w) if w else (None, None)
                if not w or not (ws <= s and en <= we):
                    errors.append(f"routine {r['id']}: {e['date']} is logged as kept but sits outside its window")


def collect_ids(conns, tl):
    ids = set()
    files = {}
    for name, data in conns.items():
        fid = set()

        def walk(o):
            if isinstance(o, dict):
                if isinstance(o.get("id"), str):
                    fid.add(o["id"])
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(data)
        files[f"{name}.json"] = fid
        ids |= fid
    files["timeline.json"] = {s["id"] for s in tl["segments"]}
    ids |= files["timeline.json"]
    return ids, files


def check_folder(folder):
    errors = []
    kind = folder.parent.name
    need = ["scenario.json", "persona.json", "timeline.json", "truth.json"] + [f"connections/{n}.json" for n in CONNECTION_FILES]
    missing = [n for n in need if not (folder / n).is_file()]
    if missing:
        return [f"missing {', '.join(missing)}: run python3 docs/situations/simulator/simulate.py {folder / 'scenario.json'}"], None
    try:
        sc = json.loads((folder / "scenario.json").read_text(encoding="utf-8"))
        persona = json.loads((folder / "persona.json").read_text(encoding="utf-8"))
        conns = {n: json.loads((folder / f"connections/{n}.json").read_text(encoding="utf-8")) for n in CONNECTION_FILES}
        tl = json.loads((folder / "timeline.json").read_text(encoding="utf-8"))
        truth = json.loads((folder / "truth.json").read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"invalid JSON: {e}"], None
    check_text(folder, errors)
    for f in ("id", "title", "persona", "now", "seed", "changes", "dev_must_notice", "best_fix", "must_not", "stay_quiet", "tags"):
        if f not in sc:
            errors.append(f"scenario: missing field {f}")
    check_persona(persona, errors)
    if errors:
        return errors, None
    rx = FOLDER_ID_RE.get(kind, FOLDER_ID_RE["cases"])
    if not rx.match(sc["id"]):
        errors.append(f"scenario.id must look like {'e' if kind == 'examples' else 's'}0001-short-slug: {sc['id']!r}")
    if folder.name != sc["id"]:
        errors.append(f"folder name {folder.name} does not match id {sc['id']}")
    if sc["persona"] != persona["id"]:
        errors.append(f"scenario.persona {sc['persona']!r} but persona.json is {persona['id']!r}")
    now = when(sc["now"], "now", errors)
    if not now:
        return errors, None
    cids = [c.get("id") for c in sc["changes"]]
    if len(cids) != len(set(cids)):
        errors.append("scenario.changes: ids must be unique")
    for c in sc["changes"]:
        if c.get("type") not in CHANGE_TYPES:
            errors.append(f"change {c.get('id')}: unknown type {c.get('type')!r}")
    # 1. the connections are exactly what the simulator makes
    try:
        sim = load_simulator()
        files = sim.render(sim.simulate(persona, sc))
        stale = [rel for rel, text in files.items() if (folder / rel).read_text(encoding="utf-8") != text]
        if stale:
            errors.append(f"generated files are stale or edited by hand ({', '.join(stale)}): re-run simulate.py, never edit them")
    except Exception as e:  # noqa: BLE001
        errors.append(f"simulate.py fails on this persona and scenario: {e}")
    # 2. shapes, money, pay, dates, timeline
    check_bank(conns["bank"], now, errors)
    check_pay(conns["work"], conns["bank"], persona, sc, errors)
    check_dates(conns, now, errors)
    ids, by_file = collect_ids(conns, tl)

    def ref_ok(r):
        f, _, rid = r.partition("#")
        return rid in by_file.get(f, ()) or rid.split("@")[0] in by_file.get(f, ())
    check_timeline(tl, now, ref_ok, errors)
    check_volume(conns, persona, sc, now, errors)
    check_routine_rates(truth, persona, ids, errors)
    # 3. what the scenario names exists, and its expected output is sound
    visible_changes = set()
    for cid, info in truth["changes"].items():
        if info["records"]:
            visible_changes.add(cid)
    for c in sc["changes"]:
        if c["type"] not in BEHAVIOUR_ONLY and not c.get("future") and c["id"] not in visible_changes and not truth["changes"].get(c["id"], {}).get("hidden"):
            errors.append(f"change {c['id']}: produced nothing in the generated data")
    named = ids | {c for c in visible_changes if c in ids}
    for c in sc["changes"]:
        if c["type"] in BEHAVIOUR_ONLY and any(c["id"] in n.get("facts", []) for n in sc["dev_must_notice"]):
            errors.append(f"change {c['id']} changes behaviour only, so Dev cannot see it: name the memory or transactions that show it instead")
    placements = check_expected(sc, now, local_dt(tl["end"]), named, errors)
    rf = check_routine_fit(sc, persona, placements, tl["segments"], conns["health"], now, named, errors)
    for i, a in enumerate(sc.get("assumptions", [])):
        if not isinstance(a, str):
            errors.append(f"assumptions[{i}] must be a sentence")
    info = {"id": sc["id"], "kinds": persona["kinds"], "checks": [n["check"] for n in sc["dev_must_notice"]], "stay_quiet": sc["stay_quiet"], "routine_fit": rf}
    return errors, info


# =============================================================== run

def targets(argv):
    if argv:
        return [Path(a).resolve() for a in argv]
    out = []
    for base in (CASES, EXAMPLES):
        if base.exists():
            out += sorted(base.glob("*.json")) + sorted(p for p in base.iterdir() if p.is_dir())
    return out


def main(argv=None):
    paths = targets(sys.argv[1:] if argv is None else argv)
    if not paths:
        print("No cases yet in docs/situations/cases/.")
        return 0
    bad = 0
    kinds, checks, quiet, fit = Counter(), Counter(), 0, 0
    seen = set()
    counted = 0
    examples_ok = examples = 0
    for p in paths:
        if p.is_dir():
            errors, c = check_folder(p)
            info = c
        else:
            errors, c = check_case(p)
            info = c and {"id": c["id"], "kinds": c["life"]["kinds"], "checks": [n["check"] for n in c["dev_must_notice"]], "stay_quiet": c["stay_quiet"], "routine_fit": bool(c.get("routine_fit"))}
        if info and info["id"] in seen:
            errors.append("duplicate id across files")
        is_example = p.parent.name == "examples"
        examples += is_example
        if errors:
            bad += 1
            print(f"FAIL {p.relative_to(ROOT) if ROOT in p.parents else p}")
            for e in errors[:40]:
                print(f"  - {e}")
            if len(errors) > 40:
                print(f"  ... and {len(errors) - 40} more")
            continue
        seen.add(info["id"])
        if is_example:
            examples_ok += 1
            continue
        counted += 1
        kinds.update(info["kinds"])
        checks.update(info["checks"])
        quiet += info["stay_quiet"]
        fit += info["routine_fit"]
    total = len(paths) - examples
    print(f"\n{counted} of {total} cases valid.")
    if examples:
        print(f"{examples_ok} of {examples} worked examples valid.")
    if counted:
        print(f"Stay-quiet share: {quiet}/{counted} ({round(100 * quiet / counted)}%)")
        print(f"Routine-fit share: {fit}/{counted} ({round(100 * fit / counted)}%), target at least 1 in 5")
        print("Kinds:", ", ".join(f"{k} {n}" for k, n in kinds.most_common()))
        print("Checks:", ", ".join(f"{k} {n}" for k, n in checks.most_common()))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
