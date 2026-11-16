"""Final voice files for the skit: the chosen takes, joined with our own pauses, levelled, with word timings (ASR mapped
onto the script's words), where each name is said, and which of the app's poses plays where.
    python3 voices3.py <chatterbox_dir> [key ...]"""
import sys, os, json, re, subprocess, difflib, numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ["HF_HUB_DISABLE_XET"] = "1"
SR = 48000
PICKS = json.load(open(f"{HERE}/picks.json"))
# key: (voice of, [segments], [pause after each segment but the last], poses by word)
LINES = {
    "dawn":    ("dawn",    ["Good morning! I'm Dawn. I planned your whole day before you woke up. Somebody had to."], [], [("wave", "Good", "morning!"), ("skeptic", "Somebody", "to.")]),
    "ray":     ("ray",     ["I'm Ray. Your classes, your shifts, and that quiz you forgot about.", "Yeah. That one."], [0.5], [("skeptic", "Yeah.", "one.")]),
    "goldie":  ("goldie",  ["I'm Goldie. Before you go out tonight, I check if you can actually afford it."], [], [("skeptic", "actually", "it.")]),
    "twinkle": ("twinkle", ["I'm Twinkle. You said you'd study tonight.", "Did you?"], [0.55], []),
    "dreamy":  ("dreamy",  ["I'm Dreamy.", "Go to bed. Tomorrow's handled."], [0.4], []),
    "just":    ("ray",     ["Just?"], [], []),
    "pick":    ("dawn",    ["Pick one of us."], [], []),
    "sky":     ("dreamy",  ["Or let the sky pick."], [], []),
}
norm = lambda w: re.sub(r"[^a-z']", "", w.lower())
def proc(path, st=0.0, tempo=1.0):
    r = 2 ** (st / 12)
    af = (f"asetrate={int(24000 * r)},aresample={SR},atempo={tempo / r:.5f}," if (st or tempo != 1) else f"aresample={SR},") + "highpass=f=80"
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", af, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32)
def build(key, cb, asr):
    who, segs, gaps, poses = LINES[key]; P = PICKS[who]; parts = []
    for si, text in enumerate(segs):
        fixed = P.get("files", {}).get(f"{key}_{si}")
        if fixed: w = proc(f"{HERE}/{fixed}", P.get("st", 0), P.get("tempo", 1))
        else:                                                      # generate it in that voice: best of a few seeds by ASR
            best = None
            for sd in (1, 2, 3, 4, 5):
                raw = cb.say(text, f"{HERE}/refs/{P['ref']}.wav", exaggeration=P["ex"], temperature=0.7, seed=sd); raw = trim_(raw)
                sf.write(f"{HERE}/vo/_{key}_{si}_s{sd}.wav", raw, 24000); w = proc(f"{HERE}/vo/_{key}_{si}_s{sd}.wav", P.get("st", 0), P.get("tempo", 1))
                ws = hear(asr, w); hyp = [norm(x[0]) for x in ws]; ok = hyp == [norm(x) for x in text.split()]
                prob = float(np.mean([x[3] for x in ws])) if ws else 0; dur = len(w) / SR; sc = (2 if ok else 0) + prob - (1 if dur > 0.6 * len(text.split()) + 1.2 else 0)
                if best is None or sc > best[0]: best = (sc, w, sd, ok)
                if ok and prob > 0.9: break
            w = best[1]; print(f"  generated {key}_{si} seed {best[2]} {'OK' if best[3] else 'XX'} {len(w) / SR:.2f}s")
        parts.append(w)
        if si < len(segs) - 1: parts.append(np.zeros(int(gaps[si] * SR), np.float32))
    a = np.concatenate(parts); sf.write(f"{HERE}/vo/{key}_cat.wav", a, SR)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{HERE}/vo/{key}_cat.wav", "-af", "loudnorm=I=-16:TP=-2", "-ar", str(SR), f"{HERE}/vo/{key}.wav"], check=True)
    a2 = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", f"{HERE}/vo/{key}.wav", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout, np.float32)
    ws = hear(asr, a2); script = " ".join(segs).split(); hyp = [norm(x[0]) for x in ws]; ref = [norm(x) for x in script]
    words = [None] * len(script)                                    # the script's words with the heard timings
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ref, hyp).get_opcodes():
        if tag == "equal":
            for d in range(i2 - i1): words[i1 + d] = (script[i1 + d], ws[j1 + d][1], ws[j1 + d][2])
    dur = len(a2) / SR
    for i in range(len(script)):                                    # fill the ones ASR heard differently
        if words[i] is None:
            p = next((words[j][2] for j in range(i - 1, -1, -1) if words[j]), 0.0); n = next((words[j][1] for j in range(i + 1, len(script)) if words[j]), dur)
            gap = [j for j in range(i, len(script)) if words[j] is None and all(words[q] is None for q in range(i, j + 1))]
            step = (n - p) / (len(gap) + 0)
            for q, j in enumerate(gap): words[j] = (script[j], p + q * step, p + (q + 1) * step)
    name = next((w for w in words if norm(w[0]) in ("dawn", "ray", "goldie", "twinkle", "dreamy")), None)
    pz = []
    for po, w0, w1 in poses:
        i0 = next(i for i, w in enumerate(words) if w[0] == w0); i1 = next(i for i, w in enumerate(words) if w[0] == w1 and i >= i0)
        pz.append((round(words[i0][1] - 0.05, 2), round(words[i1][2] + 0.35, 2), po))
    json.dump(dict(dur=round(dur, 3), words=[(w, round(s, 2), round(e, 2)) for w, s, e in words], name_at=round(name[1], 2) if name else 0.0, poses=pz,
                   heard=" ".join(x[0] for x in ws), voice=P.get("ref", "")), open(f"{HERE}/vo/{key}.json", "w"))
    print(f"{key:8s} {dur:5.2f}s heard: {' '.join(x[0] for x in ws)}")
def hear(asr, w48):
    a16 = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ar", "16000", "-f", "s16le", "-"], input=w48.astype(np.float32).tobytes(), capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    segs, _ = asr.transcribe(a16, word_timestamps=True, initial_prompt="The skylings are called Dawn, Ray, Goldie, Twinkle and Dreamy.")
    return [(x.word.strip(), float(x.start), float(x.end), float(x.probability)) for s in segs for x in s.words]
def trim_(w, thr=0.012):
    e = np.sqrt(np.convolve(w ** 2, np.ones(480) / 480, mode="same")); idx = np.where(e > thr)[0]
    return w[max(0, idx[0] - 600): idx[-1] + 2400] if len(idx) else w
if __name__ == "__main__":
    from faster_whisper import WhisperModel
    os.makedirs(f"{HERE}/vo", exist_ok=True); keys = sys.argv[2:] or list(LINES)
    asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4); cb = None
    need_gen = any(not PICKS[LINES[k][0]].get("files", {}).get(f"{k}_{si}") for k in keys for si in range(len(LINES[k][1])))
    if need_gen:
        from cb import CB
        cb = CB(sys.argv[1])
    for k in keys: build(k, cb, asr)
