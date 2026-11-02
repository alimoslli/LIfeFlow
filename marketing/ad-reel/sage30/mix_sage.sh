# Speech from the selfie clips (trimmed per plan, levelled per clip) + ducked music bed -> mix.wav
set -e
python3 - <<'PY'
import json, subprocess
P = json.load(open("plan.json"))
parts = []
for i, c in enumerate(P["clips"]):
    d = c["end"] - c["start"]
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", c["path"], "-vn", "-af", f"atrim=0:{d},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-2:LRA=7,atrim=0:{d}", f"sp{i}.wav"], check=True)
    parts.append(f"sp{i}.wav")
open("sp.txt", "w").write("".join(f"file '{p}'\n" for p in parts))
PY
ffmpeg -loglevel error -y -f concat -safe 0 -i sp.txt -af "apad=whole_dur=30" -t 30 speech.wav
ffmpeg -loglevel error -y -i speech.wav -i music.wav -filter_complex "[0:a]asplit=2[sp][sc];[1:a]volume=0.5[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=300[duck];[sp][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9,atrim=0:30[out]" -map "[out]" -ar 48000 -c:a pcm_s16le mix.wav
