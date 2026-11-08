#!/usr/bin/env bash
# Student spot v2: Sterling voiceover + new caption track. Picture = the v1 cut (pic.mp4); app shots unchanged (placeholders).
set -euo pipefail
cd "$(dirname "$0")"
FM=/usr/share/fonts/opentype/inter/Inter-SemiBold.otf
LOGOSND=../push2/gen/logo.mp3
V=voice
# caption: text start end size ypos
cap() { local bx=""; [ "${6:-}" = box ] && bx=":box=1:boxcolor=black@0.5:boxborderw=16"; echo "drawtext=fontfile=$FM:text='$1':fontcolor=white:fontsize=$4:x=(w-tw)/2:y=h*$5$bx:borderw=2:bordercolor=black@0.35:shadowcolor=black@0.7:shadowx=0:shadowy=3:alpha='if(lt(t,$2),0,if(lt(t,$2+0.3),(t-$2)/0.3,if(lt(t,$3-0.25),1,max(0,($3-t)/0.25))))'"; }
caps() { # size y
  local s=$1 y=$2
  echo "$(cap 'pick one.' 0.8 3.3 $s $y),$(cap 'school or work.' 3.0 5.4 $s $y),$(cap 'dreams or people.' 5.4 7.7 $s $y),$(cap 'you were never built to choose.' 7.9 9.7 $s $y),$(cap 'shift thursday. quiz friday.' 9.9 12.2 $s $y box),$(cap '2 hours found wednesday.' 12.2 14.6 $s $y box),$(cap 'you said yes.' 14.6 16.3 $s $y box),$(cap 'your whole life. connected.' 16.5 18.6 $s $y box),$(cap 'the time you get back...' 19.2 21.4 $s $y),$(cap 'goes to what you would never give up.' 21.4 24.6 $s $y)"
}
HOLD="drawtext=fontfile=$FM:text='placeholder app screen, new design coming':fontcolor=white@0.85:fontsize=26:x=(w-tw)/2:y=60:box=1:boxcolor=0x1F4D3A@0.85:boxborderw=10:enable='between(t,9.8,18.6)'"
# 16:9 master
ffmpeg -nostdin -v error -y -i pic.mp4 -vf "$(caps 50 0.82),$HOLD" -c:v libx264 -crf 16 -preset slow pic_v2.mp4
# 9:16 cut: crop first, then captions sized for the phone
ffmpeg -nostdin -v error -y -i pic.mp4 -vf "crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos,$(caps 58 0.74),${HOLD//fontsize=26/fontsize=34}" -c:v libx264 -crf 17 pic_v2_vert.mp4
# sound: the existing score ducked under Sterling, logo sound on the card
ffmpeg -nostdin -v error -y -i a/music.mp3 -i $V/s1.wav -i $V/s2.wav -i $V/s3.wav -i $V/s4.wav -i $V/s5.wav -i $V/s6.wav -i $V/s7.wav -i "$LOGOSND" -filter_complex \
 "[0]atrim=0:30,volume='if(lt(t,14.8),2.2,0.85)':eval=frame,afade=t=out:st=28.6:d=1.4,aformat=channel_layouts=stereo[m];\
[1]adelay=800|800[a1];[2]adelay=3000|3000[a2];[3]adelay=7900|7900[a3];[4]adelay=9900|9900[a4];[5]adelay=16500|16500[a5];[6]adelay=19200|19200[a6];[7]adelay=27300|27300[a7];\
[a1][a2][a3][a4][a5][a6][a7]amix=inputs=7:normalize=0,aformat=channel_layouts=stereo,volume=1.7,asplit[vo][sc];\
[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=400[md];\
[8]volume=0.7,adelay=26950|26950,aformat=channel_layouts=stereo[lg];\
[md][vo][lg]amix=inputs=3:normalize=0,atrim=0:30,loudnorm=I=-14:TP=-1.5:LRA=9[aout]" -map "[aout]" -ar 48000 -c:a pcm_s16le mix_v2.wav
ffmpeg -nostdin -v error -y -i pic_v2.mp4 -i mix_v2.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest lifeflow-spot-v2-16x9.mp4
ffmpeg -nostdin -v error -y -i pic_v2_vert.mp4 -i mix_v2.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest lifeflow-spot-v2-9x16.mp4
echo done
