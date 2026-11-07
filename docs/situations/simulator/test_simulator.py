#!/usr/bin/env python3
"""Tests for the life simulator, the persona generator and validate.py v2.

Run: python3 -m unittest discover -s docs/situations/simulator -p "test_*.py"
  or python3 docs/situations/simulator/test_simulator.py
"""
import copy
import json
import sys
import tempfile
import unittest
from collections import defaultdict
from datetime import datetime
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(LIBRARY))

import personas  # noqa: E402
import simulate  # noqa: E402
import validate  # noqa: E402

EXAMPLES = LIBRARY / "examples"
STUDENT = EXAMPLES / "e0001-student-aunt-away-short-before-payday"
NURSE = EXAMPLES / "e0002-night-nurse-school-closure"


def load(case):
    sc = json.loads((case / "scenario.json").read_text(encoding="utf-8"))
    return simulate.resolve_persona(sc, case / "scenario.json"), sc


_CACHE = {}


def run(case):
    if case not in _CACHE:
        p, sc = load(case)
        _CACHE[case] = (p, sc, simulate.simulate(p, sc))
    return _CACHE[case]


class SameSeedSameOutput(unittest.TestCase):
    def test_identical_files_for_the_same_seed(self):
        p, sc = load(STUDENT)
        a = simulate.render(simulate.simulate(p, sc))
        b = simulate.render(simulate.simulate(copy.deepcopy(p), copy.deepcopy(sc)))
        self.assertEqual(a, b)

    def test_a_different_seed_gives_a_different_life(self):
        p, sc = load(STUDENT)
        other = dict(sc, seed=sc["seed"] + 1)
        a = simulate.render(simulate.simulate(p, sc))["connections/bank.json"]
        b = simulate.render(simulate.simulate(p, other))["connections/bank.json"]
        self.assertNotEqual(a, b)

    def test_files_on_disk_are_current(self):
        for case in (STUDENT, NURSE):
            files = simulate.render(run(case)[2])
            for rel, text in files.items():
                self.assertEqual((case / rel).read_text(encoding="utf-8"), text, f"{case.name}/{rel} is stale: re-run simulate.py")

    def test_generated_personas_are_deterministic(self):
        self.assertEqual(personas.make_persona(7), personas.make_persona(7))
        self.assertNotEqual(personas.make_persona(7), personas.make_persona(8))


class BalancesReconcile(unittest.TestCase):
    def check(self, bank):
        accts = {a["id"]: a for a in bank["accounts"]}
        bal = {k: a["opening_balance_cents"] for k, a in accts.items()}
        pending = defaultdict(int)
        for t in bank["transactions"]:
            self.assertIsInstance(t["amount_cents"], int)
            if t["pending"]:
                self.assertIsNone(t["balance_after_cents"])
                pending[t["account_id"]] += min(0, t["amount_cents"])
                continue
            credit = accts[t["account_id"]]["type"] == "credit"
            bal[t["account_id"]] += -t["amount_cents"] if credit else t["amount_cents"]
            self.assertEqual(t["balance_after_cents"], bal[t["account_id"]], t["id"])
        for k, a in accts.items():
            self.assertEqual(a["current_balance_cents"], bal[k], k)
            if a["type"] != "credit":
                self.assertEqual(a["available_balance_cents"], bal[k] + pending[k], k)

    def test_examples_reconcile(self):
        for case in (STUDENT, NURSE):
            self.check(run(case)[2]["connections"]["bank"])

    def test_pinned_balance_is_exact(self):
        bank = run(STUDENT)[2]["connections"]["bank"]
        chk = next(a for a in bank["accounts"] if a["id"] == "acc-checking")
        self.assertEqual(chk["available_balance_cents"], 4000)

    def test_holdings_come_from_the_persona_and_stay_in_cents(self):
        p, sc = load(LIBRARY / "cases" / "s0026-student-short-for-car-insurance-sell-fifty-of-vti")
        bank = simulate.simulate(p, sc)["connections"]["bank"]
        h = bank["holdings"][0]
        self.assertEqual((h["id"], h["account_id"], h["value_cents"], h["cost_basis_cents"]), ("h-vti", "acc-brokerage", 81240, 60040))
        self.assertEqual(h["value_cents"] - h["cost_basis_cents"], 21200)
        self.assertEqual(next(a for a in bank["accounts"] if a["id"] == "acc-brokerage")["type"], "investment")
        errors = []
        validate.check_bank(bank, datetime.fromisoformat(sc["now"]), errors)
        self.assertEqual(errors, [])
        bad = copy.deepcopy(p)
        bad["holdings"][0]["account"] = "acc-checking"
        with self.assertRaises(simulate.SimError):
            simulate.simulate(bad, sc)

    def test_signs_follow_cashflow_rules(self):
        rows = {t["id"]: t for t in run(STUDENT)[2]["connections"]["bank"]["transactions"]}
        self.assertEqual(rows["x-target"]["amount_cents"], -8517)
        self.assertTrue(rows["x-target"]["pending"])
        self.assertEqual(rows["tx-2026-10-23-pay-store"]["kind"], "income")
        self.assertGreater(rows["tx-2026-10-23-pay-store"]["amount_cents"], 0)
        phone = next(t for t in rows.values() if t["recurring_id"] == "rec-phone")
        self.assertEqual((phone["category"], phone["kind"]), ("Phone", "expense"))

    def test_nothing_posted_after_now(self):
        for case in (STUDENT, NURSE):
            p, sc, res = run(case)
            now = datetime.fromisoformat(sc["now"])
            for t in res["connections"]["bank"]["transactions"]:
                if t["pending"]:
                    self.assertLessEqual((now.date() - datetime.fromisoformat(t["authorized_date"]).date()).days, 6)
                else:
                    self.assertLessEqual(t["date"], sc["now"][:10])

    def test_generated_people_reconcile(self):
        for seed in (3, 11):
            p = personas.make_persona(seed)
            res = simulate.simulate(p, {"id": "s9999-test", "persona": p["id"], "now": "2026-11-05T18:00", "seed": seed, "changes": []})
            self.check(res["connections"]["bank"])


class PayMatchesHours(unittest.TestCase):
    def test_paychecks_are_hours_times_rate_less_tax(self):
        for case in (STUDENT, NURSE):
            p, sc, res = run(case)
            work, bank = res["connections"]["work"], res["connections"]["bank"]
            inc = {i["job"]: i for i in p["income"] if i["type"] == "hourly"}
            shifts = {s["id"]: s for s in work["shifts"]}
            deposits = {t["id"]: t for t in bank["transactions"]}
            self.assertGreaterEqual(len(work["paychecks"]), 5)
            for pc in work["paychecks"]:
                rate, tax = inc[pc["employer_id"]]["rate_cents"], Fraction(str(inc[pc["employer_id"]]["tax_share"]))
                minutes = 0
                for sid in pc["shift_ids"]:
                    s = shifts[sid]
                    worked = (datetime.fromisoformat(s["recorded_end"]) - datetime.fromisoformat(s["recorded_start"])).total_seconds() / 60
                    minutes += round(worked) - s["break_minutes"]
                self.assertAlmostEqual(pc["hours"], minutes / 60, delta=0.011)
                ot = Fraction(round(pc["overtime_hours"] * 60))
                gross = Fraction(minutes - ot) * rate / 60 + ot * rate / 60 * Fraction(3, 2)
                self.assertLessEqual(abs(gross - pc["gross_cents"]), 2, pc["id"])
                self.assertLessEqual(abs(Fraction(pc["gross_cents"]) * (1 - tax) - pc["net_cents"]), 1, pc["id"])
                dep = deposits[pc["transaction_id"]]
                self.assertEqual((dep["amount_cents"], dep["date"]), (pc["net_cents"], pc["pay_date"]))

    def test_payday_is_on_schedule(self):
        work = run(STUDENT)[2]["connections"]["work"]
        for pc in work["paychecks"]:
            self.assertEqual(datetime.fromisoformat(pc["pay_date"]).strftime("%a"), "Fri", pc["id"])

    def test_the_night_shift_overtime_is_paid(self):
        work = run(NURSE)[2]["connections"]["work"]
        self.assertTrue(any(pc["overtime_hours"] > 0 for pc in work["paychecks"]))

    def test_validator_pay_check_agrees(self):
        for case in (STUDENT, NURSE):
            p, sc, res = run(case)
            errors = []
            validate.check_pay(res["connections"]["work"], res["connections"]["bank"], p, sc, errors)
            self.assertEqual(errors, [])


class TimelineHasNoOverlaps(unittest.TestCase):
    def test_consecutive_stretches_from_start_to_end(self):
        for case in (STUDENT, NURSE):
            tl = run(case)[2]["timeline"]
            segs = tl["segments"]
            self.assertEqual(segs[0]["start"], tl["start"])
            self.assertEqual(segs[-1]["end"], tl["end"])
            for a, b in zip(segs, segs[1:]):
                self.assertEqual(a["end"], b["start"], f"{case.name}: {a['id']} and {b['id']} overlap or leave a gap")
                self.assertLess(a["start"], a["end"])

    def test_weekdays_states_and_expected_flags(self):
        for case in (STUDENT, NURSE):
            p, sc, res = run(case)
            errors = []
            ids, by_file = validate.collect_ids(res["connections"], res["timeline"])
            validate.check_timeline(res["timeline"], datetime.fromisoformat(sc["now"]), lambda r: r.partition("#")[2].split("@")[0] in by_file.get(r.partition("#")[0], ()), errors)
            self.assertEqual(errors, [])

    def test_unposted_shifts_stay_hidden(self):
        p, sc, res = run(STUDENT)
        hidden = {s["id"] for s in res["truth"]["hidden_future_shifts"]}
        self.assertTrue(hidden)
        shown = {s["id"] for s in res["connections"]["work"]["shifts"]}
        self.assertFalse(hidden & shown)
        refs = {r for s in res["timeline"]["segments"] for r in s["sources"]}
        self.assertFalse({f"work.json#{h}" for h in hidden} & refs)


class RoutinesAndRoutineFit(unittest.TestCase):
    def test_history_keeps_routines_at_a_learnable_rate(self):
        for case in (STUDENT, NURSE):
            p, sc, res = run(case)
            errors = []
            ids, _ = validate.collect_ids(res["connections"], res["timeline"])
            validate.check_routine_rates(res["truth"], p, ids, errors)
            self.assertEqual(errors, [])
        gym = next(r for r in run(STUDENT)[2]["truth"]["routines"] if r["id"] == "gym")
        self.assertTrue(0.7 <= gym["kept_share"] <= 0.9, gym["kept_share"])
        workouts = run(STUDENT)[2]["connections"]["health"]["workouts"]
        at_seven = [w for w in workouts if w["start"][11:13] == "07"]
        self.assertGreater(len(at_seven) / len(workouts), 0.7)

    def bad(self, edit):
        p, sc, res = run(STUDENT)
        sc = copy.deepcopy(sc)
        edit(sc)
        files = simulate.render(res)
        files["scenario.json"] = json.dumps(sc)
        errors, _ = validate.check_files(files, "examples", regen=False)
        return errors

    def test_a_placement_outside_its_window_needs_a_reason(self):
        def evening(sc):
            sc["best_fix"][2]["placements"][1].update(start="2026-11-30T20:00", end="2026-11-30T21:30")
        errors = self.bad(evening)
        self.assertTrue(any("outside study window" in e for e in errors), errors)

        def with_reason(sc):
            evening(sc)
            fit = next(f for f in sc["routine_fit"]["placements"] if f["placement"] == "pl-bio-2")
            fit.update(fits=False, reason="Only free evening before the exam, and she agreed to try it", window=None)
        self.assertFalse([e for e in self.bad(with_reason) if "pl-bio-2" in e])

    def test_tempting_suggestions_must_be_in_must_not(self):
        errors = self.bad(lambda sc: sc["must_not"].remove("plan study on a Sunday morning (kept free)"))
        self.assertTrue(any("tempting" in e for e in errors), errors)

    def test_no_second_workout_on_a_gym_day(self):
        def gym(sc):
            sc["best_fix"][0]["placements"] = [{"id": "pl-gym", "activity": "workout", "label": "Evening workout", "start": "2026-11-02T18:00", "end": "2026-11-02T19:00"}]
            sc["now"] = "2026-11-02T12:00"
        errors = self.bad(gym)
        self.assertTrue(any("pl-gym" in e for e in errors), errors)

    def test_facts_must_exist(self):
        errors = self.bad(lambda sc: sc["dev_must_notice"][0]["facts"].append("tx-1999-01-01-nothing"))
        self.assertTrue(any("tx-1999-01-01-nothing" in e for e in errors), errors)


class GeneratorMix(unittest.TestCase):
    def test_seventy_percent_students(self):
        for count, start in ((10, 1), (20, 5), (7, 40)):
            batch = personas.mix(count, start)
            self.assertEqual(sum(k == "student" for _, k in batch), round(count * 0.7))

    def test_students_vary(self):
        studs = [personas.make_persona(s, "student")["student"] for s in range(1, 41)]
        self.assertGreaterEqual(len({s["level"] for s in studs}), 4)
        self.assertGreaterEqual(len({s["work"] for s in studs}), 5)
        self.assertGreaterEqual(len({s["living"] for s in studs}), 5)
        self.assertGreaterEqual(len({s["lms"] for s in studs}), 4)
        self.assertGreaterEqual(len({s["classes"] for s in studs}), 4)
        self.assertTrue({"morning", "evening"} <= {s["study_style"] for s in studs})
        self.assertTrue({"steady", "crammer"} <= {s["pace"] for s in studs})
        self.assertTrue({"student parent", "first-generation"} <= {f for s in studs for f in s["flags"]})

    def test_generated_lives_pass_every_data_check(self):
        for seed, kind in personas.mix(10, 101):
            p = personas.make_persona(seed, kind)
            sc = {"id": "s9999-test", "persona": p["id"], "now": "2026-11-05T18:00", "seed": seed, "changes": []}
            errors, _ = validate.check_generated(p, sc, expected=False)
            self.assertEqual(errors, [], p["id"])


class FocusedFormatStillWorks(unittest.TestCase):
    def test_a_focused_case_validates(self):
        case = {
            "id": "s0999-focused-sample", "title": "Sample", "life": {"summary": "x", "kinds": ["student"], "time_zone": "America/Chicago", "pay": {"type": "hourly", "period": "biweekly"}},
            "now": "2026-01-14T15:00", "known": [{"id": "k1", "fact": "Partner away", "source": "told Dev"}],
            "timeline": [{"id": "t1", "start": "2026-01-14T19:00", "end": "2026-01-15T07:30", "state": "work", "label": "Night shift", "source": "schedule", "expected": False}],
            "attached": [{"id": "a1", "at": "2026-01-14T16:00", "part": "life", "kind": "message", "label": "School closed", "amount_cents": None, "expected": False, "source": "email"}],
            "money": {"available_now_cents": 100}, "dev_must_notice": [{"check": "collision", "what": "x", "by_when": "2026-01-14T18:00", "facts": ["t1", "a1", "k1"]}],
            "best_fix": {"what": "ask", "why": "time", "action": "ask", "needs_user": True}, "must_not": ["contact anyone"], "stay_quiet": False, "assumptions": [], "tags": [],
        }
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "s0999-focused-sample.json"
            path.write_text(json.dumps(case), encoding="utf-8")
            errors, _ = validate.check_case(path)
            self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
