# runs in the Higgsfield sandbox: every word with its time (faster-whisper medium.en)
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "medium.en", device="cpu", compute_type="int8", cpu_threads=8)
segs, _ = m.transcribe(sys.argv[1], word_timestamps=True, beam_size=5, vad_filter=True,
                       initial_prompt="LifeFlow, skyling, skylings, Ali, Tyler, Canvas, waitlist, lifeflowweb.com, January 2027")
out = [dict(s=round(s.start, 2), e=round(s.end, 2), t=s.text.strip(), w=[(round(w.start, 2), round(w.end, 2), w.word) for w in s.words]) for s in segs]
json.dump(out, open("fire_words.json", "w")); print("WORDS_DONE", len(out))
