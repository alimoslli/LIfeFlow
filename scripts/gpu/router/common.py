"""Shared helpers for the skill router pilot (runs on the rented GPU box)."""
import json, os, re, torch
from transformers import AutoTokenizer, AutoModelForCausalLM

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
SKILLS = json.load(open(f"{D}/skills.json"))
NAMES = [s["name"] for s in SKILLS]

ROUTER_SYSTEM = (
    "You are the skill router for LifeFlow, a life assistant app for students. "
    "Read the student's message and answer with the one skill that should handle it. "
    "Answer with the skill name only, exactly as written in the list.\n\nSkills:\n"
    + "\n".join(f"- {s['name']}: {s['description']}" for s in SKILLS)
)

def load(model_id, adapter=None):
    tok = AutoTokenizer.from_pretrained(model_id)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16, device_map={"": 0})
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    return tok, model

def chat(tok, system, user, assistant=None):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    # models with a thinking switch (SmolLM3, Qwen3): turn it off; other templates ignore the extra argument
    text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    return text if assistant is None else text + assistant

@torch.no_grad()
def generate(tok, model, prompts, bs=32, **gen):
    tok.padding_side = "left"
    order = sorted(range(len(prompts)), key=lambda i: -len(prompts[i]))
    res = {}
    for b in range(0, len(order), bs):
        idx = order[b:b + bs]
        enc = tok([prompts[i] for i in idx], return_tensors="pt", padding=True, add_special_tokens=False).to(0)
        o = model.generate(**enc, pad_token_id=tok.pad_token_id, **gen)
        for i, row in zip(idx, o):
            res[i] = tok.decode(row[enc["input_ids"].shape[1]:], skip_special_tokens=True)
        print(f"  gen {min(b + bs, len(order))}/{len(order)}", flush=True)
    return [res[i] for i in range(len(prompts))]

def parse_skill(text):
    t = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip().lower()
    first = t.split("\n")[0].strip(" .`'\"*-:")
    if first in NAMES:
        return first
    hits = [(t.find(n), -len(n), n) for n in NAMES if n in t]
    return min(hits)[2] if hits else "none"

def classify(tok, model, texts, bs=48):
    prompts = [chat(tok, ROUTER_SYSTEM, x) for x in texts]
    raw = generate(tok, model, prompts, bs=bs, max_new_tokens=12, do_sample=False)
    return [parse_skill(r) for r in raw], raw
