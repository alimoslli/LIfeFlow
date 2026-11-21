"""Fine-tunes an open chat model (LoRA) on the filtered skyling examples (scripts/gpu/chat-data/filter.py output), so it
answers the way the skyling should, with the app's real prompt and tools. Made-up data only (ADR 0023).

  python train_chat.py --data /workspace/chatdata/train.jsonl --model Qwen/Qwen3-8B --out /workspace/chattrain/adapter \
      --epochs 2 --max-minutes 60

Each example is one skyling turn: the exact messages the model was sent (system prompt, earlier turns, its own tool calls
and their results) and its final answer. Loss is only on the skyling's own turns (its tool calls and its answers), never
on the prompt or the tool results. Thinking is off, as the app runs it.
"""
import argparse, json, math, random, re, time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--model", default="Qwen/Qwen3-8B")
ap.add_argument("--out", required=True)
ap.add_argument("--epochs", type=float, default=2)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--rank", type=int, default=16)
ap.add_argument("--accum", type=int, default=8)
ap.add_argument("--max-len", type=int, default=16384)
ap.add_argument("--max-minutes", type=float, default=60, help="stop and save when this much time has passed")
ap.add_argument("--holdout", type=int, default=40, help="examples kept back to measure loss on")
a = ap.parse_args()
t_start = time.time()

tok = AutoTokenizer.from_pretrained(a.model)
rows = [json.loads(l) for l in open(a.data)]
random.Random(7).shuffle(rows)


def render(r):
    msgs = []
    for m in r["messages"]:
        m = dict(m)
        if m.get("tool_calls"):
            m["tool_calls"] = [{"type": "function", "id": c.get("id"), "function": {"name": c["function"]["name"],
                                "arguments": json.loads(c["function"]["arguments"] or "{}")}} for c in m["tool_calls"]]
        if m["role"] == "assistant" and m.get("content") is None:
            m["content"] = ""
        msgs.append(m)
    return tok.apply_chat_template(msgs, tools=r["tools"] or None, tokenize=False, enable_thinking=False)


ASSIST = re.compile(r"<\|im_start\|>assistant\n(.*?<\|im_end\|>)", re.S)


def encode(r):
    text = render(r)
    enc = tok(text, return_offsets_mapping=True, add_special_tokens=False)
    ids, offs = enc["input_ids"], enc["offset_mapping"]
    if len(ids) > a.max_len:
        return None
    spans = [m.span(1) for m in ASSIST.finditer(text)]
    labels = [-100] * len(ids)
    for i, (s, e) in enumerate(offs):
        if any(s >= a0 and e <= b0 for a0, b0 in spans):
            labels[i] = ids[i]
    if all(l == -100 for l in labels):
        return None
    return ids, labels


data, skipped = [], 0
for r in rows:
    try:
        x = encode(r)
    except Exception as e:  # a malformed example never stops the run
        x = None
    if x is None:
        skipped += 1
    else:
        data.append(x)
hold, train = data[: a.holdout], data[a.holdout:]
ntok = sum(len(x[0]) for x in train)
print(f"examples {len(rows)} usable {len(data)} skipped {skipped} train {len(train)} holdout {len(hold)} tokens {ntok}", flush=True)

model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16, device_map={"": 0}, attn_implementation="sdpa")
model.gradient_checkpointing_enable()
model.enable_input_require_grads()
model = get_peft_model(model, LoraConfig(r=a.rank, lora_alpha=2 * a.rank, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"))
model.print_trainable_parameters()
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)
total = max(1, math.ceil(len(train) * a.epochs / a.accum))
warm = max(1, int(0.05 * total))
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * max(0.05, (total - s) / total))


def loss_of(ids, labels):
    x = torch.tensor([ids], device=0)
    y = torch.tensor([labels], device=0)
    return model(input_ids=x, labels=y).loss


@torch.no_grad()
def holdout_loss():
    model.eval()
    v = [loss_of(*h).item() for h in hold]
    model.train()
    return sum(v) / max(1, len(v))


log = {"model": a.model, "examples": len(rows), "train": len(train), "holdout": len(hold), "tokens": ntok, "rank": a.rank, "lr": a.lr,
       "accum": a.accum, "epochs_planned": a.epochs, "holdout_loss": [], "steps": 0}
h0 = holdout_loss()
print("holdout loss before", round(h0, 4), flush=True)
log["holdout_loss"].append((0, h0))
model.train()
step, seen, stopped = 0, 0, False
order = []
for ep in range(math.ceil(a.epochs)):
    idx = list(range(len(train)))
    random.Random(ep).shuffle(idx)
    order += idx
order = order[: int(len(train) * a.epochs)]
for n, i in enumerate(order):
    loss = loss_of(*train[i]) / a.accum
    loss.backward()
    seen += 1
    if seen % a.accum == 0:
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step(); sched.step(); opt.zero_grad(); step += 1
        if step % 10 == 0:
            el = (time.time() - t_start) / 60
            print(f"step {step}/{total} loss {loss.item() * a.accum:.4f} {el:.1f} min", flush=True)
        if step % 50 == 0:
            hl = holdout_loss()
            log["holdout_loss"].append((step, hl))
            print("holdout loss", step, round(hl, 4), flush=True)
            model.save_pretrained(a.out)
        if (time.time() - t_start) / 60 > a.max_minutes:
            stopped = True
            break
hl = holdout_loss()
log["holdout_loss"].append((step, hl))
log.update({"steps": step, "examples_seen": seen, "stopped_at_time_limit": stopped, "minutes": (time.time() - t_start) / 60})
model.save_pretrained(a.out)
json.dump(log, open(a.out.rstrip("/") + "-train.json", "w"), indent=1)
print("TRAIN DONE", json.dumps({k: log[k] for k in ("steps", "examples_seen", "minutes", "stopped_at_time_limit")}), "holdout", round(hl, 4), flush=True)
