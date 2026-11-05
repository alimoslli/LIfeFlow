#!/usr/bin/env python3
"""Persona generator for the situation library: varied lives, deterministic by seed.

The owner's rule (2026-11-05): 70% of generated people are students. Students vary on level, number of
classes and credit load, assignments, quizzes, labs or clinicals, midterm and finals weeks, group projects,
online and flexible exams, class format and days, school system, work, money, living situation, student
parents, athletes and first-generation students, and how they study (morning or evening, steady or cramming).
The other 30% are other lives (shift workers, salaried, freelancers, gig workers, single parents with two
jobs, caregivers, retired people).

Run:
  python3 docs/situations/simulator/personas.py --count 10 --start 1            # 7 students, 3 others, printed
  python3 docs/situations/simulator/personas.py --count 10 --start 1 --out docs/situations/personas
  python3 docs/situations/simulator/personas.py --seed 7 --kind student --term spring-2027 --print

Every generated persona simulates cleanly (see test_simulator.py). Read it before using it in a case and
edit the parts that matter for the case; the persona is yours once it is in docs/situations/personas/.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from simulate import DAYS, Seeds, slug  # noqa: E402

STUDENT_SHARE = 0.7

TERMS = {
    "fall-2026": {"name": "Fall 2026", "start": "2026-08-24", "last_class": "2026-12-11", "finals": ["2026-12-14", "2026-12-18"],
                  "breaks": [{"start": "2026-11-25", "end": "2026-11-29", "label": "Thanksgiving break"}], "no_class_days": [{"date": "2026-09-07", "label": "Labor Day"}],
                  "aid": ["2026-09-02", "2026-10-21"], "tuition_due": "2026-08-14", "plan_day": 5, "plan_months": ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]},
    "spring-2027": {"name": "Spring 2027", "start": "2027-01-19", "last_class": "2027-05-07", "finals": ["2027-05-10", "2027-05-14"],
                    "breaks": [{"start": "2027-03-15", "end": "2027-03-21", "label": "Spring break"}], "no_class_days": [{"date": "2027-01-18", "label": "Martin Luther King Jr. Day"}],
                    "aid": ["2027-01-27", "2027-03-24"], "tuition_due": "2027-01-08", "plan_day": 5, "plan_months": ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]},
}
TIME_ZONES = [("America/New_York", 4), ("America/Chicago", 3), ("America/Denver", 1), ("America/Los_Angeles", 3), ("America/Phoenix", 1)]
FIRST = ["Ana", "Jamal", "Priya", "Diego", "Mei", "Tariq", "Grace", "Luis", "Amara", "Noah", "Sofia", "Kwame", "Lena", "Omar", "Hana", "Mateo", "Zara", "Eli", "Ines", "Ravi"]

LEVELS = [("community college", 33), ("university", 40), ("grad", 12), ("adult learner", 15)]
LMS = [("canvas", 50), ("blackboard", 20), ("moodle", 15), ("google_classroom", 15)]
LIVING = {
    "community college": [("with family", 40), ("roommates", 20), ("commuter", 25), ("far from home", 5), ("international", 10)],
    "university": [("dorm", 40), ("roommates", 25), ("with family", 10), ("commuter", 8), ("far from home", 9), ("international", 8)],
    "grad": [("roommates", 55), ("far from home", 20), ("international", 20), ("with family", 5)],
    "adult learner": [("own place", 70), ("with family", 30)],
}
WORK = {
    "community college": [("none", 15), ("campus job", 10), ("part-time", 45), ("nearly full-time", 15), ("gig", 10), ("two jobs", 5)],
    "university": [("none", 30), ("campus job", 30), ("part-time", 25), ("gig", 10), ("two jobs", 5)],
    "grad": [("assistantship", 55), ("none", 15), ("part-time", 20), ("gig", 10)],
    "adult learner": [("nearly full-time", 55), ("part-time", 30), ("two jobs", 15)],
}
STYLES = [("morning", 30), ("afternoon", 20), ("evening", 35), ("late night", 15)]
UNDERGRAD = [("BIO", "Biology I", "lab"), ("CHEM", "General Chemistry I", "lab"), ("MATH", "Calculus I", None), ("STAT", "Statistics", None), ("ENG", "Composition II", "essay"),
             ("HIST", "U.S. History", "essay"), ("PSY", "Introduction to Psychology", None), ("SOC", "Introduction to Sociology", "essay"), ("CS", "Programming I", "project"),
             ("ECON", "Microeconomics", None), ("COMM", "Public Speaking", "project"), ("ART", "Drawing I", "project"), ("PHYS", "Physics I", "lab"), ("SPAN", "Spanish II", None),
             ("NURS", "Nursing Fundamentals", "clinical"), ("BUS", "Introduction to Business", "project"), ("PHIL", "Ethics", "essay"), ("ANTH", "Cultural Anthropology", "essay")]
GRAD = [("EDU", "Research Methods", "essay"), ("PH", "Epidemiology", None), ("CS", "Machine Learning", "project"), ("MBA", "Managerial Finance", "project"),
        ("SW", "Clinical Practice", "clinical"), ("ENGR", "Systems Design", "project"), ("STAT", "Applied Regression", None), ("PSY", "Advanced Statistics", None)]
MWF = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]
TTH = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30"]
FINAL_SLOTS = [("08:00", "10:00"), ("10:30", "12:30"), ("13:00", "15:00"), ("15:30", "17:30"), ("18:00", "20:00")]


def pick(r, items):
    total = sum(w for _, w in items)
    x = r.random() * total
    for v, w in items:
        x -= w
        if x <= 0:
            return v
    return items[-1][0]


def hm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def mm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


class Week:
    """Fixed weekly commitments, so classes, labs, jobs and routines never collide by construction."""

    def __init__(self):
        self.busy = {d: [] for d in DAYS}

    def free(self, day, a, b, pad=15):
        return all(b + pad <= s or a >= e + pad for s, e in self.busy[day])

    def take(self, days, a, b):
        for d in days:
            self.busy[d].append((a, b))

    def free_days(self, days, a, b, pad=15):
        return [d for d in days if self.free(d, a, b, pad)]


def mix(count, start=1):
    """Exactly round(70%) students in any batch, at seeded positions."""
    seeds = list(range(start, start + count))
    n = round(count * STUDENT_SHARE)
    order = sorted(seeds, key=lambda s: Seeds(f"mix-{start}-{count}").r(s).random())
    students = set(order[:n])
    return [(s, "student" if s in students else "other") for s in seeds]


def make_persona(seed, kind=None, term="fall-2026"):
    R = Seeds(f"persona-{seed}").r
    if kind is None:
        kind = "student" if R("mix").random() < STUDENT_SHARE else "other"
    g = Gen(seed, R, TERMS[term])
    return g.student() if kind == "student" else g.other()


class Gen:
    def __init__(self, seed, R, term):
        self.seed, self.R, self.term = seed, R, term
        r = R("basics")
        self.tz = pick(r, TIME_ZONES)
        self.name = r.choice(FIRST)
        self.week = Week()
        self.p = {"places": {"home": "home", "campus": "campus", "work": "work", "gym": "the gym", "out": "town"}, "commute_minutes": {}, "commute_mode": "car",
                  "ready_minutes": 40, "wind_down_minutes": 30, "accounts": [], "income": [], "bills": [], "spending": [], "routines": [], "memories": [],
                  "real_life": {"events": [], "nights_out": None, "trips": []}}
        self.monthly_in = 0
        self.monthly_bills = 0
        self.mem_n = 0
        self.t0 = date.fromisoformat(term["start"])

    # ------------------------------------------------------------ small builders
    def memory(self, content, category="fact", days_after_start=6, via="chat", mid=None):
        self.mem_n += 1
        mid = mid or f"m-{self.mem_n:02d}"
        told = self.t0 + timedelta(days=days_after_start) - timedelta(days=30)
        self.p["memories"].append({"id": mid, "content": content, "category": category, "via": via, "told_at": f"{told.isoformat()}T{19 + self.mem_n % 4:02d}:{(self.mem_n * 7) % 60:02d}"})
        return mid

    def bill(self, bid, name, desc, pfc, cents, day=None, via="ach", acc="acc-checking", kind="bill", **extra):
        b = {"id": bid, "name": name, "description": desc, "merchant_name": extra.pop("merchant_name", None), "pfc": pfc, "amount_cents": cents, "via": via, "account": acc, "kind": kind}
        if day:
            b["day"] = day
        b.update(extra)
        self.p["bills"].append(b)
        if b.get("frequency", "monthly") == "monthly":
            self.monthly_bills += cents

    def habit(self, hid, label, pfc, per_week, amount, merchants, **extra):
        h = {"id": hid, "label": label, "pfc": pfc, "per_week": per_week, "amount_cents": list(amount), "merchants": merchants}
        h.update(extra)
        self.p["spending"].append(h)
        return h

    def accounts(self, checking, savings=None, card_limit=None, inst="Lakeside Credit Union"):
        r = self.R("accounts")
        self.p["accounts"].append({"id": "acc-checking", "name": "Checking", "official_name": "Everyday Checking", "type": "depository", "subtype": "checking", "institution_name": inst,
                                   "mask": f"{r.randint(1000, 9999)}", "opening_balance_cents": checking})
        if savings is not None:
            self.p["accounts"].append({"id": "acc-savings", "name": "Savings", "official_name": "Share Savings", "type": "depository", "subtype": "savings", "institution_name": inst,
                                       "mask": f"{r.randint(1000, 9999)}", "opening_balance_cents": savings, "apy_bps": r.choice([50, 100, 150, 400]), "interest_description": "INTEREST PAID"})
        if card_limit:
            owed = r.randint(card_limit // 20, card_limit // 5)
            self.p["accounts"].append({"id": "acc-card", "name": "Visa", "official_name": "Rewards Visa", "type": "credit", "subtype": "credit card", "institution_name": inst,
                                       "mask": f"{r.randint(1000, 9999)}", "credit_limit_cents": card_limit, "opening_balance_cents": owed, "last_statement_cents": owed,
                                       "statement_day": r.randint(3, 25), "due_days": 25, "apr_bps": r.choice([1999, 2399, 2799]), "autopay": "statement",
                                       "autopay_from": "acc-checking", "payment_description": "CARD PAYMENT AUTOPAY", "payment_received": "PAYMENT RECEIVED THANK YOU"})
        self.p["bank"] = {"overdraft_fee_cents": r.choice([0, 2500, 3400]), "low_balance_alert_cents": 5000, "switch_to_card_below_cents": 2000}

    def job(self, jid, employer, position, slots, rate, tax, period="biweekly", place="work", label=None, posted=14, closing_after=None, source="schedule", desc=None):
        anchor = self.t0 - timedelta(days=self.t0.weekday() + 1 + 21)  # a Sunday before the term
        job = {"id": jid, "employer": employer, "position": position, "place": place, "timeline_label": label or f"Shift, {employer}", "source": source,
               "overtime_threshold_hours": 40, "overtime_multiplier": 1.5, "workweek_starts": "Sun", "ready_minutes": 30,
               "pattern": {"type": "weekly", "slots": slots}, "closed_on": [],
               "posting": {"block_days": 7, "anchor": anchor.isoformat(), "posted_days_ahead": posted, "time": "15:00", "jitter_days": [0, 0, 1]},
               "cancel_rate": 0.02, "sick_rate": 0.01, "sent_home_rate": 0.03, "stay_late_rate": 0.1}
        self.p.setdefault("work", {"jobs": []})["jobs"].append(job)
        inc = {"id": f"inc-{jid.removeprefix('job-')}", "type": "hourly", "job": jid, "rate_cents": rate, "pay_period": period, "period_anchor": anchor.isoformat(),
               "days_after_period_end": 1 if period == "weekly" else 6, "tax_share": tax, "account": "acc-checking",
               "description": desc or f"{slug(employer).replace('-', ' ').upper()[:22]} PAYROLL PPD ID: {1400000000 + self.seed * 7919 % 99999999}", "merchant_name": None}
        if period == "weekly":
            inc["pfc"] = "INCOME_OTHER_INCOME"
        self.p["income"].append(inc)
        hours = sum((mm(s["end"]) - mm(s["start"])) % 1440 / 60 * len(s["days"]) * s.get("chance", 1) - s.get("break_minutes", 0) / 60 * len(s["days"]) for s in slots)
        self.monthly_in += hours * 4.33 * rate * (1 - tax)
        for s in slots:
            if s.get("chance", 1) >= 0.5:
                self.week.take(s["days"], mm(s["start"]), mm(s["end"]) if mm(s["end"]) > mm(s["start"]) else 1440)
        return job, hours

    def find_slots(self, days, length, starts, n_days, r):
        """Pick n_days free days with a common start time."""
        opts = list(starts)
        r.shuffle(opts)
        for st in opts:
            a = mm(st)
            free = self.week.free_days(days, a, a + length)
            if len(free) >= n_days:
                chosen = sorted(r.sample(free, n_days), key=DAYS.index)
                return chosen, a
        return None, None

    # ------------------------------------------------------------ everyday money (scaled to income)
    def everyday_spending(self, profile, car, campus):
        r = self.R("spending")
        lo = 1.0
        H = self.habit
        groceries = []
        if profile.get("groceries", True):
            groceries = H("groceries", "Groceries", "FOOD_AND_DRINK_GROCERIES", 0.0, (1800, 6500) if not profile.get("family_budget") else (5500, 17000),
                          [{"description": "ALDI 7{n4}".replace("{n4}", f"{r.randint(1000, 9999)}"), "merchant_name": "Aldi", "weight": 2},
                           {"description": f"KROGER #{r.randint(100, 999):04d}", "merchant_name": "Kroger", "weight": 2},
                           {"description": f"TRADER JOE'S #{r.randint(100, 899)}", "merchant_name": "Trader Joe's", "weight": 1}],
                          routine="groceries", extra_per_week=0.4 if not profile.get("family_budget") else 2.3, card_share=0.4)
        if campus:
            H("campus-food", "Campus dining", "FOOD_AND_DRINK_RESTAURANT", profile.get("campus_food", 1.5), (650, 1450),
              [{"description": f"ARAMARK UNIV DINING {r.randint(1000, 9999)}", "merchant_name": "Aramark", "weight": 2},
               {"description": f"SQ *CAMPUS GRILL {r.randint(1000, 9999)}", "merchant_name": "Campus Grill", "weight": 2}], days=DAYS[:5], when="class_days", time=["11:15", "14:00"], card_share=0.2)
        H("eating-out", "Fast food and takeout", "FOOD_AND_DRINK_FAST_FOOD", profile.get("eating_out", 1.5), (850, 2200),
          [{"description": f"CHIPOTLE {r.randint(1000, 3999)}", "merchant_name": "Chipotle", "weight": 2}, {"description": f"MCDONALD'S F{r.randint(10000, 39999)}", "merchant_name": "McDonald's", "weight": 2},
           {"description": f"TACO BELL {r.randint(10000, 39999):06d}", "merchant_name": "Taco Bell", "weight": 1}, {"description": "SQ *NOODLE BAR", "merchant_name": None, "weight": 1}],
          time=["17:00", "22:00"], card_share=0.3)
        H("coffee", "Coffee", "FOOD_AND_DRINK_COFFEE", profile.get("coffee", 2.5), (375, 725),
          [{"description": f"STARBUCKS STORE {r.randint(10000, 29999)}", "merchant_name": "Starbucks", "weight": 2}, {"description": "SQ *CORNER CAFE", "merchant_name": "Corner Cafe", "weight": 2},
           {"description": f"DUNKIN #{r.randint(300000, 399999)}", "merchant_name": "Dunkin'", "weight": 1}], time=["07:00", "15:00"], card_share=0.2)
        if car:
            H("gas", "Gas", "TRANSPORTATION_GAS", profile.get("gas", 0.9), (2800, 5200),
              [{"description": f"SHELL OIL {r.randint(10000000000, 59999999999)}", "merchant_name": "Shell", "weight": 2}, {"description": f"SPEEDWAY {r.randint(1000, 9999):05d}", "merchant_name": "Speedway", "weight": 1}],
              time=["07:00", "21:00"], card_share=0.5)
        else:
            H("rideshare", "Rides", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", 0.4, (900, 2400), [{"description": "UBER *TRIP {A4}", "merchant_name": "Uber", "weight": 2}, {"description": "LYFT *RIDE {A6}", "merchant_name": "Lyft", "weight": 1}],
              time=["18:00", "23:30"], card_share=0.6)
        H("shopping", "Online orders", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", profile.get("shopping", 1.0), (899, 5499), [{"description": "AMZN Mktp US*{A6}", "merchant_name": "Amazon", "weight": 1}],
          time=["09:00", "23:30"], card_share=0.6, refund_chance=0.05, receipt_email="orders-marketplace@example.com", month_scale={"11": 1.3, "12": 1.6})
        H("target", "Target run", "GENERAL_MERCHANDISE_SUPERSTORES", profile.get("target", 0.4), (1500, 6000), [{"description": f"TARGET {r.randint(100, 3999):08d}", "merchant_name": "Target", "weight": 1}],
          time=["10:00", "20:00"], card_share=0.5)
        H("entertainment", "Movies and going out", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", 0.3, (1200, 3500),
          [{"description": f"AMC {r.randint(1000, 9999)} ONLINE", "merchant_name": "AMC Theatres", "weight": 1}, {"description": "EVENTBRITE *TICKETS", "merchant_name": "Eventbrite", "weight": 1}],
          days=["Thu", "Fri", "Sat", "Sun"], time=["15:00", "22:00"], card_share=0.5)
        H("venmo", "Splitting with friends", "TRANSFER_OUT_ACCOUNT_TRANSFER", 0.4, (600, 3000), [{"description": "VENMO PAYMENT {n10}", "merchant_name": "Venmo", "weight": 1}], time=["11:00", "23:30"])
        H("gifts", "Gifts", "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES", 0.1, (1500, 4500), [{"description": "SQ *GIFT SHOP", "merchant_name": None, "weight": 1}], time=["11:00", "20:00"], card_share=0.5, month_scale={"12": 3})
        H("pharmacy", "Pharmacy", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS", 0.15, (600, 2800), [{"description": f"CVS/PHARMACY #{r.randint(1000, 9999):05d}", "merchant_name": "CVS", "weight": 1}],
          time=["10:00", "20:00"], discretionary=False)
        H("personal-care", "Haircuts and care", "PERSONAL_CARE_HAIR_AND_BEAUTY", 0.1, (1500, 4500), [{"description": f"GREAT CLIPS #{r.randint(1000, 9999)}", "merchant_name": "Great Clips", "weight": 1}],
          time=["10:00", "18:00"], card_share=0.5)
        H("convenience", "Snacks and convenience store", "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK", profile.get("convenience", 1.2), (250, 1200),
          [{"description": f"7-ELEVEN {r.randint(10000, 39999)}", "merchant_name": "7-Eleven", "weight": 2}, {"description": f"CAMPUS C-STORE {r.randint(1000, 9999)}" if campus else "CIRCLE K # 0441", "merchant_name": None, "weight": 2}],
          time=["10:00", "23:30"], card_share=0.1)
        H("app-store", "Apps and in-app purchases", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", profile.get("apps", 0.4), (99, 1499), [{"description": "APPLE.COM/BILL", "merchant_name": "Apple", "weight": 1}],
          time=["12:00", "23:59"], card_share=0.5)
        if profile.get("family_budget"):
            H("kids", "Things for the kids", "GENERAL_MERCHANDISE_SUPERSTORES", 2.0, (1200, 5500), [{"description": f"TARGET {r.randint(100, 3999):08d}", "merchant_name": "Target", "weight": 1},
                                                                                              {"description": f"WALMART #{r.randint(1000, 5999)}", "merchant_name": "Walmart", "weight": 1}], time=["09:00", "19:00"], card_share=0.6)
            H("family-takeout", "Family takeout", "FOOD_AND_DRINK_RESTAURANT", 1.9, (1800, 4800), [{"description": f"DOMINO'S {r.randint(1000, 9999)}", "merchant_name": "Domino's", "weight": 1},
                                                                                              {"description": f"PANERA BREAD #{r.randint(100000, 699999)}", "merchant_name": "Panera Bread", "weight": 1}], time=["17:00", "20:00"], card_share=0.6)
            H("kid-activities", "Kids' activities", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", 0.5, (1000, 4500), [{"description": "SQ *LITTLE GYM CLASS", "merchant_name": None, "weight": 1},
                                                                                                         {"description": "EVENTBRITE *KIDS EVENT", "merchant_name": "Eventbrite", "weight": 1}], time=["09:00", "18:00"], card_share=0.6)
            H("school-lunch", "School lunch account", "GENERAL_SERVICES_EDUCATION", 0.3, (1500, 4000), [{"description": "SCHOOLCAFE K12 TOPUP", "merchant_name": None, "weight": 1}], time=["19:00", "22:00"], discretionary=False)
        if profile.get("abroad"):
            H("family-abroad", "Money for family abroad", "TRANSFER_OUT_ACCOUNT_TRANSFER", 0.1, (4000, 12000), [{"description": "REMITLY* {A8}", "merchant_name": "Remitly", "weight": 1}], time=["18:00", "22:00"],
              discretionary=False)
        # scale amounts so spending fits what comes in
        habit_month = sum((h.get("per_week", 0) + h.get("extra_per_week", 0) + (1 if h.get("routine") else 0)) * 4.33 * sum(h["amount_cents"]) / 2 for h in self.p["spending"])
        room = max(18000, (self.monthly_in - self.monthly_bills) * 0.9)
        scale = max(0.35, min(1.4, room / max(1, habit_month)))
        for h in self.p["spending"]:
            h["amount_cents"] = [max(150, round(h["amount_cents"][0] * scale)), max(300, round(h["amount_cents"][1] * scale))]
            for m in h["merchants"]:
                if m.get("amount_cents"):
                    m["amount_cents"] = [max(150, round(x * scale)) for x in m["amount_cents"]]
        self.spend_month = habit_month * scale
        return groceries

    def cover_gap(self):
        """Opening balances that carry the person through the window when less comes in than goes out (summer savings, a refund)."""
        out = self.monthly_bills + getattr(self, "spend_month", 0)
        gap = out - self.monthly_in
        if gap > 0:
            self.p["accounts"][0]["opening_balance_cents"] += round(gap * 3.8 / 100) * 100
        if not any(i["type"] in ("hourly", "salary") for i in self.p["income"]):
            # living on lump sums (aid, family): enough to reach the next one
            acc = self.p["accounts"][0]
            acc["opening_balance_cents"] = max(acc["opening_balance_cents"], round(out * 1.8 / 100) * 100)

    def phone_and_subs(self, acc_card):
        r = self.R("subs")
        self.bill("phone", "Phone", r.choice(["TMOBILE*AUTO PAY", "VERIZON WIRELESS PAYMENTS", "MINT MOBILE", "VISIBLE SERVICE"]), "RENT_AND_UTILITIES_TELEPHONE", r.choice([2500, 3000, 4500, 6500]),
                  day=r.randint(2, 26), email={"name": "Phone company", "address": "billing-phone@example.com", "subject": "Your bill is ready", "days_before": 5})
        subs = [("spotify", "Spotify", "Spotify USA", "Spotify", "ENTERTAINMENT_MUSIC_AND_AUDIO", 599), ("netflix", "Netflix", "NETFLIX.COM", "Netflix", "ENTERTAINMENT_TV_AND_MOVIES", 799),
                ("icloud", "iCloud storage", "APPLE.COM/BILL", "Apple", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", 299), ("ai", "AI assistant", "CLAUDE.AI SUBSCRIPTION", "Anthropic", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", 2000),
                ("hulu", "Hulu", "HULU 877-555-0142", "Hulu", "ENTERTAINMENT_TV_AND_MOVIES", 999)]
        for sid, name, desc, merch, pfc, cents in r.sample(subs, r.randint(1, 3)):
            self.bill(sid, name, desc, pfc, cents, day=r.randint(1, 27), via="card", acc="acc-card" if acc_card and r.random() < 0.7 else "acc-checking", kind="subscription", merchant_name=merch)

    def email(self, address, extra=None, scale=1.0):
        per = {"promotions": round(3.0 * scale, 2), "newsletters": 0.5, "social": 0.7, "personal": 0.15, "security": 0.05}
        per.update(extra or {})
        self.p["email"] = {"address": address, "per_day": per, "weekend_scale": 0.8}

    def sleep_routine(self, early, free, early_before="09:00", var=34, night=None):
        w = [{"id": "before-early-day", "day_type": "early_next_day", "start": early[0], "end": early[1], "firmness": "usual"},
             {"id": "before-free-day", "day_type": "free_next_day", "start": free[0], "end": free[1], "firmness": "loose"}]
        if night:
            w.append({"id": "after-nights", "day_type": "after_night_shift", "start": night[0], "end": night[1], "firmness": "firm"})
        self.p["routines"].insert(0, {"id": "sleep", "activity": "sleep", "label": "Sleep", "records_as": "health_sleep", "variance_minutes": var, "late_night_rate": 0.09,
                                      "early_before": early_before, "windows": w})

    def gym(self, r, options, mem=True):
        for days, start, length in options:
            free = self.week.free_days(days, mm(start), mm(start) + length + 20)
            if len(free) >= max(2, len(days) - 1):
                mid = self.memory(f"I work out {', '.join(free[:-1])} and {free[-1]} around {self._ampm(start)}", "routine") if mem else None
                self.p["routines"].append({"id": "gym", "activity": "workout", "label": "Workout", "where": "gym", "records_as": "health_workout", "keep_rate": round(r.uniform(0.7, 0.85), 2),
                                           "duration_minutes": [length - 15, length], "ready_minutes": 15,
                                           "windows": [{"id": "usual", "days": free, "start": start, "end": hm(mm(start) + length + 15), "firmness": "usual"}],
                                           "workout_types": {"Traditional Strength Training": 2, "Running": 1, "Elliptical": 1}, **({"source_memory": mid} if mid else {})})
                self.week.take(free, mm(start), mm(start) + length + 15)
                return True
        return False

    @staticmethod
    def _ampm(t):
        h, m = (int(x) for x in t.split(":"))
        return f"{(h - 1) % 12 + 1}{':' + f'{m:02d}' if m else ''} {'AM' if h < 12 else 'PM'}"

    def groceries_routine(self, r, days=("Sat", "Sun")):
        options = [(d, st) for d in r.sample(list(days), len(days)) for st in ("10:30", "11:00", "13:00", "15:30")]
        options += [(d, "19:30") for d in r.sample(["Mon", "Tue", "Wed", "Thu"], 4)]
        for d, st in options:
            for st in (st,):
                if self.week.free(d, mm(st), mm(st) + 90, pad=20):
                    self.week.take([d], mm(st), mm(st) + 90)
                    self.p["routines"].append({"id": "groceries", "activity": "groceries", "label": "Weekly grocery run", "where": "out", "records_as": "bank", "keep_rate": round(r.uniform(0.7, 0.85), 2),
                                               "duration_minutes": [35, 70], "timeline": "none", "windows": [{"id": "usual", "days": [d], "start": st, "end": hm(mm(st) + 90), "firmness": "usual"}]})
                    return
        for h in self.p["spending"]:
            if h["id"] == "groceries":  # no regular slot: shops whenever, so it stays a plain habit
                h.pop("routine", None)
                h["per_week"] = h.pop("extra_per_week", 0.5) + 0.9

    # ------------------------------------------------------------ students
    def student(self):
        R, term = self.R, self.term
        r = R("student")
        level = pick(r, LEVELS)
        living = pick(r, LIVING[level])
        intl = living == "international"
        work = pick(r, WORK[level])
        if intl:
            work = "campus job" if r.random() < 0.6 else ("assistantship" if level == "grad" else "none")
        flags = []
        if r.random() < (0.35 if level == "adult learner" else 0.04):
            flags.append("student parent")
        if level in ("community college", "university") and not flags and r.random() < 0.09:
            flags.append("student athlete")
        if level != "grad" and r.random() < 0.32:
            flags.append("first-generation")
        style = pick(r, STYLES)
        if "student parent" in flags:
            style = r.choice(["evening", "late night", "morning"])
        pace = "crammer" if r.random() < 0.38 else "steady"
        lms = pick(r, LMS)
        n = {"community college": (3, 5), "university": (4, 6), "grad": (2, 4), "adult learner": (2, 3)}[level]
        n_classes = r.randint(*n) + (1 if level == "university" and r.random() < 0.12 else 0)
        car = living in ("commuter", "with family", "own place") or (living == "roommates" and r.random() < 0.6)
        campus = living not in ("own place",) and level != "adult learner" or r.random() < 0.3
        home_campus = {"dorm": 5, "with family": r.choice([10, 15, 25]), "commuter": r.choice([35, 45, 55]), "roommates": r.choice([8, 12, 20]), "far from home": r.choice([10, 15]),
                       "international": r.choice([8, 12]), "own place": r.choice([15, 25, 35])}[living]
        self.p["commute_minutes"] = {"home-campus": home_campus, "home-work": r.choice([10, 15, 20]), "campus-work": r.choice([10, 15, 20]), "home-gym": 10, "gym-campus": 5,
                                     "home-out": 15, "home-clinical": 30, "campus-clinical": 25, "home-field": home_campus, "field-campus": 5, "home-airport": 40}
        if not car:
            self.p["commute_mode"] = "transit" if living != "dorm" else "walk"
        self.p["places"].update({"campus": "campus", "clinical": "the clinical site", "field": "the practice field"})
        # ---- classes
        courses = self.courses(r, level, n_classes, lms, flags, style)
        credits = sum(c.get("credits", 3) for c in courses)
        # ---- work
        jobs_hours = 0
        if work in ("campus job", "two jobs"):
            cap = 20 if intl else 15
            slots = self.shift_slots(r, ["Mon", "Tue", "Wed", "Thu", "Fri"], ["09:00", "12:00", "14:00", "16:00", "18:00"], 180 if cap <= 15 else 240, r.randint(2, 4), cap)
            employer = r.choice(["Campus Library", "Rec Center Front Desk", "Dining Services", "Campus Tutoring Center", "Student Union Info Desk"])
            _, h = self.job("job-campus", employer, "Student worker", slots, r.choice([1300, 1400, 1500, 1600]), 0.04, place="campus", label=f"Work, {employer}", posted=21)
            jobs_hours += h
        if work in ("part-time", "two jobs", "nearly full-time"):
            full = work == "nearly full-time"
            employer = r.choice(["Northgate Grocers", "Brightside Coffee", "Pinecrest Mall Outfitters", "Harbor Diner", "Summit Hardware", "City Pharmacy", "Lakeview Care Home"])
            length = 480 if full else r.choice([300, 360, 420])
            slots = self.shift_slots(r, DAYS, ["06:00", "08:00", "10:00", "14:00", "16:00", "17:00"] if full else ["10:00", "12:00", "16:00", "17:00"], length, r.randint(4, 5) if full else r.randint(2, 3),
                                     38 if full else 22, weekend_first=not full)
            _, h = self.job("job-main", employer, r.choice(["Associate", "Cashier", "Barista", "Server", "Aide"]), slots, r.randint(1500, 1950), round(r.uniform(0.08, 0.13), 3),
                            closing_after="22:00", posted=r.choice([7, 14]))
            jobs_hours += h
        if work == "gig":
            slots = self.shift_slots(r, DAYS, ["11:00", "17:00", "18:00"], r.choice([180, 240]), r.randint(3, 4), 16, chance=0.7)
            self.job("job-gig", "QuickDrop Courier", "Delivery driver", slots, r.randint(1700, 2400), 0.0, period="weekly", place="out", label="Deliveries, QuickDrop", posted=0,
                     desc="QUICKDROP COURIER PAYOUT {A6}")
            self.p["work"]["jobs"][-1]["posting"]["posted_days_ahead"] = 2
        if work == "assistantship":
            self.p["income"].append({"id": "inc-stipend", "type": "salary", "label": "Assistantship stipend", "annual_cents": r.choice([2100000, 2400000, 2700000]), "pay_period": "monthly", "pay_day": 25,
                                     "tax_share": 0.12, "account": "acc-checking", "description": "UNIV PAYROLL STIPEND PPD ID: 2201004411", "merchant_name": None})
            self.monthly_in += self.p["income"][-1]["annual_cents"] / 12 * 0.88
            slots = self.shift_slots(r, DAYS[:5], ["09:00", "10:00", "13:00"], 240, 3, 20)
            self.p.setdefault("work", {"jobs": []})["jobs"].append({"id": "job-ta", "employer": "Graduate school", "position": "Teaching assistant", "place": "campus", "timeline_label": "Teaching assistant hours",
                                                                   "source": "schedule", "pattern": {"type": "weekly", "slots": slots}, "posting": {"block_days": 7, "anchor": "2026-08-02", "posted_days_ahead": 28, "time": "09:00"}})
            for s in slots:
                self.week.take(s["days"], mm(s["start"]), mm(s["end"]))
        # ---- money
        rr = R("money")
        aid = level in ("community college", "university") and rr.random() < 0.62 or level == "adult learner" and rr.random() < 0.4
        loans = level in ("university", "grad") and rr.random() < 0.35
        scholarship = rr.random() < 0.25
        family = (living in ("dorm", "far from home", "international") and rr.random() < 0.7) or (living in ("with family", "roommates", "commuter") and rr.random() < 0.35)
        if work == "none" and not (aid or loans or scholarship):
            family = True  # every student without a job has someone or something paying the bills
        disb = []
        if aid:
            disb.append({"date": term["aid"][0], "amount_cents": rr.randint(60000, 320000), "description": "FINANCIAL AID REFUND STUDENT ACCT"})
        if loans:
            disb.append({"date": term["aid"][0], "amount_cents": rr.randint(150000, 450000), "description": "STUDENT LOAN DISB REFUND"})
        if scholarship:
            disb.append({"date": term["aid"][1], "amount_cents": rr.randint(50000, 150000), "description": "SCHOLARSHIP DISBURSEMENT"})
        if disb:
            self.p["income"].append({"id": "inc-aid", "type": "student_aid", "disbursements": disb, "account": "acc-checking"})
            self.monthly_in += sum(x["amount_cents"] for x in disb) / 4.5
        if family:
            amt = (40000, 90000) if living in ("dorm", "international") else (15000, 45000)
            self.p["income"].append({"id": "inc-family", "type": "family", "label": "Money from family", "day_of_month": rr.randint(1, 20), "jitter_days": [0, 3], "amount_cents": list(amt),
                                     "skip_chance": 0.1, "account": "acc-checking", "description": "ZELLE FROM PARENT {A4} CONF# {A8}" if not intl else "WISE INC {A8} TRANSFER",
                                     "pfc": "TRANSFER_IN_ACCOUNT_TRANSFER"})
            self.monthly_in += sum(amt) / 2 * 0.9
        card = rr.random() < 0.55
        self.accounts(rr.randint(25000, 180000) + (100000 if level in ("grad", "adult learner") else 0), rr.randint(0, 400000) if rr.random() < 0.6 else None, rr.choice([50000, 100000, 200000]) if card else None)
        if living == "roommates" or living == "far from home" or (living == "international" and level == "grad"):
            rent = rr.randint(45000, 95000)
            self.bill("rent-share", "Rent share", "ZELLE TO ROOMMATE CONF# {A8}" if rr.random() < 0.5 else "MAPLE COURT APTS RENT WEB", "TRANSFER_OUT_ACCOUNT_TRANSFER" if rr.random() < 0.5 else "RENT_AND_UTILITIES_RENT",
                      rent, day=1)
            self.bill("utilities-share", "Utilities share", "VENMO PAYMENT {n10}", "TRANSFER_OUT_ACCOUNT_TRANSFER", rr.randint(3500, 8000), day=rr.randint(8, 15), varies_pct=0.25)
        elif living == "own place":
            self.bill("rent", "Rent", "RIVERSIDE APTS RENT WEB", "RENT_AND_UTILITIES_RENT", rr.randint(95000, 165000), day=1)
            self.bill("electric", "Electric", "CITY POWER AND LIGHT", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", rr.randint(7000, 13000), day=rr.randint(10, 20), varies_pct=0.2)
        elif living in ("with family", "commuter") and rr.random() < 0.4:
            self.bill("family-share", "Share for the household", "ZELLE TO MOM CONF# {A8}", "TRANSFER_OUT_ACCOUNT_TRANSFER", rr.randint(5000, 20000), day=1)
        if car:
            self.bill("car-insurance", "Car insurance", "SAFEROUTE AUTO INS PREM", "GENERAL_SERVICES_INSURANCE", rr.randint(7000, 16000), day=rr.randint(3, 25), merchant_name="SafeRoute Insurance")
        elif living != "dorm":
            self.bill("transit", "Transit pass", "METRO TRANSIT PASS AUTOLOAD", "TRANSPORTATION_PUBLIC_TRANSIT", rr.choice([3000, 5000, 7500]), day=rr.randint(1, 5), via="card")
        if not aid and not loans:
            months = term["plan_months"]
            self.bill("tuition-plan", "Tuition payment plan", "CAMPUS PAY PLAN TUITION", "GENERAL_SERVICES_EDUCATION",
                      {"community college": rr.randint(22000, 40000), "university": rr.randint(60000, 120000), "grad": rr.randint(80000, 150000), "adult learner": rr.randint(18000, 35000)}[level],
                      frequency="dates", dates=[f"{m}-{term['plan_day']:02d}" for m in months], known=True)
            self.monthly_bills += self.p["bills"][-1]["amount_cents"]
        books = rr.randint(8000, 45000)
        self.bill("textbooks", "Textbooks and access codes", "CAMPUS BOOKSTORE {n4}", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", books, via="card", frequency="dates",
                  dates=[(self.t0 + timedelta(days=rr.randint(1, 6))).isoformat()], recurring=False, kind="other", acc="acc-card" if card else "acc-checking")
        self.bill("course-fee", "Online course access code", "PEARSON *ACCESS CODE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", rr.randint(4000, 12000), via="card", frequency="dates",
                  dates=[(self.t0 + timedelta(days=rr.randint(8, 16))).isoformat()], recurring=False, kind="other")
        if "student parent" in flags:
            self.bill("childcare", "Childcare", "BRIGHT STEPS CHILDCARE", "GENERAL_SERVICES_CHILDCARE", rr.randint(55000, 110000), day=1)
        self.phone_and_subs(card)
        profile = {"campus_food": 0.8 if living == "dorm" else 1.3 if campus else 0, "eating_out": 2.0 if living == "dorm" else 1.7, "coffee": 3.2, "shopping": 1.2, "target": 0.5,
                   "convenience": 1.6 if living == "dorm" else 1.0, "apps": 0.5, "groceries": living != "dorm", "abroad": intl or (living == "far from home" and rr.random() < 0.4),
                   "family_budget": "student parent" in flags}
        self.everyday_spending(profile, car, campus)
        self.cover_gap()
        if living == "dorm":
            self.p["memories"].append({"id": "m-meal-plan", "content": "My meal plan covers 14 meals a week in the dining hall", "category": "fact", "via": "get-to-know answer",
                                       "told_at": f"{(self.t0 + timedelta(days=3)).isoformat()}T20:10"})
        # ---- routines
        self.student_routines(r, style, pace, living, flags, courses, level)
        if not any(x["id"] == "groceries" for x in self.p["routines"]):
            self.groceries_routine(r) if living != "dorm" else None
        # ---- school block
        breaks = list(term["breaks"]) + [{"start": term["finals"][0], "end": term["finals"][1], "label": "Finals week, no regular classes"}]
        inst = {"community college": r.choice(["Harbor Point Community College", "Eastfield Community College", "Mesa Ridge Community College"]),
                "university": r.choice(["Northlake State University", "Coastal Plains University", "Ridgeview University"]),
                "grad": r.choice(["Northlake State University Graduate School", "Ridgeview University Graduate School"]),
                "adult learner": r.choice(["Eastfield Community College evening program", "Coastal Plains University online program"])}[level]
        self.p["school"] = {"institution": inst, "lms": lms, "term": {"name": term["name"], "start": term["start"], "end": term["finals"][1], "breaks": breaks,
                                                                      "no_class_days": term["no_class_days"]}, "courses": courses}
        kinds = ["student who works" if work != "none" else "student"]
        kinds += {"with family": ["lives with family"], "commuter": ["lives with family"], "roommates": ["roommates"], "far from home": ["far from home", "roommates"],
                  "international": ["new to the country", "far from home"], "dorm": ["far from home"] if r.random() < 0.5 else [], "own place": []}[living]
        if "student parent" in flags:
            kinds.append("single parent" if r.random() < 0.5 else "parent")
        if work == "two jobs":
            kinds.append("two jobs")
        if work == "gig":
            kinds.append("gig worker")
        style = self.p.get("student", {}).get("study_style", style)
        self.p["student"] = {"level": level, "classes": n_classes, "credits": credits, "lms": lms, "formats": sorted({c["format"] for c in courses}), "work": work, "living": living,
                             "flags": flags, "study_style": style, "pace": pace, "aid": aid, "loans": loans, "scholarship": scholarship, "family_support": family}
        bits = [f"{'Full' if credits >= 12 else 'Part'}-time {level} student" if level != "adult learner" else "Part-time adult learner", f"{n_classes} classes ({credits} credits)",
                {"none": "no job", "campus job": "campus job", "part-time": "part-time job", "nearly full-time": "works nearly full time", "gig": "delivery gig", "two jobs": "two jobs",
                 "assistantship": "teaching assistantship"}[work],
                {"dorm": "lives in a dorm", "with family": "lives with family", "commuter": "long commute from home", "roommates": "lives with roommates", "far from home": "far from home",
                 "international": "international student", "own place": "own place"}[living]]
        bits += flags
        bits.append(f"{style} studier, {pace}")
        self.p["id"] = f"p{1000 + self.seed:04d}-" + slug(f"{level} {living} {work}")[:40].strip("-")
        self.p["summary"] = ", ".join(bits)
        self.p["kinds"] = list(dict.fromkeys(kinds))
        self.p["time_zone"] = self.tz
        self.p["pay"] = {"type": "hourly", "period": "biweekly"} if work in ("campus job", "part-time", "nearly full-time", "two jobs") else {"type": "per gig", "period": "weekly"} if work == "gig" else {"type": "salary", "period": "monthly"} if work == "assistantship" else {"type": "none", "period": None}
        self.p["health"] = {"goals": {"workouts_per_week": 3 if any(x["id"] == "gym" for x in self.p["routines"]) else 0, "sleep_hours": 8},
                            "steps": {"work": [8000, 13000], "class": [6000, 10000], "free": [2500, 7000]}, "resting_heart_rate": r.randint(58, 70),
                            "nutrition": {"enabled": r.random() < 0.25, "log_rate": 0.5, "base_kcal": 1900, "sd_kcal": 220, "goal_kcal": 2000}}
        self.email(f"{self.name.lower()}.{self.seed}@example.com", {"school_other": 0.4})
        if "first-generation" in flags:
            self.memory("I'm the first in my family to go to college, so I'm figuring out financial aid on my own", "fact", via="get-to-know answer")
        if intl:
            self.memory("On my student visa I can work at most 20 hours a week, and only on campus", "fact", via="get-to-know answer")
        self.memory(f"Home is about {home_campus} minutes from campus", "fact", via="get-to-know answer")
        return self.finish()

    def shift_slots(self, r, days, starts, length, n_days, cap_hours, weekend_first=False, chance=None):
        slots, hours = [], 0
        order = (["Sat", "Sun"] + [d for d in days if d not in ("Sat", "Sun")]) if weekend_first else list(days)
        if not weekend_first:
            r.shuffle(order)
        for d in order:
            if len(slots) >= n_days or hours + length / 60 > cap_hours:
                break
            opts = list(starts)
            r.shuffle(opts)
            for st in opts:
                a = mm(st)
                if a + length <= 23 * 60 + 30 and self.week.free(d, a - 30, a + length + 30):
                    sl = {"days": [d], "start": st, "end": hm(a + length), "chance": chance or 0.95}
                    if length >= 360:
                        sl["break_minutes"] = 30
                    slots.append(sl)
                    hours += length / 60
                    self.week.take([d], a, a + length)
                    break
        if not slots:
            slots = [{"days": ["Sat"], "start": "10:00", "end": hm(600 + min(length, 360)), "chance": 0.9}]
        return slots

    def courses(self, r, level, n, lms, flags, style):
        pool = list(GRAD if level == "grad" else UNDERGRAD)
        if level != "grad" and "student athlete" in flags:
            pool = [p for p in pool if p[2] != "clinical"]
        r.shuffle(pool)
        chosen, seen = [], set()
        for code, name, kind in pool:
            if code in seen:
                continue
            seen.add(code)
            chosen.append((code, name, kind))
            if len(chosen) == n:
                break
        if "student athlete" in flags:
            self.week.take(DAYS[:5], mm("15:15"), mm("18:00"))
        out = []
        term = self.term
        t0, last = date.fromisoformat(term["start"]), date.fromisoformat(term["last_class"])
        fin0 = date.fromisoformat(term["finals"][0])
        num = {"community college": (101, 230), "university": (100, 420), "grad": (510, 690), "adult learner": (101, 240)}[level]
        for i, (code, name, kind) in enumerate(chosen):
            cr = r.random()
            if level == "adult learner":
                fmt = "night" if cr < 0.5 else "online" if cr < 0.85 else "hybrid"
            elif level == "grad":
                fmt = "night" if cr < 0.35 else "in person" if cr < 0.8 else "online"
            else:
                fmt = "in person" if cr < 0.68 else "online" if cr < 0.86 else "hybrid" if cr < 0.95 else "night"
            meetings = []
            loc = f"{r.choice(['Main Hall', 'Science Hall', 'Arts Building', 'Library', 'North Hall'])} {r.randint(100, 340)}"
            if fmt == "in person":
                pat = "MWF" if r.random() < 0.45 else "TTh"
                days, length, starts = (["Mon", "Wed", "Fri"], 50, MWF) if pat == "MWF" else (["Tue", "Thu"], 75, TTH)
                dd, a = self.find_slots(days, length, starts, len(days), r)
                if dd is None:
                    fmt = "online"
                else:
                    meetings.append({"days": dd, "start": hm(a), "end": hm(a + length), "location": loc})
                    self.week.take(dd, a, a + length)
            if fmt == "hybrid":
                dd, a = self.find_slots(DAYS[:5], 75, TTH, 1, r)
                if dd:
                    meetings.append({"days": dd, "start": hm(a), "end": hm(a + 75), "location": loc})
                    self.week.take(dd, a, a + 75)
                else:
                    fmt = "online"
            if fmt == "night":
                dd, a = self.find_slots(DAYS[:4], 165, ["18:00", "18:30"], 1, r)
                if dd:
                    meetings.append({"days": dd, "start": hm(a), "end": hm(a + 165), "location": loc})
                    self.week.take(dd, a, a + 165)
                else:
                    fmt = "online"
            if fmt == "online" and r.random() < 0.3:
                dd, a = self.find_slots(DAYS[:5], 60, ["12:00", "17:00", "19:00"], 1, r)
                if dd:
                    meetings.append({"days": dd, "start": hm(a), "end": hm(a + 60), "online": True, "label": "live session"})
                    self.week.take(dd, a, a + 60)
            credits = 3
            if kind == "lab" and fmt != "online":
                dd, a = self.find_slots(["Tue", "Wed", "Thu"], 170, ["13:00", "14:00"], 1, r)
                if dd:
                    meetings.append({"days": dd, "start": hm(a), "end": hm(a + 170), "location": f"Lab {r.randint(10, 40)}", "label": "lab"})
                    self.week.take(dd, a, a + 170)
                    credits = 4
            if kind == "clinical":
                dd, a = self.find_slots(["Tue", "Thu", "Fri"], 510, ["06:30"], 1, r)
                if dd:
                    meetings.append({"days": dd, "start": "06:30", "end": "15:00", "location": "Clinical site", "place": "clinical", "label": "clinical"})
                    self.week.take(dd, mm("06:30"), mm("15:00"))
                    credits = 4
            c = {"code": f"{code} {r.randint(*num)}", "name": name, "format": fmt, "credits": credits, "instructor": f"Prof. {r.choice(['Okafor', 'Lindqvist', 'Haddad', 'Brandt', 'Varga', 'Moreno', 'Chen', 'Adeyemi', 'Kowalski', 'Nakamura'])}",
                 "grade_pct": sorted([r.randint(68, 85), r.randint(86, 98)]), "meetings": meetings, "announcements_per_month": r.choice([1, 2, 3, 4])}
            c["instructor_email"] = f"{slug(c['instructor'].split()[-1])}-{slug(code)}@example.com"
            first = t0 + timedelta(days=3)
            rules = []
            due_day = r.choice(["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"])
            if kind in (None, "lab") or code in ("MATH", "STAT", "CS", "PHYS", "CHEM", "ECON"):
                rules.append({"title": "Homework {n}", "weekday": due_day, "due": "23:59", "points": r.choice([10, 20]), "start": first.isoformat(), "end": last.isoformat()})
            if kind == "essay" or fmt in ("online", "hybrid"):
                rules.append({"title": "Discussion post {n}", "kind": "discussion", "weekday": r.choice(["Sun", "Thu", "Wed"]), "due": "23:59", "points": 5, "start": first.isoformat(), "end": last.isoformat()})
            if r.random() < 0.5:
                rules.append({"title": "Quiz {n}", "kind": "quiz", "weekday": r.choice(["Fri", "Sun", "Mon"]), "due": "23:59", "points": 10, "start": (first + timedelta(days=7)).isoformat(), "end": last.isoformat(),
                              "every_weeks": r.choice([1, 2])})
            if kind == "lab":
                rules.append({"title": "Lab report {n}", "kind": "lab", "weekday": "Fri", "due": "23:59", "points": 40, "start": (first + timedelta(days=10)).isoformat(), "end": last.isoformat(), "every_weeks": 2})
            if kind == "clinical":
                rules.append({"title": "Clinical log {n}", "weekday": "Sun", "due": "23:59", "points": 10, "start": first.isoformat(), "end": last.isoformat()})
            c["assignments"] = rules
            items = []
            if kind == "essay":
                for k, wk in enumerate((5, 10, 14)):
                    items.append({"title": f"Essay {k + 1}", "due": f"{(t0 + timedelta(weeks=wk, days=4)).isoformat()}T23:59", "points": 100})
            if kind == "project":
                for k, (title, wk) in enumerate((("Group project proposal", 4), ("Group project draft", 9), ("Group project final", 14))):
                    items.append({"title": title, "kind": "project", "due": f"{(t0 + timedelta(weeks=wk, days=3)).isoformat()}T23:59", "points": 50 if k < 2 else 150})
                for wk in (3, 8, 13):
                    d = t0 + timedelta(weeks=wk, days=r.choice([1, 2, 3]))
                    st = r.choice(["18:30", "19:00", "16:00"])
                    if self.week.free(DAYS[d.weekday()], mm(st), mm(st) + 90):
                        self.p["real_life"]["events"].append({"id": f"ev-group-{slug(code)}-{wk}", "title": f"Group project meeting, {c['code']}", "start": f"{d.isoformat()}T{st}",
                                                              "end": f"{d.isoformat()}T{hm(mm(st) + 75)}", "state": "with people", "place": "campus", "source": "google", "created_days_before": 6})
            c["items"] = items
            exams = []
            n_mid = 0 if kind in ("project", "essay") and r.random() < 0.6 else (2 if r.random() < 0.45 else 1)
            for k in range(n_mid):
                wk = (7 if n_mid == 1 else (6 + 5 * k))
                exams.append(self.exam(r, c, f"Midterm {k + 1}" if n_mid > 1 else "Midterm", t0 + timedelta(weeks=wk), fmt))
            if kind not in ("project",) or r.random() < 0.3:
                exams.append(self.final(r, c, i, fin0, fmt))
            c["exams"] = exams
            out.append(c)
        return out

    def exam(self, r, c, title, week_start, fmt):
        online = fmt == "online" or (fmt == "hybrid" and r.random() < 0.6) or (fmt == "in person" and r.random() < 0.12)
        if not online and c["meetings"]:
            m = c["meetings"][0]
            d = week_start
            while DAYS[d.weekday()] not in m["days"]:
                d += timedelta(days=1)
            return {"title": title, "mode": "in_person", "date": d.isoformat(), "start": m["start"], "end": m["end"]}
        opens = week_start + timedelta(days=3)
        return {"title": title, "mode": "online", "opens": f"{opens.isoformat()}T08:00", "closes": f"{(opens + timedelta(days=r.choice([1, 2, 3]))).isoformat()}T23:59", "minutes": r.choice([45, 60, 75, 90])}

    def final(self, r, c, i, fin0, fmt):
        if fmt == "online" or not c["meetings"]:
            o = fin0 + timedelta(days=i % 3)
            return {"title": "Final exam", "mode": "online", "opens": f"{o.isoformat()}T08:00", "closes": f"{(o + timedelta(days=2)).isoformat()}T23:59", "minutes": r.choice([90, 120])}
        for k in range(10):
            d = fin0 + timedelta(days=(i + k) % 5)
            a, b = FINAL_SLOTS[(i * 2 + k) % len(FINAL_SLOTS)]
            if self.week.free(DAYS[d.weekday()], mm(a), mm(b), pad=0) or k == 9:
                return {"title": "Final exam", "mode": "in_person", "date": d.isoformat(), "start": a, "end": b, "location": "Exam hall"}

    def student_routines(self, r, style, pace, living, flags, courses, level):
        if "student parent" in flags:
            self.parent_care(r)
        all_windows = {"morning": [("07:30", "09:40", DAYS[:5]), ("09:00", "11:30", ["Sat"])], "afternoon": [("14:00", "16:45", DAYS[:5]), ("13:00", "15:30", ["Sun"])],
                       "evening": [("19:00", "21:45", ["Sun", "Mon", "Tue", "Wed", "Thu"])], "late night": [("21:30", "23:59", ["Sun", "Mon", "Tue", "Wed", "Thu"])]}
        ws = []
        for cand in [style] + [x for x in ("evening", "afternoon", "morning", "late night") if x != style]:
            for k, (a, b, days) in enumerate(all_windows[cand]):
                free_days = self.week.free_days(days, mm(a), mm(b), pad=5)
                if free_days:
                    ws.append({"id": f"{slug(cand)}-{k + 1}", "days": free_days, "start": a, "end": b, "firmness": "firm" if k == 0 else "usual"})
                    self.week.take(free_days, mm(a), mm(b))
            if sum(len(w["days"]) for w in ws) >= 2:
                style = cand
                break
        if not ws:
            ws = [{"id": "late", "days": ["Sun"], "start": "21:00", "end": "23:30", "firmness": "usual"}]
        self.p.setdefault("student", {})["study_style"] = style
        early, free, before = {"morning": (("23:00", "06:45"), ("00:00", "08:30"), "09:30"), "afternoon": (("23:45", "07:15"), ("00:45", "09:15"), "09:30"),
                               "evening": (("00:15", "07:30"), ("01:15", "09:45"), "10:00"), "late night": (("01:15", "08:00"), ("02:30", "10:30"), "10:30")}[style]
        self.sleep_routine(early, free, before)
        place = "home" if living == "dorm" or style in ("evening", "late night") else "campus"
        slots = sum(len(w["days"]) for w in ws)
        per = round(min(slots, r.uniform(1.5, 2.5)) if pace == "crammer" else min(slots, r.uniform(3.5, 5.5)), 1)
        mem = self.memory({"morning": "I study in the mornings before class. I can't focus at night", "afternoon": "I get my studying done in the afternoons",
                           "evening": "I study in the evenings, usually after dinner", "late night": "I'm a night owl. I study late, after 9:30"}[style]
                          + (". I tend to cram the last few days before an exam" if pace == "crammer" else ""), "preference")
        study = {"id": "study", "activity": "study", "label": "Study" if place == "home" else "Study at the library", "where": place, "records_as": "calendar" if r.random() < 0.85 else "none",
                 "per_week": per, "keep_rate": round(r.uniform(0.72, 0.86), 2), "duration_minutes": [50, 110], "ready_minutes": 20, "windows": ws, "source_memory": mem,
                 "not_after": {"morning": "13:00", "afternoon": "18:30", "evening": "23:00", "late night": None}[style]}
        if study["not_after"] is None:
            del study["not_after"]
        if pace == "crammer":
            study["cram_days"] = 3
        if any(j.get("pattern", {}).get("slots") and any(mm(s["end"]) >= mm("22:00") for s in j["pattern"]["slots"]) for j in self.p.get("work", {}).get("jobs", [])):
            study["exceptions"] = [{"type": "after_closing_shift", "label": "Skips studying the morning after a closing shift"}]
        self.p["routines"].append(study)
        if "student athlete" in flags:
            mid = self.memory("Practice is every weekday from 3:30 to 5:45, and we travel for some Saturday games", "routine")
            self.p["real_life"]["events"].append({"id": "ev-practice", "title": "Team practice", "start": "15:30", "end": "17:45", "repeat": {"days": DAYS[:5], "from": self.term["start"]},
                                                  "state": "other", "place": "field", "source": "google", "created_days_before": 20})
            for k, wk in enumerate((3, 6, 9, 12)):
                d = self.t0 + timedelta(weeks=wk, days=5)
                self.p["real_life"]["events"].append({"id": f"ev-game-{k + 1}", "title": "Away game", "start": f"{d.isoformat()}T09:00", "end": f"{d.isoformat()}T19:00",
                                                      "state": "with people", "place": "field", "source": "google", "created_days_before": 30})
        elif r.random() < 0.55:
            self.gym(r, [(["Mon", "Wed", "Fri"], "07:00", 60), (["Tue", "Thu"], "12:15", 60), (["Mon", "Wed", "Thu"], "18:00", 60), (["Tue", "Thu", "Sat"], "17:00", 60), (["Sat", "Sun"], "10:00", 60)])
        if living in ("dorm", "far from home", "international") or r.random() < 0.3:
            t = "09:00" if living == "international" else r.choice(["19:00", "20:00", "18:30"])
            d = r.choice(["Sat", "Sun"])
            mid = self.memory(f"I call my family every {dict(zip(DAYS, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']))[d]} {'morning' if t < '12:00' else 'evening'}", "routine")
            if self.week.free(d, mm(t), mm(t) + 45):
                self.p["routines"].append({"id": "call-family", "activity": "call", "label": "Call with family", "records_as": "calendar_recurring" if r.random() < 0.5 else "none",
                                           "timeline": "routine", "calendar_title": "Call home", "keep_rate": round(r.uniform(0.78, 0.88), 2),
                                           "windows": [{"id": "weekly", "days": [d], "start": t, "end": hm(mm(t) + 45), "firmness": "firm"}], "source_memory": mid})
                self.week.take([d], mm(t), mm(t) + 45)
        dinner_days = self.week.free_days(DAYS, mm("18:30"), mm("19:45"), pad=10)
        if living in ("with family", "commuter") and len(dinner_days) >= 3:
            mid = self.memory("We eat dinner together at home most nights", "routine")
            self.week.take(dinner_days, mm("18:30"), mm("19:45"))
            self.p["routines"].append({"id": "dinner-home", "activity": "meal", "label": "Dinner at home", "where": "home", "records_as": "none", "timeline": "none", "keep_rate": 0.82,
                                       "duration_minutes": [30, 45], "windows": [{"id": "evening", "days": dinner_days, "start": "18:30", "end": "19:45", "firmness": "usual"}],
                                       "exceptions": [{"type": "on_work_days", "label": "Eats at work on shift days"}], "source_memory": mid})
            for h in self.p["spending"]:
                if h["id"] == "eating-out":
                    h["on_routine_miss"] = {"routine": "dinner-home", "chance": 0.45}
                    h["per_week"] = round(h["per_week"] * 0.6, 2)
        if r.random() < 0.4:
            d, a, b, label = r.choice([("Sun", "08:00", "12:00", "Sunday morning, kept free"), ("Fri", "19:00", "23:00", "Friday night, kept free"), ("Sat", "08:00", "12:00", "Saturday morning, kept free")])
            if self.week.free(d, mm(a), mm(b), pad=0):
                self.week.take([d], mm(a), mm(b))
                mid = self.memory(f"{label.split(',')[0]}s are mine. No plans", "preference")
                self.p["routines"].append({"id": "keep-free", "activity": "keep free", "label": label, "timeline": "routine", "records_as": "none", "keep_rate": 1.0,
                                           "windows": [{"id": "weekly", "days": [d], "start": a, "end": b, "firmness": "fixed"}], "source_memory": mid})
        if living != "dorm":
            self.groceries_routine(r)
        if r.random() < 0.5 and self.week.free_days(["Fri", "Sat"], mm("18:30"), mm("23:59"), pad=30):
            self.p["real_life"]["nights_out"] = {"per_month": r.choice([1, 2, 3]), "days": self.week.free_days(["Fri", "Sat"], mm("18:30"), mm("23:59"), pad=30) or ["Fri"], "start": "19:30", "end": "23:00", "on_calendar": 0.4, "place": "out",
                                                 "titles": ["Dinner with friends", "Movie night", "Game night", "Concert"], "spend": {"habit": "eating-out", "amount_cents": [1500, 4000]}}

    def parent_care(self, r):
        kid = r.choice(["Leo", "Maya", "Sam", "Ava", "Eli"])
        self.p["places"]["school"] = f"{kid}'s school"
        self.p["commute_minutes"]["home-school"] = 8
        self.p["dependents"] = [{"id": "kid", "name": kid, "school": {"days": DAYS[:5], "start": "08:15", "end": "15:00", "calendar_source": "google", "calendar_name": "School district calendar",
                                                                     "calendar_added": "2026-08-01", "no_school": [{"date": "2026-10-12", "label": "No school: staff day"},
                                                                                                                  {"from": "2026-11-25", "to": "2026-11-27", "label": "No school: Thanksgiving break"},
                                                                                                                  {"from": "2026-12-21", "to": "2027-01-01", "label": "No school: winter break"}]}}]
        mid = self.memory(f"I drop {kid} at school at 8 and pick up at 3", "routine")
        self.week.take(DAYS[:5], mm("07:40"), mm("08:30"))
        self.week.take(DAYS[:5], mm("14:35"), mm("15:25"))
        for rid, (a, b) in (("dropoff", ("07:50", "08:20")), ("pickup", ("14:45", "15:15"))):
            self.p["routines"].append({"id": rid, "activity": "care", "label": "School drop-off" if rid == "dropoff" else "School pickup", "records_as": "none", "timeline": "routine", "keep_rate": 1.0,
                                       "ready_minutes": 10, "windows": [{"id": "weekday", "days": DAYS[:5], "start": a, "end": b, "firmness": "fixed"}],
                                       "exceptions": [{"type": "school_days_only", "dependent": "kid", "label": "No school"}], "source_memory": mid})

    # ------------------------------------------------------------ other lives
    def other(self):
        r = self.R("other")
        life = pick(r, [("shift worker", 25), ("salaried", 22), ("freelancer", 12), ("gig worker", 12), ("single parent two jobs", 12), ("caregiver", 9), ("retired", 8)])
        self.t0 = date.fromisoformat(self.term["start"])
        rr = self.R("money")
        kinds = []
        car = r.random() < 0.8
        self.p["commute_minutes"] = {"home-work": r.choice([15, 20, 30, 40]), "home-gym": 10, "home-out": 15, "home-care": 20, "work-care": 25, "home-school": 8, "home-airport": 40}
        if life == "shift worker":
            kinds = ["shift worker"] + (["roommates"] if r.random() < 0.5 else ["lives with family"])
            if r.random() < 0.5:
                pat = {"type": "rotation", "anchor": (self.t0 - timedelta(days=self.t0.weekday() + 1 + 28)).isoformat(), "cycle_days": 8, "on": [0, 1, 2, 3], "start": "06:00", "end": "16:30",
                       "break_minutes": 30, "extra_chance": 0.03}
                job, h = self.job("job-main", "Riverside Distribution Center", "Warehouse associate", [], rr.randint(1800, 2300), 0.15, label="Shift, warehouse", posted=21)
                job["pattern"] = pat
                self.monthly_in = 4 / 8 * 7 * 10 * 4.33 * self.p["income"][-1]["rate_cents"] * 0.85
                self.week.take(DAYS, mm("05:30"), mm("17:00"))
                sleep = (("21:30", "05:00"), ("23:00", "07:30"))
            else:
                slots = self.shift_slots(r, DAYS, ["07:00", "11:00", "14:00", "15:00"], 480, 5, 40)
                self.job("job-main", r.choice(["Northgate Grocers", "Pinecrest Mall Outfitters", "Summit Hardware"]), "Associate", slots, rr.randint(1600, 2100), 0.13, posted=14)
                sleep = (("23:00", "06:30"), ("00:00", "08:00"))
            self.sleep_routine(*sleep, early_before="10:00")
        elif life == "salaried":
            kinds = ["salaried"] + (["roommates"] if r.random() < 0.3 else [])
            annual = rr.choice([5200000, 6500000, 7800000, 9500000])
            self.p["income"].append({"id": "inc-salary", "type": "salary", "label": "Salary", "annual_cents": annual, "pay_period": r.choice(["biweekly", "semimonthly"]), "period_anchor": "2026-08-02",
                                     "days_after_period_end": 5, "tax_share": 0.27, "account": "acc-checking", "description": "BRIGHTPATH SOFTWARE PAYROLL PPD ID: 7712004411", "merchant_name": None})
            self.monthly_in = annual / 12 * 0.73
            office = r.sample(["Tue", "Wed", "Thu", "Mon"], 3)
            self.p.setdefault("work", {"jobs": []})["jobs"].append({"id": "job-office", "employer": "BrightPath Software", "position": "Analyst", "place": "work", "timeline_label": "Office day", "source": "schedule",
                                                                   "pattern": {"type": "weekly", "slots": [{"days": sorted(office, key=DAYS.index), "start": "09:00", "end": "17:30", "break_minutes": 30},
                                                                                                           {"days": [d for d in DAYS[:5] if d not in office], "start": "09:00", "end": "17:00", "chance": 1}]},
                                                                   "posting": {"block_days": 7, "anchor": "2026-08-02", "posted_days_ahead": 60, "time": "09:00"}})
            self.p["places"]["work"] = "the office"
            self.week.take(DAYS[:5], mm("08:30"), mm("18:00"))
            self.sleep_routine(("23:15", "06:45"), ("00:15", "08:30"))
        elif life == "freelancer":
            kinds = ["freelancer"]
            clients = [{"name": n, "first_invoice": (self.t0 - timedelta(days=rr.randint(60, 120))).isoformat(), "every_days": rr.choice([14, 30]), "amount_cents": [rr.randint(60000, 150000), rr.randint(160000, 400000)],
                        "terms_days": rr.choice([15, 30]), "late_chance": rr.choice([0.1, 0.3, 0.5]), "late_days": [5, 25]} for n in r.sample(["Acme Studio", "Blue Fern Media", "Northwind Clinic", "Oak and Ivy Shop"], 2)]
            self.p["income"].append({"id": "inc-freelance", "type": "freelance", "clients": clients, "account": "acc-checking", "description": "STRIPE TRANSFER ST-{A8}", "pfc": "INCOME_OTHER_INCOME"})
            self.monthly_in = sum(sum(c["amount_cents"]) / 2 * 30 / c["every_days"] for c in clients)
            mid = self.memory("I do my best client work 9 to 1, then admin in the afternoon", "routine")
            self.p["routines"].append({"id": "deep-work", "activity": "deep work", "label": "Client work", "where": "home", "records_as": "calendar", "per_week": 4.5, "keep_rate": 0.8, "duration_minutes": [150, 230],
                                       "windows": [{"id": "mornings", "days": DAYS[:5], "start": "09:00", "end": "13:00", "firmness": "firm"}], "source_memory": mid})
            self.week.take(DAYS[:5], mm("09:00"), mm("13:00"))
            self.bill("software", "Design software", "ADOBE *CREATIVE CLD", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", 5999, day=12, via="card", kind="subscription", merchant_name="Adobe")
            self.sleep_routine(("23:45", "07:30"), ("00:30", "08:45"), early_before="10:00")
        elif life == "gig worker":
            kinds = ["gig worker"] + (["two jobs"] if r.random() < 0.4 else [])
            slots = self.shift_slots(r, DAYS, ["10:30", "16:30", "17:00"], 300, 5, 32, chance=0.75)
            self.job("job-gig", "QuickDrop Courier", "Delivery driver", slots, rr.randint(1800, 2500), 0.0, period="weekly", place="out", label="Deliveries, QuickDrop", desc="QUICKDROP COURIER PAYOUT {A6}")
            self.p["work"]["jobs"][-1]["posting"]["posted_days_ahead"] = 2
            if "two jobs" in kinds:
                slots = self.shift_slots(r, ["Mon", "Wed", "Fri"], ["07:00", "08:00"], 240, 2, 10)
                self.job("job-second", "Clean Sweep Services", "Cleaner", slots, rr.randint(1500, 1800), 0.1)
            self.sleep_routine(("00:00", "07:30"), ("01:00", "09:00"), early_before="10:00")
        elif life == "single parent two jobs":
            kinds = ["single parent", "two jobs"]
            self.parent_care(r)
            slots = self.shift_slots(r, DAYS[:5], ["09:00"], 330, 5, 28)
            self.job("job-main", "Lakeview Dental Office", "Front desk", slots, rr.randint(1700, 2100), 0.12)
            slots = self.shift_slots(r, ["Sat", "Sun"], ["10:00", "11:00"], 420, 2, 14)
            self.job("job-second", "Pinecrest Mall Outfitters", "Weekend associate", slots, rr.randint(1500, 1700), 0.1)
            self.bill("childcare", "After-school program", "KIDS CLUB AFTERCARE", "GENERAL_SERVICES_CHILDCARE", rr.randint(25000, 45000), day=1)
            self.sleep_routine(("22:45", "06:30"), ("23:30", "07:30"))
        elif life == "caregiver":
            kinds = ["caregiver", "lives with family"]
            slots = self.shift_slots(r, DAYS[:5], ["08:00", "09:00"], 300, 4, 22)
            self.job("job-main", "City Pharmacy", "Pharmacy technician", slots, rr.randint(1700, 2100), 0.11)
            mid = self.memory("I take care of my mom. I'm at her place Tuesday and Thursday evenings and Saturday mornings", "routine")
            self.p["places"]["care"] = "her mom's place"
            self.p["routines"].append({"id": "mom-care", "activity": "care", "label": "Caring for Mom", "where": "care", "records_as": "none", "timeline": "routine", "keep_rate": 1.0,
                                       "windows": [{"id": "weekly", "days": ["Tue", "Thu"], "start": "17:30", "end": "20:30", "firmness": "fixed"},
                                                   {"id": "saturday", "days": ["Sat"], "start": "09:00", "end": "12:00", "firmness": "fixed"}], "source_memory": mid})
            self.week.take(["Tue", "Thu"], mm("17:30"), mm("20:30"))
            self.week.take(["Sat"], mm("09:00"), mm("12:00"))
            self.sleep_routine(("23:00", "06:45"), ("23:45", "07:45"))
        else:
            kinds = ["retired"]
            self.p["income"].append({"id": "inc-ss", "type": "salary", "label": "Social Security", "annual_cents": rr.randint(1900000, 3000000), "pay_period": "monthly", "pay_day": r.choice([3, 10, 17, 24]),
                                     "tax_share": 0.0, "account": "acc-checking", "description": "SSA TREAS 310 XXSOC SEC", "merchant_name": None, "pfc": "INCOME_RETIREMENT_PENSION"})
            self.p["income"].append({"id": "inc-pension", "type": "salary", "label": "Pension", "annual_cents": rr.randint(900000, 2400000), "pay_period": "monthly", "pay_day": 1, "tax_share": 0.1,
                                     "account": "acc-checking", "description": "STATE TEACHERS RET SYS PENSION", "merchant_name": None, "pfc": "INCOME_RETIREMENT_PENSION"})
            self.monthly_in = sum(i["annual_cents"] for i in self.p["income"]) / 12 * 0.95
            self.p["real_life"]["events"].append({"id": "ev-volunteer", "title": "Volunteering at the food bank", "start": "09:30", "end": "12:30", "repeat": {"days": ["Wed"], "from": "2026-06-03"},
                                                  "state": "with people", "place": "out", "source": "google"})
            self.week.take(["Wed"], mm("09:30"), mm("12:30"))
            self.sleep_routine(("22:30", "06:30"), ("23:00", "07:15"), early_before="10:00")
        self.accounts(rr.randint(150000, 600000), rr.randint(100000, 1500000), rr.choice([300000, 500000, 900000]))
        if life not in ("retired",) or r.random() < 0.5:
            rent = rr.randint(90000, 185000) if "roommates" not in kinds else rr.randint(60000, 110000)
            self.bill("rent", "Rent" if "roommates" not in kinds else "Rent share", "PARKSIDE APTS RENT WEB", "RENT_AND_UTILITIES_RENT", rent, day=1, merchant_name="Parkside Apartments")
        else:
            self.bill("property-tax", "Property tax escrow", "COUNTY TREASURER ESCROW", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", rr.randint(25000, 45000), day=15)
        self.bill("electric", "Electric", "CITY POWER AND LIGHT", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", rr.randint(6000, 14000), day=rr.randint(8, 22), varies_pct=0.2, merchant_name="City Power and Light")
        self.bill("internet", "Internet", "FIBERLINE INTERNET", "RENT_AND_UTILITIES_INTERNET_AND_CABLE", rr.choice([5500, 6999, 7999]), day=rr.randint(5, 25), via="card", acc="acc-card", merchant_name="Fiberline")
        if car:
            self.bill("car-insurance", "Car insurance", "SAFEROUTE AUTO INS PREM", "GENERAL_SERVICES_INSURANCE", rr.randint(9000, 19000), day=rr.randint(3, 25), merchant_name="SafeRoute Insurance")
        self.phone_and_subs(True)
        fam = "parent" in " ".join(kinds)
        self.everyday_spending({"campus_food": 0, "eating_out": 1.6, "coffee": 2.8, "shopping": 1.6 if fam else 1.0, "family_budget": fam, "target": 0.8 if fam else 0.4,
                                "gas": 1.4 if fam else 0.9, "convenience": 1.6 if fam else 1.2}, car, False)
        self.cover_gap()
        self.p["savings_plan"] = {"from": "acc-checking", "to": "acc-savings", "amount_cents": max(2500, round(max(0, self.monthly_in - self.monthly_bills - self.spend_month) * 0.4 / 100) * 100),
                                  "on": "monthly", "day": 3, "skip_if_below_cents": 60000}
        if not any(x["id"] == "gym" for x in self.p["routines"]) and r.random() < 0.5:
            self.gym(r, [(["Mon", "Wed", "Fri"], "06:15", 60), (["Tue", "Thu", "Sat"], "18:00", 60), (["Sat", "Sun"], "09:00", 75), (["Mon", "Thu"], "19:00", 60)])
        if not any(x["id"] == "groceries" for x in self.p["routines"]):
            self.groceries_routine(r)
        if r.random() < 0.5:
            mid = self.memory("I call my sister every Sunday evening", "routine")
            if self.week.free("Sun", mm("19:00"), mm("19:45")):
                self.p["routines"].append({"id": "call-family", "activity": "call", "label": "Call with family", "records_as": "calendar_recurring", "calendar_title": "Call sis", "keep_rate": 0.85,
                                           "windows": [{"id": "weekly", "days": ["Sun"], "start": "19:00", "end": "19:45", "firmness": "firm"}], "source_memory": mid})
        if r.random() < 0.5 and self.week.free_days(["Fri", "Sat"], mm("18:30"), mm("23:59"), pad=30):
            self.p["real_life"]["nights_out"] = {"per_month": r.choice([1, 2, 3]), "days": self.week.free_days(["Fri", "Sat"], mm("18:30"), mm("23:59"), pad=30) or ["Fri"], "start": "19:00", "end": "22:30", "on_calendar": 0.5, "place": "out",
                                                 "titles": ["Dinner with friends", "Movie night", "Drinks with coworkers"], "spend": {"habit": "eating-out", "amount_cents": [2000, 5500]}}
        self.p["id"] = f"p{1000 + self.seed:04d}-" + slug(life)
        self.p["summary"] = {"shift worker": "Works full-time shifts, no school", "salaried": "Salaried office worker, hybrid schedule", "freelancer": "Freelance designer with two clients and uneven pay",
                             "gig worker": "Delivery gig worker with variable weekly pay", "single parent two jobs": "Single parent working two jobs", "caregiver": "Part-time pharmacy technician who cares for her mom",
                             "retired": "Retired teacher living on a pension and Social Security"}[life]
        self.p["kinds"] = kinds
        self.p["time_zone"] = self.tz
        self.p["pay"] = {"type": "salary" if life in ("salaried", "retired") else "per gig" if life in ("gig worker", "freelancer") else "hourly", "period": "monthly" if life == "retired" else "biweekly"}
        self.p["health"] = {"goals": {"workouts_per_week": 2, "sleep_hours": 7}, "steps": {"work": [7000, 13000], "class": [6000, 9000], "free": [3000, 8000]}, "resting_heart_rate": r.randint(58, 72),
                            "nutrition": {"enabled": r.random() < 0.2, "log_rate": 0.5, "base_kcal": 2000, "sd_kcal": 220, "goal_kcal": 2100}}
        self.email(f"{self.name.lower()}.{self.seed}@example.com", {"work_other": 0.5} if life not in ("retired",) else {}, scale=1.1)
        return self.finish()

    def finish(self):
        order = ["id", "summary", "kinds", "student", "time_zone", "pay", "places", "commute_minutes", "commute_mode", "ready_minutes", "wind_down_minutes", "accounts", "income", "bills",
                 "savings_plan", "bank", "spending", "school", "work", "dependents", "health", "routines", "real_life", "email", "memories"]
        p = {k: self.p[k] for k in order if k in self.p}
        p["generated"] = {"by": "personas.py", "seed": self.seed, "term": self.term["name"]}
        # Volume guard: a real account like this shows about this many purchases a week. Small, frequent habits make up
        # the difference, with smaller amounts so the total still fits what comes in.
        family = any(k in p["kinds"] for k in ("parent", "single parent"))
        target = 23.0 if family else 14.5
        est = sum((h.get("per_week", 0) * (0.5 if h.get("when", "any") != "any" else 1)) + h.get("extra_per_week", 0) + (1 if h.get("routine") else 0) for h in p["spending"])
        flex = [h for h in p["spending"] if h["id"] in ("coffee", "convenience", "eating-out", "shopping", "kids", "family-takeout", "app-store", "venmo", "target")]
        if est < target and flex:
            f = 1 + (target - est) / sum(h["per_week"] for h in flex)
            for h in flex:
                h["per_week"] = round(h["per_week"] * f, 2)
                h["amount_cents"] = [max(150, round(x / f)) for x in h["amount_cents"]]
                for m in h["merchants"]:
                    if m.get("amount_cents"):
                        m["amount_cents"] = [max(150, round(x / f)) for x in m["amount_cents"]]
        for h in p["spending"]:
            if h.get("routine") and not any(x["id"] == h["routine"] for x in p["routines"]):
                h.pop("routine")
                h["per_week"] = h.pop("extra_per_week", 0.5) + 0.8
        return p


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate personas for the situation library (70% students by default).")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--start", type=int, default=1, help="first seed")
    ap.add_argument("--seed", type=int, help="one persona with this seed")
    ap.add_argument("--kind", choices=["student", "other"], help="force a student or another life (with --seed)")
    ap.add_argument("--term", choices=sorted(TERMS), default="fall-2026")
    ap.add_argument("--out", help="folder to write <id>.json into (default: print a summary)")
    ap.add_argument("--print", action="store_true", help="print the full JSON")
    a = ap.parse_args(argv)
    batch = [(a.seed, a.kind)] if a.seed is not None else mix(a.count, a.start)
    for seed, kind in batch:
        p = make_persona(seed, kind, a.term)
        if a.out:
            Path(a.out).mkdir(parents=True, exist_ok=True)
            (Path(a.out) / f"{p['id']}.json").write_text(json.dumps(p, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if a.print:
            print(json.dumps(p, indent=2, ensure_ascii=False))
        else:
            print(f"{p['id']}: {p['summary']} [{', '.join(p['kinds'])}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
