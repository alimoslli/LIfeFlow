"""Casting round 2: real human reference voices (Kyutai tts-voices: CC0 voice donations, CC0 LibriVox picks, Alba MacKenna's
characters CC BY 4.0) through Chatterbox; lines in short segments so the pauses are ours; best of N seeds per segment by ASR."""
import sys, json, time, subprocess, numpy as np, soundfile as sf, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cb import CB, SR
os.environ["HF_HUB_DISABLE_XET"] = "1"
from faster_whisper import WhisperModel
D = sys.argv[1]; ROLES = json.load(open(sys.argv[2])); only = sys.argv[3].split(",") if len(sys.argv) > 3 else None
cb = CB(D); asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
norm = lambda s: re.sub(r"[^a-z' ]", "", s.lower().replace("-", " ")).split()
def hear(w):
    a16 = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ar", "16000", "-f", "s16le", "-"], input=w.astype(np.float32).tobytes(), capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    segs, _ = asr.transcribe(a16, word_timestamps=True, initial_prompt="The skylings are called Dawn, Ray, Goldie, Twinkle and Dreamy.")
    ws = [x for s in segs for x in s.words]; return ws
def trim(w, thr=0.012):
    e = np.sqrt(np.convolve(w ** 2, np.ones(480) / 480, mode="same")); idx = np.where(e > thr)[0]
    return w[max(0, idx[0] - 600): idx[-1] + 2400] if len(idx) else w
os.makedirs("takes2", exist_ok=True)
for role, R in ROLES.items():
    if only and role not in only: continue
    for cand in R["cands"]:
        segs_out = []
        for si, text in enumerate(R["segs"]):
            best = None
            for sd in R.get("seeds", [1, 2, 3]):
                w = trim(cb.say(text, f"refs/{cand}.wav", exaggeration=R["ex"], temperature=R.get("temp", 0.7), seed=sd))
                ws = hear(w); hyp = " ".join(x.word.strip() for x in ws); ok = norm(hyp) == norm(text)
                prob = float(np.mean([x.probability for x in ws])) if ws else 0; dur = len(w) / SR; rate = len(text.split()) / dur
                score = (2 if ok else 0) + prob - 0.6 * max(0, rate - 3.2) - (1 if dur > 2.5 * len(text.split()) / 2.4 + 1.2 else 0)
                rec = dict(seed=sd, ok=ok, prob=round(prob, 2), dur=round(dur, 2), rate=round(rate, 2), hyp=hyp, words=[(x.word.strip(), round(float(x.start), 2), round(float(x.end), 2)) for x in ws])
                if best is None or score > best[0]: best = (score, w, rec)
                if ok and prob > 0.93 and rate <= 3.3: break
            p = f"takes2/{role}_{cand}_{si}.wav"; sf.write(p, best[1], SR); json.dump(dict(text=text, **best[2]), open(p[:-4] + ".json", "w"))
            segs_out.append(best[2]); print(f"{role:8s} {cand:28s} seg{si} s{best[2]['seed']} {best[2]['dur']:4.2f}s {best[2]['rate']:.1f}w/s prob {best[2]['prob']:.2f} {'OK' if best[2]['ok'] else 'XX'} | {best[2]['hyp']}", flush=True)
