import json, sys
from pathlib import Path
SIM = Path("/home/user/LIfeFlow/docs/situations/simulator")
sys.path.insert(0, str(SIM))
import personas, simulate
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
count, start, hist = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
plant = len(sys.argv) > 5 and sys.argv[5] == "plant"
ok = 0
SUBPFC = ("ENTERTAINMENT", "GENERAL_SERVICES_OTHER")
for seed, kind in personas.mix(count, start):
    p = personas.make_persona(seed, kind)
    changes = []
    if plant:
        subs = [b for b in p.get("bills", []) if b.get("via") == "card" and b.get("day") and any(b["pfc"].startswith(x) for x in SUBPFC)]
        if subs:
            b = subs[seed % len(subs)]
            changes.append({"id": f"x-price-{b['id']}", "type": "price_change", "bill": b["id"], "from": "2026-09-08", "amount_cents": abs(b["amount_cents"]) + max(50, round(abs(b["amount_cents"]) * (0.10 + (seed % 4) * 0.05)))})
        if len(subs) >= 2:
            b2 = subs[(seed + 1) % len(subs)]
            day = min(b2["day"], 28)
            changes.append({"id": f"x-dup-{b2['id']}", "type": "purchase", "at": f"2026-10-{day:02d}T13:10", "account": b2.get("account", "acc-card" if any(a["id"] == "acc-card" for a in p["accounts"]) else "acc-checking"),
                            "description": b2["description"], "merchant_name": b2.get("merchant_name"), "amount_cents": -abs(b2["amount_cents"]), "pfc": b2["pfc"]})
    sc = {"id": f"s9{seed:04d}-review", "persona": p["id"], "now": "2026-11-05T18:00", "seed": seed, "changes": changes, "history_days": hist}
    try:
        res = simulate.simulate(p, sc)
    except BaseException as e:
        # retry without changes
        try:
            sc["changes"] = []; res = simulate.simulate(p, sc); changes = []
        except BaseException as e2:
            print("FAIL", seed, kind, repr(e2)[:150]); continue
    bank = res["connections"]["bank"]; truth = res["truth"]
    d = {"about": f"seed {seed} {kind}", "now": sc["now"], "accounts": [{"id": a["id"], "type": a["type"], "mask": a.get("mask")} for a in bank["accounts"]],
         "transactions": [{k: t.get(k) for k in ("id", "account_id", "date", "description", "merchant_name", "amount_cents", "pending", "personal_finance_category")} for t in bank["transactions"]],
         "recurring": truth["recurring"], "pay": [x["pay_date"] for x in truth["pay"]], "changes": changes}
    (out / f"h{seed:04d}.json").write_text(json.dumps(d)); ok += 1
print("ok", ok)
