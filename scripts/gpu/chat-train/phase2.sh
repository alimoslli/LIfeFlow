#!/bin/sh
# After the examples (run_box.sh wrote /workspace/chatdata/done): filter again with the current rules, fine-tune
# Qwen3-8B on them, then score the untuned and the tuned model on the 20 test questions. Unattended, on the same box.
#   nohup sh phase2.sh <train minutes> > /workspace/chattrain/phase2.log 2>&1 &
set -x
TRAIN_MIN="${1:-60}"
W=/workspace/chatdata; T=/workspace/chattrain; L=/root/job; REPO=$L/LIfeFlow
mkdir -p $T
export PATH=$L/node-v22.23.5-linux-x64/bin:$PATH
step() { echo "STEP $1 $(date -u +%H:%M:%S)" | tee -a $T/steps.log; }

step wait
# the student's weights and the training library, while the teacher is still busy
(python3 -m venv $L/hfenv 2>/dev/null; $L/hfenv/bin/pip install -q huggingface_hub >/dev/null 2>&1; $L/hfenv/bin/hf download Qwen/Qwen3-8B --local-dir $L/qwen3-8b > $T/download.log 2>&1 && echo ok > $L/qwen.ready) &
$L/venv/bin/pip install -q peft > $T/pip-peft.log 2>&1
while [ ! -f $W/done ]; do sleep 10; done

step refilter
cd $REPO && git fetch -q --depth 3 origin claude/skill-router-pilot && git reset -q --hard FETCH_HEAD; git log --oneline -1
python3 scripts/gpu/chat-data/filter.py --meta "$W/meta-*.jsonl" --dump $W/dump.jsonl --out $T/train.jsonl --report $T/filter-report.json > $T/filter.log 2>&1
cat $T/filter.log

step free-gpu
pkill -f "served-model-name gpt-oss-120b"; sleep 5; pkill -f "VLLM::EngineCore"
sleep 20
while [ ! -f $L/qwen.ready ]; do sleep 5; done

step train
$L/venv/bin/python scripts/gpu/chat-train/train_chat.py --data $T/train.jsonl --model $L/qwen3-8b --out $T/adapter --epochs 1 --max-minutes "$TRAIN_MIN" > $T/train.log 2>&1
tail -3 $T/train.log

step serve
nohup $L/venv/bin/vllm serve $L/qwen3-8b --served-model-name qwen3-8b --port 8000 --max-model-len 32768 --gpu-memory-utilization 0.9 \
  --enable-auto-tool-choice --tool-call-parser hermes --enable-lora --lora-modules skyling=$T/adapter --max-lora-rank 16 > $T/vllm.log 2>&1 &

step eval-base
sh scripts/gpu/chat-eval/run.sh qwen3-8b $T/eval-qwen3-8b-base --no-think > $T/eval-base.log 2>&1
python3 scripts/gpu/chat-eval/summarize.py $T/eval-qwen3-8b-base/raw-local.json > $T/summary-base.txt 2>&1
step eval-tuned
sh scripts/gpu/chat-eval/run.sh skyling $T/eval-skyling --no-think > $T/eval-tuned.log 2>&1
python3 scripts/gpu/chat-eval/summarize.py $T/eval-skyling/raw-local.json > $T/summary-tuned.txt 2>&1
step done
# shut the model server down, so the box goes idle and stops itself (it kept an H100 billing for hours otherwise)
pkill -f "[v]llm serve"; sleep 5; pkill -f "VLLM::EngineCore"
echo DONE > $T/done
