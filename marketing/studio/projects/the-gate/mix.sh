#!/usr/bin/env bash
# Sound for "The Gate": each shot's own voices and effects, the music low under the night and up on the ending, the
# app's star on the real tick-off, a soft whoosh on each cut and the logo sound. Usage: mix.sh <rendered.mp4> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/../.."
IN="$1"; OUT="$2"; T=$(mktemp -d); G=public/generated/gate/audio; A=public/audio
S=(0 9.0 18.0); D=(9.0 9.0 9.0); O=27.0; TICK=${TICK:-6.0}
END=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$IN")
f=""
for i in 0 1 2; do
  ms=$(echo "${S[$i]}*1000" | bc | cut -d. -f1)
  f+="[$i:a]atrim=0:${D[$i]},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.04,afade=t=out:st=$(echo "${D[$i]}-0.08"|bc):d=0.08,adelay=${ms}:all=1[c$i];"
done
f+="[3:a]atrim=0:$END,aresample=48000,volume='if(gte(t,$O),0.75,if(between(t,9,18),0.30,0.16))':eval=frame,afade=t=in:d=0.6,afade=t=out:st=$(echo "$END-1.0"|bc):d=1.0[m];"
f+="[4:a]aresample=48000,volume=0.6,adelay=$(echo "(${S[1]}+$TICK)*1000"|bc|cut -d. -f1):all=1[st];"
f+="[5:a]aresample=48000,volume=0.8,adelay=$(echo "($O+0.1)*1000"|bc|cut -d. -f1):all=1[lg];"
f+="[6:a]aresample=48000,volume=0.3,adelay=8950:all=1[w0];[6:a]aresample=48000,volume=0.3,adelay=17950:all=1[w1];[6:a]aresample=48000,volume=0.3,adelay=26950:all=1[w2];"
f+="[c0][c1][c2][m][st][lg][w0][w1][w2]amix=inputs=9:normalize=0:duration=longest,atrim=0:$END[mix]"
ffmpeg -v error -y -i $G/g1.wav -i $G/g2.wav -i $G/g3.wav -i $A/olj_music.mp3 -i $A/star_tick_it_off.wav -i $A/logo_ending_sound.wav -i $A/whoosh_scene_change.wav -filter_complex "$f" -map "[mix]" -c:a pcm_s16le $T/mix.wav
I=$(ffmpeg -v info -i $T/mix.wav -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
ffmpeg -v error -y -i "$IN" -i $T/mix.wav -filter_complex "[1:a]volume=$(echo "-14 - ($I)"|bc)dB,alimiter=limit=0.89:level=false[o]" -map 0:v -map "[o]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "mixed: I was $I LUFS -> $OUT"
