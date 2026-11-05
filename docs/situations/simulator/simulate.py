#!/usr/bin/env python3
"""LifeFlow life simulator: a persona plus a scenario become a full, realistic mock of every connection.

The situation writer authors a persona (how this life normally runs, reusable across cases) and a scenario
(the signal and what Dev must do). This script expands them, deterministically by seed, into what a real
account looks like after every connection is synced, with the signal buried in normal life.

Run:
  python3 docs/situations/simulator/simulate.py docs/situations/cases/<id>/scenario.json
  python3 docs/situations/simulator/simulate.py <scenario.json> --persona <persona.json> --out <folder>

Writes next to scenario.json (or into --out):
  persona.json    the persona actually used (library persona with the scenario's overrides), frozen
  connections/    bank.json calendar.json school.json work.json health.json email.json memories.json
  timeline.json   real life derived from the connections: consecutive stretches, no gaps, no overlaps
  truth.json      what the simulator planted (routine log, hidden shifts, change effects, recurring charges,
                  pay pairs). For graders and model tests; Dev never sees it.

Standard library only. The same persona, scenario and seed always give byte-identical files.
Formats: persona.schema.md and scenario.schema.md in this folder.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from fractions import Fraction
from pathlib import Path
from zoneinfo import ZoneInfo

VERSION = "1.0"
HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent
PERSONA_DIR = LIBRARY / "personas"
DAY = timedelta(days=1)
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
CONNECTIONS = ["bank", "calendar", "school", "work", "health", "email", "memories"]

# Timeline: which state wins when two stretches overlap.
PRIO = {"away": 100, "work": 90, "class": 85, "appointment": 80, "care": 75, "with people": 70, "study": 65, "other": 60, "asleep": 50, "commute": 40, "home": 20, "day off": 10}
SOFT_STATES = ("home", "day off", "asleep")
ACTIVITY_STATE = {"study": "study", "workout": "other", "call": "with people", "family": "with people", "care": "care", "meal": "home", "keep free": "day off",
                  "deep work": "work", "chores": "home", "groceries": "other", "sleep": "asleep", "appointment": "appointment"}
ACTIVITIES = set(ACTIVITY_STATE)
FIRMNESS = {"fixed": 1.0, "firm": 0.88, "usual": 0.78, "loose": 0.65}
ROUTINE_ORDER = {"care": 0, "keep free": 1, "workout": 2, "study": 3, "deep work": 3, "call": 4, "family": 4, "meal": 5, "groceries": 6, "chores": 7}
RECORDS_AS = {"calendar", "calendar_recurring", "health_workout", "health_sleep", "bank", "none"}

# The app's default categories (services/finance/categories.ts), child -> parent.
CATEGORY_TREE = {
    "Food & Dining": ["Groceries", "Restaurants", "Coffee", "Food Delivery"], "Housing": ["Rent", "Utilities", "Internet"],
    "Transportation": ["Gas", "Rideshare", "Public Transit", "Parking"], "Shopping": ["Clothing", "Electronics", "Household"],
    "Entertainment": ["Streaming", "Events", "Games"], "Health": ["Pharmacy", "Fitness", "Medical"], "Education": ["Tuition", "Books & Supplies"],
    "Bills & Subscriptions": ["Phone", "Insurance", "Software"], "Income": ["Paycheck", "Side Income", "Interest Income"],
    "Transfers": ["Credit Card Payment", "Savings Transfer", "Investment Transfer"],
}
CATEGORY_PARENT = {c: p for p, cs in CATEGORY_TREE.items() for c in cs}

# Plaid personal_finance_category primaries, longest first so prefixes resolve.
PFC_PRIMARIES = sorted(["INCOME", "TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "BANK_FEES", "ENTERTAINMENT", "FOOD_AND_DRINK", "GENERAL_MERCHANDISE", "HOME_IMPROVEMENT",
                        "MEDICAL", "PERSONAL_CARE", "GENERAL_SERVICES", "GOVERNMENT_AND_NON_PROFIT", "TRANSPORTATION", "TRAVEL", "RENT_AND_UTILITIES"], key=len, reverse=True)

# Ported from integrations/plaid.ts (mapPfc, pickCategory) and services/finance/categorize.ts (keywordCategory).
INCOMING_HINT = re.compile(r"\b(payroll|direct dep|dir dep|deposit|salary|zelle|venmo|cash ?app|paypal|wages|stipend)\b", re.I)
GENERIC = {"Other", "Household", "Events", "Transportation", "Personal Care"}
INCOME_KEYWORDS = [(re.compile(p), n) for p, n in [
    (r"\b(payroll|direct dep(osit)?|dir dep|salary|paycheck|wages|adp|gusto|paychex|trinet|workday pay)\b", "Paycheck"),
    (r"\b(dasher|doordash|uber|lyft|instacart|shipt|grubhub|etsy|ebay|fiverr|upwork|rover|tutor)\b", "Side Income"),
    (r"\b(interest paid|interest earned|int earned|dividend)\b", "Interest Income"),
]]
KEYWORDS = [(re.compile(p), n) for p, n in [
    (r"\b(overdraft|nsf|insufficient funds|late fee|interest charge|service fee|maintenance fee|atm fee|foreign transaction)\b", "Fees & Interest"),
    (r"\b(uber ?eats|doordash|grubhub|postmates|seamless|instacart)\b", "Food Delivery"),
    (r"\b(starbucks|dunkin|peet'?s|tim hortons|dutch bros|coffee|cafe)\b", "Coffee"),
    (r"\b(trader joe'?s|whole foods|safeway|kroger|aldi|publix|wegmans|costco|sam'?s club|h ?e ?b|food lion|giant eagle|sprouts|grocery|supermarket|market|meijer|hy-?vee|winco|stop ?& ?shop|food 4 less|smart ?& ?final)\b", "Groceries"),
    (r"\b(mcdonald'?s|chipotle|chick ?fil ?a|subway|taco bell|wendy'?s|burger king|panera|domino'?s|pizza|kfc|sweetgreen|shake shack|panda express|five guys|jersey mike'?s|wingstop|popeyes|raising cane'?s|in-n-out|jack in the box|sonic drive|arby'?s|cava|qdoba|noodles|ihop|denny'?s|applebee'?s|olive garden|buffalo wild|restaurant|grill|diner|bistro|kitchen|taqueria|sushi|ramen|bbq)\b", "Restaurants"),
    (r"\b(uber|lyft)\b", "Rideshare"),
    (r"\b(verizon|t[- ]?mobile|at ?& ?t|mint mobile|visible|cricket|xfinity mobile|boost mobile|metro by)\b", "Phone"),
    (r"\b(shell|chevron|exxon|mobil|bp|sunoco|valero|marathon|speedway|wawa|quiktrip|racetrac|gas station|fuel)\b", "Gas"),
    (r"\b(mta|bart|metro|transit|septa|cta|marta|amtrak|caltrain|clipper|ventra)\b", "Public Transit"),
    (r"\b(parking|parkmobile|spothero)\b", "Parking"),
    (r"\b(netflix|hulu|disney ?\+?|disney plus|hbo max|hbo|spotify|apple music|youtube premium|paramount|peacock|crunchyroll)\b", "Streaming"),
    (r"\b(amazon prime|prime video|apple\.com\/bill|apple com bill|itunes|google \*|patreon|audible|siriusxm)\b", "Bills & Subscriptions"),
    (r"\b(steam|playstation|xbox|nintendo|epic games)\b", "Games"),
    (r"\b(ticketmaster|stubhub|eventbrite|amc|regal|cinema)\b", "Events"),
    (r"\b(cvs|walgreens|rite aid|pharmacy)\b", "Pharmacy"),
    (r"\b(urgent care|clinic|hospital|medical|dentist|doctor|physician|optometrist|labcorp|quest diagnostics|copay)\b", "Medical"),
    (r"\b(sephora|ulta|barber|salon|haircut|nail spa|great clips|supercuts|sally beauty)\b", "Personal Care"),
    (r"\b(gofundme|red cross|donation|charity|church|unicef|st jude)\b", "Gifts & Donations"),
    (r"\b(planet fitness|equinox|la fitness|gym|peloton|crunch fitness|ymca)\b", "Fitness"),
    (r"\b(comcast|xfinity|spectrum|cox|optimum|fios|internet)\b", "Internet"),
    (r"\b(geico|progressive|state farm|allstate|lemonade|insurance|dental|vision plan)\b", "Insurance"),
    (r"\b(adobe|microsoft|google storage|icloud|dropbox|notion|chatgpt|openai|github|canva|grammarly)\b", "Software"),
    (r"\b(best buy|apple store|newegg)\b", "Electronics"),
    (r"\b(amazon|amzn|target|walmart|ikea|home depot|lowe'?s|bed bath|dollar general|dollar tree)\b", "Household"),
    (r"\b(h ?& ?m|zara|uniqlo|nike|adidas|old navy|gap|nordstrom|shein)\b", "Clothing"),
    (r"\b(rent|apartments?|apts|property management|landlord)\b", "Rent"),
    (r"\b(electric|power|energy|con ?ed|pg ?& ?e|duke energy|water|sewer|gas company|utility|utilities|dominion|xcel|entergy|national grid|pseg|edison|fpl)\b", "Utilities"),
    (r"\b(airbnb|hotel|marriott|hilton|hyatt|expedia|booking\.com|delta air|united airlines|american airlines|southwest|jetblue|spirit airlines|frontier airlines)\b", "Travel"),
    (r"\b(tuition|bursar|registrar)\b", "Tuition"),
    (r"\b(chegg|textbook|bookstore|pearson|mcgraw)\b", "Books & Supplies"),
    (r"\b(credit crd|credit card payment|card payment|payment thank you|payment received|capital one|discover|amex|american express|citi card|chase card|epay)\b", "Credit Card Payment"),
    (r"\b(transfer to savings|savings transfer)\b", "Savings Transfer"),
    (r"\b(venmo|zelle|cash app|paypal)\b", ""),
]]

DEFAULT_SUBJECTS = {
    "promotions": ["{pct}% off this weekend only", "Last chance: free shipping ends tonight", "New arrivals picked for you", "Your weekend deals are here", "Members save more this week",
                   "Back in stock", "Flash sale, today only", "We saved you a coupon", "Your cart misses you", "Fresh picks for the week"],
    "newsletters": ["This week in your neighborhood", "Your weekly digest", "Five stories worth reading", "Weekend reading", "The Monday brief", "What's new this month"],
    "social": ["{name} commented on your post", "You have 4 new notifications", "{name} sent you a message", "{name} tagged you in a photo", "See what you missed this week", "{name} shared a memory"],
    "personal": ["Re: this weekend", "Photos from Saturday", "Quick question", "Re: plans", "Sharing the recipe", "Fwd: you'll like this"],
    "security": ["New sign-in to your account", "Your verification code", "Your password was changed", "Review your recent activity"],
    "school_other": ["Registration for spring opens soon", "Campus closure reminder", "Library hours this week", "Advising appointments are open", "Student life events this week"],
    "work_other": ["Benefits enrollment reminder", "Team update", "Policy update: please review", "Your training is due", "Staff newsletter"],
    "kid_school": ["Room 12 weekly update", "Picture day reminder", "Field trip form", "Library books due Friday", "Class party sign-up"],
}
DEFAULT_SENDERS = {
    "promotions": [["Shop deals", "deals@example.com"], ["Outdoor gear", "news-outdoor@example.com"], ["Pizza place", "offers-pizza@example.com"],
                   ["Shoe store", "hello-shoes@example.com"], ["Grocery app", "save-grocer@example.com"]],
    "newsletters": [["Local news", "digest-local@example.com"], ["Weekly reads", "weekly-reads@example.com"]],
    "social": [["Social app", "notify-social@example.com"], ["Photo app", "notify-photos@example.com"]],
    "personal": [["A friend", "friend-one@example.com"], ["A cousin", "cousin-one@example.com"]],
    "security": [["Account security", "security-noreply@example.com"]],
    "school_other": [["College news", "college-news@example.com"]],
    "work_other": [["Workplace HR", "hr-news@example.com"]],
    "kid_school": [["Classroom teacher", "room12-teacher@example.com"]],
}
LABELS = {"promotions": "CATEGORY_PROMOTIONS", "newsletters": "CATEGORY_UPDATES", "social": "CATEGORY_SOCIAL", "personal": "CATEGORY_PERSONAL", "security": "CATEGORY_UPDATES",
          "school": "CATEGORY_UPDATES", "school_other": "CATEGORY_UPDATES", "work": "CATEGORY_UPDATES", "work_other": "CATEGORY_UPDATES", "bank": "CATEGORY_UPDATES",
          "receipt": "CATEGORY_UPDATES", "bill": "CATEGORY_UPDATES", "travel": "CATEGORY_UPDATES", "kid_school": "CATEGORY_UPDATES", "school_district": "CATEGORY_UPDATES"}
FIRST_NAMES = ["Alex", "Sam", "Jordan", "Taylor", "Riley", "Casey", "Morgan", "Jamie", "Avery", "Quinn"]
ANNOUNCEMENTS = ["Slides for this week are posted", "Study guide posted", "Reading for next week", "Office hours moved this week", "Lab safety reminder",
                 "Reminder about late work", "Optional review session", "Groups for the next project", "Update to the schedule page", "Tips for the next assignment"]


class SimError(Exception):
    """A persona or scenario the simulator can't turn into a consistent life."""


# ---------------------------------------------------------------- small helpers

def D(s):
    return date.fromisoformat(s)


def T(s):
    return datetime.fromisoformat(s)


def at(day, hhmm):
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime(day.year, day.month, day.day) + timedelta(hours=h, minutes=m)


def mins(n):
    return timedelta(minutes=n)


def wd(d):
    return DAYS[d.weekday()]


def local(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def daterange(a, b):
    d = a
    while d < b:
        yield d
        d += DAY


def span(day, w):
    """A window {start, end} on a day; an end at or before the start runs past midnight."""
    s, e = at(day, w["start"]), at(day, w["end"])
    if e <= s:
        e += DAY
    return s, e


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def half_up(f):
    f = Fraction(f)
    return math.floor(f + Fraction(1, 2)) if f >= 0 else -math.floor(-f + Fraction(1, 2))


def poisson(rng, lam):
    if lam <= 0:
        return 0
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def chance_round(rng, x):
    whole = math.floor(x)
    return whole + (1 if rng.random() < x - whole else 0)


def weighted(rng, items):
    total = sum(i.get("weight", 1) for i in items)
    x = rng.random() * total
    for i in items:
        x -= i.get("weight", 1)
        if x <= 0:
            return i
    return items[-1]


def fill(template, rng):
    """{n4} -> 4 random digits, {A6} -> 6 random capitals and digits (the varying reference in a bank line)."""
    def rep(m):
        pool = "0123456789" if m.group(1) == "n" else "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return "".join(rng.choice(pool) for _ in range(int(m.group(2))))
    return re.sub(r"\{([nA])(\d+)\}", rep, template)


def money(c):
    return f"${abs(c) / 100:,.2f}"


def nth_weekday(y, m, weekday, n):
    if n > 0:
        d = date(y, m, 1)
        return d + timedelta(days=(weekday - d.weekday()) % 7) + timedelta(weeks=n - 1)
    last = date(y + (m == 12), m % 12 + 1, 1) - DAY
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def bank_holidays(y):
    fixed = [date(y, 1, 1), date(y, 6, 19), date(y, 7, 4), date(y, 11, 11), date(y, 12, 25)]
    fixed = [d + DAY if d.weekday() == 6 else d for d in fixed]
    return set(fixed + [nth_weekday(y, 1, 0, 3), nth_weekday(y, 2, 0, 3), nth_weekday(y, 5, 0, -1), nth_weekday(y, 9, 0, 1), nth_weekday(y, 10, 0, 2), nth_weekday(y, 11, 3, 4)])


_HOLIDAYS = {}


def business_day(d):
    if d.year not in _HOLIDAYS:
        _HOLIDAYS[d.year] = bank_holidays(d.year)
    return d.weekday() < 5 and d not in _HOLIDAYS[d.year]


def next_business(d):
    while not business_day(d):
        d += DAY
    return d


def prev_business(d):
    while not business_day(d):
        d -= DAY
    return d


def month_day(y, m, day):
    last = (date(y + (m == 12), m % 12 + 1, 1) - DAY).day
    return date(y, m, min(day, last))


class Seeds:
    """Independent random streams per key, so changing one part of a life never shifts another."""

    def __init__(self, seed):
        self.seed = seed

    def r(self, *key):
        h = hashlib.sha256("|".join(str(k) for k in (self.seed, *key)).encode()).digest()
        return random.Random(int.from_bytes(h[:8], "big"))


def hexid(*key, n=16, alphabet="0123456789abcdef"):
    """A stable provider-style id. Never all digits when the alphabet has letters, so it can't pass for an account number."""
    salt = 0
    while True:
        h = hashlib.sha256("|".join(str(k) for k in (key + (salt,) if salt else key)).encode()).digest()
        x = int.from_bytes(h, "big")
        out = []
        for _ in range(n):
            x, i = divmod(x, len(alphabet))
            out.append(alphabet[i])
        val = "".join(out)
        if alphabet.isdigit() or not val.isdigit():
            return val
        salt += 1


def deep_merge(base, over):
    """Dicts merge; lists of objects with ids merge by id (a null value removes one); other values replace."""
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(base[k], v) if k in base else v
        return out
    if isinstance(base, list) and isinstance(over, list) and all(isinstance(x, dict) and "id" in x for x in base + over):
        out = [dict(x) for x in base]
        idx = {x["id"]: i for i, x in enumerate(out)}
        for x in over:
            if x["id"] in idx:
                out[idx[x["id"]]] = deep_merge(out[idx[x["id"]]], x)
            else:
                out.append(x)
        return [x for x in out if not x.get("remove")]
    return copy.deepcopy(over)


# ------------------------------------------------------------- the app's category rules

def pfc_primary(detailed):
    for p in PFC_PRIMARIES:
        if detailed == p or detailed.startswith(p + "_"):
            return p
    raise SimError(f"unknown Plaid category {detailed!r}")


def map_pfc(detailed, amount, text):
    """Plaid category -> (LifeFlow default category, transaction kind), as integrations/plaid.ts does it.
    The detail is read after the primary prefix (RENT_AND_UTILITIES_TELEPHONE is Phone, not Rent)."""
    p = pfc_primary(detailed)
    d = detailed[len(p):]
    out = amount < 0
    if p == "INCOME":
        return ("Paycheck" if "WAGES" in d else "Interest Income" if "INTEREST" in d else "Side Income"), ("expense" if out else "income")
    if p in ("TRANSFER_IN", "TRANSFER_OUT"):
        if "SAVINGS" in d:
            return "Savings Transfer", "transfer"
        if "INVESTMENT" in d:
            return "Investment Transfer", "transfer"
        if p == "TRANSFER_IN" and not out and INCOMING_HINT.search(text):
            return ("Paycheck" if "PAYROLL" in d else "Side Income"), "income"
        return None, "transfer"
    if p == "LOAN_PAYMENTS":
        return ("Credit Card Payment" if "CREDIT_CARD" in d else None), "transfer"
    cat = {
        "BANK_FEES": lambda x: "Fees & Interest",
        "ENTERTAINMENT": lambda x: "Streaming" if ("TV_AND_MOVIES" in x or "MUSIC" in x) else "Games" if "VIDEO_GAMES" in x else "Events",
        "FOOD_AND_DRINK": lambda x: "Groceries" if "GROCERIES" in x else "Coffee" if "COFFEE" in x else "Restaurants",
        "GENERAL_MERCHANDISE": lambda x: "Clothing" if "CLOTHING" in x else "Electronics" if "ELECTRONICS" in x else "Household",
        "HOME_IMPROVEMENT": lambda x: "Household",
        "MEDICAL": lambda x: "Pharmacy" if "PHARMAC" in x else "Medical",
        "PERSONAL_CARE": lambda x: "Fitness" if "GYMS" in x else "Personal Care",
        "GENERAL_SERVICES": lambda x: "Insurance" if "INSURANCE" in x else "Tuition" if "EDUCATION" in x else "Other",
        "GOVERNMENT_AND_NON_PROFIT": lambda x: "Gifts & Donations" if "DONATIONS" in x else "Other",
        "TRANSPORTATION": lambda x: "Gas" if "GAS" in x else "Parking" if "PARKING" in x else "Public Transit" if "PUBLIC_TRANSIT" in x else "Rideshare" if "TAXIS" in x else "Transportation",
        "TRAVEL": lambda x: "Travel",
        "RENT_AND_UTILITIES": lambda x: "Rent" if x.startswith("_RENT") else "Phone" if "TELEPHONE" in x else "Internet" if "INTERNET" in x else "Utilities",
    }[p](d)
    return cat, ("expense" if out else "refund")


def keyword_category(text, amount):
    t = f" {text.lower()} "
    for rx, name in (INCOME_KEYWORDS if amount > 0 else KEYWORDS):
        if rx.search(t):
            return name or None
    return None


def categorize(detailed, amount, merchant, description):
    text = f"{merchant or ''} {description}"
    cat, kind = map_pfc(detailed, amount, text)
    kw = keyword_category(text, amount)
    if not cat:
        cat = kw
    elif kw and kind == "expense" and cat in GENERIC:
        cat = kw
    return cat, kind


def merchant_key(merchant, description):
    raw = re.sub(r"^(?:paypal|pp|sq|tst|sp|py|ckc|dd|google|goog|apl|in)\s*\*\s*", "", (merchant or description).strip(), flags=re.I)
    words = [w for w in re.sub(r"[^a-z0-9 ]+", " ", raw.lower()).split() if not re.search(r"\d", w)]
    return " ".join(words[:4])


# ---------------------------------------------------------------- the simulator

class Sim:
    def __init__(self, persona, scenario):
        self.p, self.s = persona, scenario
        self.seed = scenario.get("seed", 1)
        self.R = Seeds(self.seed).r
        self.tz = persona["time_zone"]
        self.zone = ZoneInfo(self.tz)
        self.now = T(scenario["now"])
        self.today = self.now.date()
        self.d0 = self.today - timedelta(days=int(scenario.get("history_days", 90)))
        self.d1 = self.today + timedelta(days=int(scenario.get("future_days", 60)) + 1)
        self.start, self.end = at(self.d0, "00:00"), at(self.d1, "00:00")
        self.changes = scenario.get("changes", [])
        self.blocks, self.by_day = [], defaultdict(list)
        self.ids = set()
        self.cal_rows, self.workouts, self.sleep_sessions = [], [], []
        self.routine_log, self.routine_hits = {}, defaultdict(list)
        self.away, self.night_spend, self.trip_buys = [], [], []
        self.emails_derived = []
        self.truth_changes = {c["id"]: {"type": c["type"], "records": []} for c in self.changes}
        self.places = persona.get("places", {})
        self.ready = persona.get("ready_minutes", 45)
        self.wind = persona.get("wind_down_minutes", 30)
        self.routines = {r["id"]: r for r in persona.get("routines", [])}
        ids = [c["id"] for c in self.changes]
        if len(ids) != len(set(ids)):
            raise SimError("scenario change ids must be unique")

    # ---- small utilities
    def ch(self, kind):
        return [c for c in self.changes if c["type"] == kind]

    def note(self, cid, rid):
        if cid in self.truth_changes and rid not in self.truth_changes[cid]["records"]:
            self.truth_changes[cid]["records"].append(rid)

    def iso(self, dt, zone=None):
        if dt is None:
            return None
        return dt.replace(tzinfo=zone or self.zone).isoformat(timespec="seconds")

    def elapsed(self, a, b):
        """Real minutes between two local times (a night across a clock change is an hour longer or shorter)."""
        ua = a.replace(tzinfo=self.zone).astimezone(timezone.utc)
        ub = b.replace(tzinfo=self.zone).astimezone(timezone.utc)
        return round((ub - ua).total_seconds() / 60)

    def uid(self, base):
        cand, i = base, 1
        while cand in self.ids:
            i += 1
            cand = f"{base}-{i}"
        self.ids.add(cand)
        return cand

    def claim(self, rid):
        if rid in self.ids:
            raise SimError(f"duplicate id {rid}")
        self.ids.add(rid)
        return rid

    def commute(self, a, b):
        if a is None or b is None or a == b:
            return 0
        cm = self.p.get("commute_minutes", {})
        return cm.get(f"{a}-{b}", cm.get(f"{b}-{a}", self.p.get("default_commute_minutes", 20)))

    def place_label(self, place):
        return self.places.get(place, place)

    # ---- real-life blocks (what fills the person's hours)
    def block(self, start, end, state, label, place, ref, visible=True, ready=None, kind=None):
        if end <= start:
            return None
        b = {"start": start, "end": end, "state": state, "label": label, "place": place, "ref": ref, "visible": visible, "ready": ready, "kind": kind or state}
        self.blocks.append(b)
        d = start.date()
        while d <= (end - mins(1)).date():
            self.by_day[d].append(b)
            d += DAY
        return b

    def overlapping(self, s, e, pad=0, visible_only=False, ignore=SOFT_STATES):
        out, seen = [], set()
        d = (s - mins(pad)).date()
        while d <= (e + mins(pad)).date():
            for b in self.by_day.get(d, []):
                if id(b) in seen:
                    continue
                seen.add(id(b))
                if b["state"] in ignore or (visible_only and not b["visible"]):
                    continue
                if b["start"] < e + mins(pad) and b["end"] > s - mins(pad):
                    out.append(b)
            d += DAY
        return out

    def is_free(self, s, e, pad=10, visible_only=False, ignore=SOFT_STATES):
        if s < self.now < e:
            return False
        return not self.overlapping(s, e, pad, visible_only, ignore)

    def blocks_starting(self, d, state, visible_only=False):
        return [b for b in self.by_day.get(d, []) if b["state"] == state and b["start"].date() == d and (b["visible"] or not visible_only)]

    def away_at(self, t):
        return next((a for a in self.away if a[0] <= t < a[1]), None)

    def cal_row(self, rid, title, s, e, kind="personal", source="google", location=None, course_id=None, all_day=False, recurrence=None, description=None,
                created_at=None, s_zone=None, e_zone=None):
        self.cal_rows.append({
            "id": rid, "title": title, "description": description, "location": location,
            "starts_at": self.iso(s, s_zone), "ends_at": self.iso(e, e_zone), "all_day": all_day, "kind": kind, "recurrence": recurrence,
            "course_id": course_id, "source": source,
            "provider_event_id": None if source == "manual" else (f"event-calendar-event-{int(hexid(rid, n=6, alphabet='0123456789'))}" if source == "canvas" else hexid(source, rid, n=26, alphabet="abcdefghijklmnopqrstuv0123456789")),
            "created_at": self.iso(created_at) if created_at else None,
        })

    # ---------------------------------------------------------------- school
    def build_school(self):
        sc = self.p.get("school")
        self.school = None
        self.term_off = {}
        self.exam_dates = []
        if not sc:
            return
        term = sc["term"]
        t0, t1 = D(term["start"]), D(term["end"])
        off = {}
        for b in term.get("breaks", []):
            for d in daterange(D(b["start"]), D(b["end"]) + DAY):
                off[d] = b.get("label", "Break")
        for h in term.get("no_class_days", []):
            off[D(h["date"])] = h.get("label", "No classes")
        self.term_off = off
        cancels = {(c["course"], c["date"]): c for c in self.ch("class_cancel")}
        moves = {(c["course"], c["exam"]): c for c in self.ch("exam_move")}
        courses, items, anns = [], [], []
        lms = sc.get("lms", "canvas")
        base = sc.get("lms_url", f"https://{lms.replace('_', '')}.example.com")
        src = {"canvas": "canvas", "google_classroom": "google"}.get(lms, "import")
        for ci, c in enumerate(sc["courses"]):
            code, cs = c["code"], slug(c["code"])
            cid = self.claim(f"course-{cs}")
            loc = c["meetings"][0].get("location") if c.get("meetings") else None
            courses.append({
                "id": cid, "name": c["name"], "code": code, "term": term.get("name"), "instructor_name": c.get("instructor"),
                "instructor_email": c.get("instructor_email"), "location": loc,
                "meeting_info": "; ".join(f"{'/'.join(m['days'])} {m['start']}-{m['end']}" for m in c.get("meetings", [])) or "Online",
                "grade_weights": c.get("grade_weights"), "format": c.get("format", "in person"), "credits": c.get("credits"), "source": src,
                "provider_course_id": str(4100 + ci * 37), "url": f"{base}/courses/{4100 + ci * 37}",
            })
            lo, hi = c.get("grade_pct", [74, 96])
            exam_days = set()
            for ex in c.get("exams", []):
                exd = dict(ex)
                mv = moves.get((code, ex["title"]))
                if mv and T(mv["announced_at"]) <= self.now:
                    exd.update({k: mv[k] for k in ("date", "start", "end", "opens", "closes", "location") if k in mv})
                eid = self.claim(f"exam-{cs}-{slug(ex['title'])}")
                if mv:
                    self.note(mv["id"], eid)
                row = {"id": eid, "course_id": cid, "title": ex["title"], "kind": "exam", "mode": exd.get("mode", "in_person"), "points_possible": ex.get("points", 100)}
                if row["mode"] == "in_person":
                    s, e = at(D(exd["date"]), exd["start"]), at(D(exd["date"]), exd["end"])
                    exam_days.add(s.date())
                    row.update({"due_at": self.iso(s), "starts_at": self.iso(s), "ends_at": self.iso(e), "window_opens_at": None, "window_closes_at": None,
                                "duration_minutes": self.elapsed(s, e), "location": exd.get("location", loc)})
                    self.exam_dates.append(s.date())
                    if self.d0 <= s.date() < self.d1:
                        self.cal_row(f"ev-{eid}", f"{code} {ex['title']}", s, e, kind="exam", source=src, location=exd.get("location", loc), course_id=cid)
                        self.claim(f"ev-{eid}")
                        self.block(s, e, "class", f"{code} {ex['title']}", exd.get("place", "campus"), f"school.json#{eid}", ready=self.ready)
                    due, done_at = s, e
                else:
                    o, cl = T(exd["opens"]), T(exd["closes"])
                    dur = ex.get("minutes", 60)
                    row.update({"due_at": self.iso(cl), "starts_at": None, "ends_at": None, "window_opens_at": self.iso(o), "window_closes_at": self.iso(cl),
                                "duration_minutes": dur, "location": "Online"})
                    due, done_at = cl, None
                    self.exam_dates.append(cl.date())
                    if cl <= self.now:
                        t = o.replace(hour=max(o.hour, 9), minute=0) if o.hour < 9 else o + mins(30)
                        while t + mins(dur) < cl and not self.is_free(t, t + mins(dur)):
                            t += mins(30)
                        if t + mins(dur) <= cl:
                            done_at = t + mins(dur)
                            if t >= self.start:
                                self.block(t, done_at, "study", f"{code} {ex['title']}, online", "home", f"school.json#{eid}")
                row.update(self.grade_fields(eid, due, done_at, row["points_possible"], lo, hi, exam=True))
                items.append(row)
            # class meetings (the Canvas calendar feed)
            for d in daterange(max(self.d0, t0), min(self.d1, t1 + DAY)):
                if d in off or d in exam_days:
                    continue
                for m in c.get("meetings", []):
                    if wd(d) not in m["days"]:
                        continue
                    cc = cancels.get((code, d.isoformat()))
                    if cc and T(cc["announced_at"]) <= self.now:
                        continue
                    s, e = at(d, m["start"]), at(d, m["end"])
                    eid = self.uid(f"class-{cs}-{d}")
                    place = m.get("place", "home" if m.get("online") else "campus")
                    self.cal_row(eid, f"{code} {c['name']}" + (f", {m['label']}" if m.get("label") else ""), s, e, kind="class", source=src,
                                 location=m.get("location") or ("Online (live)" if m.get("online") else None), course_id=cid)
                    self.block(s, e, "class", f"{code} {c['name']}" + (f", {m['label']}" if m.get("label") else ""), place, f"calendar.json#{eid}", ready=self.ready)
            # assignments on a cadence, then one-off items
            for rule in c.get("assignments", []):
                n, d = rule.get("first_number", 1), D(rule["start"])
                while wd(d) != rule["weekday"]:
                    d += DAY
                while d <= D(rule["end"]):
                    if d not in off:
                        title = rule["title"].format(n=n)
                        due = at(d, rule.get("due", "23:59"))
                        items.append(self.assignment(cid, cs, title, rule.get("kind", "assignment"), due, rule.get("points", 10), lo, hi))
                        n += 1
                    d += timedelta(weeks=rule.get("every_weeks", 1))
            for it in c.get("items", []):
                items.append(self.assignment(cid, cs, it["title"], it.get("kind", "assignment"), T(it["due"]), it.get("points", 10), lo, hi))
            # announcements from the instructor
            months = max(0, (min(self.today, t1) - max(self.d0, t0)).days) / 30.4
            r = self.R("announcements", code)
            count = poisson(r, c.get("announcements_per_month", 2) * months)
            a0 = at(max(self.d0, t0), "00:00")
            span_min = max(1, int((min(self.now, at(t1, "23:00")) - a0).total_seconds() // 60))
            stamps = sorted(a0 + mins(r.randrange(span_min)) for _ in range(count))
            for i, ts in enumerate(stamps):
                ts = ts.replace(hour=min(max(ts.hour, 8), 21))
                if ts > self.now:
                    continue
                aid = self.claim(f"ann-{cs}-{i + 1:02d}")
                anns.append({"id": aid, "course_id": cid, "title": r.choice(ANNOUNCEMENTS), "posted_at": self.iso(ts), "author_role": "instructor"})
        for key, c in cancels.items():
            if T(c["announced_at"]) <= self.now:
                cid = f"course-{slug(c['course'])}"
                anns.append({"id": self.claim(c["id"]), "course_id": cid, "title": c.get("title", f"No class on {D(c['date']).strftime('%A, %b %-d')}"),
                             "posted_at": self.iso(T(c["announced_at"])), "author_role": "instructor"})
                self.note(c["id"], c["id"])
        for key, mv in moves.items():
            if T(mv["announced_at"]) <= self.now and mv.get("announcement", True):
                when = D(mv["date"]).strftime("%A, %b %-d") if "date" in mv else T(mv["closes"]).strftime("%A, %b %-d")
                anns.append({"id": self.claim(mv["id"] + ".announcement"), "course_id": f"course-{slug(mv['course'])}", "title": mv.get("title", f"{mv['exam']} moved to {when}"),
                             "posted_at": self.iso(T(mv["announced_at"])), "author_role": "instructor"})
                self.note(mv["id"], mv["id"] + ".announcement")
        for c in self.ch("assignment_add"):
            if T(c.get("added_at", self.s["now"])) <= self.now:
                cid, cs = f"course-{slug(c['course'])}", slug(c["course"])
                row = self.assignment(cid, cs, c["title"], c.get("kind", "assignment"), T(c["due"]), c.get("points", 10), 80, 95, rid=c["id"])
                items.append(row)
                self.note(c["id"], c["id"])
        items.sort(key=lambda a: (a["due_at"] or "", a["id"]))
        anns.sort(key=lambda a: a["posted_at"])
        self.school = {"provider": lms, "institution": sc.get("institution"), "lms_url": base,
                       "term": {"name": term.get("name"), "start": term["start"], "end": term["end"], "breaks": term.get("breaks", []), "no_class_days": term.get("no_class_days", [])},
                       "courses": courses, "assignments": items, "announcements": anns}

    def assignment(self, cid, cs, title, kind, due, points, lo, hi, rid=None):
        aid = rid or self.uid(f"asg-{cs}-{slug(title)}")
        if rid:
            self.claim(rid)
        row = {"id": aid, "course_id": cid, "title": title, "kind": kind, "mode": "online", "points_possible": points, "due_at": self.iso(due), "starts_at": None, "ends_at": None,
               "window_opens_at": None, "window_closes_at": None, "duration_minutes": None, "location": None}
        row.update(self.grade_fields(aid, due, None, points, lo, hi))
        return row

    def grade_fields(self, key, due, done_at, points, lo, hi, exam=False):
        r = self.R("grade", key)
        out = {"status": "todo", "submission": None, "completed_at": None, "graded_at": None, "grade": None, "dedupe_key": f"canvas:{int(hexid(key, n=7, alphabet='0123456789'))}"}
        if due > self.now:
            return out
        roll = r.random()
        if not exam and roll < 0.02:
            out["submission"] = "missing"
        elif exam and done_at is None:
            out["submission"] = "missing"
        else:
            late = not exam and roll < 0.05
            done = done_at or (due + mins(r.randint(20, 1800)) if late else due - mins(r.randint(30, 1800)))
            if done > self.now:
                return out
            out.update({"status": "done", "submission": "late" if late else "submitted", "completed_at": self.iso(done)})
        graded = (done_at or due) + timedelta(days=r.randint(2, 7), hours=r.randint(0, 8))
        if graded <= self.now:
            score = 0 if out["submission"] == "missing" else round(points * r.uniform(lo, hi) / 100 * 2) / 2
            score = int(score) if float(score).is_integer() else score
            out.update({"graded_at": self.iso(graded), "grade": f"{score}/{points}"})
        return out

    # ---------------------------------------------------------------- work
    def build_work(self):
        jobs = self.p.get("work", {}).get("jobs", [])
        self.employers, self.shifts, self.posts, self.paychecks, self.deposits = [], [], [], [], []
        self.hidden_shifts = []
        hourly = {i["job"]: i for i in self.p.get("income", []) if i["type"] == "hourly"}
        gen_from = self.d0 - timedelta(days=42)
        for job in jobs:
            jid = job["id"]
            js = slug(jid.removeprefix("job-"))
            inc = hourly.get(jid)
            self.employers.append({
                "id": self.claim(jid), "name": job["employer"], "position": job.get("position"), "pay_type": "hourly" if inc else "salary",
                "hourly_rate_cents": inc["rate_cents"] if inc else None, "annual_salary_cents": None,
                "overtime_threshold_hours": job.get("overtime_threshold_hours", 40), "overtime_multiplier": job.get("overtime_multiplier", 1.5),
                "schedule": None, "source": job.get("source", "schedule"),
            })
            planned = self.plan_shifts(job, gen_from, self.d1)
            for c in self.ch("shift_add"):
                if c["job"] == jid:
                    s, e = T(c["start"]), T(c["end"])
                    planned.append({"start": s, "end": e, "brk": c.get("break_minutes", 0), "rid": c["id"], "notes": c.get("notes"),
                                    "posted_at": T(c["posted_at"]) if c.get("posted_at") else s - timedelta(days=7)})
            planned.sort(key=lambda x: x["start"])
            post = job.get("posting", {"block_days": 7, "anchor": "2020-01-05", "posted_days_ahead": 14, "time": "16:00"})
            anchor, bd = D(post.get("anchor", "2020-01-05")), post.get("block_days", 7)
            late_posts = {(c["job"], D(c["covers_from"])): c for c in self.ch("schedule_posted_late")}
            post_times = {}

            def posted_for(d):
                k = (d - anchor).days // bd
                bs = anchor + timedelta(days=k * bd)
                if bs not in post_times:
                    r = self.R("post", jid, bs)
                    pa = at(bs - timedelta(days=post.get("posted_days_ahead", 14)), post.get("time", "16:00")) + timedelta(days=r.choice(post.get("jitter_days", [0])))
                    lp = next((c for (j, cf), c in late_posts.items() if j == jid and bs <= cf < bs + timedelta(days=bd)), None)
                    if lp:
                        pa = T(lp["posted_at"])
                    post_times[bs] = (pa, lp)
                return bs, post_times[bs]

            cancels = {(c["job"], c["date"]): c for c in self.ch("shift_cancel")}
            sick = {c["date"]: c for c in self.ch("sick_day")}
            for sh in planned:
                d = sh["start"].date()
                bs, (pa, lp) = posted_for(d)
                if "posted_at" in sh and sh.get("rid"):
                    pa = sh["posted_at"]
                rid = self.claim(sh["rid"]) if sh.get("rid") else self.uid(f"shift-{js}-{d}" + ("-b" if sh.get("part") else ""))
                if sh.get("rid"):
                    self.note(sh["rid"], rid)
                if lp:
                    self.note(lp["id"], rid)
                r = self.R("punch", rid)
                status, notes, rs, re_ = "scheduled", sh.get("notes"), None, None
                cc = cancels.get((jid, d.isoformat()))
                if cc and T(cc.get("at", d.isoformat() + "T00:00")) <= self.now:
                    status, notes = "cancelled", cc.get("reason", "Cancelled by manager")
                    self.note(cc["id"], rid)
                elif d.isoformat() in sick and sh["start"] <= self.now + DAY:
                    status, notes = "cancelled", "Called out sick"
                    self.note(sick[d.isoformat()]["id"], rid)
                elif sh["end"] <= self.now and not sh.get("rid"):
                    x = r.random()
                    if x < job.get("cancel_rate", 0.02):
                        status, notes = "cancelled", job.get("cancel_note", "Cancelled by manager")
                    elif x < job.get("cancel_rate", 0.02) + job.get("sick_rate", 0.015):
                        status, notes = "cancelled", "Called out sick"
                if status != "cancelled" and sh["end"] <= self.now:
                    status = "worked"
                    rs = sh["start"] + mins(r.randint(-6, 4))
                    re_ = sh["end"] + mins(r.randint(-4, 10))
                    y = r.random()
                    if y < job.get("sent_home_rate", 0.03):
                        re_ = sh["end"] - mins(r.choice([60, 90, 120]))
                        notes = "Sent home early"
                    elif y < job.get("sent_home_rate", 0.03) + job.get("stay_late_rate", 0.1):
                        re_ += mins(r.randint(15, 50))
                    if re_ > self.now:  # still there, staying late
                        status, re_ = "scheduled", None
                elif status != "cancelled" and sh["start"] <= self.now:
                    rs = sh["start"] + mins(r.randint(-6, 4))
                visible = pa <= self.now or sh["start"] <= self.now
                row = {"id": rid, "employer_id": jid, "starts_at": self.iso(sh["start"]), "ends_at": self.iso(sh["end"]), "break_minutes": sh.get("brk", 0),
                       "break_paid": job.get("break_paid", False), "recorded_start": self.iso(rs), "recorded_end": self.iso(re_), "status": status, "notes": notes,
                       "source": job.get("source", "schedule"), "provider_shift_id": hexid(rid, n=10, alphabet="0123456789") if job.get("source") == "ukg" else None,
                       "posted_at": self.iso(pa), "_start": sh["start"], "_end": sh["end"], "_rs": rs, "_re": re_, "_job": jid}
                (self.shifts if visible else self.hidden_shifts).append(row)
                if status != "cancelled" and sh["start"] < self.end and sh["end"] > self.start - DAY:
                    a, b = (rs or sh["start"]), (re_ or sh["end"])
                    self.block(a, b, "work", job.get("timeline_label", "Shift"), job.get("place", "work"),
                               f"work.json#{rid}" if visible else None, visible=visible, ready=job.get("ready_minutes", self.ready), kind="night" if sh["end"].date() > sh["start"].date() and sh["end"].hour >= 4 else "work")
            for bs, (pa, lp) in sorted(post_times.items()):
                if pa <= self.now and bs + timedelta(days=bd) > self.d0:
                    pid = lp["id"] if lp else f"post-{js}-{bs}"
                    self.posts.append({"id": self.claim(pid), "employer_id": jid, "covers_from": bs.isoformat(), "covers_to": (bs + timedelta(days=bd - 1)).isoformat(), "posted_at": self.iso(pa)})
                    if lp:
                        self.note(lp["id"], pid)
            if inc:
                self.pay_hourly(job, inc, js)
        self.shifts.sort(key=lambda s: (s["_start"], s["id"]))
        self.posts.sort(key=lambda p: p["posted_at"])

    def plan_shifts(self, job, a, b):
        pat, out = job["pattern"], []
        closed = set(job.get("closed_on", []))
        if pat["type"] == "weekly":
            for d in daterange(a, b):
                if d.isoformat() in closed:
                    continue
                day = []
                for i, sl in enumerate(pat["slots"]):
                    if wd(d) not in sl["days"] or self.R("shift", job["id"], d, i).random() >= sl.get("chance", 1):
                        continue
                    parts = sl.get("split") or [[sl["start"], sl["end"]]]
                    cand = [span(d, {"start": p[0], "end": p[1]}) for p in parts]
                    if any(s < e2 and e > s2 for s, e in cand for s2, e2, *_ in day):
                        continue
                    for k, (s, e) in enumerate(cand):
                        day.append((s, e, k, sl.get("break_minutes", 0) if len(parts) == 1 else 0, sl.get("label")))
                for s, e, k, brk, label in day:
                    if self.away_at(s):
                        continue
                    out.append({"start": s, "end": e, "brk": brk, "part": k, "notes": None})
        elif pat["type"] == "rotation":
            anchor, cycle, on = D(pat["anchor"]), pat["cycle_days"], set(pat["on"])
            for d in daterange(a, b):
                k = (d - anchor).days % cycle
                is_on = k in on
                if not is_on and pat.get("extra_chance"):
                    near = {(k - 1) % cycle, (k + 1) % cycle} & on
                    is_on = not near and self.R("extra", job["id"], d).random() < pat["extra_chance"]
                if is_on and d.isoformat() not in closed and not self.away_at(span(d, pat)[0]):
                    s, e = span(d, pat)
                    out.append({"start": s, "end": e, "brk": pat.get("break_minutes", 0), "part": 0, "notes": None if k in on else "Picked up an extra shift"})
        else:
            raise SimError(f"work pattern type {pat['type']!r} is not weekly or rotation")
        return out

    def pay_periods(self, inc, a, b):
        kind = inc["pay_period"]
        out = []
        if kind in ("weekly", "biweekly"):
            n = 7 if kind == "weekly" else 14
            s = D(inc["period_anchor"])
            s -= timedelta(days=n * math.ceil((s - a).days / n)) if s > a else timedelta(0)
            while s < b:
                out.append((s, s + timedelta(days=n - 1)))
                s += timedelta(days=n)
        elif kind == "monthly":
            y, m = a.year, a.month
            while date(y, m, 1) < b:
                out.append((date(y, m, 1), month_day(y, m, 31)))
                y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        elif kind == "semimonthly":
            y, m = a.year, a.month
            while date(y, m, 1) < b:
                out.append((date(y, m, 1), date(y, m, 15)))
                out.append((date(y, m, 16), month_day(y, m, 31)))
                y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        else:
            raise SimError(f"pay_period {kind!r} is not weekly, biweekly, semimonthly or monthly")
        return out

    def pay_hourly(self, job, inc, js):
        rate = inc["rate_cents"]
        thr = Fraction(str(job.get("overtime_threshold_hours", 40))) * 60
        mult = Fraction(str(job.get("overtime_multiplier", 1.5)))
        ws = DAYS.index(job.get("workweek_starts", "Sun"))
        worked = sorted([s for s in self.shifts + self.hidden_shifts if s["_job"] == job["id"] and s["status"] == "worked"], key=lambda s: s["_rs"])
        cum = defaultdict(int)
        for s in worked:
            m = self.elapsed(s["_rs"], s["_re"]) - (0 if s["break_paid"] else s["break_minutes"])
            d = s["_start"].date()
            wk = d - timedelta(days=(d.weekday() - ws) % 7)
            reg = int(max(0, min(m, thr - cum[wk])))
            s["_reg"], s["_ot"] = reg, m - reg
            cum[wk] += m
        late = {(c["income"], c["pay_date"]): c for c in self.ch("late_paycheck")}
        for ps, pe in self.pay_periods(inc, self.d0 - timedelta(days=40), self.today + timedelta(days=45)):
            sched = prev_business(pe + timedelta(days=inc.get("days_after_period_end", 5)))
            lc = late.get((inc["id"], sched.isoformat()))
            actual = next_business(sched + timedelta(days=lc["delay_days"])) if lc else sched
            these = [s for s in worked if ps <= s["_start"].date() <= pe]
            reg, ot = sum(s["_reg"] for s in these), sum(s["_ot"] for s in these)
            if not these:
                continue
            gross = half_up(Fraction(reg * rate, 60) + Fraction(ot * rate, 60) * mult)
            net = half_up(gross * (1 - Fraction(str(inc["tax_share"]))))
            if actual > self.today or actual < self.d0:
                continue
            pid = self.claim(f"pay-{js}-{sched}")
            tid = self.claim(f"tx-{actual}-pay-{js}")
            self.paychecks.append({"id": pid, "employer_id": job["id"], "pay_date": actual.isoformat(), "scheduled_pay_date": sched.isoformat(), "period_start": ps.isoformat(),
                                   "period_end": pe.isoformat(), "hours": round((reg + ot) / 60, 2), "regular_hours": round(reg / 60, 2), "overtime_hours": round(ot / 60, 2),
                                   "gross_cents": gross, "net_cents": net, "tax_share": inc["tax_share"], "transaction_id": tid, "source": "import",
                                   "shift_ids": [s["id"] for s in these]})
            self.deposits.append({"date": actual, "amount": net, "desc": inc["description"], "merchant": inc.get("merchant_name"), "acc": inc["account"], "tid": tid,
                                  "pfc": inc.get("pfc", "INCOME_WAGES"), "paycheck": pid})
            if lc:
                self.note(lc["id"], pid)
                self.note(lc["id"], tid)

    # ---------------------------------------------------------------- calendar
    def build_trips(self):
        for t in self.p.get("real_life", {}).get("trips", []) + self.ch("trip"):
            self.trip(t)

    def build_calendar(self):
        rl = self.p.get("real_life", {})
        for ev in rl.get("events", []):
            self.persona_event(ev)
        for c in self.ch("calendar_event"):
            self.persona_event(c, change=True)
        for dep in self.p.get("dependents", []):
            for ns in dep.get("school", {}).get("no_school", []):
                a = D(ns.get("date") or ns["from"])
                b = D(ns.get("date") or ns["to"]) + DAY
                if b <= self.d0 or a >= self.d1:
                    continue
                rid = self.claim(f"ev-noschool-{slug(dep['id'])}-{a}")
                self.cal_row(rid, ns["label"], at(a, "00:00"), at(b, "00:00"), all_day=True, source=dep["school"].get("calendar_source", "google"),
                             description=f"{dep['school'].get('calendar_name', 'School district calendar')}", created_at=at(D(dep["school"].get("calendar_added", "2025-08-01")), "12:00"))
        self.nights_out(rl.get("nights_out"))

    def trip(self, t):
        tid = t["id"]
        booked = T(t["booked_at"])
        known = booked <= self.now
        dep, ret = T(t["depart"]), T(t["return"])
        lead = t.get("airport_minutes", 150) + self.commute("home", "airport")
        s, e = dep - mins(lead), ret + mins(45 + self.commute("airport", "home"))
        dest = t["destination"]
        self.away.append((s, e, tid))
        self.block(max(s, self.start - DAY), e, "away", f"Away, {dest}", None, f"calendar.json#{tid}" if known else None, visible=known)
        if not known:
            return
        dz = ZoneInfo(t.get("destination_time_zone", self.tz))
        self.claim(tid)
        self.cal_row(tid, t.get("title", f"Flight to {dest}"), dep, T(t["arrive_local"]), source="google", location=t.get("from", "Airport"), created_at=booked + mins(4), e_zone=dz,
                     description="Added from a booking email")
        self.note(tid, tid)
        if "return_depart_local" in t:
            self.claim(tid + ".return")
            self.cal_row(tid + ".return", f"Flight home from {dest}", T(t["return_depart_local"]), ret, source="google", location=dest, created_at=booked + mins(4), s_zone=dz,
                         description="Added from a booking email")
            self.note(tid, tid + ".return")
        if "purchase" in t and self.d0 <= booked.date():
            self.trip_buys.append(t)
        self.emails_derived.append({"at": booked + mins(2), "type": "travel", "sender": t.get("email_sender", ["Airline reservations", "reservations@example.com"]),
                                    "subject": f"Your trip to {dest} is confirmed", "rid": tid + ".email", "change": tid})

    def persona_event(self, ev, change=False):
        state, place = ev.get("state", "with people"), ev.get("place", "out")
        show = ev.get("timeline", True)
        src = ev.get("source", "google")
        kind = ev.get("kind", "appointment" if state == "appointment" else "personal")
        if "repeat" in ev:
            rp = ev["repeat"]
            first = D(rp.get("from", self.d0.isoformat()))
            until = D(rp["until"]) if rp.get("until") else self.d1
            skip, occ = [], []
            for d in daterange(max(first, self.d0), min(until + DAY, self.d1)):
                if wd(d) not in rp["days"] or ((d - first).days // 7) % rp.get("every_weeks", 1):
                    continue
                s, e = span(d, ev)
                if self.overlapping(s, e, 0, visible_only=s >= self.now, ignore=SOFT_STATES + ("care", "study", "other")) or self.away_at(s):
                    skip.append(d.isoformat())
                    continue
                occ.append((d, s, e))
            rid = self.claim(ev["id"])
            byday = sorted((DAYS.index(x) + 1) % 7 for x in rp["days"])
            d0 = max(first, self.d0)
            while wd(d0) not in rp["days"]:
                d0 += DAY
            s0, e0 = span(d0, ev)
            self.cal_row(rid, ev["title"], s0, e0, kind=kind, source=src, location=ev.get("location"),
                         recurrence={"freq": "weekly", "byDay": byday, "interval": rp.get("every_weeks", 1), "until": rp.get("until"), "skip": skip or None},
                         created_at=at(first, "09:00") - timedelta(days=ev.get("created_days_before", 30)))
            if show:
                for d, s, e in occ:
                    self.block(s, e, state, ev["title"], place, f"calendar.json#{rid}@{d}", ready=ev.get("ready_minutes"))
            return
        s, e = (T(ev["start"]), T(ev["end"])) if "T" in ev["start"] else (at(D(ev["start"]), "00:00"), at(D(ev["end"]), "00:00"))
        created = T(ev["created_at"]) if ev.get("created_at") else s - timedelta(days=ev.get("created_days_before", 14))
        if created > self.now or e <= self.start or s >= self.end:
            if change:
                self.truth_changes[ev["id"]]["hidden"] = True
            return
        rid = self.claim(ev["id"])
        all_day = "T" not in ev["start"]
        self.cal_row(rid, ev["title"], s, e, kind=kind, source=src, location=ev.get("location"), all_day=all_day, created_at=created, description=ev.get("description"))
        if change:
            self.note(ev["id"], rid)
        if show and not all_day:
            self.block(s, e, state, ev.get("label", ev["title"]), place, f"calendar.json#{rid}", ready=ev.get("ready_minutes"))

    def nights_out(self, no):
        if not no:
            return
        p_day = no["per_month"] * 12 / 52 / len(no["days"])
        for d in daterange(self.d0, self.d1):
            if wd(d) not in no["days"]:
                continue
            r = self.R("nightout", d)
            if r.random() >= p_day:
                continue
            s, e = span(d, no)
            shift = mins(r.choice([-30, 0, 0, 30]))
            s, e = s + shift, e + shift
            if not self.is_free(s, e, pad=30) or self.away_at(s):
                continue
            on_cal = r.random() < no.get("on_calendar", 0.5)
            created = s - timedelta(days=r.randint(1, 6), hours=r.randint(0, 10))
            if s >= self.now and not (on_cal and created <= self.now):
                continue
            title = r.choice(no["titles"])
            rid = None
            if on_cal and created <= self.now:
                rid = self.claim(f"ev-night-{d}")
                self.cal_row(rid, title, s, e, source="google", created_at=created)
            self.block(s, e, "with people", title, no.get("place", "out"), f"calendar.json#{rid}" if rid else None, visible=bool(rid))
            if e <= self.now:
                self.night_spend.append((d, s + mins(60), no.get("spend")))

    # ---------------------------------------------------------------- routines
    def build_routines(self):
        order = sorted((r for r in self.p.get("routines", []) if r["activity"] != "sleep"), key=lambda r: (ROUTINE_ORDER.get(r["activity"], 5), r["id"]))
        for r in order:
            self.run_routine(r)

    def suspended(self, rid, t):
        for c in self.ch("routine_suspend"):
            if rid in c["routines"] and D(c["from"]) <= t.date() <= D(c["until"]):
                return c["id"]
        a = self.away_at(t)
        return f"away:{a[2]}" if a else None

    def exception(self, r, d, ws, vis=False):
        for ex in r.get("exceptions", []):
            t = ex["type"]
            label = ex.get("label", t)
            if t == "after_closing_shift":
                h, m = (int(x) for x in ex.get("ends_after", "22:00").split(":"))
                for b in self.overlapping(ws - timedelta(hours=14), ws, visible_only=vis, ignore=()):
                    if b["state"] != "work" or not (ws - timedelta(hours=14) <= b["end"] <= ws) or b["end"] - b["start"] >= timedelta(hours=11):
                        continue
                    if b["end"].date() > b["start"].date() or (b["end"].hour, b["end"].minute) >= (h, m):
                        return label
            elif t == "after_night_shift":
                for b in self.overlapping(ws - timedelta(hours=10), ws + timedelta(hours=3), visible_only=vis, ignore=()):
                    if b["state"] == "work" and b["kind"] == "night" and b["end"].date() == d:
                        return label
            elif t == "on_work_days":
                if self.blocks_starting(d, "work", vis):
                    return label
            elif t == "school_days_only":
                dep = next(x for x in self.p.get("dependents", []) if x["id"] == ex["dependent"])
                if not self.school_day(dep, d):
                    return label
            elif t == "not_on":
                if d.isoformat() in ex.get("dates", []) or wd(d) in ex.get("days", []):
                    return label
            elif t == "sick":
                pass
            else:
                raise SimError(f"routine {r['id']}: unknown exception type {t!r}")
        for c in self.ch("sick_day"):
            if c["date"] == d.isoformat():
                return "sick"
        return None

    def school_day(self, dep, d):
        sch = dep.get("school", {})
        if wd(d) not in sch.get("days", DAYS[:5]):
            return False
        for ns in sch.get("no_school", []):
            a = D(ns.get("date") or ns["from"])
            b = D(ns.get("date") or ns["to"])
            if a <= d <= b:
                return False
        return True

    def find_slot(self, ws, we, dur, rng, pad=10):
        slack = int((we - ws - dur).total_seconds() // 60)
        if slack < 0:
            return None
        first = min(slack, rng.choice([0, 0, 5, 10, 15]))
        for off in [first] + list(range(0, slack + 1, 5)):
            s = ws + mins(off)
            if self.is_free(s, s + dur, pad, ignore=("home", "asleep")):
                return s
        return None

    def find_moved(self, r, d, w, dur, rng):
        ws, we = span(d, w)
        latest = r.get("not_after", "21:00")
        cands = []
        for day in (d, d + DAY):
            t = at(day, "07:00")
            stop = at(day, latest) - dur
            while t <= stop:
                if not (t < we and t + dur > ws) and t + dur <= self.now:
                    cands.append(t)
                t += mins(30)
        rng.shuffle(cands)
        # people move a habit into time their other habits don't use
        others = [(x, ow) for x in self.p.get("routines", []) if x["id"] != r["id"] and x["activity"] != "sleep" for ow in x["windows"]]

        def clashes(t):
            for x, ow in others:
                for day in (t.date() - DAY, t.date()):
                    if wd(day) in ow.get("days", []):
                        a, b = span(day, ow)
                        if a < t + dur and b > t:
                            return True
            return False
        for t in [c for c in cands if not clashes(c)][:40]:
            if self.is_free(t, t + dur, 10, ignore=("home", "asleep")):
                return t
        return None

    def run_routine(self, r):
        rid, act = r["id"], r["activity"]
        rec, tl = r.get("records_as", "none"), r.get("timeline", "records")
        if rec not in RECORDS_AS:
            raise SimError(f"routine {rid}: records_as {rec!r} is not one of {sorted(RECORDS_AS)}")
        state = ACTIVITY_STATE.get(act, "other")
        log = self.routine_log.setdefault(rid, [])
        mem = r.get("source_memory")
        rec_id = None
        if rec == "calendar_recurring":
            w0 = r["windows"][0]
            rec_id = self.claim(r.get("calendar_id", f"ev-{rid}"))
            byday = sorted((DAYS.index(x) + 1) % 7 for x in w0["days"])
            d0 = self.d0
            while wd(d0) not in w0["days"]:
                d0 += DAY
            s0, e0 = span(d0, w0)
            self.cal_row(rec_id, r.get("calendar_title", r["label"]), s0, e0, source=r.get("calendar_source", "google"),
                         recurrence={"freq": "weekly", "byDay": byday, "interval": 1, "until": None, "skip": None}, created_at=at(self.d0, "10:00") - timedelta(days=120))
        wk = self.d0 - timedelta(days=self.d0.weekday())
        # Habits hold their rate over weeks: error diffusion with jitter, so the kept share lands near keep_rate.
        acc = self.R("routine-acc", rid).random()
        while wk < self.d1:
            cands = [(d, w) for d in daterange(wk, wk + timedelta(days=7)) for w in r["windows"] if self.d0 <= d < self.d1 and wd(d) in w["days"]]
            per = r.get("per_week")
            rr = self.R("routine-plan", rid, wk)
            if per is not None and per < len(cands):
                planned = sorted(rr.sample(cands, chance_round(rr, per)), key=lambda x: (x[0], x[1].get("id", "")))
            else:
                planned = cands
            if r.get("cram_days") and act == "study":
                cram = [(d, w) for d, w in cands if any(0 < (x - d).days <= r["cram_days"] for x in self.exam_dates)]
                planned = sorted({(d, w.get("id")): (d, w) for d, w in planned + cram}.values(), key=lambda x: (x[0], x[1].get("id", "")))
            for d, w in planned:
                ws, we = span(d, w)
                place = w.get("where", r.get("where"))
                lo, hi = r.get("duration_minutes", [int((we - ws).total_seconds() // 60)] * 2)
                ro = self.R("routine", rid, d, w.get("id"))
                dur = mins(ro.randint(lo, hi))
                ref_mem = f"memories.json#{mem}" if mem else None
                if we > self.now:
                    # The future: only what the person's data already says (a recurring event, a routine they told Dev).
                    if self.exception(r, d, ws, vis=True) or self.suspended(rid, ws):
                        continue
                    if rec == "calendar_recurring" and self.is_free(ws, we, 0):
                        self.block(ws, we, state, r["label"], place, f"calendar.json#{rec_id}@{d}", ready=r.get("ready_minutes"))
                    elif tl == "routine" and (act == "keep free" or self.is_free(ws, we, 0)):
                        self.block(ws, we, state, r["label"], place, ref_mem, ready=r.get("ready_minutes"))
                    elif tl == "records" and rec in ("calendar", "health_workout") and r.get("expected_in_future", True) and ws >= self.now:
                        # A routine learned from history is part of the expected future, at its usual time.
                        s = ws + mins(5) if w.get("firmness") != "fixed" else ws
                        s = ws if not self.is_free(s, s + dur, 5, visible_only=True) and self.is_free(ws, ws + dur, 5, visible_only=True) else s
                        if self.is_free(s, min(s + dur, we), 5, visible_only=True):
                            self.block(s, min(s + dur, we), state, f"{w.get('label', r['label'])} (usual time)", place, ref_mem, ready=r.get("ready_minutes"))
                    continue
                entry = {"date": d.isoformat(), "window": w.get("id"), "outcome": None, "start": None, "end": None, "record": None, "reason": None}
                why = self.suspended(rid, ws)
                if why:
                    entry.update(outcome="suspended", reason=why)
                    log.append(entry)
                    continue
                why = self.exception(r, d, ws)
                if why:
                    entry.update(outcome="excepted", reason=why)
                    log.append(entry)
                    continue
                if act == "keep free":
                    self.block(ws, we, state, r["label"], None, ref_mem)
                    continue
                keep = r.get("keep_rate", FIRMNESS.get(w.get("firmness", "usual"), 0.78))
                acc += keep + ro.uniform(-0.25, 0.25)
                if acc >= 1:
                    acc -= 1
                    roll = 0.0
                else:
                    roll = keep + (1 - keep) * ro.random()
                s = None
                if rec == "calendar_recurring":
                    outcome = "kept" if roll < keep else "skipped"
                    if self.is_free(ws, we, 0):
                        self.block(ws, we, state, r["label"], place, f"calendar.json#{rec_id}@{d}", ready=r.get("ready_minutes"))
                    entry.update(outcome=outcome, start=local(ws) if outcome == "kept" else None, end=local(we) if outcome == "kept" else None,
                                 record=f"{rec_id}@{d}")
                    log.append(entry)
                    continue
                if roll < keep:
                    s = self.find_slot(ws, we, dur, ro)
                    outcome = "kept" if s else None
                    if not s:
                        s = self.find_moved(r, d, w, dur, ro)
                        outcome = "moved" if s else "skipped"
                elif roll < keep + (1 - keep) * r.get("move_share", 0.5):
                    s = self.find_moved(r, d, w, dur, ro)
                    outcome = "moved" if s else "skipped"
                else:
                    outcome = "skipped"
                if s and s + dur > self.now:
                    s, outcome = None, "skipped"
                entry["outcome"] = outcome
                if s:
                    e = s + dur
                    entry.update(start=local(s), end=local(e))
                    entry["record"] = self.routine_record(dict(r, label=w.get("label", r["label"])), rec, tl, state, place, s, e, ro, ref_mem)
                log.append(entry)
            wk += timedelta(days=7)

    def routine_record(self, r, rec, tl, state, place, s, e, ro, ref_mem):
        d = s.date()
        label = r["label"]
        if rec == "calendar":
            rid = self.uid(f"study-{d}" if r["activity"] == "study" else f"ev-{r['id']}-{d}")
            title = label
            if r["activity"] == "study" and self.school:
                nxt = [a for a in self.school["assignments"] if a["due_at"] and a["due_at"] > self.iso(s)]
                if nxt:
                    course = next(c for c in self.school["courses"] if c["id"] == nxt[0]["course_id"])
                    title = f"Study: {course['code']}"
            self.cal_row(rid, title, s, e, kind="study" if r["activity"] == "study" else "personal", source=r.get("calendar_source", "manual"),
                         location=self.place_label(place) if place else None, created_at=s - timedelta(days=ro.randint(0, 3), hours=ro.randint(1, 12)))
            self.block(s, e, state, title, place, f"calendar.json#{rid}", ready=r.get("ready_minutes"))
            return rid
        if rec == "health_workout":
            rid = self.uid(f"wk-{d}")
            types = r.get("workout_types", {"Traditional Strength Training": 1})
            kind = weighted(ro, [{"name": k, "weight": v} for k, v in types.items()])["name"]
            m = self.elapsed(s, e)
            self.workouts.append({"id": rid, "type": kind, "start": self.iso(s), "end": self.iso(e), "minutes": m, "active_kcal": round(m * ro.uniform(5.5, 8.5)),
                                  "source": "apple_health", "_start": s})
            self.block(s, e, state, label, place, f"health.json#{rid}", ready=r.get("ready_minutes"))
            return rid
        if rec == "bank":
            hit = {"routine": r["id"], "date": d, "at": s, "record": None}
            self.routine_hits[r["id"]].append(hit)
            self.block(s, e, state, label, place, None, visible=False)
            return hit
        self.block(s, e, state, label, place, ref_mem if tl == "routine" else None, visible=(tl == "routine"), ready=r.get("ready_minutes"))
        return None

    # ---------------------------------------------------------------- sleep
    def build_sleep(self):
        r = next((x for x in self.p.get("routines", []) if x["activity"] == "sleep"), None)
        if not r:
            raise SimError("the persona needs a sleep routine (activity: sleep) with early_next_day and free_next_day windows")
        wins = {w["day_type"]: w for w in r["windows"]}
        for need in ("early_next_day", "free_next_day"):
            if need not in wins:
                raise SimError(f"sleep routine needs a {need} window")
        var = r.get("variance_minutes", 30)
        late_rate = r.get("late_night_rate", 0.07)
        early_before = r.get("early_before", "11:00")
        log = self.routine_log.setdefault(r["id"], [])
        last_end = None
        for d in daterange(self.d0 - DAY, self.d1 - DAY):
            n = d + DAY
            future = at(n, "05:00") > self.now
            vis = future
            ns = self.night_shift_over(d, vis)
            rng = self.R("sleep", d)
            if ns and not future and ns["end"] + timedelta(hours=8) > self.now:
                future = vis = True
            if ns:
                w = wins.get("after_night_shift")
                if not w:
                    continue
                ps, pe = at(ns["end"].date(), w["start"]), at(ns["end"].date(), w["end"])
                earliest = ns["end"] + mins(self.commute(ns["place"], "home") + 15)
                nxt = self.first_commitment(earliest, at(ns["end"].date(), "22:00"), vis)
                latest = nxt["start"] - mins(self.commute("home", nxt["place"]) + (nxt["ready"] if nxt["ready"] is not None else 15)) if nxt else None
                kind = "day"
            else:
                early = self.first_commitment(at(n, "04:00"), at(n, early_before), vis)
                if not early:
                    later = self.first_commitment(at(n, early_before), at(n, "13:00"), vis)
                else:
                    later = None
                w = wins["early_next_day"] if early else wins["free_next_day"]
                ps, pe = span(d, w)
                if ps.hour < 12:  # a bedtime after midnight belongs to the night of d, so it is on the next date
                    ps, pe = ps + DAY, pe + DAY
                last = self.last_commitment(at(d, "15:00"), at(n, "04:00"), vis)
                earliest = last["end"] + mins(self.commute(last["place"], "home") + self.wind) if last else None
                first = early or later
                latest = first["start"] - mins(self.commute("home", first["place"]) + (first["ready"] if first["ready"] is not None else self.ready)) if first else None
                kind = "main"
            bed, wake = ps, pe
            if not future:
                bed += mins(round(rng.gauss(0, var)))
                wake += mins(round(rng.gauss(0, var * 0.7)))
                if rng.random() < late_rate:
                    bed += mins(rng.randint(60, 140))
            clamped = False
            if earliest and bed < earliest:
                bed, clamped = earliest, True
            if latest and wake > latest:
                wake, clamped = latest, True
            if last_end and bed < last_end + mins(30):
                bed = last_end + mins(30)
            if wake - bed < timedelta(hours=1):
                wake = bed + timedelta(hours=1)
            if wake <= self.start - DAY:
                continue
            if not future and wake > self.now:
                future = True
            last_end = wake
            hours = round(self.elapsed(bed, wake) / 60, 2)
            if not future:
                sid = self.uid(f"sleep-{wake.date()}" + ("-day" if kind == "day" and any(s["id"] == f"sleep-{wake.date()}" for s in self.sleep_sessions) else ""))
                self.sleep_sessions.append({"id": sid, "kind": kind, "start": self.iso(bed), "end": self.iso(wake), "hours": hours, "day": wake.date().isoformat(), "source": "apple_health",
                                            "_start": bed, "_end": wake})
                self.block(bed, wake, "asleep", "Asleep" if kind == "main" else "Asleep after the night shift", "home", f"health.json#{sid}")
                if wake.date() >= self.d0:
                    off = max(abs((bed - ps).total_seconds()), abs((wake - pe).total_seconds())) / 60
                    outcome = "excepted" if clamped else ("kept" if off <= 60 else "moved")
                    log.append({"date": wake.date().isoformat(), "window": w.get("id", w["day_type"]), "outcome": outcome, "start": local(bed), "end": local(wake), "record": sid,
                                "reason": "a commitment set the time" if outcome == "excepted" else None})
            else:
                self.block(bed, wake, "asleep", "Asleep (usual time)" if kind == "main" else "Asleep after the night shift (usual time)", "home", None)
        self.sleep_sessions.sort(key=lambda s: s["_start"])

    def night_shift_over(self, d, vis):
        for b in self.by_day.get(d + DAY, []):
            if b["state"] == "work" and (b["visible"] or not vis) and b["start"].date() == d and b["start"].hour >= 16 and b["end"] > at(d + DAY, "03:00"):
                return b
        return None

    def first_commitment(self, a, b, vis):
        best = None
        for day in {a.date(), (b - mins(1)).date()}:
            for x in self.by_day.get(day, []):
                if x["state"] in SOFT_STATES or (vis and not x["visible"]):
                    continue
                if a <= x["start"] < b and (best is None or x["start"] < best["start"]):
                    best = x
        return best

    def last_commitment(self, a, b, vis):
        best = None
        for day in {a.date(), (b - mins(1)).date()}:
            for x in self.by_day.get(day, []):
                if x["state"] in SOFT_STATES + ("away",) or (vis and not x["visible"]):
                    continue
                if x["start"] < b and x["end"] > a and x["end"] <= b + timedelta(hours=4) and (best is None or x["end"] > best["end"]):
                    if x["state"] == "work" and x["start"] >= at(a.date(), "16:00") and x["end"] > b:
                        continue
                    best = x
        return best

    # ---------------------------------------------------------------- bank
    def accounts(self):
        return {a["id"]: a for a in self.p["accounts"]}

    def primary_checking(self):
        accs = self.p["accounts"]
        return next((a["id"] for a in accs if a["type"] == "depository" and a.get("subtype") == "checking"), None)

    def money_targets(self):
        m = self.s.get("money") or {}
        out = []
        if m.get("available_now_cents") is not None:
            out.append((m.get("account") or self.primary_checking(), "available", m["available_now_cents"]))
        if m.get("savings_cents") is not None:
            sav = next(a["id"] for a in self.p["accounts"] if a.get("subtype") == "savings")
            out.append((sav, "current", m["savings_cents"]))
        for t in m.get("targets", []):
            out.append((t["account"], t.get("measure", "current"), t["cents"]))
        return out

    def build_bank(self):
        openings = {a["id"]: a["opening_balance_cents"] for a in self.p["accounts"]}
        targets = self.money_targets()
        decisions = None
        res = None
        for it in range(12):
            frozen = decisions if it >= 4 else None
            rec = {}
            res = self.run_bank(openings, frozen, rec)
            if frozen is None:
                decisions = rec
            diffs = {acc: want - res["measure"](acc, how) for acc, how, want in targets}
            if not any(diffs.values()):
                break
            for acc, dv in diffs.items():
                openings[acc] += dv
        else:
            raise SimError(f"could not pin the balances in scenario.money (still off by {diffs}); check the persona's spending against its income")
        for acc, how, want in targets:
            a = self.accounts()[acc]
            if a["type"] != "credit" and openings[acc] < 0:
                raise SimError(f"pinning {acc} to {money(want)} would need an opening balance of -{money(openings[acc])}: over this window the persona brings in more than it spends. "
                               "Raise spending, lower income or savings_plan, shorten history_days, or try another seed")
        self.bank = res
        self.openings = openings

    def run_bank(self, openings, frozen, rec):
        P = self.p
        accts = self.accounts()
        chk = self.primary_checking()
        card = next((a["id"] for a in P["accounts"] if a["type"] == "credit"), None)
        bank_cfg = P.get("bank", {})
        floor = bank_cfg.get("switch_to_card_below_cents", 2500)
        L, ids = [], set()
        authbal = dict(openings)
        posted = dict(openings)
        bucket = defaultdict(list)
        seq = [0]
        food = defaultdict(int)
        statements = defaultdict(list)
        due_pay = defaultdict(list)
        rec_charges = defaultdict(list)
        receipts = []
        low_days = []

        def credit(acc):
            return accts[acc]["type"] == "credit"

        def add(acc, auth, post, desc, merchant, amount, pfc, rank, base=None, tid=None, card_like=False, pending_amount=None, recurring=None, extra=None):
            if tid is None:
                cand, i = f"tx-{auth.date()}-{base}", 1
                while cand in ids or cand in self.ids:
                    i += 1
                    cand = f"tx-{auth.date()}-{base}-{i}"
                tid = cand
            elif tid in ids:
                raise SimError(f"duplicate transaction id {tid}")
            ids.add(tid)
            seq[0] += 1
            t = {"id": tid, "acc": acc, "auth": auth, "post": post, "desc": desc, "merchant": merchant, "amount": amount, "pfc": pfc, "rank": rank, "seq": seq[0],
                 "card_like": card_like, "pending_amount": pending_amount, "recurring": recurring, "extra": extra or {}}
            L.append(t)
            bucket[post].append(t)
            authbal[acc] += -amount if credit(acc) else amount
            return t

        def swipe_post(rng, auth, lag=(1, 2)):
            return next_business(auth.date() + timedelta(days=rng.randint(*lag)))

        bills = [dict(b) for b in P.get("bills", [])] + [dict(c, _change=c["id"]) for c in self.ch("bill_add")]
        prices = defaultdict(list)
        for c in self.ch("price_change"):
            prices[c["bill"]].append(c)
        first_new_price = set()
        statement_due = {}
        for a in P["accounts"]:
            if a["type"] == "credit" and a.get("statement_day"):
                close = month_day(self.d0.year, self.d0.month, a["statement_day"])
                if close >= self.d0:
                    pm = (self.d0.replace(day=1) - DAY)
                    close = month_day(pm.year, pm.month, a["statement_day"])
                due = next_business(close + timedelta(days=a.get("due_days", 25)))
                bal = a.get("last_statement_cents", a["opening_balance_cents"])
                statements[a["id"]].append({"close_date": close.isoformat(), "balance_cents": bal, "due_date": due.isoformat()})
                if due >= self.d0:
                    due_pay[due].append((a["id"], bal))
        income = [i for i in P.get("income", []) if i["type"] != "hourly"]
        habits = P.get("spending", [])
        hchanges = self.ch("habit_change")
        day_flags = {}
        for d in daterange(self.d0, self.today + DAY):
            day_flags[d] = {"class": bool(self.blocks_starting(d, "class")), "work": bool(self.blocks_starting(d, "work"))}

        def amount_for(h, m, r):
            lo, hi = m.get("amount_cents") or h["amount_cents"]
            return r.randint(lo, hi)

        def purchase(h, when, key, amount=None, merchant=None):
            if when > self.now or when.date() < self.d0:
                return None
            r = self.R("purchase", h["id"], key)
            m = merchant or weighted(r, h["merchants"])
            amt = amount if amount is not None else amount_for(h, m, r)
            for c in hchanges:
                if c["habit"] == h["id"] and D(c["from"]) <= when.date() <= D(c["until"]) and c.get("amount_scale"):
                    amt = round(amt * c["amount_scale"])
            acc = h.get("account", chk)
            if card and r.random() < h.get("card_share", 0):
                acc = card
            if not credit(acc):
                k = ("guard", h["id"], str(key))
                choice = frozen.get(k) if frozen and k in frozen else None
                if choice is None:
                    choice = acc
                    if authbal[acc] - amt < floor:
                        if card and openings.get(card) is not None and authbal[card] + amt <= accts[card].get("credit_limit_cents", 10 ** 9):
                            choice = card
                        elif h.get("discretionary", True):
                            choice = "skip"
                rec[k] = choice
                if choice == "skip":
                    return None
                acc = choice
            tip = None
            final = amt
            if h.get("tip_pct"):
                tip = amt
                final = amt + round(amt * r.uniform(*h["tip_pct"]) / 100)
            post = swipe_post(r, when, tuple(h.get("post_lag_days", [1, 2])))
            desc = fill(m["description"], r)
            t = add(acc, when, post, desc, m.get("merchant_name"), -final, h["pfc"], 2, base=h["id"], card_like=True, pending_amount=-tip if tip else None,
                    extra={"habit": h["id"]})
            if h.get("nutrition_kcal"):
                food[when.date()] += h["nutrition_kcal"]
            if h.get("receipt_email"):
                receipts.append((when, m.get("merchant_name") or desc, final, t["id"], h.get("receipt_email")))
            if h.get("refund_chance") and r.random() < h["refund_chance"]:
                rd = when + timedelta(days=r.randint(5, 12), hours=r.randint(1, 6))
                if rd <= self.now:
                    add(acc, rd, swipe_post(r, rd, (0, 1)), desc, m.get("merchant_name"), final, h["pfc"], 1, base=f"{h['id']}-refund", extra={"refund_of": t["id"]})
            return t

        for d in daterange(self.d0, self.today + DAY):
            # 1. money in
            for dep in self.deposits:
                if dep["date"] == d:
                    add(dep["acc"], at(d, "05:00"), d, dep["desc"], dep["merchant"], dep["amount"], dep["pfc"], 0, tid=dep["tid"], extra={"paycheck": dep["paycheck"]})
            for inc in income:
                self.bank_income(inc, d, add)
            # 2. bills
            for b in bills:
                if not self.bill_due(b, d):
                    continue
                r = self.R("bill", b["id"], d)
                amt = b["amount_cents"]
                cid = None
                for c in sorted(prices[b["id"]], key=lambda c: c["from"]):
                    if D(c["from"]) <= d:
                        amt, cid = -c["amount_cents"] if c["amount_cents"] < 0 else c["amount_cents"], c["id"]
                scale = b.get("month_scale", {}).get(str(d.month), 1)
                if b.get("varies_pct"):
                    amt = round(amt * scale * (1 + r.uniform(-b["varies_pct"], b["varies_pct"])))
                elif scale != 1:
                    amt = round(amt * scale)
                tid = None
                if cid and cid not in first_new_price:
                    tid = cid
                    first_new_price.add(cid)
                if b.get("_change") and b["_change"] not in first_new_price:
                    tid = b["_change"]
                    first_new_price.add(tid)
                acc = b.get("account", chk)
                desc = fill(b["description"], r)
                auth = at(d, b.get("time", "04:00")) + mins(r.randint(0, 90))
                rid_ = None if b.get("recurring") is False else f"rec-{b['id']}"
                if b.get("via", "ach") == "card":
                    t = add(acc, auth, swipe_post(r, auth, (1, 1)), desc, b.get("merchant_name"), -amt, b["pfc"], 2, base=b["id"], tid=tid, card_like=True, recurring=rid_)
                else:
                    t = add(acc, at(d, "06:00"), next_business(d), desc, b.get("merchant_name"), -amt, b["pfc"], 1, base=b["id"], tid=tid, recurring=rid_)
                rec_charges[b["id"]].append(t)
                if tid:
                    self.note(tid, tid)
            # 3. savings plan and trips paid from savings
            sp = P.get("savings_plan")
            if sp:
                hit = (sp.get("on") == "payday" and any(dep["date"] == d and dep["acc"] == sp["from"] for dep in self.deposits)) or (sp.get("on") == "monthly" and d.day == sp.get("day", 1))
                if hit:
                    k = ("save", d.isoformat())
                    do = frozen[k] if frozen and k in frozen else authbal[sp["from"]] - sp["amount_cents"] >= sp.get("skip_if_below_cents", 0)
                    rec[k] = do
                    if do:
                        self.transfer(add, sp["from"], sp["to"], d, sp["amount_cents"], "savings")
            for t in self.trip_buys:
                if T(t["booked_at"]).date() == d:
                    pu = t["purchase"]
                    if pu.get("fund_from"):
                        self.transfer(add, pu["fund_from"], pu["account"], d, -pu["amount_cents"], "trip-fund", at_time=T(t["booked_at"]) - mins(20))
                    r = self.R("trip", t["id"])
                    auth = T(t["booked_at"])
                    add(pu["account"], auth, swipe_post(r, auth), pu["description"], pu.get("merchant_name"), pu["amount_cents"], pu.get("pfc", "TRAVEL_FLIGHTS"), 2,
                        tid=t["id"] + ".purchase", card_like=True)
                    self.note(t["id"], t["id"] + ".purchase")
            # 4. credit card statements and autopay
            for a in P["accounts"]:
                if a["type"] != "credit" or not a.get("statement_day"):
                    continue
                if d == month_day(d.year, d.month, a["statement_day"]):
                    owed = openings[a["id"]] - sum(t["amount"] for t in L if t["acc"] == a["id"] and t["post"] <= d)
                    due = next_business(d + timedelta(days=a.get("due_days", 25)))
                    statements[a["id"]].append({"close_date": d.isoformat(), "balance_cents": owed, "due_date": due.isoformat()})
                    due_pay[due].append((a["id"], owed))
            for acc, bal in due_pay.get(d, []):
                a = accts[acc]
                mode = a.get("autopay", "statement")
                pay = bal if mode == "statement" else min(bal, a.get("autopay_fixed_cents", 5000)) if mode == "fixed" else min(bal, max(2500, bal // 100 * 2))
                if pay > 0:
                    src = a.get("autopay_from", chk)
                    add(src, at(d, "07:00"), d, a.get("payment_description", "CARD PAYMENT AUTOPAY"), None, -pay, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 1, base="card-payment")
                    add(acc, at(d, "07:00"), d, a.get("payment_received", "PAYMENT RECEIVED THANK YOU"), None, pay, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 0, base="card-payment-in")
            # 5. interest at month end
            if (d + DAY).day == 1:
                for a in P["accounts"]:
                    if a.get("apy_bps") and a["type"] == "depository":
                        cents = round(posted[a["id"]] * a["apy_bps"] / 10000 / 12)
                        if cents > 0:
                            add(a["id"], at(d, "20:00"), d, a.get("interest_description", "INTEREST PAID"), None, cents, "INCOME_INTEREST_EARNED", 0, base="interest")
            # 6. everyday spending
            flags = day_flags[d]
            for h in habits:
                r = self.R("habit", h["id"], d)
                if h.get("routine"):
                    for i, hit in enumerate(self.routine_hits.get(h["routine"], [])):
                        if hit["date"] == d:
                            t = purchase(h, hit["at"] + mins(r.randint(10, 50)), ("r", d, i))
                            hit["record"] = t["id"] if t else None
                when = h.get("when", "any")
                ok = (not h.get("days") or wd(d) in h["days"]) and (when == "any" or (when == "class_days" and flags["class"]) or (when == "work_days" and flags["work"])
                                                                   or (when == "free_days" and not flags["class"] and not flags["work"]))
                lam = 0.0
                if ok:
                    lam = (h.get("extra_per_week", 0) if h.get("routine") else h.get("per_week", 0)) / len(h.get("days") or DAYS)
                    lam *= h.get("month_scale", {}).get(str(d.month), 1)
                    for c in hchanges:
                        if c["habit"] == h["id"] and D(c["from"]) <= d <= D(c["until"]):
                            if c.get("per_week") is not None:
                                lam = c["per_week"] / len(h.get("days") or DAYS)
                            lam += c.get("add_per_week", 0) / len(h.get("days") or DAYS)
                            self.note(c["id"], f"habit:{h['id']}")
                    if self.away_at(at(d, "12:00")):
                        lam = 0
                n = min(poisson(r, lam), 3)
                times = []
                m = h.get("on_routine_miss")
                if m and ok:
                    for entry in self.routine_log.get(m["routine"], []):
                        if entry["date"] == d.isoformat() and entry["outcome"] in ("skipped", "suspended", "excepted") and r.random() < m.get("chance", 0.8):
                            w = next(x for x in self.routines[m["routine"]]["windows"] if x.get("id") == entry["window"])
                            ws, we = span(d, w)
                            times.append(ws + mins(r.randint(0, max(0, int((we - ws).total_seconds() // 60) - 10))))
                for i in range(n):
                    lo, hi = h.get("time", ["09:00", "20:00"])
                    s0, e0 = span(d, {"start": lo, "end": hi})
                    times.append(s0 + mins(r.randint(0, max(0, int((e0 - s0).total_seconds() // 60)))))
                for i, t0 in enumerate(sorted(times)):
                    purchase(h, t0, (d, i))
            for (nd, when, spend) in self.night_spend:
                if nd == d and spend:
                    h = next(x for x in habits if x["id"] == spend["habit"])
                    r = self.R("nightspend", d)
                    purchase(h, when, ("night", d), amount=r.randint(*spend["amount_cents"]))
            # 7. injected one-offs
            for c in self.changes:
                if c["type"] in ("purchase", "refund", "duplicate_charge") and T(c["at"]).date() == d:
                    self.bank_injected(c, add, L)
            # 8. end of day: post, overdraft fee, low balance
            for t in bucket[d]:
                posted[t["acc"]] += -t["amount"] if credit(t["acc"]) else t["amount"]
            fee = bank_cfg.get("overdraft_fee_cents", 0)
            if chk and fee:
                k = ("overdraft", d.isoformat())
                do = frozen.get(k, False) if frozen is not None else (posted[chk] < 0 and any(t["acc"] == chk and t["amount"] < 0 for t in bucket[d]))
                rec[k] = do
                if do:
                    t = add(chk, at(d, "23:30"), d, "OVERDRAFT FEE", None, -fee, "BANK_FEES_OVERDRAFT_FEES", 3, base="overdraft-fee")
                    posted[chk] -= fee
            if chk and d < self.today and posted[chk] < bank_cfg.get("low_balance_alert_cents", 0):
                low_days.append((d, posted[chk]))

        # ---- assemble what the bank actually shows at `now`
        out = []
        for t in L:
            if t["auth"] > self.now:
                continue
            is_posted = t["post"] <= self.today
            if not is_posted and not t["card_like"]:
                continue
            t["pending"] = not is_posted
            out.append(t)
        out.sort(key=lambda t: (t["post"] if not t["pending"] else date.max, t["rank"], t["auth"], t["seq"]))
        bal = dict(openings)
        rows = []
        for t in out:
            amount = t["pending_amount"] if t["pending"] and t["pending_amount"] is not None else t["amount"]
            after = None
            if not t["pending"]:
                bal[t["acc"]] += -amount if credit(t["acc"]) else amount
                after = bal[t["acc"]]
            cat, kind = categorize(t["pfc"], amount, t["merchant"], t["desc"])
            pend_id = hexid("plaid-pending", t["id"], n=37, alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") if t["card_like"] else None
            rows.append({
                "id": t["id"], "account_id": t["acc"], "date": (t["auth"].date() if t["pending"] else t["post"]).isoformat(),
                "authorized_date": t["auth"].date().isoformat() if t["card_like"] else None, "description": t["desc"], "merchant_name": t["merchant"],
                "amount_cents": amount, "currency": "USD", "kind": kind, "category": cat, "category_parent": CATEGORY_PARENT.get(cat), "pending": t["pending"], "source": "plaid",
                "provider_transaction_id": pend_id if t["pending"] else hexid("plaid", t["id"], n=37, alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
                "pending_transaction_id": None if t["pending"] else pend_id,
                "pending_amount_cents": t["pending_amount"] if (not t["pending"] and t["pending_amount"] is not None) else None,
                "personal_finance_category": {"primary": pfc_primary(t["pfc"]), "detailed": t["pfc"]}, "recurring_id": t["recurring"], "balance_after_cents": after,
                "excluded": False, "notes": None,
            })
        pending_out = defaultdict(int)
        for r_ in rows:
            if r_["pending"] and r_["amount_cents"] < 0:
                pending_out[r_["account_id"]] += r_["amount_cents"]

        def measure(acc, how):
            if how == "current":
                return bal[acc]
            if credit(acc):
                return accts[acc].get("credit_limit_cents", 0) - bal[acc] + pending_out[acc]
            return bal[acc] + pending_out[acc]

        habit_of = {t["id"]: t["extra"].get("habit") for t in out}
        return {"rows": rows, "habit_of": habit_of, "final": bal, "pending_out": pending_out, "measure": measure, "food": food, "statements": statements, "rec_charges": rec_charges,
                "receipts": receipts, "low_days": low_days, "bills": bills, "prices": prices}

    def transfer(self, add, frm, to, d, cents, base, at_time=None):
        accts = self.accounts()
        when = at_time or at(d, "09:30")
        fa, ta = accts[frm], accts[to]
        add(frm, when, d, f"ONLINE TRANSFER TO {ta.get('short_name', ta['subtype'].upper())} XXXXXX{ta['mask']}", None, -cents, "TRANSFER_OUT_SAVINGS" if ta.get("subtype") == "savings" else "TRANSFER_OUT_ACCOUNT_TRANSFER", 1, base=f"{base}-out")
        add(to, when, d, f"ONLINE TRANSFER FROM {fa.get('short_name', fa['subtype'].upper())} XXXXXX{fa['mask']}", None, cents, "TRANSFER_IN_SAVINGS" if fa.get("subtype") == "savings" or ta.get("subtype") == "savings" else "TRANSFER_IN_ACCOUNT_TRANSFER", 0, base=f"{base}-in")

    def bill_due(self, b, d):
        if b.get("from") and d < D(b["from"]):
            return False
        if b.get("until") and d > D(b["until"]):
            return False
        f = b.get("frequency", "monthly")
        if f == "monthly":
            return d == month_day(d.year, d.month, b["day"])
        if f == "yearly":
            return d.month == b["month"] and d == month_day(d.year, d.month, b["day"])
        if f == "weekly":
            return wd(d) == b["weekday"]
        if f == "biweekly":
            return (d - D(b["anchor"])).days % 14 == 0
        if f == "dates":
            return d.isoformat() in b["dates"]
        if f == "quarterly":
            return d.month % 3 == b.get("month_offset", 0) and d == month_day(d.year, d.month, b["day"])
        raise SimError(f"bill {b['id']}: unknown frequency {f!r}")

    def bank_income(self, inc, d, add):
        r = self.R("income", inc["id"], d)
        kind = inc["type"]
        acc = inc.get("account", self.primary_checking())
        if kind == "salary":
            for ps, pe in self.pay_periods(inc, d - timedelta(days=40), d + timedelta(days=40)):
                pay = prev_business(pe + timedelta(days=inc.get("days_after_period_end", 0)))
                if inc.get("pay_day"):
                    pay = prev_business(month_day(ps.year, ps.month, inc["pay_day"]))
                if pay == d:
                    per_year = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12}[inc["pay_period"]]
                    gross = half_up(Fraction(inc["annual_cents"], per_year))
                    net = half_up(gross * (1 - Fraction(str(inc["tax_share"]))))
                    add(acc, at(d, "05:00"), d, inc["description"], inc.get("merchant_name"), net, inc.get("pfc", "INCOME_WAGES"), 0, base=f"pay-{slug(inc['id'])}",
                        extra={"salary": inc["id"], "gross_cents": gross})
        elif kind == "family":
            target = month_day(d.year, d.month, inc.get("day_of_month", 1))
            jit = self.R("family-jitter", inc["id"], d.year, d.month).randint(*inc.get("jitter_days", [0, 2]))
            if d == target + timedelta(days=jit):
                rr = self.R("family-amt", inc["id"], d.year, d.month)
                if rr.random() >= inc.get("skip_chance", 0):
                    amt = rr.randint(*inc["amount_cents"])
                    add(acc, at(d, inc.get("time", "18:00")), d, fill(inc["description"], rr), inc.get("merchant_name"), amt, inc.get("pfc", "TRANSFER_IN_ACCOUNT_TRANSFER"), 0,
                        base=slug(inc["id"]))
        elif kind == "student_aid":
            for x in inc["disbursements"]:
                if D(x["date"]) == d:
                    add(acc, at(d, "06:00"), d, x.get("description", inc.get("description", "FINANCIAL AID REFUND")), None, x["amount_cents"], inc.get("pfc", "INCOME_OTHER_INCOME"), 0,
                        base=slug(inc["id"]))
        elif kind == "freelance":
            for inv in self.invoices_for(inc):
                if inv["_paid"] == d:
                    add(acc, at(d, "08:00"), d, fill(inc.get("description", "STRIPE TRANSFER {A8}"), r), inc.get("merchant_name"), inv["amount_cents"],
                        inc.get("pfc", "INCOME_OTHER_INCOME"), 0, tid=inv["deposit_transaction_id"])
        else:
            raise SimError(f"income {inc['id']}: unknown type {kind!r}")

    def invoices_for(self, inc):
        key = ("_inv", inc["id"])
        if key in self.__dict__.setdefault("_cache", {}):
            return self._cache[key]
        out = []
        for cl in inc["clients"]:
            d = D(cl["first_invoice"])
            n = 1
            while d <= self.today:
                r = self.R("invoice", inc["id"], cl["name"], d)
                amt = r.randint(*cl["amount_cents"])
                due = d + timedelta(days=cl.get("terms_days", 30))
                paid = due + (timedelta(days=r.randint(*cl.get("late_days", [3, 20]))) if r.random() < cl.get("late_chance", 0.2) else -timedelta(days=r.randint(0, 3)))
                paid = next_business(paid)
                iid = f"inv-{slug(cl['name'])}-{n:03d}"
                status = "paid" if paid <= self.today else ("overdue" if due < self.today else "open")
                if d >= self.d0 - timedelta(days=60):
                    out.append({"id": iid, "client": cl["name"], "issued_on": d.isoformat(), "due_on": due.isoformat(), "amount_cents": amt, "status": status,
                                "paid_on": paid.isoformat() if status == "paid" else None, "deposit_transaction_id": f"tx-{paid}-{iid}" if status == "paid" else None,
                                "_paid": paid if status == "paid" and paid >= self.d0 else None})
                d += timedelta(days=cl.get("every_days", 30))
                n += 1
        self._cache[key] = out
        return out

    def bank_injected(self, c, add, L):
        r = self.R("inject", c["id"])
        auth = T(c["at"])
        if auth > self.now:
            self.truth_changes[c["id"]]["hidden"] = True
            return
        acc = c.get("account", self.primary_checking())
        if c.get("pending"):
            post = self.today + DAY
        else:
            post = next_business(auth.date() + timedelta(days=c.get("post_lag_days", 1)))
        if c["type"] == "purchase":
            if c["amount_cents"] >= 0:
                raise SimError(f"{c['id']}: a purchase is money out, so amount_cents must be negative")
            add(acc, auth, post, c["description"], c.get("merchant_name"), c["amount_cents"], c.get("pfc", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE"), 2, tid=c["id"], card_like=True)
            self.note(c["id"], c["id"])
        elif c["type"] == "refund":
            if c["amount_cents"] <= 0:
                raise SimError(f"{c['id']}: a refund is money in, so amount_cents must be positive")
            orig = next((t for t in L if t["id"] == c.get("of")), None)
            add(acc if not orig else orig["acc"], auth, next_business(auth.date()), c.get("description") or (orig["desc"] if orig else "REFUND"), c.get("merchant_name") or (orig["merchant"] if orig else None),
                c["amount_cents"], c.get("pfc") or (orig["pfc"] if orig else "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE"), 1, tid=c["id"])
            self.note(c["id"], c["id"])
        elif c["type"] == "duplicate_charge":
            if c["amount_cents"] >= 0:
                raise SimError(f"{c['id']}: a charge is money out, so amount_cents must be negative")
            for tid, dt in ((c["id"] + ".first", auth), (c["id"], auth + mins(c.get("minutes_apart", 1)))):
                add(acc, dt, post, c["description"], c.get("merchant_name"), c["amount_cents"], c.get("pfc", "FOOD_AND_DRINK_RESTAURANT"), 2, tid=tid, card_like=True)
                self.note(c["id"], tid)
            if c.get("refund_at") and T(c["refund_at"]) <= self.now:
                ra = T(c["refund_at"])
                add(acc, ra, next_business(ra.date()), c["description"], c.get("merchant_name"), -c["amount_cents"], c.get("pfc", "FOOD_AND_DRINK_RESTAURANT"), 1, tid=c["id"] + ".refund")
                self.note(c["id"], c["id"] + ".refund")

    def bank_output(self):
        res = self.bank
        accts = self.accounts()
        rows = res["rows"]
        for t in rows:
            self.ids.add(t["id"])
        out_accts = []
        for a in self.p["accounts"]:
            cur = res["final"][a["id"]]
            avail = res["measure"](a["id"], "available")
            st = res["statements"].get(a["id"], [])
            past = [s for s in st if D(s["close_date"]) <= self.today]
            nxt_due = None
            if a["type"] == "credit" and a.get("statement_day"):
                open_due = [s for s in past if D(s["due_date"]) >= self.today]
                if open_due:
                    nxt_due = open_due[0]["due_date"]
                else:
                    d = self.today
                    while d != month_day(d.year, d.month, a["statement_day"]) or d <= self.today:
                        d += DAY
                    nxt_due = next_business(d + timedelta(days=a.get("due_days", 25))).isoformat()
            out_accts.append({
                "id": self.claim(a["id"]), "name": a["name"], "official_name": a.get("official_name"), "type": a["type"], "subtype": a.get("subtype"),
                "institution_name": a.get("institution_name"), "mask": a.get("mask"), "currency": "USD", "source": "plaid",
                "provider_account_id": hexid("plaid-acct", a["id"], n=37, alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
                "opening_balance_cents": self.openings[a["id"]], "opening_balance_date": self.d0.isoformat(),
                "current_balance_cents": cur, "available_balance_cents": avail, "credit_limit_cents": a.get("credit_limit_cents"),
                "apr_bps": a.get("apr_bps"), "min_payment_cents": (max(2500, past[-1]["balance_cents"] // 100 * 2) if past and past[-1]["balance_cents"] > 0 else None) if a["type"] == "credit" else None,
                "next_payment_due_date": nxt_due, "last_statement_balance_cents": past[-1]["balance_cents"] if past and a["type"] == "credit" else None,
                "last_statement_date": past[-1]["close_date"] if past and a["type"] == "credit" else None, "balance_updated_at": self.iso(self.now),
            })
        recurring = []
        for b in res["bills"]:
            charges = [t for t in res["rec_charges"].get(b["id"], []) if t["auth"] <= self.now]
            if (len(charges) < 2 and not b.get("known")) or b.get("recurring") is False:
                continue
            amt = b["amount_cents"]
            for c in sorted(res["prices"].get(b["id"], []), key=lambda c: c["from"]):
                if D(c["from"]) <= self.today:
                    amt = abs(c["amount_cents"])
            last = max((t["auth"].date() for t in charges), default=None)
            nd = self.today
            while not self.bill_due(b, nd) or (last and nd <= last):
                nd += DAY
                if nd > self.today + timedelta(days=400):
                    nd = None
                    break
            cat, _ = categorize(b["pfc"], -amt, b.get("merchant_name"), b["description"])
            rid = self.claim(f"rec-{b['id']}")
            recurring.append({"id": rid, "name": b["name"], "merchant_key": merchant_key(b.get("merchant_name"), b["description"]), "amount_cents": -amt,
                              "frequency": b.get("frequency", "monthly"), "next_due_date": nd.isoformat() if nd else None, "kind": b.get("kind", "bill"), "category": cat,
                              "account_id": b.get("account", self.primary_checking()), "status": "active", "source": "detected",
                              "last_charged_on": last.isoformat() if last else None})
        self.recurring_out = recurring
        return {"provider": "plaid", "synced_at": self.iso(self.now), "accounts": out_accts, "transactions": rows, "recurring": recurring}

    # ---------------------------------------------------------------- health
    def build_health(self):
        h = self.p.get("health", {})
        daily, nutrition = [], []
        sleep_by_day = defaultdict(float)
        for s in self.sleep_sessions:
            sleep_by_day[s["day"]] += s["hours"]
        steps_cfg = h.get("steps", {"work": [8000, 12000], "class": [6000, 9000], "free": [3000, 7500]})
        rhr = h.get("resting_heart_rate", 64)
        wk_by_day = defaultdict(list)
        for w in self.workouts:
            wk_by_day[w["_start"].date()].append(w)
        nut = h.get("nutrition", {})
        food = self.bank["food"]

        def row(metric, d, v):
            daily.append({"id": self.claim(f"hs-{metric}-{d}"), "metric": metric, "day": d.isoformat(), "value": v, "source": "apple_health"})

        for d in daterange(self.d0, self.today + DAY):
            r = self.R("health", d)
            sh = round(sleep_by_day.get(d.isoformat(), 0), 1)
            if sh:
                row("sleep_hours", d, sh)
            if d == self.today:
                continue
            kind = "work" if self.blocks_starting(d, "work") else "class" if self.blocks_starting(d, "class") else "free"
            steps = r.randint(*steps_cfg[kind]) + 1800 * len(wk_by_day[d])
            ex = sum(w["minutes"] for w in wk_by_day[d]) + r.randint(2, 14)
            row("steps", d, steps)
            row("exercise_minutes", d, ex)
            row("active_energy_kcal", d, round(steps * 0.035 + sum(w["active_kcal"] for w in wk_by_day[d])))
            row("distance_km", d, round(steps * 0.00072, 1))
            row("resting_heart_rate", d, rhr + r.randint(-2, 2) + (3 if 0 < sh < 6 else 0))
            if nut.get("enabled") and r.random() < nut.get("log_rate", 0.6):
                kcal = round(r.gauss(nut.get("base_kcal", 1900), nut.get("sd_kcal", 200)) + 0.4 * food.get(d, 0))
                nutrition.append({"id": self.claim(f"nu-{d}"), "day": d.isoformat(), "kcal_logged": kcal, "meals_logged": r.randint(2, 4), "goal_kcal": nut.get("goal_kcal"),
                                  "source": "apple_health"})
        self.health = {"provider": "apple_health", "synced_at": self.iso(self.now), "goals": h.get("goals", {}), "daily": daily,
                       "sleep_sessions": [{k: v for k, v in s.items() if not k.startswith("_")} for s in self.sleep_sessions if s["day"] >= self.d0.isoformat()],
                       "workouts": [{k: v for k, v in w.items() if not k.startswith("_")} for w in sorted(self.workouts, key=lambda w: w["_start"])],
                       "nutrition": nutrition}
        for s in self.health["sleep_sessions"]:
            self.ids.add(s["id"])

    # ---------------------------------------------------------------- email
    def build_email(self):
        P = self.p
        em = P.get("email", {})
        msgs = []

        def add(when, typ, sender, subject, rid=None, change=None):
            if when > self.now or when < self.start:
                return
            msgs.append({"_at": when, "type": typ, "sender": sender, "subject": subject, "rid": rid, "change": change})

        # derived from the other connections
        if self.school:
            for a in self.school["announcements"]:
                course = next(c for c in self.school["courses"] if c["id"] == a["course_id"])
                add(T(a["posted_at"][:19]) + mins(2), "school", ["Course notifications", "notifications@example.com"], f"{course['code']}: {a['title']}", change=a["id"] if a["id"] in self.truth_changes else None)
            for a in self.school["assignments"]:
                if a["graded_at"] and self.R("gradeemail", a["id"]).random() < 0.35:
                    add(T(a["graded_at"][:19]), "school", ["Course notifications", "notifications@example.com"], f"Grade posted: {a['title']}")
        for p_ in self.posts:
            job = next(j for j in P["work"]["jobs"] if j["id"] == p_["employer_id"])
            add(T(p_["posted_at"][:19]) + mins(1), "work", [job["employer"] + " scheduling", "schedule-noreply@example.com"],
                f"Your schedule for {D(p_['covers_from']).strftime('%b %-d')} to {D(p_['covers_to']).strftime('%b %-d')} is posted", change=p_["id"] if p_["id"] in self.truth_changes else None)
        for pc in self.paychecks:
            job = next(j for j in P["work"]["jobs"] if j["id"] == pc["employer_id"])
            add(at(D(pc["pay_date"]), "06:10"), "work", [job["employer"] + " payroll", "payroll-noreply@example.com"], "Your pay statement is ready")
        inst = next((a.get("institution_name") for a in P["accounts"]), "Your bank")
        for acc, sts in self.bank["statements"].items():
            for st in sts:
                cd = D(st["close_date"])
                add(at(cd + DAY, "08:15"), "bank", [inst, "alerts@example.com"], "Your card statement is ready")
                add(at(D(st["due_date"]) - timedelta(days=3), "09:00"), "bank", [inst, "alerts@example.com"], f"Autopay of {money(st['balance_cents'])} is scheduled")
        low_set = {d for d, _ in self.bank["low_days"]}
        for d in sorted(low_set):
            if d - DAY not in low_set:
                add(at(d, "19:40"), "bank", [inst, "alerts@example.com"], "Low balance alert for your checking account")
        for b in self.bank["bills"]:
            if b.get("email"):
                for t in self.bank["rec_charges"].get(b["id"], []):
                    add(t["auth"] - timedelta(days=b["email"].get("days_before", 0)) + mins(30), "bill", [b["email"]["name"], b["email"]["address"]], b["email"].get("subject", f"Your {b['name']} bill is ready"))
        for c in self.ch("price_change"):
            if c.get("notice_at"):
                b = next(x for x in self.bank["bills"] if x["id"] == c["bill"])
                sender = (b.get("email") or {}).get("name", b["name"]), (b.get("email") or {}).get("address", "billing@example.com")
                add(T(c["notice_at"]), "bill", list(sender), c.get("notice_subject", f"Your {b['name']} price is changing"), rid=c["id"] + ".email", change=c["id"])
        for when, merch, cents, tid, how in self.bank["receipts"]:
            add(when + mins(3), "receipt", [merch, how if isinstance(how, str) and "@" in how else "orders@example.com"], f"Your {merch} order of {money(cents)}")
        for e in self.emails_derived:
            add(e["at"], e["type"], e["sender"], e["subject"], rid=e.get("rid"), change=e.get("change"))
        for c in self.ch("email"):
            if T(c["at"]) <= self.now:
                add(T(c["at"]), c.get("sender_type", "personal"), [c.get("sender_name", "Sender"), c["from_address"]], c["subject"], rid=c["id"], change=c["id"])
            else:
                self.truth_changes[c["id"]]["hidden"] = True
        # everyday mail
        rates = em.get("per_day", {})
        senders = {**DEFAULT_SENDERS, **em.get("senders", {})}
        subjects = {**DEFAULT_SUBJECTS, **em.get("subjects", {})}
        for d in daterange(self.d0, self.today + DAY):
            for typ, rate in sorted(rates.items()):
                r = self.R("email", typ, d)
                lam = rate * (em.get("weekend_scale", 0.8) if d.weekday() >= 5 else 1)
                for i in range(poisson(r, lam)):
                    when = at(d, "06:00") + mins(r.randint(0, 17 * 60))
                    s = r.choice(senders[typ])
                    subj = r.choice(subjects[typ]).format(pct=r.choice([15, 20, 25, 30, 40]), name=r.choice(FIRST_NAMES))
                    add(when, typ, s, subj)
        msgs.sort(key=lambda m: (m["_at"], m["subject"]))
        rows, per_day = [], defaultdict(int)
        address = em.get("address", "me@example.com")
        for m in msgs:
            d = m["_at"].date()
            per_day[d] += 1
            rid = m["rid"] or f"em-{d}-{per_day[d]:02d}"
            rid = self.claim(rid) if m["rid"] else self.uid(rid)
            if m["change"]:
                self.note(m["change"], rid)
            r = self.R("emailmeta", rid)
            age_h = (self.now - m["_at"]).total_seconds() / 3600
            unread_p = {"promotions": 0.75, "newsletters": 0.6, "social": 0.4}.get(m["type"], 0.15)
            unread = r.random() < (unread_p if age_h > 24 else max(unread_p, 0.6))
            labels = ["INBOX", LABELS.get(m["type"], "CATEGORY_UPDATES")] + (["UNREAD"] if unread else [])
            mid = hexid("gmail", rid)
            rows.append({"id": rid, "gmail_message_id": mid, "thread_id": mid, "from_address": m["sender"][1], "sender_name": m["sender"][0], "sender_type": m["type"],
                         "subject": m["subject"], "received_at": self.iso(m["_at"]), "unread": unread, "labels": labels})
        self.email = {"provider": "gmail", "address": address, "synced_at": self.iso(self.now), "bodies": "not stored (metadata only)", "messages": rows}

    # ---------------------------------------------------------------- memories
    def build_memories(self):
        rows = []
        items = list(self.p.get("memories", [])) + [dict(c) for c in self.ch("memory")]
        for k in self.s.get("known", []):
            items.append({"id": k["id"], "content": k["fact"], "category": k.get("category", "fact"), "via": k.get("source", "told Dev"),
                          "told_at": k.get("at", local(self.now - timedelta(days=3)))})
        for m in items:
            told = T(m["told_at"])
            if told > self.now:
                if m["id"] in self.truth_changes:
                    self.truth_changes[m["id"]]["hidden"] = True
                continue
            status = m.get("status", "active")
            rows.append({"id": self.claim(m["id"]), "content": m["content"], "category": m.get("category", "fact"), "source": m.get("source", "user"), "status": status,
                         "basis": m.get("basis", "stated"), "told_via": m.get("via", "chat"), "created_at": self.iso(told),
                         "confirmed_at": self.iso(told) if status == "active" else None, "expires_at": self.iso(T(m["expires_at"])) if m.get("expires_at") else None})
            if m["id"] in self.truth_changes:
                self.note(m["id"], m["id"])
        rows.sort(key=lambda m: m["created_at"])
        self.memories = {"memories": rows}

    # ---------------------------------------------------------------- timeline
    def build_timeline(self):
        vis = [b for b in self.blocks if b["visible"] and b["end"] > self.start and b["start"] < self.end]
        occupied = defaultdict(list)
        pieces = []
        for b in sorted(vis, key=lambda b: (-PRIO[b["state"]], b["start"], b["label"])):
            segs = [(max(b["start"], self.start), min(b["end"], self.end))]
            days = set()
            d = segs[0][0].date()
            while d <= (segs[0][1] - mins(1)).date():
                days.add(d)
                d += DAY
            others = sorted({id(o): o for day in days for o in occupied[day]}.values(), key=lambda o: o[0])
            for os_, oe in others:
                nxt = []
                for s, e in segs:
                    if oe <= s or os_ >= e:
                        nxt.append((s, e))
                        continue
                    if s < os_:
                        nxt.append((s, os_))
                    if oe < e:
                        nxt.append((oe, e))
                segs = nxt
            for s, e in segs:
                if e - s < mins(5):
                    continue
                piece = dict(b, start=s, end=e)
                pieces.append(piece)
                iv = (s, e)
                d = s.date()
                while d <= (e - mins(1)).date():
                    occupied[d].append(iv)
                    d += DAY
        pieces.sort(key=lambda p: p["start"])
        segs = []
        cur, t = "home", self.start
        for p in pieces:
            if p["start"] > t:
                self.fill_gap(segs, t, p["start"], cur, p["place"] if p["state"] != "away" else "home")
            elif p["start"] < t:
                p = dict(p, start=t)
                if p["end"] <= t:
                    continue
            segs.append({"start": p["start"], "end": p["end"], "state": p["state"], "label": p["label"], "refs": [p["ref"]] if p["ref"] else [], "derived": p["ref"] is None})
            t = p["end"]
            if p["state"] == "away":
                cur = "home"
            elif p["place"]:
                cur = p["place"]
        if t < self.end:
            self.fill_gap(segs, t, self.end, cur, None)
        # split at now, merge neighbours, then name them
        cut = []
        for sg in segs:
            if sg["start"] < self.now < sg["end"]:
                cut.append(dict(sg, end=self.now))
                cut.append(dict(sg, start=self.now))
            else:
                cut.append(sg)
        merged = []
        for sg in cut:
            sg["expected"] = sg["start"] >= self.now
            if merged and merged[-1]["state"] == sg["state"] and merged[-1]["label"] == sg["label"] and merged[-1]["expected"] == sg["expected"] and merged[-1]["end"] == sg["start"]:
                merged[-1]["end"] = sg["end"]
                merged[-1]["refs"] = merged[-1]["refs"] + [r for r in sg["refs"] if r not in merged[-1]["refs"]]
                continue
            merged.append(dict(sg))
        out = []
        for sg in merged:
            refs = sg["refs"]
            src = refs[0].split(".json")[0] if refs else "derived"
            out.append({"id": "tl-" + sg["start"].strftime("%Y%m%dT%H%M"), "start": local(sg["start"]), "end": local(sg["end"]), "weekday": DAYS[sg["start"].weekday()],
                        "state": sg["state"], "label": sg["label"], "source": src, "sources": refs or ["derived"], "expected": sg["expected"]})
        for o in out:
            self.claim(o["id"])
        self.timeline = {"time_zone": self.tz, "now": local(self.now), "start": local(self.start), "end": local(self.end),
                         "about": "Real life, derived only from the connections and what the person told Dev. Past stretches happened; expected ones come from schedules, calendars and routines.",
                         "segments": out}

    def fill_gap(self, segs, a, b, cur, nxt):
        if b <= a:
            return
        moves = []
        verb = {"car": "Drive", "transit": "Ride", "walk": "Walk", "bike": "Bike"}.get(self.p.get("commute_mode", "car"), "Travel")

        def go(frm, to, s, e):
            if e > s:
                moves.append((s, e, "commute", f"{verb} to {self.place_label(to)}" if to != "home" else f"{verb} home"))

        gap = (b - a).total_seconds() / 60
        if cur == "home" and (nxt in (None, "home")):
            moves.append((a, b, "stay", "home"))
        elif cur == "home":
            c = self.commute("home", nxt)
            if gap > c:
                moves.append((a, b - mins(c), "stay", "home"))
            go("home", nxt, max(a, b - mins(c)), b)
        else:
            back = self.commute(cur, "home")
            if nxt in (None, "home"):
                go(cur, "home", a, min(b, a + mins(back)))
                if gap > back:
                    moves.append((a + mins(back), b, "stay", "home"))
            else:
                fwd = self.commute("home", nxt)
                if gap >= back + fwd + (150 if nxt == cur else 90):
                    go(cur, "home", a, a + mins(back))
                    moves.append((a + mins(back), b - mins(fwd), "stay", "home"))
                    go("home", nxt, b - mins(fwd), b)
                elif nxt == cur:
                    moves.append((a, b, "stay", cur))
                else:
                    c = self.commute(cur, nxt)
                    if gap > c:
                        moves.append((a, b - mins(c), "stay", cur))
                    go(cur, nxt, max(a, b - mins(c)), b)
        # a few minutes of standing around before leaving is just part of the trip
        for i in range(len(moves) - 1):
            s, e, kind, what = moves[i]
            if kind == "stay" and e - s < mins(10) and moves[i + 1][2] == "commute":
                moves[i + 1] = (s, *moves[i + 1][1:])
                moves[i] = (s, s, kind, what)
        for s, e, kind, what in moves:
            if e <= s:
                continue
            if kind == "commute":
                segs.append({"start": s, "end": e, "state": "commute", "label": what, "refs": [], "derived": True})
                continue
            for ps, pe in self.day_parts(s, e):
                segs.append({"start": ps, "end": pe, **self.gap_name(ps, pe, what, nxt), "refs": [], "derived": True})

    def day_parts(self, s, e):
        if e - s <= timedelta(hours=4) and s.date() == (e - mins(1)).date():
            return [(s, e)]
        out, t = [], s
        while t < e:
            d = t.date()
            cuts = [at(d, "05:00"), at(d, "12:00"), at(d, "17:00"), at(d, "22:00"), at(d + DAY, "00:00")]
            nxt = min([c for c in cuts if c > t] + [e])
            out.append((t, nxt))
            t = nxt
        return out

    def gap_name(self, s, e, where, nxt_place=None):
        h = (s + (e - s) / 2).hour
        part = "Night" if h >= 22 or h < 5 else "Morning" if h < 12 else "Afternoon" if h < 17 else "Evening"
        if where != "home":
            following = self.first_commitment(e, e + mins(1), True)
            if where == "campus":
                label = "Between classes, on campus" if following and following["state"] == "class" else "Free time on campus"
            else:
                label = f"Free time near {self.place_label(where)}"
            return {"state": "other", "label": label}
        d = s.date()
        busy = self.blocks_starting(d, "class", True) or self.blocks_starting(d, "work", True) or self.overlapping(at(d, "08:00"), at(d, "18:00"), 0, True, ignore=SOFT_STATES + ("commute",))
        if not busy and part in ("Morning", "Afternoon"):
            return {"state": "day off", "label": f"{FULL_DAYS[d.weekday()]}, nothing planned"}
        return {"state": "home", "label": f"{part} at home"}

    # ---------------------------------------------------------------- truth and output
    def build_truth(self):
        routines = []
        for r in self.p.get("routines", []):
            log = self.routine_log.get(r["id"], [])
            for e in log:
                if isinstance(e.get("record"), dict):
                    e["record"] = e["record"]["record"]
            c = defaultdict(int)
            for e in log:
                c[e["outcome"]] += 1
            judged = c["kept"] + c["moved"] + c["skipped"]
            routines.append({"id": r["id"], "activity": r["activity"], "label": r["label"], "windows": r["windows"], "keep_rate": r.get("keep_rate"),
                             "records_as": r.get("records_as", "none"), "counts": dict(sorted(c.items())), "kept_share": round(c["kept"] / judged, 3) if judged else None, "log": log})
        signals = {}
        for c in self.ch("routine_suspend") + self.ch("habit_change"):
            signals[c["id"]] = self.signal_stats(c)
        recurring = []
        for b in self.bank["bills"]:
            recurring.append({"bill": b["id"], "name": b["name"], "frequency": b.get("frequency", "monthly"), "charges": [t["id"] for t in self.bank["rec_charges"].get(b["id"], []) if t["auth"] <= self.now],
                              "price_changes": [c["id"] for c in self.bank["prices"].get(b["id"], [])]})
        pay = []
        for pc in self.paychecks:
            sh = [s for s in self.shifts + self.hidden_shifts if s["id"] in pc["shift_ids"]]
            sched = sum(self.elapsed(s["_start"], s["_end"]) - s["break_minutes"] for s in sh) / 60
            pay.append({"paycheck": pc["id"], "pay_date": pc["pay_date"], "scheduled_hours": round(sched, 2), "worked_hours": pc["hours"], "net_cents": pc["net_cents"]})
        hidden = [{"id": s["id"], "starts_at": s["starts_at"], "ends_at": s["ends_at"], "posted_at": s["posted_at"]} for s in self.hidden_shifts if s["_start"] >= self.now]
        hidden_blocks = defaultdict(int)
        for b in self.blocks:
            if not b["visible"] and b["start"] < self.now:
                hidden_blocks[b["label"]] += 1
        return {"about": "What the simulator planted. For graders and model tests (ADR 0023); Dev never sees this file.", "generated_by": f"simulate.py {VERSION}",
                "persona": self.p["id"], "scenario": self.s["id"], "seed": self.seed, "now": local(self.now), "window": {"start": local(self.start), "end": local(self.end)},
                "opening_balances": self.openings, "routines": routines, "recurring": recurring, "pay": pay, "hidden_future_shifts": hidden,
                "real_life_not_in_any_connection": dict(sorted(hidden_blocks.items())), "changes": self.truth_changes, "signals": signals}

    def signal_stats(self, c):
        a, b = D(c["from"]), min(D(c["until"]), self.today)
        before0 = max(self.d0, a - timedelta(days=42))
        habits = c.get("habits") or ([c["habit"]] if "habit" in c else [h["id"] for h in self.p.get("spending", []) if (h.get("on_routine_miss") or {}).get("routine") in c.get("routines", [])])
        out = {}
        habit_of = self.bank["habit_of"]
        for hid in habits:
            rows = [t for t in self.bank["rows"] if habit_of.get(t["id"]) == hid and t["amount_cents"] < 0]

            def weekly(x, y):
                days = (y - x).days + 1
                if days <= 0:
                    return None
                cents = -sum(t["amount_cents"] for t in rows if x.isoformat() <= (t["authorized_date"] or t["date"]) <= y.isoformat())
                return round(cents * 7 / days)
            ids = [t["id"] for t in rows if a.isoformat() <= (t["authorized_date"] or t["date"]) <= b.isoformat()]
            out[hid] = {"weekly_cents_before": weekly(before0, a - DAY), "weekly_cents_during": weekly(a, b), "during_ids": ids}
        return out

    def run(self):
        self.build_trips()
        self.build_school()
        self.build_work()
        self.build_calendar()
        self.build_routines()
        self.build_sleep()
        self.build_bank()
        bank = self.bank_output()
        self.build_health()
        self.build_email()
        self.build_memories()
        self.build_timeline()
        self.cal_rows.sort(key=lambda e: (e["starts_at"], e["id"]))
        for e in self.cal_rows:
            self.ids.add(e["id"])
        strip = lambda rows: [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
        conns = {
            "bank": bank,
            "calendar": {"provider": "google_calendar", "synced_at": self.iso(self.now), "events": self.cal_rows},
            "school": self.school or {"provider": None, "courses": [], "assignments": [], "announcements": []},
            "work": {"provider": "schedule", "synced_at": self.iso(self.now), "employers": self.employers, "shifts": strip(self.shifts), "schedule_posts": self.posts,
                     "paychecks": self.paychecks, "invoices": [{k: v for k, v in i.items() if not k.startswith("_")} for inc in self.p.get("income", []) if inc["type"] == "freelance" for i in self.invoices_for(inc)]},
            "health": self.health,
            "email": self.email,
            "memories": self.memories,
        }
        return {"connections": conns, "timeline": self.timeline, "truth": self.build_truth()}


# ---------------------------------------------------------------- files

def dumps(obj):
    """JSON with one record per line inside lists, so a case reads and diffs well."""
    def enc(o, ind):
        pad = "  " * ind
        if isinstance(o, dict) and o and any(isinstance(v, list) and v and isinstance(v[0], dict) for v in o.values()) or (isinstance(o, dict) and ind == 0):
            items = [f'{pad}  {json.dumps(k)}: {enc(v, ind + 1)}' for k, v in o.items()]
            return "{\n" + ",\n".join(items) + "\n" + pad + "}"
        if isinstance(o, list) and o and all(isinstance(x, dict) for x in o):
            return "[\n" + ",\n".join(pad + "  " + enc(x, ind + 1) for x in o) + "\n" + pad + "]"
        return json.dumps(o, ensure_ascii=False)
    return enc(obj, 0) + "\n"


def resolve_persona(scenario, scenario_path=None, persona_path=None):
    """The persona a scenario uses: --persona, else the library persona it names, then the scenario's overrides."""
    if persona_path:
        base = json.loads(Path(persona_path).read_text(encoding="utf-8"))
    else:
        ref = scenario.get("persona")
        if not ref:
            raise SimError("scenario.persona must name a persona in docs/situations/personas/ (or pass --persona)")
        cand = [PERSONA_DIR / f"{ref}.json", Path(ref)]
        if scenario_path:
            cand.insert(1, Path(scenario_path).parent / ref)
        path = next((c for c in cand if c.is_file()), None)
        if not path:
            raise SimError(f"persona {ref!r} not found in {PERSONA_DIR}")
        base = json.loads(path.read_text(encoding="utf-8"))
    over = scenario.get("persona_overrides")
    return deep_merge(base, over) if over else base


def simulate(persona, scenario):
    """Pure: persona + scenario -> {"persona", "connections", "timeline", "truth"}."""
    out = Sim(persona, scenario).run()
    out["persona"] = persona
    return out


def render(result):
    """Every file a case folder holds, as {relative path: text}."""
    files = {"persona.json": json.dumps(result["persona"], indent=2, ensure_ascii=False) + "\n"}
    for name, data in result["connections"].items():
        files[f"connections/{name}.json"] = dumps(data)
    files["timeline.json"] = dumps(result["timeline"])
    files["truth.json"] = dumps(result["truth"])
    return files


def write(files, out_dir):
    out_dir = Path(out_dir)
    (out_dir / "connections").mkdir(parents=True, exist_ok=True)
    for rel, text in files.items():
        (out_dir / rel).write_text(text, encoding="utf-8")


def summary(result):
    c, tl, tr = result["connections"], result["timeline"], result["truth"]
    lines = []
    tx = c["bank"]["transactions"]
    lines.append(f"bank: {len(c['bank']['accounts'])} accounts, {len(tx)} transactions ({sum(t['pending'] for t in tx)} pending), {len(c['bank']['recurring'])} recurring")
    for a in c["bank"]["accounts"]:
        lines.append(f"  {a['id']}: current {money(a['current_balance_cents'])}, available {money(a['available_balance_cents'])}, opening {money(a['opening_balance_cents'])}")
    for r in c["bank"]["recurring"]:
        lines.append(f"  {r['id']}: {money(r['amount_cents'])} {r['frequency']}, next {r['next_due_date']}")
    lines.append(f"calendar: {len(c['calendar']['events'])} events")
    s = c["school"]
    lines.append(f"school: {len(s['courses'])} courses, {len(s['assignments'])} assignments and exams, {len(s['announcements'])} announcements")
    w = c["work"]
    lines.append(f"work: {len(w['shifts'])} shifts visible ({len(tr['hidden_future_shifts'])} not posted yet), {len(w['paychecks'])} paychecks, {len(w['schedule_posts'])} schedule posts")
    for p in w["paychecks"][-3:]:
        lines.append(f"  {p['id']}: {p['hours']} h -> {money(p['net_cents'])} on {p['pay_date']}")
    h = c["health"]
    lines.append(f"health: {len(h['sleep_sessions'])} nights of sleep, {len(h['workouts'])} workouts, {len(h['daily'])} daily values, {len(h['nutrition'])} days of nutrition")
    days = max(1, len({m['received_at'][:10] for m in c['email']['messages']}))
    lines.append(f"email: {len(c['email']['messages'])} messages ({len(c['email']['messages']) / days:.1f} a day)")
    lines.append(f"memories: {len(c['memories']['memories'])}")
    lines.append(f"timeline: {len(tl['segments'])} stretches from {tl['start']} to {tl['end']}")
    for r in tr["routines"]:
        lines.append(f"  routine {r['id']}: {r['counts']} kept share {r['kept_share']}")
    for cid, ch in tr["changes"].items():
        lines.append(f"  change {cid} ({ch['type']}): {', '.join(ch['records'][:8]) or 'no visible record'}{' ...' if len(ch['records']) > 8 else ''}{' (not visible yet)' if ch.get('hidden') else ''}")
    for cid, sig in tr["signals"].items():
        for hid, st in sig.items():
            lines.append(f"  signal {cid} {hid}: {money(st['weekly_cents_before'] or 0)}/week before, {money(st['weekly_cents_during'] or 0)}/week during")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Expand a persona and a scenario into full connection data.")
    ap.add_argument("scenario", help="path to scenario.json")
    ap.add_argument("--persona", help="persona JSON to use instead of the library persona the scenario names")
    ap.add_argument("--out", help="folder to write (default: the scenario's folder)")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    sp = Path(a.scenario)
    scenario = json.loads(sp.read_text(encoding="utf-8"))
    try:
        persona = resolve_persona(scenario, sp, a.persona)
        result = simulate(persona, scenario)
    except SimError as e:
        print(f"simulate: {e}", file=sys.stderr)
        return 1
    write(render(result), a.out or sp.parent)
    if not a.quiet:
        print(f"Wrote {a.out or sp.parent}")
        print(summary(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
