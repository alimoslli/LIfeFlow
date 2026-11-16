"""Chatterbox (Resemble AI, MIT) through its ONNX export (onnx-community/chatterbox-ONNX), on CPU, no PyTorch.
Zero-shot: the output speaks in the timbre of a short reference clip; `exaggeration` is the acting intensity.
Sampling (temperature, top-p, repetition penalty) gives different takes per seed; pick takes by ear or by ASR.
    from cb import CB; cb = CB(model_dir); wav = cb.say("Hi, I'm Ray!", ref_wav_path, exaggeration=0.7, seed=1)   # 24 kHz float32
"""
import subprocess, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
SR = 24000; START_SPEECH, STOP_SPEECH = 6561, 6562
def load_audio(path, sr=SR):
    b = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(b, np.float32).copy()
class CB:
    def __init__(self, d, threads=4):
        so = ort.SessionOptions(); so.intra_op_num_threads = threads; so.log_severity_level = 3
        S = lambda n: ort.InferenceSession(f"{d}/onnx/{n}.onnx", so, providers=["CPUExecutionProvider"])
        self.enc, self.emb, self.lm, self.dec = S("speech_encoder"), S("embed_tokens"), S("language_model"), S("conditional_decoder")
        self.tok = Tokenizer.from_file(f"{d}/tokenizer.json"); self._ref = {}
        self.L, self.Hh, self.Dh = 30, 16, 64
    def ref(self, path):
        if path not in self._ref:
            a = load_audio(path)[None, :]; self._ref[path] = self.enc.run(None, {"audio_values": a})
        return self._ref[path]
    def say(self, text, ref_path, exaggeration=0.5, temperature=0.8, top_p=0.95, rep=1.2, seed=0, max_new=400):
        rng = np.random.default_rng(seed)
        cond_emb, prompt_token, xvec, feat = self.ref(ref_path)
        ids = np.array([self.tok.encode(text).ids], np.int64)
        pos = np.where(ids >= START_SPEECH, 0, np.arange(ids.shape[1])[None, :] - 1)
        ex = np.array([exaggeration], np.float32)
        x = self.emb.run(None, {"input_ids": ids, "position_ids": pos, "exaggeration": ex})[0]
        x = np.concatenate([cond_emb, x], 1)
        past = {f"past_key_values.{l}.{kv}": np.zeros([1, self.Hh, 0, self.Dh], np.float32) for l in range(self.L) for kv in ("key", "value")}
        mask = np.ones((1, x.shape[1]), np.int64); gen = [START_SPEECH]
        for i in range(max_new):
            logits, *pres = self.lm.run(None, dict(inputs_embeds=x, attention_mask=mask, **past))
            lg = logits[0, -1].astype(np.float64)
            seen = np.array(sorted(set(gen)))
            lg[seen] = np.where(lg[seen] < 0, lg[seen] * rep, lg[seen] / rep)
            if temperature <= 0: nxt = int(lg.argmax())
            else:
                p = np.exp((lg - lg.max()) / temperature); p /= p.sum()
                order = np.argsort(-p); cs = np.cumsum(p[order]); keep = order[: int(np.searchsorted(cs, top_p)) + 1]
                q = np.zeros_like(p); q[keep] = p[keep]; q /= q.sum(); nxt = int(rng.choice(len(q), p=q))
            gen.append(nxt)
            if nxt == STOP_SPEECH: break
            x = self.emb.run(None, {"input_ids": np.array([[nxt]], np.int64), "position_ids": np.array([[i + 1]], np.int64), "exaggeration": ex})[0]
            mask = np.concatenate([mask, np.ones((1, 1), np.int64)], 1)
            for j, k in enumerate(past): past[k] = pres[j]
        toks = np.array([gen[1:-1] if gen[-1] == STOP_SPEECH else gen[1:]], np.int64)
        toks = np.concatenate([prompt_token, toks], 1)
        wav = self.dec.run(None, {"speech_tokens": toks, "speaker_embeddings": xvec, "speaker_features": feat})[0]
        return np.squeeze(wav).astype(np.float32)
