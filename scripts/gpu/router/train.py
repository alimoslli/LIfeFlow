"""Step 4: LoRA fine-tune a small open model to answer with the skill name. Plain PyTorch loop.
Usage on the box: python train.py <hf model id> <tag> [epochs]
Trains on out/train.json (teacher rewrites that passed the filters) plus the seed prompts. Never the held-out or fresh sets."""
import json, sys, time, random, math, torch
from peft import LoraConfig, get_peft_model
from common import *

MODEL = sys.argv[1]; TAG = sys.argv[2]
EPOCHS = int(sys.argv[3]) if len(sys.argv) > 3 else 3
BS, LR = 8, 2e-4  # batch 16 ran out of memory on one H100 (long system prompt with all 37 skills)
rows = json.load(open(f"{OUT}/train.json")) + [dict(s, kind="seed") for s in json.load(open(f"{D}/seeds.json"))]
random.Random(1).shuffle(rows)
tok = AutoTokenizer.from_pretrained(MODEL)
if tok.pad_token is None: tok.pad_token = tok.eos_token
tok.padding_side = "right"
model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16, device_map={"": 0})
model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"))
model.print_trainable_parameters()
eos = tok.eos_token
def enc(r):
    p = tok(chat(tok, ROUTER_SYSTEM, r["text"]), add_special_tokens=False)["input_ids"]
    a = tok(r["skill"] + eos, add_special_tokens=False)["input_ids"]
    return p + a, [-100] * len(p) + a  # loss only on the answer
data = [enc(r) for r in rows]
print(len(data), "rows, prompt tokens ~", len(data[0][0]), flush=True)
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=LR, weight_decay=0.0)
steps = EPOCHS * math.ceil(len(data) / BS); warm = int(0.05 * steps)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * max(0.0, (steps - s) / steps))
model.train(); t0 = time.time(); step = 0
for ep in range(EPOCHS):
    random.Random(ep).shuffle(data)
    for b in range(0, len(data), BS):
        batch = data[b:b + BS]; L = max(len(x[0]) for x in batch)
        ids = torch.tensor([x[0] + [tok.pad_token_id] * (L - len(x[0])) for x in batch]).to(0)
        lab = torch.tensor([x[1] + [-100] * (L - len(x[1])) for x in batch]).to(0)
        att = torch.tensor([[1] * len(x[0]) + [0] * (L - len(x[0])) for x in batch]).to(0)
        loss = model(input_ids=ids, attention_mask=att, labels=lab).loss
        loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step(); sched.step(); opt.zero_grad(); step += 1
        if step % 20 == 0: print(f"ep {ep} step {step}/{steps} loss {loss.item():.4f} {time.time()-t0:.0f}s", flush=True)
secs = time.time() - t0
model.save_pretrained(f"{OUT}/adapter-{TAG}")
json.dump({"model": MODEL, "rows": len(data), "epochs": EPOCHS, "batch": BS, "lr": LR, "lora_r": 16, "steps": steps, "train_seconds": secs},
          open(f"{OUT}/train-{TAG}.json", "w"), indent=1)
print("TRAIN DONE", secs, flush=True)
