#!/usr/bin/env bash
# LifeFlow film "It didn't forget": about 27 s, 1080x1920, 30 fps, film look.
set -euo pipefail
cd "$(dirname "$0")"
FL=/usr/share/fonts/opentype/inter/InterDisplay-Light.otf
FM=/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf
LOGO=/workspace/LIfeFlow/public/brand/lifeflow-mark-transparent-512.png
LOGOSND=../push2/gen/logo.mp3
mkdir -p segv
GRADE="curves=all='0/0.04 0.5/0.5 1/0.97',colorbalance=rm=0.03:bm=-0.03:rh=0.02,split[a][b];[b]gblur=sigma=18,colorchannelmixer=rr=1:gg=0.55:bb=0.35[g];[a][g]blend=all_mode=screen:all_opacity=0.12,noise=alls=7:allf=t,vignette=PI/4.5"
# one line of text: text start end [size] [y]
TXT() {
  local s=${4:-74} y=${5:-0.72}
  echo "drawtext=fontfile=$FM:text='$1':fontcolor=white:fontsize=$s:x=(w-tw)/2:y=h*$y:alpha='if(lt(t,$2),0,if(lt(t,$2+0.45),(t-$2)/0.45,if(lt(t,$3-0.35),1,max(0,($3-t)/0.35))))':shadowcolor=black@0.75:shadowx=0:shadowy=3:borderw=2:bordercolor=black@0.35"
}
seg() { # in start dur out [text filters]
  local tx=${5:-}
  ffmpeg -nostdin -v error -y -ss "$2" -i "$1" -t "$3" -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,$GRADE${tx:+,$tx},format=yuv420p[v]" -map "[v]" -an -c:v libx264 -crf 15 -preset medium "segv/$4.mp4"
}
seg v4.mp4 2.2 2.0 s0 "$(TXT 'she forgot her' 0.15 2.0 60 0.70),$(TXT 'best friend’s birthday.' 0.15 2.0 60 0.745)"
seg w1.mp4 0.4 4.0 s1 "$(TXT '3 days earlier' 0.0 1.4 44 0.12),$(TXT 'her 5th shift this week.' 0.4 2.2 58),$(TXT 'a project due friday.' 2.2 4.0 58)"
seg v1.mp4 0.3 3.2 s2 "$(TXT 'the party is saturday.' 0.3 3.2 60)"
seg v2.mp4 1.2 3.0 s3 "$(TXT 'she forgot.' 0.4 3.0 70)"
seg w2.mp4 0.3 4.7 s4 "$(TXT 'her assistant didn’t.' 0.2 2.0 66)"",""$(TXT 'study time moved to wednesday.' 2.0 3.55 50)"",""$(TXT 'saturday is free.' 3.5 4.7 54)"
seg w3.mp4 0.3 2.6 s5 "$(TXT 'saturday, 9 pm.' 0.3 2.4 52 0.12)"
seg v3.mp4 0.4 2.2 s6
seg v4.mp4 0.3 3.6 s7 "$(TXT 'she showed up.' 0.6 3.6 70)"
ffmpeg -nostdin -v error -y -f lavfi -i "color=c=0x0d1a14:s=1080x1920:r=30:d=3.4" -loop 1 -t 3.4 -i "$LOGO" -filter_complex \
 "[1]scale=200:-1,format=rgba,fade=in:st=0.1:d=0.6:alpha=1[l];[0][l]overlay=(W-w)/2:700,\
drawtext=fontfile=$FM:text='LifeFlow':fontcolor=0xF4F0E8:fontsize=110:x=(w-tw)/2:y=950:alpha='min(1,max(0,(t-0.35)/0.5))',\
drawtext=fontfile=$FL:text='It remembers, so you can show up.':fontcolor=0xF4F0E8@0.9:fontsize=54:x=(w-tw)/2:y=1110:alpha='min(1,max(0,(t-0.8)/0.5))',\
drawtext=fontfile=$FL:text='lifeflowweb.com':fontcolor=0xF4F0E8@0.65:fontsize=40:x=(w-tw)/2:y=1240:alpha='min(1,max(0,(t-1.3)/0.5))',\
noise=alls=6:allf=t,format=yuv420p" -c:v libx264 -crf 15 segv/e.mp4
# total before card: 3.2+2.6+2.8+4.0+2.6+2.2+3.4 = 20.8; card fades in at 20.2
ffmpeg -nostdin -v error -y -f lavfi -i "color=c=white:s=1080x1920:r=30:d=0.13" -vf format=yuv420p -c:v libx264 segv/fl.mp4
ffmpeg -nostdin -v error -y -i segv/s0.mp4 -i segv/fl.mp4 -i segv/s1.mp4 -i segv/s2.mp4 -i segv/s3.mp4 -i segv/s4.mp4 -i segv/s5.mp4 -i segv/s6.mp4 -i segv/s7.mp4 -i segv/e.mp4 -filter_complex \
 "[0][1][2][3][4][5][6][7][8]concat=n=9:v=1:a=0,settb=1/30,fps=30[x];[9]settb=1/30,fps=30[e];[x][e]xfade=transition=fadeblack:duration=0.6:offset=24.83,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -crf 16 -preset slow picv.mp4
# sound: score, a soft phone buzz as the phone lights up (8.6 s), the two-note logo on the card
ffmpeg -nostdin -v error -y -i full.mp3 -i buzz.wav -i "$LOGOSND" -filter_complex \
 "[0]atrim=0:28.23,afade=t=out:st=26.6:d=1.6,aformat=channel_layouts=stereo[m];\
[1]adelay=12880|12880,aformat=channel_layouts=stereo[z];\
[2]volume=0.9,adelay=25530|25530,aformat=channel_layouts=stereo[l];\
[m][z][l]amix=inputs=3:normalize=0,atrim=0:28.23,loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map "[a]" -ar 48000 -c:a pcm_s16le mixv.wav
ffmpeg -nostdin -v error -y -i picv.mp4 -i mixv.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest lifeflow-film-v4.mp4
echo done
