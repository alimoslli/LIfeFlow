#!/bin/sh
# The whole training-night pipeline with a stand-in model and no GPU: made-up lives, the message bank, the app's real loop
# through the translator with the guard on, the recording, the filter, the quality-check export, the training-set builder and
# (when a training Python is given) the trainer on a tiny copy of the big model. Run it before every paid night, here or on
# the box before the model loads: it takes a few minutes and costs nothing. It proves the code paths, not the model.
#
#   sh scripts/gpu/own-model/dry_run.sh [work folder, default a new temp folder] [python with torch+transformers+peft, optional]
#
# Needs: this repository with `npm ci` done, Postgres installed (it starts it and makes its own test database), python3.
# On 2026-11-25 a night was lost to things a dry run shows: a stage that could not start on a fresh box, an untested path.
set -u
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
W="${1:-$(mktemp -d)}"; TRAIN_PY="${2:-}"
mkdir -p "$W"; cd "$REPO" || exit 1
DB=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_dry_test
FAILS=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
stop_all() { pkill -f "[f]ake_model.py" 2> /dev/null; pkill -f "[r]esponses_shim.py --upstream http://127.0.0.1:8090" 2> /dev/null; }
trap stop_all EXIT

# ---- database
pg_isready -q 2> /dev/null || service postgresql start > /dev/null 2>&1
sleep 2
pg_isready -q || { bad "Postgres does not start"; echo "$FAILS problems"; exit 1; }
su postgres -c "psql -qc \"create role budgetflow login superuser password 'budgetflow_dev'\"" > /dev/null 2>&1
su postgres -c "psql -qc \"alter role budgetflow superuser\"" > /dev/null 2>&1
su postgres -c "dropdb --if-exists budgetflow_dry_test" > /dev/null 2>&1
su postgres -c "createdb -O budgetflow budgetflow_dry_test" || bad "could not make the test database"
TEST_DATABASE_URL=$DB npm run db:migrate:test > "$W/migrate.log" 2>&1 && ok "database migrated" || bad "migrations (see $W/migrate.log)"
su postgres -c "psql -qc \"alter role budgetflow nosuperuser nobypassrls\"" > /dev/null 2>&1   # a superuser skips row-level security

# ---- the checks that need no model
python3 scripts/gpu/chat-eval/reality_checks.py > "$W/reality.log" 2>&1 && ok "clock and facts checks: $(tail -1 "$W/reality.log")" || bad "reality_checks.py self-check (see $W/reality.log)"
python3 scripts/gpu/chat-eval/owner_score.py > "$W/owner.log" 2>&1 && ok "owner score self-check: $(tail -2 "$W/owner.log" | head -1)" || bad "owner_score.py self-check (see $W/owner.log)"

# ---- lives and messages
python3 scripts/gpu/chat-data/make_lives.py --out "$W/lives" --per-persona 1 > "$W/lives.log" 2>&1
LIVES=$(ls "$W/lives" 2> /dev/null | wc -l)
[ "$LIVES" -ge 20 ] && ok "$LIVES made-up lives" || bad "lives (see $W/lives.log)"
python3 scripts/gpu/chat-data/build_alive_questions.py --out "$W/bank.json" --total 600 > "$W/bank.log" 2>&1 && ok "message bank: $(head -1 "$W/bank.log")" || bad "message bank (see $W/bank.log)"

# ---- the app's real loop against the stand-in model, guard on, recorded
python3 scripts/gpu/chat-eval/fake_model.py --port 8090 > "$W/fake.log" 2>&1 &
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8090/v1 --port 8190 --think off --guard \
  --system-append scripts/gpu/own-model/skyling-rules.txt --system-append scripts/gpu/own-model/skyling-alive.txt \
  --remind scripts/gpu/own-model/skyling-reminders-alive2.txt --situations scripts/gpu/own-model/skyling-situations.txt \
  --log "$W/shim.jsonl" --dump "$W/dump.jsonl" > "$W/shim.out" 2>&1 &
sleep 2
for i in 0 1 2; do
  TEST_DATABASE_URL=$DB node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives "$W/lives" --questions "$W/bank.json" \
    --per-life 3 --worker $i --workers 3 --model fake --base-url http://127.0.0.1:8190/v1 --modes --out "$W/meta-$i.jsonl" > "$W/gen-$i.log" 2>&1 &
done
wait $(pgrep -f "[g]enerate.ts --lives $W/lives" | tr '\n' ' ') 2> /dev/null
while pgrep -f "[g]enerate.ts --lives $W/lives" > /dev/null; do sleep 2; done
TURNS=$(cat "$W"/meta-*.jsonl 2> /dev/null | wc -l)
ERRS=$(cat "$W"/meta-*.jsonl 2> /dev/null | grep -c '"outcome":"error"\|"error":"load')
[ "$TURNS" -ge $((LIVES * 3 - 3)) ] && ok "$TURNS chats ran through the app's real loop ($ERRS with an error)" || bad "only $TURNS chats ran (see $W/gen-0.log)"
[ "$ERRS" -le $((TURNS / 10)) ] || bad "$ERRS of $TURNS chats ended in an error (see $W/meta-0.jsonl)"
python3 - "$W" <<'PY' && ok "every message fitted its life and its hour" || bad "a message was asked of a life or at an hour it does not fit"
import glob, json, sys
bad = 0
for f in glob.glob(sys.argv[1] + "/meta-*.jsonl"):
    for line in open(f):
        r = json.loads(line)
        q = r.get("question")
        if not q:
            continue
        hour, traits = int(r["nowLocal"][11:13]), set(r.get("traits") or [])
        fits_hour = q.get("hours") is None or q["hours"][0] <= hour < q["hours"][1] or q["hours"][0] <= hour + 24 < q["hours"][1]
        if not fits_hour or not set(q.get("needs") or []) <= traits:
            bad += 1
            print("  misfit:", r["life"], r["nowLocal"], sorted(traits), q["text"][:60], q.get("needs"), q.get("hours"))
sys.exit(1 if bad else 0)
PY
grep -q "house_check" "$W/shim.jsonl" 2> /dev/null || grep -q '"guard"' "$W/shim.jsonl" 2> /dev/null && ok "the guard sent answers back" || bad "the guard never fired (the stand-in model is wrong on purpose, so it must)"
grep -rq "p[0-9][0-9][0-9][0-9]\b" "$W"/meta-*.jsonl 2> /dev/null; python3 - "$W" <<'PY' && ok "no made-up person is called by an id" || bad "a made-up person still has an id for a name"
import json, re, sys
ids = 0
for line in open(sys.argv[1] + "/dump.jsonl"):
    r = json.loads(line)
    sysm = " ".join(m["content"] for m in r["messages"] if m["role"] in ("system", "developer") and isinstance(m["content"], str))
    k = re.search(r"User: ([^.\n]+)\. Now:", sysm)
    if not k or re.fullmatch(r"p\d{4}.*", k.group(1).strip()):
        ids += 1
sys.exit(1 if ids else 0)
PY

ON=$(grep -c "Acting on your own: on" "$W/dump.jsonl"); OFF=$(grep -c "Acting on your own: off" "$W/dump.jsonl")
[ "$ON" -gt 0 ] && [ "$OFF" -gt 0 ] && ok "both modes are in the recorded prompts ($ON on, $OFF off)" || bad "the mode line is missing from the recording ($ON on, $OFF off)"

grep -q "Acting on your own is off" "$W/shim.jsonl" && ok "with acting on its own off, an unasked block was sent back" || bad "an unasked block was never sent back for an offer-first person"

# longer chats (2026-11-27): a share of chats runs 3 to 5 turns, each follow-up picked from what the skyling really did
python3 - "$W" <<'PY' && ok "longer chats: $(cat "$W/long.txt")" || bad "no chat of 3 or more turns was recorded whole ($(cat "$W/long.txt" 2> /dev/null))"
import collections, glob, json, sys
n, by_len, picked = 0, collections.Counter(), collections.Counter()
for f in glob.glob(sys.argv[1] + "/meta-*.jsonl"):
    for line in open(f):
        r = json.loads(line)
        if "turns" not in r:
            continue
        n += 1
        by_len[len(r["turns"])] += 1
        picked.update(t.get("nextFrom") for t in r["turns"] if t.get("nextFrom"))
three = sum(v for k, v in by_len.items() if k >= 3)
open(sys.argv[1] + "/long.txt", "w").write(f"{three} of {n} chats have 3+ turns, by length {dict(sorted(by_len.items()))}, next lines from {dict(picked)}")
sys.exit(0 if three else 1)
PY

# ---- filter, quality-check export, training set
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump "$W/dump.jsonl" --out "$W/train-new.jsonl" --report "$W/filter-report.json" --alive \
  --details "$W/details.jsonl" > "$W/filter.log" 2>&1 && ok "filter: $(wc -l < "$W/train-new.jsonl") examples kept of $(wc -l < "$W/details.jsonl") turns" || bad "filter (see $W/filter.log)"
# The stand-in model's planted mistakes must not reach the examples: the guard sends most back, the filter drops what slips
# past. Which of the two catches them changes from run to run, and most are mistakes only at some hours ("this evening" at
# 11:30 PM, not at noon), so the check runs the same clock and figure checks over every kept example: none may fail.
python3 - "$W" <<'PY' && ok "no kept example fails the clock and figure checks: $(cat "$W/planted.txt")" || bad "a kept example fails the checks: $(cat "$W/planted.txt" 2> /dev/null)"
import json, sys
sys.path.insert(0, "scripts/gpu/chat-eval")
from reality_checks import reality_notes
W = sys.argv[1]
CLOCK = {"past time", "past save", "invented amount", "comes back with nothing saved", "claims a change it did not make"}
bad, n = [], 0
for l in open(W + "/train-new.jsonl"):
    r = json.loads(l)
    n += 1
    msgs, last = r["messages"][:-1], r["messages"][-1]
    got = [c for c, _ in reality_notes(msgs, last) if c in CLOCK]
    if got:
        bad.append(f'{r["meta"]["conv"]} {got[0]}')
caught = sum(any(x.split(":")[0] in CLOCK for x in json.loads(l)["reasons"]) for l in open(W + "/details.jsonl"))
sent_back = sum(1 for l in open(W + "/shim.jsonl") if "house_check" in l or '"guard"' in l)
open(W + "/planted.txt", "w").write(f"{len(bad)} of {n} fail{(': ' + bad[0]) if bad else ''}; the guard sent {sent_back} answers back, the filter dropped {caught}")
sys.exit(1 if bad else 0)
PY
python3 scripts/gpu/chat-data/qc_export.py --meta "$W/meta-*.jsonl" --dump "$W/dump.jsonl" --details "$W/details.jsonl" --out "$W/qc.jsonl" > "$W/qc.log" 2>&1 && ok "quality-check export: $(tail -1 "$W/qc.log")" || bad "quality-check export (see $W/qc.log)"
head -2 "$W/qc.jsonl" | python3 -c "import json,sys; print(' '.join(json.loads(l)['conv'] for l in sys.stdin))" > "$W/drop.txt" 2> /dev/null
# and the first turn of one long chat whose later turns the filter kept: a reader's flag on it must take the later turns too
python3 - "$W" >> "$W/drop.txt" <<'PY'
import json, sys
kept = {json.loads(l)["meta"]["conv"] for l in open(sys.argv[1] + "/train-new.jsonl")}
for c in sorted(kept):
    life, k, t = c.split("~")
    if t == "0" and f"{life}~{k}~2" in kept:
        print(c)
        open(sys.argv[1] + "/drop-chat.txt", "w").write(f"{life}~{k}")
        break
PY
python3 scripts/gpu/chat-data/make_trainset.py --kept "$W/train-new.jsonl" --drop "$W/drop.txt" --out "$W/train.jsonl" > "$W/trainset.log" 2>&1 && ok "training set: $(cat "$W/trainset.log" | cut -c1-110)" || bad "training-set builder (see $W/trainset.log)"
python3 - "$W" <<'PY' && ok "long chats in the training set: $(cat "$W/turns.txt")" || bad "long chats in the training set: $(cat "$W/turns.txt" 2> /dev/null)"
import collections, json, os, sys
W = sys.argv[1]
rows = [json.loads(l) for l in open(W + "/train.jsonl")]
by_turn = collections.Counter(r["meta"].get("turn", 0) for r in rows if r["meta"]["kind"] != "tool_call")
chat = open(W + "/drop-chat.txt").read().strip() if os.path.exists(W + "/drop-chat.txt") else None
left = [r["meta"]["conv"] for r in rows if chat and r["meta"]["conv"].startswith(chat + "~")]
# every example's history must end with the person's own message for that turn, after the earlier answers
order_ok = all(sum(1 for m in r["messages"] if m["role"] == "user") == r["meta"].get("turn", 0) + 1 for r in rows)
open(W + "/turns.txt", "w").write(f"answers by turn {dict(sorted(by_turn.items()))}; the flagged chat {chat} has {len(left)} examples left; history matches the turn: {order_ok}")
sys.exit(0 if any(t >= 2 for t in by_turn) and chat and not left and order_ok else 1)
PY

# ---- the trainer on a tiny copy of the big model (optional: needs torch, transformers, peft and the model's small files)
if [ -n "$TRAIN_PY" ] && [ -n "${TINY_MODEL:-}" ] && [ -s "$W/train.jsonl" ]; then
  "$TRAIN_PY" scripts/gpu/chat-train/train_big.py --tiny --model "$TINY_MODEL" --data "$W/train.jsonl" --smoke-data "$W/train.jsonl" --smoke 2 \
    --adapter "$W/adapter" --out "$W/merged" --max-minutes 0.5 --holdout 2 --accum 2 --save-minutes 0.2 --clip-tokens 400 > "$W/train.log" 2>&1
  grep -q "^MERGED" "$W/train.log" && ok "trainer, tiny copy: $(grep "^TRAIN DONE" "$W/train.log" | cut -c1-120)" || bad "trainer (see $W/train.log)"
else
  echo "skip  trainer (give a training python as the second argument and TINY_MODEL=<folder with the big model's config and tokenizer>)"
fi
stop_all
echo "$FAILS problems. Work folder: $W"
[ "$FAILS" -eq 0 ]
