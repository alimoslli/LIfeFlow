#!/usr/bin/env python3
"""Make the made-up people for the noticing grader.

About 10 people (personas.mix: 70% students, all different) and several world seeds each. A world is the same person
with a different normal life (sim seed) and a different random mix of planted life events. World 0 of every person
is deliberately QUIET: nothing planted. Deterministic by seed. Standard library only.

  python3 gen.py /tmp/grader-people [--people 10] [--start 1] [--worlds 5]

Planting is two-pass: the person's normal life is simulated first, then events are planted ON TOP OF what really
exists in it (a shift on top of a real class, an assignment due the morning after a real late shift, a big charge
just before a real bill). Parameters (days, hours, amounts) are random per world.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

SIM = Path(__file__).resolve().parents[2] / "simulator"
sys.path.insert(0, str(SIM))
import personas  # noqa: E402
import simulate  # noqa: E402

NOW = "2026-11-05T18:00"
NOW_DATE = date(2026, 11, 5)
REPLAY_DAYS = 21
REPLAY_START = NOW_DATE - timedelta(days=REPLAY_DAYS - 1)
HISTORY_DAYS = 120


def parse(ts: str, tz: ZoneInfo) -> datetime:
    """Any simulator timestamp to a naive local datetime."""
    d = datetime.fromisoformat(ts)
    return d.astimezone(tz).replace(tzinfo=None) if d.tzinfo else d


def hm(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M")


def r15(d: datetime) -> datetime:
    return d.replace(minute=(d.minute // 15) * 15, second=0, microsecond=0)


class World:
    def __init__(self, persona, wseed, tz):
        self.p, self.rng, self.tz = persona, random.Random(f"notice-{persona['id']}-{wseed}"), tz
        self.changes: list[dict] = []
        self.meta: list[dict] = []
        self.n = 0

    def cid(self, tag):
        self.n += 1
        return f"x{self.n}-{tag}"


def base_facts(r0, tz):
    c = r0["connections"]
    shifts = [dict(s, S=parse(s["starts_at"], tz), E=parse(s["ends_at"], tz), P=parse(s["posted_at"], tz) if s.get("posted_at") else None)
              for s in c["work"]["shifts"] if s["status"] != "cancelled"]
    classes = [dict(e, S=parse(e["starts_at"], tz), E=parse(e["ends_at"], tz)) for e in c["calendar"]["events"] if e["kind"] == "class" and not e["all_day"]]
    asg = [dict(a, D=parse(a["due_at"], tz)) for a in c["school"]["assignments"] if a.get("due_at")]
    return shifts, classes, asg


def posted_before(rng, x: datetime, lo_days=1, hi_days=6) -> datetime:
    """A 'known since' time at least a day before x, inside the replay window, never after now."""
    latest = min(x - timedelta(days=1), datetime(2026, 11, 5, 12, 0))
    earliest = datetime.combine(REPLAY_START, datetime.min.time()) + timedelta(hours=8)
    p = x - timedelta(days=rng.randint(lo_days, hi_days), hours=rng.randint(0, 6))
    p = max(earliest, min(p, latest))
    return r15(p.replace(hour=rng.choice([8, 9, 10, 15, 17, 19]), minute=0))


def free_of_shift(shifts, s, e):
    return not any(x["S"] < e and s < x["E"] for x in shifts)


# --------------------------------------------------------------------------- plants. Each returns True when it planted something.

def plant_shift_on_class(w: World, r0, shifts, classes, asg):
    jobs = r0["connections"]["work"]["employers"]
    cands = [c for c in classes if datetime(2026, 10, 20) <= c["S"] <= datetime(2026, 11, 6, 23, 59)]
    if not jobs or not cands:
        return False
    c = w.rng.choice(cands)
    s = r15(c["S"] + timedelta(minutes=w.rng.randint(-150, 45)))
    e = s + timedelta(hours=w.rng.randint(4, 8))
    cid = w.cid("shift-on-class")
    w.changes.append({"id": cid, "type": "shift_add", "job": jobs[0]["id"], "start": hm(s), "end": hm(e), "break_minutes": 30, "posted_at": hm(posted_before(w.rng, s))})
    w.meta.append({"id": cid, "type": "shift_on_class", "with": c["id"]})
    return True


def plant_event_on_shift(w: World, r0, shifts, classes, asg):
    cands = [s for s in shifts if datetime(2026, 10, 20) <= s["S"] <= datetime(2026, 11, 6, 23, 59) and (s["P"] is None or s["P"] <= datetime(2026, 11, 4))]
    if not cands:
        return False
    s = w.rng.choice(cands)
    st = r15(s["S"] + timedelta(minutes=w.rng.randint(-60, 180)))
    en = st + timedelta(minutes=w.rng.choice([45, 60, 90, 120]))
    cid = w.cid("event-on-shift")
    title = w.rng.choice(["Dentist appointment", "Advising meeting", "Family dinner", "Car service", "Doctor visit", "Study group"])
    w.changes.append({"id": cid, "type": "calendar_event", "title": title, "start": hm(st), "end": hm(en), "state": "appointment", "source": "google", "created_at": hm(posted_before(w.rng, st))})
    w.meta.append({"id": cid, "type": "event_on_shift", "with": s["id"]})
    return True


def plant_event_on_class(w: World, r0, shifts, classes, asg):
    cands = [c for c in classes if datetime(2026, 10, 20) <= c["S"] <= datetime(2026, 11, 6, 23, 59)]
    if not cands:
        return False
    c = w.rng.choice(cands)
    st = r15(c["S"] + timedelta(minutes=w.rng.randint(-45, 40)))
    en = st + timedelta(minutes=w.rng.choice([60, 90, 120]))
    cid = w.cid("event-on-class")
    title = w.rng.choice(["Dentist appointment", "Advising meeting", "Interview", "Doctor visit", "Pick up cousin"])
    w.changes.append({"id": cid, "type": "calendar_event", "title": title, "start": hm(st), "end": hm(en), "state": "appointment", "source": "google", "created_at": hm(posted_before(w.rng, st))})
    w.meta.append({"id": cid, "type": "event_on_class", "with": c["id"]})
    return True


def plant_exam_move_on_shift(w: World, r0, shifts, classes, asg):
    exams = [a for a in r0["connections"]["school"]["assignments"] if a["kind"] == "exam" and a.get("starts_at")]
    cands = [s for s in shifts if datetime(2026, 10, 22) <= s["S"] <= datetime(2026, 11, 6, 23, 59) and (s["P"] is None or s["P"] <= datetime(2026, 11, 4))]
    if not exams or not cands:
        return False
    ex, s = w.rng.choice(exams), w.rng.choice(cands)
    course = next(c for c in r0["connections"]["school"]["courses"] if c["id"] == ex["course_id"])
    st = r15(s["S"] + timedelta(minutes=w.rng.randint(-60, 120)))
    en = st + timedelta(minutes=w.rng.choice([90, 120]))
    cid = w.cid("exam-moved")
    ann = posted_before(w.rng, st, 1, 4)
    w.changes.append({"id": cid, "type": "exam_move", "course": course["code"], "exam": ex["title"], "date": st.strftime("%Y-%m-%d"), "start": st.strftime("%H:%M"), "end": en.strftime("%H:%M"),
                      "announced_at": hm(ann), "title": f"{ex['title']} date changed", "announcement": "The exam has been moved. Please check the new time."})
    w.meta.append({"id": cid, "type": "exam_move", "with": s["id"], "exam_id": ex["id"], "announced_at": hm(ann), "orig_start": ex["starts_at"], "orig_end": ex["ends_at"], "orig_due": ex["due_at"]})
    return True


def plant_deadline_after_late_shift(w: World, r0, shifts, classes, asg):
    """An assignment due the morning after a REAL long or late shift (the assignment is the planted part)."""
    courses = r0["connections"]["school"]["courses"]
    cands = [s for s in shifts if datetime(2026, 10, 20) <= s["S"] <= datetime(2026, 11, 5, 23, 59) and ((s["E"] - s["S"]).total_seconds() >= 7 * 3600 or s["E"].hour >= 21 or s["E"].date() > s["S"].date())]
    if not courses or not cands:
        return False
    s = w.rng.choice(cands)
    due = datetime.combine(s["S"].date() + timedelta(days=1), datetime.min.time()) + timedelta(hours=w.rng.choice([8, 9, 10, 12, 14, 23]), minutes=w.rng.choice([0, 30, 59]))
    added = posted_before(w.rng, s["S"], 2, 9)
    cid = w.cid("deadline-after-shift")
    course = w.rng.choice(courses)
    w.changes.append({"id": cid, "type": "assignment_add", "course": course["code"], "title": w.rng.choice(["Case study", "Lab report", "Research paper draft", "Problem set", "Project milestone"]),
                      "kind": w.rng.choice(["assignment", "project"]), "due": hm(due), "points": w.rng.choice([30, 50, 75, 100]), "added_at": hm(added)})
    w.meta.append({"id": cid, "type": "deadline_after_shift", "with": s["id"], "added_at": hm(added)})
    return True


def plant_late_shift_before_deadline(w: World, r0, shifts, classes, asg):
    """A long or late shift added the day before a REAL deadline (the shift is the planted part)."""
    jobs = r0["connections"]["work"]["employers"]
    cands = [a for a in asg if a["kind"] in ("assignment", "project", "exam", "quiz") and datetime(2026, 10, 21) <= a["D"] <= datetime(2026, 11, 6, 23, 59)]
    if not jobs or not cands:
        return False
    a = w.rng.choice(cands)
    day = a["D"].date() - timedelta(days=1)
    st = datetime.combine(day, datetime.min.time()) + timedelta(hours=w.rng.choice([8, 12, 14, 16]))
    en = st + timedelta(hours=w.rng.choice([8, 9, 8]))
    if not free_of_shift(shifts, st, en):
        return False
    cid = w.cid("late-shift-before-deadline")
    w.changes.append({"id": cid, "type": "shift_add", "job": jobs[0]["id"], "start": hm(st), "end": hm(en), "break_minutes": 30, "posted_at": hm(posted_before(w.rng, st, 1, 4))})
    w.meta.append({"id": cid, "type": "late_shift_before_deadline", "with": a["id"]})
    return True


def balance_before(r0, day: date):
    """Checking balance at the end of the day before `day` (data only)."""
    b = r0["connections"]["bank"]
    acc = next(a for a in b["accounts"] if a["id"] == "acc-checking")
    bal = acc["opening_balance_cents"]
    for t in b["transactions"]:
        if t["account_id"] == "acc-checking" and date.fromisoformat(t["authorized_date"] or t["date"]) < day:
            bal += t["amount_cents"]
    return bal


def plant_bill_squeeze(w: World, r0, shifts, classes, asg):
    """A big one-off bill (repair, fees) a few days before a REAL bill, leaving less than the bill."""
    b = r0["connections"]["bank"]
    income = [date.fromisoformat(t["date"]) for t in b["transactions"] if t["amount_cents"] > 0 and t["kind"] == "income"]
    bills = []
    for r in r0["truth"]["recurring"]:
        if r["frequency"] != "monthly":
            continue
        for tid in r["charges"]:
            t = next((x for x in b["transactions"] if x["id"] == tid), None)
            if t and t["account_id"] == "acc-checking" and abs(t["amount_cents"]) >= 4000 and date(2026, 10, 21) <= date.fromisoformat(t["authorized_date"] or t["date"]) <= date(2026, 11, 4):
                bills.append(t)
    w.rng.shuffle(bills)
    for t in bills:
        X = date.fromisoformat(t["authorized_date"] or t["date"])
        P = X - timedelta(days=w.rng.randint(2, 5))
        if P < REPLAY_START or any(P < d <= X for d in income):
            continue
        B = abs(t["amount_cents"])
        bal = balance_before(r0, P)
        spend = bal - int(B * w.rng.uniform(0.15, 0.8))
        if spend < 5000 or bal < 0:
            continue
        cid = w.cid("bill-squeeze")
        what = w.rng.choice([("REGIONAL AUTO REPAIR", "Regional Auto Repair"), ("CAMPUS BURSAR FEES", None), ("URGENT CARE COPAY", None), ("APARTMENT DAMAGE DEPOSIT", None)])
        w.changes.append({"id": cid, "type": "purchase", "at": f"{P.isoformat()}T{w.rng.randint(9, 17):02d}:{w.rng.randint(0, 59):02d}", "account": "acc-checking",
                          "description": what[0], "merchant_name": what[1], "amount_cents": -spend, "pfc": "GENERAL_SERVICES_AUTOMOTIVE" if "AUTO" in what[0] else "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"})
        w.meta.append({"id": cid, "type": "bill_squeeze", "bill_tx": t["id"]})
        return True
    return False


def plant_price_rise(w: World, r0, shifts, classes, asg):
    subs = {b["id"]: b for b in w.p["bills"] if b["kind"] == "subscription"}
    b = r0["connections"]["bank"]
    cands = []
    for r in r0["truth"]["recurring"]:
        if r["bill"] in subs and r["frequency"] == "monthly" and not r["price_changes"]:
            for tid in r["charges"]:
                t = next((x for x in b["transactions"] if x["id"] == tid), None)
                if t and date(2026, 10, 17) <= date.fromisoformat(t["authorized_date"] or t["date"]) <= date(2026, 11, 3):
                    cands.append((subs[r["bill"]], t))
    if not cands:
        return False
    bill, t = w.rng.choice(cands)
    cid = w.cid("price-rise")
    new = bill["amount_cents"] + w.rng.choice([d for d in (100, 200, 300, 500, 800, 1000) if d <= bill["amount_cents"] * 0.6] or [100])  # a realistic rise: up to +60%
    w.changes.append({"id": cid, "type": "price_change", "bill": bill["id"], "from": t["authorized_date"] or t["date"], "amount_cents": new})
    w.meta.append({"id": cid, "type": "price_rise", "bill": bill["id"]})
    return True


def plant_duplicate_sub(w: World, r0, shifts, classes, asg):
    have = {b["id"] for b in w.p["bills"]}
    video = [("hulu", "Hulu", "HULU 877-555-0142", "Hulu", 999), ("disney", "Disney+", "DISNEY PLUS 888-905-7888", "Disney+", 1399), ("max", "Max", "MAX.COM HBO", "Max", 1599), ("netflix", "Netflix", "NETFLIX.COM", "Netflix", 1549)]
    music = [("spotify", "Spotify", "Spotify USA", "Spotify", 1099), ("applemusic", "Apple Music", "APPLE.COM/BILL MUSIC", "Apple Music", 1099), ("tidal", "Tidal", "TIDAL.COM", "Tidal", 1099)]
    for fam in w.rng.sample([video, music], 2):
        owned = [x for x in fam if x[0] in have]
        free = [x for x in fam if x[0] not in have]
        if owned and free:
            sid, name, desc, merch, cents = w.rng.choice(free)
            cid = w.cid("dup-sub")
            w.changes.append({"id": cid, "type": "bill_add", "name": name, "description": desc, "merchant_name": merch, "pfc": "ENTERTAINMENT_TV_AND_MOVIES" if fam is video else "ENTERTAINMENT_MUSIC_AND_AUDIO",
                              "amount_cents": cents, "via": "card", "account": "acc-checking", "kind": "subscription", "day": w.rng.randint(1, 27), "from": "2026-09-01", "frequency": "monthly"})
            w.meta.append({"id": cid, "type": "dup_sub", "name": name})
            return True
    return False


def plant_unusual_charge(w: World, r0, shifts, classes, asg):
    """A charge several times what this person usually pays that merchant (the merchant is a real habit)."""
    b = r0["connections"]["bank"]
    by: dict[str, list] = {}
    for t in b["transactions"]:
        if t["kind"] == "expense" and t["amount_cents"] < 0 and t["account_id"] == "acc-checking":
            by.setdefault(t["description"], []).append(t)
    habits = [(d, ts) for d, ts in by.items() if len(ts) >= 6 and not any(r["bill"] for r in [] )]
    recurring_desc = {t["description"] for r in r0["truth"]["recurring"] for tid in r["charges"] for t in b["transactions"] if t["id"] == tid}
    habits = [(d, ts) for d, ts in habits if d not in recurring_desc]
    if not habits:
        return False
    d, ts = w.rng.choice(habits)
    amts = sorted(abs(t["amount_cents"]) for t in ts)
    med = amts[len(amts) // 2]
    amount = int(max(med * w.rng.uniform(3.5, 9), 7500))
    day = REPLAY_START + timedelta(days=w.rng.randint(4, 19))
    cid = w.cid("unusual")
    w.changes.append({"id": cid, "type": "purchase", "at": f"{day.isoformat()}T{w.rng.randint(9, 20):02d}:{w.rng.randint(0, 59):02d}", "account": "acc-checking", "description": d,
                      "merchant_name": ts[0]["merchant_name"], "amount_cents": -amount, "pfc": (ts[0].get("personal_finance_category") or {}).get("detailed")})
    w.meta.append({"id": cid, "type": "unusual", "usual_cents": med})
    return True


def plant_big_oneoff(w: World, r0, shifts, classes, asg):
    """A large charge at a merchant the person has never used."""
    day = REPLAY_START + timedelta(days=w.rng.randint(4, 19))
    cid = w.cid("oneoff")
    what = w.rng.choice([("BEST BUY 00001", "Best Buy", "GENERAL_MERCHANDISE_ELECTRONICS", (25000, 90000)), ("DELTA AIR LINES", "Delta", "TRAVEL_FLIGHTS", (30000, 70000)),
                         ("URGENT CARE VISIT", None, "MEDICAL_PRIMARY_CARE", (20000, 60000)), ("UNIVERSITY BOOKSTORE", None, "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", (20000, 45000))])
    w.changes.append({"id": cid, "type": "purchase", "at": f"{day.isoformat()}T{w.rng.randint(9, 20):02d}:{w.rng.randint(0, 59):02d}", "account": "acc-checking", "description": what[0], "merchant_name": what[1],
                      "amount_cents": -w.rng.randint(*what[3]), "pfc": what[2]})
    w.meta.append({"id": cid, "type": "oneoff"})
    return True


MENU = [
    (plant_shift_on_class, 3), (plant_event_on_shift, 2), (plant_event_on_class, 2), (plant_exam_move_on_shift, 1),
    (plant_deadline_after_late_shift, 3), (plant_late_shift_before_deadline, 2),
    (plant_bill_squeeze, 3), (plant_price_rise, 2), (plant_duplicate_sub, 1), (plant_unusual_charge, 2), (plant_big_oneoff, 1),
]


def build_world(persona, wseed, quiet, money=None):
    tz = ZoneInfo(persona["time_zone"])
    sc = {"id": f"s9{wseed:05d}", "persona": persona["id"], "now": NOW, "seed": wseed, "changes": [], "history_days": HISTORY_DAYS}
    r0 = simulate.simulate(persona, sc)
    w = World(persona, wseed, tz)
    if not quiet:
        shifts, classes, asg = base_facts(r0, tz)
        pool = [f for f, wt in MENU for _ in range(wt)]
        want = w.rng.randint(3, 5)
        tried = 0
        planted = set()
        while len(planted) < want and tried < 40:
            tried += 1
            f = w.rng.choice(pool)
            if f.__name__ in planted:
                continue
            if f(w, r0, shifts, classes, asg):
                planted.add(f.__name__)
    sc["changes"] = w.changes
    r = simulate.simulate(persona, dict(sc, id=sc["id"] + "p")) if w.changes else r0
    return r, w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--people", type=int, default=10)
    ap.add_argument("--start", type=int, default=18)
    ap.add_argument("--worlds", type=int, default=5)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    made, kinds = 0, []
    for pseed, kind in personas.mix(a.people, a.start):
        persona = personas.make_persona(pseed, kind)
        for k in range(a.worlds):
            wseed = pseed * 100 + k
            try:
                r, w = build_world(persona, wseed, quiet=(k == 0))
            except simulate.SimError as e:
                print("SKIP", pseed, k, str(e)[:80])
                continue
            d = out / f"p{pseed:02d}w{k}"
            (d / "connections").mkdir(parents=True, exist_ok=True)
            for name, val in r["connections"].items():
                (d / "connections" / f"{name}.json").write_text(json.dumps(val))
            (d / "truth.json").write_text(json.dumps(r["truth"]))
            (d / "timeline.json").write_text(json.dumps(r["timeline"]))
            (d / "plants.json").write_text(json.dumps(w.meta))
            (d / "meta.json").write_text(json.dumps({"person": pseed, "kind": kind, "world": k, "quiet": k == 0, "bills": [{k2: b.get(k2) for k2 in ("id", "name", "kind", "amount_cents", "description", "account")} for b in persona.get("bills", []) + [c for c in w.changes if c["type"] == "bill_add"]], "time_zone": persona["time_zone"], "summary": persona["summary"], "now": NOW,
                                                     "replay_start": REPLAY_START.isoformat(), "changes": w.changes}))
            made += 1
        kinds.append(kind)
        print(f"person {pseed} {kind}: {persona['summary'][:90]}")
    print(f"worlds written: {made}; students {kinds.count('student')}/{len(kinds)}")


if __name__ == "__main__":
    main()
