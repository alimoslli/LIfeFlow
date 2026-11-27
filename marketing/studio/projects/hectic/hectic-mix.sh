#!/usr/bin/env bash
# Sound for "Hectic": the two cutscenes' own voices and effects, original music under them, and the studio's effects.
# Usage: projects/hectic/hectic-mix.sh <rendered video.mp4> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/../.."
IN="$1"; OUT="$2"; T=$(mktemp -d)
G=public/generated/hectic; A=public/audio
A0=8.6; B0=13.2; O0=23.0; END=26.6; AS=0.12; BS=0.2
ffmpeg -v error -y \
  -i $G/chase.mp4 -i $G/casino.mp4 -i $A/hectic_music.mp3 -i $A/whoosh_scene_change.wav -i $A/answer_lands.wav -i $A/logo_ending_sound.wav \
  -filter_complex "
  [0:a]atrim=$AS:$(echo "$AS+$A0"|bc),asetpts=PTS-STARTPTS,afade=t=out:st=$(echo "$A0-0.15"|bc):d=0.15,aresample=48000[a];
  [1:a]atrim=$BS:10,asetpts=PTS-STARTPTS,afade=t=in:d=0.08,afade=t=out:st=9.65:d=0.15,aresample=48000,adelay=$(echo "$B0*1000"|bc|cut -d. -f1):all=1[b];
  [2:a]atrim=0:$END,aresample=48000,volume='if(between(t,$A0,$B0)+between(t,$O0,$END),0.62,0.2)':eval=frame,afade=t=in:d=0.3,afade=t=out:st=$(echo "$END-1.2"|bc):d=1.2[m];
  [3:a]aresample=48000,volume=0.7,adelay=8450:all=1[w];
  [4:a]aresample=48000,volume=0.45,adelay=9300:all=1[l];
  [5:a]aresample=48000,volume=0.8,adelay=$(echo "$O0*1000+100"|bc|cut -d. -f1):all=1[e];
  [a][b][m][w][l][e]amix=inputs=6:normalize=0:duration=longest,atrim=0:$END[mix]" -map "[mix]" -c:a pcm_s16le $T/mix.wav
I=$(ffmpeg -v info -i $T/mix.wav -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
ffmpeg -v error -y -i "$IN" -i $T/mix.wav -filter_complex "[1:a]volume=$(echo "-14 - ($I)"|bc)dB,alimiter=limit=0.89:level=false[o]" \
  -map 0:v -map "[o]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "mixed: I was $I LUFS, now about -14 -> $OUT"
