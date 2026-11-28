#!/usr/bin/env bash
# Sound for "One Last Job": each shot's own voices and effects, the original music under them, the app's star sound on
# the real tick-off, soft whooshes on the cuts and the logo sound. Usage: mix.sh <rendered.mp4> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/../.."
IN="$1"; OUT="$2"; T=$(mktemp -d); G=public/generated/olj; A=public/audio
# shot starts and lengths (must match src/projects/one-last-job.tsx)
S=(0 8.05 16.95 26.95 34.45); D=(8.05 8.9 10 7.5 9.0); O=43.45; END=46.95
f=""; inputs=""
for i in 0 1 2 3 4; do
  inputs+=" -i $G/s$((i+1)).mp4"
  ms=$(echo "${S[$i]}*1000" | bc | cut -d. -f1)
  f+="[$i:a]atrim=0:${D[$i]},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.04,afade=t=out:st=$(echo "${D[$i]}-0.08"|bc):d=0.08,adelay=${ms}:all=1[c$i];"
done
f+="[5:a]atrim=0:$END,aresample=48000,volume='if(gte(t,$O),0.75,0.24)':eval=frame,afade=t=out:st=$(echo "$END-1.0"|bc):d=1.0[m];"
f+="[6:a]aresample=48000,volume=0.6,adelay=$(echo "(${S[2]}+1.7)*1000"|bc|cut -d. -f1):all=1[st];"
f+="[7:a]aresample=48000,volume=0.8,adelay=$(echo "($O+0.1)*1000"|bc|cut -d. -f1):all=1[lg];"
w=""; n=0
for c in 8.0 16.9 26.9 34.4 43.4; do f+="[8:a]aresample=48000,volume=0.35,adelay=$(echo "$c*1000"|bc|cut -d. -f1):all=1[w$n];"; w+="[w$n]"; n=$((n+1)); done
f+="[c0][c1][c2][c3][c4][m][st][lg]${w}amix=inputs=$((8+n)):normalize=0:duration=longest,atrim=0:$END[mix]"
ffmpeg -v error -y $inputs -i $A/olj_music.mp3 -i $A/star_tick_it_off.wav -i $A/logo_ending_sound.wav -i $A/whoosh_scene_change.wav -filter_complex "$f" -map "[mix]" -c:a pcm_s16le $T/mix.wav
I=$(ffmpeg -v info -i $T/mix.wav -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
ffmpeg -v error -y -i "$IN" -i $T/mix.wav -filter_complex "[1:a]volume=$(echo "-14 - ($I)"|bc)dB,alimiter=limit=0.89:level=false[o]" -map 0:v -map "[o]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "mixed: I was $I LUFS -> $OUT"
