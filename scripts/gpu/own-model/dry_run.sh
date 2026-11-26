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

# ---- filter, quality-check export, training set
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump "$W/dump.jsonl" --out "$W/train-new.jsonl" --report "$W/filter-report.json" --alive \
  --details "$W/details.jsonl" > "$W/filter.log" 2>&1 && ok "filter: $(wc -l < "$W/train-new.jsonl") examples kept of $(wc -l < "$W/details.jsonl") turns" || bad "filter (see $W/filter.log)"
grep -q "past time\|past save\|invented amount\|comes back with nothing saved" "$W/details.jsonl" && ok "the filter dropped clock and made-up-figure answers" || bad "the filter caught none of the stand-in model's planted mistakes"
python3 scripts/gpu/chat-data/qc_export.py --meta "$W/meta-*.jsonl" --dump "$W/dump.jsonl" --details "$W/details.jsonl" --out "$W/qc.jsonl" > "$W/qc.log" 2>&1 && ok "quality-check export: $(tail -1 "$W/qc.log")" || bad "quality-check export (see $W/qc.log)"
head -2 "$W/qc.jsonl" | python3 -c "import json,sys; print(' '.join(json.loads(l)['conv'] for l in sys.stdin))" > "$W/drop.txt" 2> /dev/null
python3 scripts/gpu/chat-data/make_trainset.py --kept "$W/train-new.jsonl" --drop "$W/drop.txt" --out "$W/train.jsonl" > "$W/trainset.log" 2>&1 && ok "training set: $(cat "$W/trainset.log" | cut -c1-110)" || bad "training-set builder (see $W/trainset.log)"

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
