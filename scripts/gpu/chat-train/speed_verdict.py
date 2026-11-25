"""Reads the trainer's speed tests (train_big.py --smoke-only) and says which way to train: the plain path, or the fast
kernels (fla-core) when they give the same numbers faster. Also says what the measured speed buys in the minutes there are.

  python3 speed_verdict.py --plain plain.log [--fast fast.log] --minutes 80 --examples 427

Prints one line to act on ("USE fast" or "USE plain") and the figures behind it. Exit code 0 = train, 3 = neither path works.
On 2026-11-25 a night was planned on a guessed 5 seconds an example; the real figure was 27. This is measured first now.
"""
import argparse, json, re, statistics

ap = argparse.ArgumentParser()
ap.add_argument("--plain", required=True)
ap.add_argument("--fast", default=None)
ap.add_argument("--minutes", type=float, default=60, help="minutes there are for training")
ap.add_argument("--examples", type=int, default=0, help="examples in the training set")
ap.add_argument("--speedup", type=float, default=1.3, help="the fast path must be at least this many times faster to be worth using")
a = ap.parse_args()
LINE = re.compile(r"^SMOKE (\d+) tokens: loss ([\d.]+), ([\d.]+)s( \(warm-up\))?, peak memory ([\d.]+ GB|cpu)")
OOM = re.compile(r"^SMOKE (\d+) tokens: out of memory")


def read(path):
    rows, oom, ok = [], [], False
    try:
        for line in open(path, errors="replace"):
            k = LINE.match(line)
            if k:
                rows.append({"tokens": int(k.group(1)), "loss": float(k.group(2)), "seconds": float(k.group(3)), "warm": bool(k.group(4)),
                             "gb": float(k.group(5).split()[0]) if k.group(5) != "cpu" else 0.0})
            k = OOM.match(line)
            if k:
                oom.append(int(k.group(1)))
            ok = ok or line.startswith("SMOKE OK")
    except OSError:
        pass
    timed = [r for r in rows if not r["warm"]] or rows
    if not ok or not timed:
        return None
    typical = statistics.median(r["tokens"] for r in timed)
    near = [r for r in timed if abs(r["tokens"] - typical) <= 0.15 * typical] or timed
    return {"rows": rows, "seconds": statistics.median(r["seconds"] for r in near), "typical_tokens": int(typical),
            "longest_fits": max(r["tokens"] for r in rows), "too_long": min(oom) if oom else None, "peak_gb": max(r["gb"] for r in rows)}


plain, fast = read(a.plain), read(a.fast) if a.fast else None
use, why = None, ""
if fast and plain:
    by = {r["tokens"]: r["loss"] for r in plain["rows"]}
    diffs = [abs(r["loss"] - by[r["tokens"]]) for r in fast["rows"] if r["tokens"] in by]
    same = bool(diffs) and max(diffs) <= 0.05     # dropout on the trained part makes two runs differ a little; a wrong kernel differs a lot
    faster = plain["seconds"] / max(fast["seconds"], 1e-6)
    if same and faster >= a.speedup:
        use, why = "fast", f"same losses (largest difference {max(diffs):.3f}) and {faster:.1f} times faster"
    else:
        use, why = "plain", ("the fast kernels give different losses (largest difference %.3f), so they are not trusted" % max(diffs) if diffs and not same
                             else f"the fast kernels are only {faster:.1f} times faster" if diffs else "the two tests share no example to compare")
elif fast and not plain:
    use, why = "fast", "the plain path did not run and there is nothing to compare with: UNCHECKED"
elif plain:
    use, why = "plain", "the fast kernels did not run" if a.fast else "only the plain path was tested"
if not use:
    print("USE none: neither path ran a single example")
    raise SystemExit(3)
m = fast if use == "fast" else plain
fit = int(a.minutes * 60 / m["seconds"])
out = {"use": use, "why": why, "seconds_per_example": m["seconds"], "typical_tokens": m["typical_tokens"], "peak_gb": m["peak_gb"], "too_long_from": m["too_long"],
       "examples_in_time": fit, "passes": round(fit / a.examples, 2) if a.examples else None,
       "plain_seconds": plain and plain["seconds"], "fast_seconds": fast and fast["seconds"]}
print(f"USE {use}: {why}")
print(f"SPEED {m['seconds']:.1f} seconds an example of about {m['typical_tokens']} tokens, peak memory {m['peak_gb']:.0f} GB"
      + (f", examples of {m['too_long']} tokens or more do not fit" if m["too_long"] else "")
      + f". In {a.minutes:.0f} minutes that is about {fit} examples" + (f", {fit / a.examples:.1f} passes over the {a.examples}" if a.examples else "") + ".")
print("JSON " + json.dumps(out))
