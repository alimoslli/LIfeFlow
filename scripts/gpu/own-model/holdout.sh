#!/bin/sh
# How does a served model behave on questions and lives it has never seen, and how fast is it? Run on a box that
# bakeoff.sh (or run_box.sh) already set up, with the model being served on :8000.
#   sh holdout.sh <served name> <label> <questions> [shim args...]
# Asks <questions> student messages (all 37 skills) of made-up lives through the real skyling loop, 12 at a time, then
# runs the automatic quality filter (numbers must come from tools, right weekdays, no changes nobody asked for, the
# skyling's style). Writes /workspace/ownmodel/holdout-<label>.txt: pass rate, why answers failed, speed.
NAME="$1"; LABEL="$2"; N="${3:-162}"; shift 3
T=/workspace/ownmodel; L=/root/job; REPO=$L/LIfeFlow; H=$L/holdout-$LABEL
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
cd $REPO; mkdir -p $H
[ -d $L/lives ] || python3 scripts/gpu/chat-data/make_lives.py --out $L/lives --per-persona 6 > $T/lives.log 2>&1
[ -f $L/questions.json ] || python3 scripts/gpu/chat-data/build_questions.py --teacher /workspace/router/out/train.json --out $L/questions.json > $T/questions.log 2>&1
su postgres -c "dropdb --if-exists budgetflow_gen_test"; su postgres -c "createdb -O budgetflow budgetflow_gen_test"
su postgres -c "psql -c \"alter role budgetflow superuser\""
TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test npm run db:migrate:test > $H/migrate.log 2>&1
su postgres -c "psql -c \"alter role budgetflow nosuperuser nobypassrls\""
pkill -f "[r]esponses_shim.py"; sleep 1
python3 scripts/gpu/chat-eval/responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 --log $H/shim.jsonl --dump $H/dump.jsonl "$@" > $H/shim.out 2>&1 &
SHIM=$!
sleep 2
START=$(date +%s)
PER=$(( (N + 161) / 162 ))
PIDS=""
for i in $(seq 0 11); do
  TEST_DATABASE_URL=postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_gen_test \
    node --conditions=react-server --import tsx scripts/gpu/chat-data/generate.ts --lives $L/lives --questions $L/questions.json \
    --per-life $PER --offset 2600 --worker $i --workers 12 --model "$NAME" --out $H/meta-$i.jsonl > $H/gen-$i.log 2>&1 &
  PIDS="$PIDS $!"
done
wait $PIDS
SECS=$(( $(date +%s) - START ))
kill $SHIM
python3 scripts/gpu/chat-data/filter.py --meta "$H/meta-*.jsonl" --dump $H/dump.jsonl --out $H/kept.jsonl --report $H/report.json --no-cap --details $H/details.jsonl > $H/filter.log 2>&1
# every turn with its skill, answer and why it failed, kept on storage; and the scorecard by skill
cp $H/details.jsonl $T/holdout-$LABEL-details.jsonl
python3 - "$H/details.jsonl" > $T/holdout-$LABEL-skills.txt <<'PY'
import json, sys, collections
rows = [json.loads(l) for l in open(sys.argv[1])]
by = collections.defaultdict(list)
for r in rows:
    by[r["skill"] or "(no skill)"].append(r)
print(f"skills {len(by)} | turns {len(rows)} | passing {sum(r['ok'] for r in rows)}")
for skill, rs in sorted(by.items(), key=lambda kv: (sum(r["ok"] for r in kv[1]) / len(kv[1]), kv[0])):
    why = collections.Counter(x.split(":")[0] for r in rs for x in set(y.split(":")[0] for y in r["reasons"]))
    print(f"{skill:24s} {sum(r['ok'] for r in rs):2d} of {len(rs):2d}  {dict(why) if why else ''}")
PY
python3 - "$H" "$SECS" "$LABEL" > $T/holdout-$LABEL.txt <<'PY'
import json, glob, sys, statistics as st
h, secs, label = sys.argv[1], int(sys.argv[2]), sys.argv[3]
rep = json.load(open(h + "/report.json"))
meta = [json.loads(l) for f in glob.glob(h + "/meta-*.jsonl") for l in open(f)]
turns = [t for m in meta for t in m.get("turns", [])]
ms = [t["ms"] for t in turns if "ms" in t]
dump = [json.loads(l) for l in open(h + "/dump.jsonl")]
tin = sum((d.get("usage") or {}).get("prompt_tokens", 0) for d in dump); tout = sum((d.get("usage") or {}).get("completion_tokens", 0) for d in dump)
answers = sum(1 for k in rep.get("by_kind", []) if k[0].startswith("answer") for _ in range(k[1]))
print(f"HOLDOUT {label}: turns {rep['turns']} | answers passing every automatic check {answers} ({100*answers/max(1,rep['turns']):.0f}%) | wall {secs}s with 12 at a time = {3600*len(turns)/max(1,secs):.0f} messages an hour")
print(f"  seconds per message median {st.median(ms)/1000:.1f} p90 {sorted(ms)[int(0.9*len(ms))]/1000:.1f} | tokens in {tin} out {tout} over {len(dump)} model calls")
print("  dropped:", rep["dropped_reasons"])
PY
cat $T/holdout-$LABEL.txt >> $T/board.txt
