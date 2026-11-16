"""more takes of Ray's one-word line, scored by how clearly it is heard: python3 just_takes.py <chatterbox_dir>"""
import sys, os, json, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); os.environ["HF_HUB_DISABLE_XET"] = "1"
d = sys.argv[1]; sys.argv = sys.argv[:1]
import voices3 as V
from faster_whisper import WhisperModel
from cb import CB
asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4); cb = CB(d); P = V.PICKS["ray"]; res = []
for ex in (0.6, 0.8):
    for sd in range(1, 8):
        raw = V.trim_(cb.say("Just?", f"{HERE}/refs/{P['ref']}.wav", exaggeration=ex, temperature=0.7, seed=sd)); fn = f"{HERE}/vo/_just_e{ex}_s{sd}.wav"; sf.write(fn, raw, 24000)
        w = V.proc(fn); ws = V.hear(asr, w); txt = " ".join(x[0] for x in ws); ok = [V.norm(x[0]) for x in ws] == ["just"]
        res.append(dict(fn=fn, ex=ex, sd=sd, dur=round(len(w) / V.SR, 2), heard=txt, ok=ok, prob=round(ws[0][3], 2) if ws else 0, wd=round(ws[0][2] - ws[0][1], 2) if ws else 0)); print(res[-1], flush=True)
json.dump(res, open(f"{HERE}/vo/_just_takes.json", "w"))
