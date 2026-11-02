# Voice + music mix for the Jarvis reel. Voice lines are pre-trimmed in vo/p*.wav; placements come from timeline.json.
set -e
read -r -a PL <<< "$(python3 -c "import json;print(' '.join(f'{n}:{t}' for n,t in json.load(open('timeline.json'))['vo']))")"
inputs=""; f=""; i=0; labels=""
for p in "${PL[@]}"; do n=${p%%:*}; s=${p##*:}; ms=$(python3 -c "print(int($s*1000))")
  inputs="$inputs -i vo/$n.wav"
  f="$f[$i:a]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,adelay=${ms}|${ms},aformat=channel_layouts=stereo[v$i];"
  labels="$labels[v$i]"; i=$((i+1)); done
f="$f${labels}amix=inputs=$i:normalize=0,volume=1.6,apad=whole_dur=30[vo];[vo]asplit=2[vo1][vosc];[$i:a]volume=0.55[mus];[mus][vosc]sidechaincompress=threshold=0.02:ratio=7:attack=15:release=250[duck];[duck][vo1]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9,atrim=0:30[out]"
ffmpeg -loglevel error -y $inputs -i music.wav -filter_complex "$f" -map "[out]" -ar 48000 -c:a pcm_s16le mix.wav
