"""Trains the large skyling model itself (Qwen3.8-27B) on checked skyling examples: a LoRA on the upper layers, merged into
the weights at the end, so the result is one model that serves exactly like the original. Made-up data only (ADR 0023).

  python train_big.py --data train.jsonl --model /root/job/models/qwen38-27b --out /root/job/models/skyling-27b \
      --adapter /workspace/ownmodel/night1/adapter --max-minutes 75 [--smoke 3]

Why the upper layers only (--from-layer, default 40 of 64): nothing below them needs a gradient, so the lower 40 layers run
forward once with no bookkeeping and the backward pass covers 24 layers instead of 64. About half the time and far less
memory than training every layer, which is what lets a 27-billion-parameter model train on one 80 GB card.

Each example is one skyling step: the exact messages the model was sent and its reply (a tool call or the final answer).
The prompt is built the way the model server builds it (thinking off), and the loss is only on the reply's own tokens.
--smoke N: load, run N examples forward and backward, print the seconds and the memory, and stop. Run it before the real thing.
"""
import argparse, json, math, os, random, shutil, time
import torch
from transformers import AutoModelForImageTextToText, AutoTokenizer
from peft import LoraConfig, get_peft_model

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--model", required=True)
ap.add_argument("--out", default=None, help="where the merged model is saved (skipped when not given)")
ap.add_argument("--adapter", required=True, help="where the LoRA itself is saved, small, on storage that outlives the box")
ap.add_argument("--from-layer", type=int, default=40)
ap.add_argument("--rank", type=int, default=16)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--accum", type=int, default=8)
ap.add_argument("--epochs", type=float, default=1)
ap.add_argument("--max-len", type=int, default=24576)
ap.add_argument("--max-minutes", type=float, default=60)
ap.add_argument("--holdout", type=int, default=24)
ap.add_argument("--smoke", type=int, default=0)
ap.add_argument("--smoke-data", default=None, help="run the smoke test on this file first, then wait for --data to appear and train on it "
                "(one model load for both: the checked training set can arrive while the model is loading and being tried)")
ap.add_argument("--until", type=float, default=0, help="unix time: training also stops here (the box has a hard stop and needs room to save and score)")
ap.add_argument("--wait-minutes", type=float, default=20, help="how long to wait for --data after the smoke test")
ap.add_argument("--save-minutes", type=float, default=4, help="the trained part and how far it got are saved this often, so a box that is taken away "
                "(idle, out of credits: both happened on 2026-11-25) loses minutes, not the run")
ap.add_argument("--resume", action="store_true", help="carry on from what is saved in --adapter (same data file), instead of starting over")
ap.add_argument("--init-adapter", default=None, help="start from the trained part of an earlier round (another folder), then train on this round's data")
ap.add_argument("--smoke-only", action="store_true", help="try a few examples, print seconds and memory for each, and stop: the speed test")
ap.add_argument("--clip-tokens", type=int, default=0, help="dry runs only: keep just the last N tokens of each prompt, so a CPU can get through real examples")
ap.add_argument("--tiny", action="store_true", help="a test of this script on a small random model of the same kind (no GPU needed)")
a = ap.parse_args()
t_start = time.time()
dev = "cuda" if torch.cuda.is_available() else "cpu"

tok = AutoTokenizer.from_pretrained(a.model)
START = "<|im_start|>assistant\n"


def norm(m):
    m = dict(m)
    if m.get("tool_calls"):
        m["tool_calls"] = [{"type": "function", "id": c.get("id"), "function": {"name": c["function"]["name"],
                            "arguments": json.loads(c["function"]["arguments"] or "{}") if isinstance(c["function"]["arguments"], str) else c["function"]["arguments"]}}
                           for c in m["tool_calls"]]
    if m["role"] == "assistant" and m.get("content") is None:
        m["content"] = ""
    return m


def encode(r):
    """prompt = what the server sends for this step (ends where the reply starts, thinking off); target = the reply."""
    msgs = [norm(m) for m in r["messages"]]
    assert msgs[-1]["role"] == "assistant"
    tools = r.get("tools") or None
    prompt = tok.apply_chat_template(msgs[:-1], tools=tools, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    full = tok.apply_chat_template(msgs, tools=tools, tokenize=False, enable_thinking=False)
    target = full[full.rindex(START) + len(START):]
    if "</think>" in target:                      # a think block the template wrote into the reply: the prompt already carries it
        target = target.split("</think>", 1)[1].lstrip("\n")
    if not target.rstrip().endswith("<|im_end|>"):
        target = target.rstrip() + "<|im_end|>"
    p = tok(prompt, add_special_tokens=False)["input_ids"]
    t = tok(target.rstrip("\n"), add_special_tokens=False)["input_ids"]
    if a.clip_tokens and len(p) + len(t) > a.clip_tokens:
        p = p[-max(8, a.clip_tokens - len(t)):]
    if len(p) + len(t) > a.max_len or not t:
        return None
    return p + t, [-100] * len(p) + t


def load(path, limit=0):
    rows = [json.loads(l) for l in open(path)]
    random.Random(7).shuffle(rows)
    if limit:
        rows = rows[:limit]
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
    lens = sorted(len(x[0]) for x in data) or [0]
    print(f"{path}: examples {len(rows)} usable {len(data)} skipped {skipped} | tokens per example median {lens[len(lens) // 2]} max {lens[-1]} "
          f"| reply tokens mean {sum(sum(1 for l in x[1] if l != -100) for x in data) / max(1, len(data)):.0f}", flush=True)
    if data:
        ids, labels = data[0]
        n = sum(1 for l in labels if l != -100)
        print("SAMPLE prompt end:", repr(tok.decode(ids[len(ids) - n - 12: len(ids) - n])), flush=True)
        print("SAMPLE reply:", repr(tok.decode([l for l in labels if l != -100])[:300]), flush=True)
    return rows, data


smoke_set = load(a.smoke_data, 60)[1] if a.smoke_data else None
if not a.smoke_data:
    rows, data = load(a.data)
    hold, train = data[: a.holdout], data[a.holdout:]

if a.tiny:
    from transformers import AutoConfig
    cfg = AutoConfig.from_pretrained(a.model)
    t_, v_ = cfg.text_config, cfg.vision_config
    t_.hidden_size, t_.intermediate_size, t_.num_hidden_layers, t_.num_attention_heads, t_.num_key_value_heads, t_.head_dim = 64, 128, 8, 4, 2, 16
    t_.layer_types = t_.layer_types[:8]
    v_.hidden_size, v_.intermediate_size, v_.out_hidden_size, v_.depth, v_.num_heads = 32, 64, 64, 2, 2
    torch.manual_seed(0)   # the same tiny model every time, so two runs (say, with and without the fast kernels) can be compared
    model = AutoModelForImageTextToText.from_config(cfg).to(dev)
    a.from_layer = min(a.from_layer, 5)
else:
    model = AutoModelForImageTextToText.from_pretrained(a.model, dtype=torch.bfloat16, device_map={"": 0})
print(f"loaded {type(model).__name__} in {time.time() - t_start:.0f}s", flush=True)
lm, head = model.model.language_model, model.lm_head
n_layers = len(lm.layers)
# LoRA on every big projection of layers from_layer and up, in the language model only (the picture tower is left alone)
names = "q_proj|k_proj|v_proj|o_proj|in_proj_qkv|in_proj_z|out_proj|gate_proj|up_proj|down_proj"
layers = "|".join(str(i) for i in range(a.from_layer, n_layers))
cfg_l = LoraConfig(r=a.rank, lora_alpha=2 * a.rank, lora_dropout=0.05, target_modules=rf"model\.language_model\.layers\.({layers})\..*\.({names})")
model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
model = get_peft_model(model, cfg_l)
model.print_trainable_parameters()
base = model.get_base_model()
lm, head = base.model.language_model, base.lm_head
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)


def loss_of(ids, labels):
    """Next-token loss on the reply's own tokens. The vocabulary projection runs only at those positions."""
    x = torch.tensor([ids], device=dev)
    y = torch.tensor(labels[1:], device=dev)
    keep = (y != -100).nonzero(as_tuple=True)[0]
    hidden = lm(input_ids=x).last_hidden_state[0, :-1]
    return torch.nn.functional.cross_entropy(head(hidden[keep]).float(), y[keep])


@torch.no_grad()
def holdout_loss():
    model.eval()
    v = [loss_of(*h).item() for h in hold]
    model.train()
    return sum(v) / max(1, len(v))


def peak():
    return f"{torch.cuda.max_memory_allocated() / 2**30:.1f} GB" if dev == "cuda" else "cpu"


too_long = 10**9   # set when an example runs out of memory: examples at least this long are skipped from then on
model.train()
if a.smoke:
    pool = sorted(smoke_set if smoke_set is not None else train, key=lambda x: len(x[0]))
    # a warm-up example first (its time is not a measurement), then typical ones, then long ones up to the longest
    spots = [0.5] + [0.5] * max(1, a.smoke - 3) + [0.9, 1.0]
    longest = [pool[min(len(pool) - 1, int(q * (len(pool) - 1)) + (k % 3 if q == 0.5 else 0))] for k, q in enumerate(spots[: max(2, a.smoke)])]
    fits = 0
    for n_smoke, (ids, labels) in enumerate(longest):
        if dev == "cuda":
            torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        try:
            loss = loss_of(ids, labels)
            loss.backward()
        except torch.OutOfMemoryError:   # an example too long for this card is left out, it never stops the run
            too_long = min(too_long, len(ids))
            loss = None
            opt.zero_grad(); torch.cuda.empty_cache()
            print(f"SMOKE {len(ids)} tokens: out of memory, examples this long or longer are left out", flush=True)
            continue
        fits += 1
        got = sum(1 for p in model.parameters() if p.requires_grad and p.grad is not None and p.grad.abs().sum() > 0)
        print(f"SMOKE {len(ids)} tokens: loss {loss.item():.4f}, {time.time() - t0:.1f}s{' (warm-up)' if n_smoke == 0 else ''}, peak memory {peak()}, "
              f"LoRA tensors with a gradient {got}", flush=True)
        opt.zero_grad()
    if not fits:
        print("SMOKE FAILED: no example fits in memory", flush=True)
        raise SystemExit(4)
    print("SMOKE OK", flush=True)
    if not a.smoke_data or a.smoke_only:
        raise SystemExit(0)
    waited, k = time.time(), 0
    while not os.path.exists(a.data):
        if time.time() - waited > a.wait_minutes * 60:
            print(f"NO DATA: {a.data} did not appear in {a.wait_minutes} minutes", flush=True)
            raise SystemExit(3)
        # real work while waiting: a rented box whose GPU sits idle for five minutes is taken away, and sleeping does not count
        with torch.no_grad():
            ids, labels = smoke_set[k % len(smoke_set)]
            if len(ids) < too_long:
                loss_of(ids, labels)
        k += 1
        time.sleep(0.5)
    time.sleep(3)   # let the writer finish
    rows, data = load(a.data)
    hold, train = data[: a.holdout], data[a.holdout:]
    print(f"train {len(train)} holdout {len(hold)} after waiting {time.time() - waited:.0f}s", flush=True)
    if dev == "cuda":
        torch.cuda.reset_peak_memory_stats()

total = max(1, math.ceil(len(train) * a.epochs / a.accum))
warm = max(1, int(0.06 * total))
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * max(0.05, (total - s) / total))
t_start = time.time()   # the minutes allowed count from here: loading, the smoke test and the wait are not training
log = {"model": a.model, "examples": len(rows), "train": len(train), "holdout": len(hold), "from_layer": a.from_layer, "layers": n_layers, "rank": a.rank,
       "lr": a.lr, "accum": a.accum, "epochs_planned": a.epochs, "holdout_loss": []}
PROGRESS = os.path.join(a.adapter, "progress.json")
start, step = 0, 0
if a.resume and os.path.exists(PROGRESS) and os.path.exists(os.path.join(a.adapter, "adapter_model.safetensors")):
    from peft import set_peft_model_state_dict
    from safetensors.torch import load_file
    was = json.load(open(PROGRESS))
    if was.get("train") != len(train) or was.get("rank") != a.rank or was.get("from_layer") != a.from_layer:
        print(f"CANNOT RESUME: what is saved was trained on {was.get('train')} examples at rank {was.get('rank')} from layer {was.get('from_layer')}, "
              f"this run has {len(train)} at rank {a.rank} from layer {a.from_layer}", flush=True)
        raise SystemExit(5)
    set_peft_model_state_dict(model, load_file(os.path.join(a.adapter, "adapter_model.safetensors")))
    start, step, h0 = was["pos"], was["step"], was["holdout_before"]
    log["holdout_loss"] = [tuple(x) for x in was.get("holdout_loss", [])]
    for _ in range(step):
        sched.step()
    print(f"RESUMED at example {start} of the planned order, step {step}; holdout loss before training was {h0:.4f}", flush=True)
else:
    if a.init_adapter:
        from peft import set_peft_model_state_dict
        from safetensors.torch import load_file
        set_peft_model_state_dict(model, load_file(os.path.join(a.init_adapter, "adapter_model.safetensors")))
        print(f"started from the trained part in {a.init_adapter}", flush=True)
    h0 = holdout_loss()
    print("holdout loss before", round(h0, 4), flush=True)
    log["holdout_loss"].append((0, h0))
order = []
for ep in range(math.ceil(a.epochs)):
    idx = list(range(len(train)))
    random.Random(ep).shuffle(idx)
    order += idx
order = order[: int(len(train) * a.epochs)]
seen, stopped, t_train, t_saved = 0, False, time.time(), time.time()
left_out = 0


def save_progress(pos):
    """The trained part and where it stands, written so that a half-written file is never read back."""
    model.save_pretrained(a.adapter)
    json.dump({"pos": pos, "step": step, "train": len(train), "rank": a.rank, "from_layer": a.from_layer, "holdout_before": h0,
               "holdout_loss": log["holdout_loss"], "saved_at": time.strftime("%H:%M:%S", time.gmtime())}, open(PROGRESS + ".tmp", "w"))
    os.replace(PROGRESS + ".tmp", PROGRESS)


pos = start - 1
for pos in range(start, len(order)):
    i = order[pos]
    if len(train[i][0]) >= too_long:
        left_out += 1
        continue
    try:
        (loss_of(*train[i]) / a.accum).backward()
    except torch.OutOfMemoryError:
        too_long = min(too_long, len(train[i][0])); left_out += 1
        opt.zero_grad(); torch.cuda.empty_cache()
        print(f"out of memory at {len(train[i][0])} tokens: left out, and so is everything that long", flush=True)
        continue
    seen += 1
    if seen % a.accum == 0:
        torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
        opt.step(); sched.step(); opt.zero_grad(); step += 1
        if step % 5 == 0:
            print(f"step {step}/{total} examples {seen} {(time.time() - t_train) / seen:.1f}s each, {(time.time() - t_start) / 60:.1f} min, peak {peak()}", flush=True)
        if step % 25 == 0:
            hl = holdout_loss()
            log["holdout_loss"].append((step, hl))
            print("holdout loss", step, round(hl, 4), flush=True)
        if step % 25 == 0 or time.time() - t_saved > a.save_minutes * 60:
            save_progress(pos + 1)
            t_saved = time.time()
        if (time.time() - t_start) / 60 > a.max_minutes or (a.until and time.time() > a.until):
            stopped = True
            break
hl = holdout_loss()
log["holdout_loss"].append((step, hl))
log.update({"steps": step, "examples_seen": seen, "left_out_too_long": left_out, "stopped_at_time_limit": stopped, "minutes": (time.time() - t_start) / 60,
            "seconds_per_example": (time.time() - t_train) / max(1, seen)})
save_progress(pos + 1)
json.dump(log, open(a.adapter.rstrip("/") + "-train.json", "w"), indent=1)
print("TRAIN DONE", json.dumps({k: log[k] for k in ("steps", "examples_seen", "left_out_too_long", "minutes", "stopped_at_time_limit", "seconds_per_example")}),
      "holdout loss", round(h0, 4), "->", round(hl, 4), flush=True)

if a.out:
    t0 = time.time()
    merged = model.merge_and_unload()
    merged.save_pretrained(a.out, max_shard_size="10GB")
    for f in os.listdir(a.model):   # everything that is not weights: tokenizer, chat template, picture pre-processing settings
        src = os.path.join(a.model, f)
        if os.path.isfile(src) and not f.endswith(".safetensors") and f not in ("config.json", "model.safetensors.index.json") and not os.path.exists(os.path.join(a.out, f)):
            shutil.copy(src, os.path.join(a.out, f))
    print(f"MERGED and saved to {a.out} in {time.time() - t0:.0f}s", flush=True)
