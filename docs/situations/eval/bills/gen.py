import json, sys, traceback
from pathlib import Path
SIM = Path("/home/user/LIfeFlow/docs/situations/simulator")
sys.path.insert(0, str(SIM))
import personas, simulate
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
count, start, hist = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
with_price = len(sys.argv) > 5 and sys.argv[5] == "price"
ok = 0
for seed, kind in personas.mix(count, start):
    p = personas.make_persona(seed, kind)
    changes = []
    if with_price:
        # a price rise on a subscription-like bill, 45 days before now
        subs = [b for b in p.get("bills", []) if b.get("kind") == "subscription" or b.get("via") == "card"]
        if subs:
            b = subs[0]
            from datetime import date, timedelta
            due = b.get("day", 5)
            changes.append({"id": f"x-price-{b['id']}", "type": "price_change", "bill": b["id"], "from": "2026-10-01", "amount_cents": abs(b["amount_cents"]) + 200})
    sc = {"id": f"s9{seed:03d}-review", "persona": p["id"], "now": "2026-11-05T18:00", "seed": seed, "changes": changes, "history_days": hist}
    try:
        res = simulate.simulate(p, sc)
    except BaseException as e:
        print("FAIL", seed, kind, repr(e)[:200]); continue
    bank = res["connections"]["bank"]
    truth = res["truth"]
    d = {"about": f"seed {seed} {kind}", "now": sc["now"], "accounts": [{"id": a["id"], "type": a["type"], "mask": a.get("mask")} for a in bank["accounts"]],
         "transactions": [{k: t.get(k) for k in ("id", "account_id", "date", "description", "merchant_name", "amount_cents", "pending", "personal_finance_category")} for t in bank["transactions"]],
         "recurring": truth["recurring"], "pay": [x["pay_date"] for x in truth["pay"]], "bills": p.get("bills", [])}
    (out / f"g{seed:04d}.json").write_text(json.dumps(d))
    ok += 1
print("ok", ok)
