"""Makes many made-up lives for the training examples: every persona in docs/situations/personas, at several moments
of the term, each with its own seed, through the library's own simulator (simulate.py). No signal is planted: these are
normal weeks, which is most of what a skyling sees. Made-up data only (ADR 0023).

  python3 scripts/gpu/chat-data/make_lives.py --out /workspace/chatdata/lives --per-persona 6

Students make up at least 70% of the personas (owner's rule for the library), so they do here too.
"""
import argparse, json, random, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SIM = ROOT / "docs/situations/simulator/simulate.py"
PERSONAS = sorted((ROOT / "docs/situations/personas").glob("*.json"))

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--per-persona", type=int, default=6)
ap.add_argument("--seed", type=int, default=2026)
a = ap.parse_args()
rng = random.Random(a.seed)
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)

# Moments across the fall term, on different weekdays and times of day (morning, afternoon, evening, late night).
days = [f"2026-09-{d:02d}" for d in (8, 15, 22, 29)] + [f"2026-10-{d:02d}" for d in (6, 13, 20, 27)] + [f"2026-11-{d:02d}" for d in (3, 10, 17)]
times = ["07:40", "09:15", "12:30", "15:10", "18:45", "21:20", "23:30"]
made, failed = 0, []
for p in PERSONAS:
    pid = p.stem
    for i in range(a.per_persona):
        day = rng.choice(days)
        # shift the day by 0 to 6 so every weekday shows up
        d = day[:8] + f"{min(30, int(day[8:]) + rng.randint(0, 6)):02d}"
        lid = f"{pid}-{i}"
        folder = out / lid
        folder.mkdir(exist_ok=True)
        scenario = {"id": lid, "title": "generated normal week", "persona": pid, "now": f"{d}T{rng.choice(times)}", "seed": rng.randint(1, 10**6)}
        (folder / "scenario.json").write_text(json.dumps(scenario, indent=1))
        r = subprocess.run([sys.executable, str(SIM), str(folder / "scenario.json"), "--out", str(folder), "--quiet"], capture_output=True, text=True)
        if r.returncode:
            failed.append((lid, r.stderr.strip().splitlines()[-1:] if r.stderr else ""))
            continue
        made += 1
print(f"made {made} lives from {len(PERSONAS)} personas; failed {len(failed)}")
for f in failed[:10]:
    print("  failed", f)
