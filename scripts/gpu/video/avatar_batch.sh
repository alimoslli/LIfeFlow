#!/bin/sh
# Several talking shots of one made-up character on ONE rented H100: set up once, then for each shot render it with
# LongCat-Video-Avatar 1.6 (MIT), cut it to its voice, sharpen it to 1080 x 1920 and upload it. Unattended, with a hard stop.
# Made-up people and voices only (ADR 0023). What the first run taught (2026-11-22) is built in: a C compiler before the python
# packages, an import check before any render, the model's "Broken pipe" at the end of a finished file is not a failure,
# and the voice starts 40 ms earlier (the model's lips ran 80 ms ahead of the voice; 40 is natural).
#
#   nohup sh avatar_batch.sh <hard stop minutes, default 40> <720p|480p, default 720p> > /workspace/avatar/run.log 2>&1 &
#
# Next to this script: upscale.py, and scenes.tsv with one shot per line, tab-separated:
#   name <tab> picture url <tab> voice url <tab> prompt
# Optional, per shot: up-<name>.txt holding a presigned upload URL; the finished 1080 clip is PUT there the moment it exists,
# so a shot that is done stays done whatever happens later.
#
# Resolution: a shot is tried at 720p when asked. If that does not fit the GPU's memory it is rendered at 480p instead and
# every later shot goes straight to 480p. A shot also drops to 480p when 720p for it would leave too little time to give the
# shots after it at least a 480p render. One render attempt per shot otherwise: a shot that fails is written down and skipped.
# Results: /workspace/avatar/<name>-1080.mp4, <name>-raw.mp4, status.txt (one block per shot), steps.log.
STOP_MIN="${1:-40}"; WANT="${2:-720p}"
HERE=$(cd "$(dirname "$0")" && pwd)
T=/workspace/avatar; L=/root/avjob
# DRY=1 (a test of this script's own logic on any machine, no GPU): no set-up, a stand-in for the render, everything under $DRY_DIR
[ -n "$DRY" ] && { T=${DRY_DIR:-/tmp/avatar-dry}/t; L=${DRY_DIR:-/tmp/avatar-dry}/l; }
R=$L/LongCat-Video; W=$R/weights
ext() { e=$(printf %s "$1" | sed 's/[?#].*//; s/.*\.//' | tr 'A-Z' 'a-z'); case "$e" in png|jpg|jpeg|webp|mp3|wav|m4a|aac|flac|ogg) echo "$e";; *) echo "$2";; esac; }
START=$(date +%s); END=$(( START + STOP_MIN * 60 ))
mkdir -p $T $L/in
: > $T/status.txt
step() { echo "STEP $1 $(date -u +%H:%M:%S) +$(( $(date +%s) - START ))s" | tee -a $T/steps.log; }
note() { echo "$1" | tee -a $T/status.txt; }
shutdown_all() {
  [ -n "$DRY" ] && return 0
  pkill -f "[r]un_demo_avatar"; pkill -f "[t]orchrun"; pkill -f "[h]f download"; pkill -f "[p]ip install"; pkill -f "[u]pscale.py"
  echo "STEP shutdown $(date -u +%H:%M:%S) +$(( $(date +%s) - START ))s" >> $T/steps.log
}
fail() { note "FAILED: $1"; step "failed: $1"; shutdown_all; kill $TIMER 2> /dev/null; exit 1; }
# hard stop: whatever is running, everything ends and the box can idle out
(until [ "$(date +%s)" -ge "$END" ]; do sleep 10; done; echo "FAILED: hard stop at $STOP_MIN minutes" >> $T/status.txt
 echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[a]vatar_batch.sh") &
TIMER=$!
[ -s "$HERE/scenes.tsv" ] || fail "no scenes.tsv next to the script"
[ -f "$HERE/upscale.py" ] || fail "no upscale.py next to the script"

step "start $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2> /dev/null | head -1), $(grep -c . "$HERE/scenes.tsv") shots, want $WANT"
if [ -z "$DRY" ]; then
# ---- 1. set up once: compiler and ffmpeg first, then weights and python packages side by side
( (command -v ffmpeg > /dev/null && command -v gcc > /dev/null) || (apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg libsndfile1 gcc g++ python3-dev) > $L/apt.log 2>&1) &
APT=$!
git clone -q --depth 1 https://github.com/meituan-longcat/LongCat-Video.git $R || fail "could not fetch the model's code"
cd $R && git log --oneline -1
(python3 -m venv $L/hf && $L/hf/bin/pip install -q "huggingface_hub[cli]" hf_transfer > $L/pip-hf.log 2>&1 \
  && HF_HUB_ENABLE_HF_TRANSFER=1 $L/hf/bin/hf download meituan-longcat/LongCat-Video --include "text_encoder/*" --include "vae/*" --include "tokenizer/*" --include "scheduler/*" --include "*.json" \
       --local-dir $W/LongCat-Video > $L/dl-base.log 2>&1 \
  && HF_HUB_ENABLE_HF_TRANSFER=1 $L/hf/bin/hf download meituan-longcat/LongCat-Video-Avatar-1.6 \
       --include "base_model/*" --include "loraA/*" --include "loraB/*" --include "scheduler/*" --include "vocal_separator/*" --include "*.json" \
       --include "whisper-large-v3/*.json" --include "whisper-large-v3/*.txt" --include "whisper-large-v3/model.safetensors" \
       --local-dir $W/LongCat-Video-Avatar-1.6 > $L/dl-avatar.log 2>&1 && echo ok > $L/weights.ready) &
DL=$!
# the shots' pictures and voices (small); a shot whose files do not arrive is skipped later
while IFS="$(printf '\t')" read -r NAME IMG AUD PROMPT <&3; do
  [ -n "$NAME" ] || continue
  curl -fsSL -m 120 -o $L/in/$NAME.$(ext "$IMG" png) "$IMG" && curl -fsSL -m 120 -o $L/in/$NAME.$(ext "$AUD" mp3) "$AUD" || note "NOTE $NAME: could not fetch its picture or voice"
done 3< "$HERE/scenes.tsv"
curl -fsSL -m 120 -o $L/x2.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth || note "NOTE: could not fetch the sharpener's weights"

wait $APT   # the compiler has to be there before the python packages are built
PY=$(python3 -c "import sys; print('cp%d%d' % sys.version_info[:2])")
python3 -m venv $L/venv || fail "venv"
P=$L/venv/bin/pip
$P install -q torch==2.6.0+cu124 torchvision==0.21.0+cu124 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 > $L/pip-torch.log 2>&1 || fail "torch (see pip-torch.log)"
$P install -q "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-$PY-$PY-linux_x86_64.whl" > $L/pip-fa.log 2>&1 || fail "flash-attn wheel for $PY"
grep -v -i "^torch==\|^flash-attn" requirements.txt > $L/req.txt
$P install -q -r $L/req.txt > $L/pip-req.log 2>&1 || fail "requirements (see pip-req.log)"
# the avatar list has a system library and a package that does not exist on the index; install it line by line, never all or nothing
grep -v -i "^libsndfile1\|^tritonserverclient" requirements_avatar.txt > $L/req-avatar.txt
while read -r line; do [ -n "$line" ] && $P install -q "$line" >> $L/pip-avatar.log 2>&1; done < $L/req-avatar.txt
$P install -q --no-deps spandrel > $L/pip-up.log 2>&1
$L/venv/bin/python -c "
import torch, flash_attn, spandrel
assert torch.__version__.startswith('2.6.0'), torch.__version__
from longcat_video.audio_process.vocal_separator import separate_vocals
from audio_separator.separator import Separator
print('torch', torch.__version__, 'cuda', torch.cuda.is_available())" > $L/imports.log 2>&1 || { tail -5 $L/imports.log; fail "a package the render needs does not load (see /root/avjob/imports.log)"; }
step "packages ready"
while [ ! -f $L/weights.ready ]; do kill -0 $DL 2> /dev/null || [ -f $L/weights.ready ] || fail "the weights download stopped (see dl-*.log)"; sleep 3; done
step "weights ready $(du -sh $W | cut -f1)"
# the GPU's memory in use, sampled every 5 seconds, so each shot can report its peak
(while sleep 5; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> $L/mem.log 2> /dev/null; done) &
MEM=$!
fi

# ---- 2. the shots, one after another
segs() { python3 -c "import math; f=math.ceil(float('$1')*25); print(max(1, 1 + math.ceil(max(0, f-93)/80)))"; }
LOAD=100; S480=60; S720=210; TAIL=40      # seconds: model load, one segment at each size (720p is a guess until measured), cut+sharpen+upload
RES_NOW="$WANT"
render() {   # render <name> <resolution> <segments> -> 0 when a readable video exists; sets OUT, SECS
  rm -rf $L/out-$1; : > $L/mem.log
  R0=$(date +%s)
  if [ -n "$DRY" ]; then   # stand-in: a grey clip with the voice, or the failure asked for with DRY_FAIL="<name>:<resolution>:<oom|crash>"
    case " $DRY_FAIL " in *" $1:$2:oom "*) echo "torch.OutOfMemoryError: CUDA out of memory" > $T/render-$1-$2.log; SECS=3; OUT=""; return 1;; *" $1:$2:crash "*) echo "Traceback boom" > $T/render-$1-$2.log; SECS=3; OUT=""; return 1;; esac
    mkdir -p $L/out-$1; [ "$2" = 720p ] && SZ=768x1280 || SZ=480x832
    ffmpeg -nostdin -y -v error -f lavfi -i "color=c=gray:s=$SZ:r=25:d=$(awk "BEGIN{print (93 + ($3 - 1) * 80) / 25}")" -i "$IMGAUD" -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac $L/out-$1/video_continue_$3.mp4 > $T/render-$1-$2.log 2>&1
    sleep ${DRY_SLEEP:-1}; SECS=$(( $(date +%s) - R0 + ${DRY_SECS:-0} )); OUT=$(ls -t $L/out-$1/*.mp4 2> /dev/null | head -1); [ -n "$OUT" ]; return $?
  fi
  $L/venv/bin/torchrun --nproc_per_node=1 run_demo_avatar_single_audio_to_video.py --context_parallel_size=1 \
    --checkpoint_dir=$W/LongCat-Video-Avatar-1.6 --stage_1=ai2v --input_json=$L/in/$1.json --output_dir=$L/out-$1 \
    --resolution=$2 --num_segments=$3 --ref_img_index=10 --mask_frame_range=0 \
    --use_distill --lora_path loraB/lora.safetensors --model_type avatar-v1.6 --mix_steps=4 --mix_alpha=1.0 > $T/render-$1-$2.log 2>&1 < /dev/null
  RC=$?; SECS=$(( $(date +%s) - R0 ))
  OUT=$(ls -t $L/out-$1/*.mp4 2> /dev/null | head -1)
  [ $RC -eq 0 ] && [ -n "$OUT" ] && return 0
  # the model's own save step stops at the end of the voice and then trips over the frames left: the file is complete by then
  [ -n "$OUT" ] && grep -q "BrokenPipeError" $T/render-$1-$2.log && ffmpeg -nostdin -v error -i "$OUT" -f null - 2> /dev/null && return 0
  return 1
}
TOTAL=$(grep -c . "$HERE/scenes.tsv"); I=0
while IFS="$(printf '\t')" read -r NAME IMG AUD PROMPT <&3; do
  [ -n "$NAME" ] || continue
  I=$((I + 1))
  PIC=$L/in/$NAME.$(ext "$IMG" png); VOICE=$L/in/$NAME.$(ext "$AUD" mp3); IMGAUD=$VOICE
  [ -s $PIC ] && [ -s $VOICE ] || { note "SHOT $NAME: skipped, its files did not arrive"; continue; }
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $VOICE)
  N=$(segs "$DUR")
  python3 - "$PROMPT" "$PIC" "$VOICE" > $L/in/$NAME.json <<'PY'
import json, sys
print(json.dumps({"prompt": sys.argv[1], "cond_image": sys.argv[2], "cond_audio": {"person1": sys.argv[3]}}))
PY
  # time left for the shots after this one, at 480p, so every shot gets at least that
  REST=$(awk -F'\t' -v i=$I -v load=$LOAD -v s=$S480 -v tail=$TAIL 'NR>i && $1!="" {n++} END {print n*(load+2*s+tail)}' "$HERE/scenes.tsv")
  NOW=$(date +%s); RES=$RES_NOW
  if [ "$RES" = 720p ] && [ $(( NOW + LOAD + N * S720 + TAIL + REST + 60 )) -gt $END ]; then RES=480p; note "NOTE $NAME: 480p, not enough time left for 720p and the shots after it"; fi
  if [ $(( NOW + LOAD + N * S480 + TAIL )) -gt $END ]; then note "SHOT $NAME: skipped, not enough time left before the hard stop"; continue; fi
  step "shot $I/$TOTAL $NAME: voice ${DUR}s, $N segments, $RES"
  if ! render $NAME $RES $N; then
    if [ "$RES" = 720p ] && grep -qi "out of memory\|OutOfMemoryError" $T/render-$NAME-720p.log; then
      note "NOTE $NAME: 720p does not fit this GPU's memory; this shot and the rest go to 480p"
      RES=480p; RES_NOW=480p
      render $NAME 480p $N || { note "SHOT $NAME: FAILED at 480p after 720p ran out of memory (see render-$NAME-480p.log)"; step "shot $NAME failed"; continue; }
    else
      grep -B2 -A6 "Traceback" $T/render-$NAME-$RES.log | tail -12
      note "SHOT $NAME: FAILED (see render-$NAME-$RES.log)"; step "shot $NAME failed"; continue
    fi
  fi
  # measured: what one segment really costs at this size, for the shots still to come
  PER=$(( (SECS - LOAD > N * 20 ? SECS - LOAD : N * 20) / N ))
  [ "$RES" = 720p ] && S720=$PER || S480=$PER
  cp "$OUT" $T/$NAME-raw.mp4
  # cut to the voice, and start the voice 40 ms early so the lips lead it by the natural amount
  ffmpeg -nostdin -y -v error -i "$OUT" -t "$DUR" -c:v libx264 -crf 12 -pix_fmt yuv420p -af "atrim=start=0.04,asetpts=PTS-STARTPTS" -c:a aac -b:a 192k -movflags +faststart $L/$NAME-cut.mp4 \
    || cp "$OUT" $L/$NAME-cut.mp4
  PEAK=$(sort -n $L/mem.log 2> /dev/null | tail -1)
  if [ -s $L/x2.pth ] && $L/venv/bin/python "$HERE/upscale.py" --in $L/$NAME-cut.mp4 --out $T/$NAME-1080.mp4 --weights $L/x2.pth > $T/upscale-$NAME.log 2>&1 < /dev/null; then :; else
    note "NOTE $NAME: sharpening failed, plain resize used"
    ffmpeg -nostdin -y -v error -i $L/$NAME-cut.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920" -c:v libx264 -crf 14 -pix_fmt yuv420p -c:a copy $T/$NAME-1080.mp4
  fi
  UPL="not uploaded (no up-$NAME.txt)"
  [ -s "$HERE/up-$NAME.txt" ] && UPL="upload http $(curl -sS -m 120 -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: video/mp4' -H 'If-None-Match: *' --data-binary @$T/$NAME-1080.mp4 "$(cat "$HERE/up-$NAME.txt")")"
  note "SHOT $NAME: OK $RES, $N segments, render ${SECS}s for ${DUR}s of voice (about ${PER}s a segment after loading), raw $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames -of csv=p=0 $T/$NAME-raw.mp4), final $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 $T/$NAME-1080.mp4), peak gpu memory ${PEAK:-?} MiB, $UPL"
  step "shot $NAME done"
done 3< "$HERE/scenes.tsv"
note "ALL DONE in $(( $(date +%s) - START ))s"
step "done"
kill $MEM 2> /dev/null
shutdown_all
kill $TIMER 2> /dev/null
