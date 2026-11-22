#!/bin/sh
# One lip-synced talking clip from one picture and one voice file, with an OPEN model on a rented GPU, to compare with a
# hosted one. Unattended: it sets up, renders, saves to GPU storage and shuts everything down so the box idles out.
# Made-up people only (ADR 0023): the picture is a generated character, the voice is a generated voice.
#
# Model: LongCat-Video-Avatar 1.6 (Meituan, released 2026-11-15, MIT licence for code and weights, commercial use allowed),
# audio-image-to-video, Whisper-large-v3 for the lips, 8 steps with its own distillation LoRA, 25 frames a second.
# Needs about 50 GB of GPU memory at full precision: one H100 (80 GB). Downloads about 63 GB.
#
#   nohup sh avatar_box.sh <picture url> <audio url> "<prompt>" <hard stop minutes, default 26> <480p|720p, default 480p> \
#       [url of another clip to sharpen on the same box] > /workspace/avatar/run.log 2>&1 &
# Results: /workspace/avatar/out.mp4 (trimmed to the audio), out-1080.mp4 (sharpened to 1080 x 1920 with upscale.py, which must
# sit next to this script), extra-1080.mp4 (the other clip, sharpened), status.txt (timings), steps.log.
IMG_URL="$1"; AUD_URL="$2"; PROMPT="$3"; STOP_MIN="${4:-26}"; RES="${5:-480p}"; EXTRA_URL="$6"
HERE=$(cd "$(dirname "$0")" && pwd)
T=/workspace/avatar; L=/root/avjob; R=$L/LongCat-Video; W=$R/weights
START=$(date +%s); END=$(( START + STOP_MIN * 60 ))
mkdir -p $T $L
: > $T/status.txt
step() { echo "STEP $1 $(date -u +%H:%M:%S) +$(( $(date +%s) - START ))s" | tee -a $T/steps.log; }
shutdown_all() {
  pkill -f "[r]un_demo_avatar"; pkill -f "[t]orchrun"; pkill -f "[h]f download"; pkill -f "[p]ip install"; pkill -f "[u]pscale.py"
  echo "STEP shutdown $(date -u +%H:%M:%S) +$(( $(date +%s) - START ))s" >> $T/steps.log
}
fail() { echo "FAILED: $1" | tee -a $T/status.txt; step "failed: $1"; shutdown_all; kill $TIMER 2>/dev/null; exit 1; }
# hard stop: whatever is running, everything ends and the box can idle out
(until [ "$(date +%s)" -ge "$END" ]; do sleep 10; done; echo "FAILED: hard stop at $STOP_MIN minutes" >> $T/status.txt
 echo "STEP hard-stop $(date -u +%H:%M:%S)" >> $T/steps.log; shutdown_all; pkill -f "[a]vatar_box.sh") &
TIMER=$!

step "start $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | head -1)"
python3 --version
# 1. code, tools and inputs (small), while the weights and the python packages come down side by side
(command -v ffmpeg > /dev/null || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg libsndfile1) > $L/apt.log 2>&1) &
APT=$!
git clone -q --depth 1 https://github.com/meituan-longcat/LongCat-Video.git $R || fail "could not fetch the model's code"
cd $R && git log --oneline -1
mkdir -p $L/in && curl -fsSL -m 120 -o $L/in/person.png "$IMG_URL" && curl -fsSL -m 120 -o $L/in/voice.mp3 "$AUD_URL" || fail "could not fetch the picture or the voice"

(python3 -m venv $L/hf && $L/hf/bin/pip install -q "huggingface_hub[cli]" hf_transfer > $L/pip-hf.log 2>&1 \
  && HF_HUB_ENABLE_HF_TRANSFER=1 $L/hf/bin/hf download meituan-longcat/LongCat-Video --include "text_encoder/*" --include "vae/*" --include "tokenizer/*" --include "scheduler/*" --include "*.json" \
       --local-dir $W/LongCat-Video > $L/dl-base.log 2>&1 \
  && HF_HUB_ENABLE_HF_TRANSFER=1 $L/hf/bin/hf download meituan-longcat/LongCat-Video-Avatar-1.6 \
       --include "base_model/*" --include "loraA/*" --include "loraB/*" --include "scheduler/*" --include "vocal_separator/*" --include "*.json" \
       --include "whisper-large-v3/*.json" --include "whisper-large-v3/*.txt" --include "whisper-large-v3/model.safetensors" \
       --local-dir $W/LongCat-Video-Avatar-1.6 > $L/dl-avatar.log 2>&1 && echo ok > $L/weights.ready) &
DL=$!

PY=$(python3 -c "import sys; print('cp%d%d' % sys.version_info[:2])")
python3 -m venv $L/venv || fail "venv"
P=$L/venv/bin/pip
$P install -q torch==2.6.0+cu124 torchvision==0.21.0+cu124 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 > $L/pip-torch.log 2>&1 || fail "torch (see pip-torch.log)"
# the prebuilt attention wheel for this torch and python (building it from source takes longer than the whole budget)
$P install -q "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-$PY-$PY-linux_x86_64.whl" > $L/pip-fa.log 2>&1 || fail "flash-attn wheel for $PY"
grep -v -i "^torch==\|^flash-attn" requirements.txt > $L/req.txt
$P install -q -r $L/req.txt > $L/pip-req.log 2>&1 || fail "requirements (see pip-req.log)"
# the avatar list names a system library as if it were a python package; leave that line out, and do not let one odd pin stop the run
grep -v -i "^libsndfile1" requirements_avatar.txt > $L/req-avatar.txt
$P install -q -r $L/req-avatar.txt > $L/pip-avatar.log 2>&1 || { while read -r line; do [ -n "$line" ] && $P install -q "$line" >> $L/pip-avatar.log 2>&1; done < $L/req-avatar.txt; }
# installing extras must not have moved torch off the version the wheel above was built for
$L/venv/bin/python -c "import torch, flash_attn; assert torch.__version__.startswith('2.6.0'), torch.__version__; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())" || fail "torch changed version or flash-attn does not load"
step "packages ready"
wait $APT
# The other clip is sharpened now, while the weights are still coming down and the GPU has nothing to do. It is saved first,
# so it is safe whatever happens to the render. A failure here is written down and never stops the main clip.
UP=""
if [ -f "$HERE/upscale.py" ]; then
  $P install -q --no-deps spandrel > $L/pip-up.log 2>&1
  curl -fsSL -m 120 -o $L/x2.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth || echo "NOTE: could not fetch the upscaler's weights" >> $T/status.txt
  if [ -n "$EXTRA_URL" ] && [ -s $L/x2.pth ]; then
    (curl -fsSL -m 120 -o $L/in/extra.mp4 "$EXTRA_URL" \
      && $L/venv/bin/python "$HERE/upscale.py" --in $L/in/extra.mp4 --out $T/extra-1080.mp4 --weights $L/x2.pth > $T/upscale-extra.log 2>&1 \
      && echo "STEP extra clip sharpened $(date -u +%H:%M:%S) +$(( $(date +%s) - START ))s" >> $T/steps.log \
      || echo "NOTE: sharpening the extra clip failed (see upscale-extra.log)" >> $T/status.txt) &
    UP=$!
  fi
fi
N=0; while [ ! -f $L/weights.ready ]; do kill -0 $DL 2> /dev/null || [ -f $L/weights.ready ] || fail "the weights download stopped (see dl-*.log)"; sleep 3; N=$((N + 1)); done
step "weights ready $(du -sh $W | cut -f1)"

# 2. the clip: segments of 93 frames at 25 a second, each later one adds 80
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $L/in/voice.mp3)
SEG=$(python3 -c "import math; f=math.ceil(float('$DUR')*25); print(max(1, 1 + math.ceil(max(0, f-93)/80)))")
python3 - "$PROMPT" > $L/in/input.json <<'PY'
import json, sys
print(json.dumps({"prompt": sys.argv[1], "cond_image": "/root/avjob/in/person.png", "cond_audio": {"person1": "/root/avjob/in/voice.mp3"}}))
PY
step "render start: audio ${DUR}s, $SEG segments, $RES"
R0=$(date +%s)
$L/venv/bin/torchrun --nproc_per_node=1 run_demo_avatar_single_audio_to_video.py --context_parallel_size=1 \
  --checkpoint_dir=$W/LongCat-Video-Avatar-1.6 --stage_1=ai2v --input_json=$L/in/input.json --output_dir=$L/out \
  --resolution=$RES --num_segments=$SEG --ref_img_index=10 --mask_frame_range=0 \
  --use_distill --lora_path loraB/lora.safetensors --model_type avatar-v1.6 --mix_steps=4 --mix_alpha=1.0 > $T/render.log 2>&1
RC=$?
R1=$(date +%s)
[ $RC -eq 0 ] || { tail -30 $T/render.log; fail "render exited $RC (see render.log)"; }
OUT=$(ls -t $L/out/*.mp4 2> /dev/null | head -1)
[ -n "$OUT" ] || fail "render finished but wrote no video"
step "render done $(basename $OUT)"
# 3. cut to the voice's length, keep the untrimmed file too, write the numbers
cp "$OUT" $T/out-full.mp4
ffmpeg -y -v error -i "$OUT" -t "$DUR" -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart $T/out.mp4 || cp "$OUT" $T/out.mp4
{
  echo "OK"
  echo "model LongCat-Video-Avatar 1.6 (MIT), code $(git log --oneline -1 | cut -c1-60)"
  echo "gpu $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1), peak memory $(nvidia-smi --query-gpu=memory.used --format=csv,noheader | head -1) at the end"
  echo "video $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 $T/out.mp4) seconds $(ffprobe -v error -show_entries format=duration -of csv=p=0 $T/out.mp4)"
  echo "render_seconds $(( R1 - R0 )) (model load included) for ${DUR}s of video"
  echo "setup_seconds $(( R0 - START )) total_seconds $(( R1 - START ))"
} >> $T/status.txt
grep -i "segment\|it/s\|s/it" $T/render.log | tail -8 >> $T/status.txt
# 4. sharpen our own clip to 1080 x 1920 the same way (after the other one has finished, one at a time on the GPU)
[ -n "$UP" ] && wait $UP
if [ -s $L/x2.pth ] && [ -f "$HERE/upscale.py" ]; then
  $L/venv/bin/python "$HERE/upscale.py" --in $T/out.mp4 --out $T/out-1080.mp4 --weights $L/x2.pth > $T/upscale-out.log 2>&1 || echo "NOTE: sharpening our clip failed (see upscale-out.log)" >> $T/status.txt
fi
cat $T/upscale-*.log 2> /dev/null | grep "^UPSCALE" >> $T/status.txt
step "done"
shutdown_all
kill $TIMER 2> /dev/null
