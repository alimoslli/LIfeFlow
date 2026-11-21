"""A small translator: the app's OpenAI provider speaks the Responses API (streamed); open model servers (vLLM) speak
chat completions best. This takes a Responses request, sends it to the server as chat completions (with tools), and
streams back the few Responses events the app reads: response.output_text.delta and response.completed (with the
message and function_call items and token usage). Stdlib only. Made for the step 2 eval on a rented GPU; not for the app.

  python responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 [--no-think]
"""
import argparse, json, re, sys, threading, time, uuid, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--upstream", default="http://127.0.0.1:8000/v1")
ap.add_argument("--port", type=int, default=8100)
ap.add_argument("--no-think", action="store_true", help="ask Qwen3-style templates to skip thinking")
ap.add_argument("--max-tokens", type=int, default=2048, help="used when the request has no max_output_tokens")
ap.add_argument("--think", choices=["on", "off", "default"], default="default", help="thinking for templates with a switch (Qwen3, Gemma 4)")
ap.add_argument("--think-after-tools", action="store_true", help="thinking off while it picks a tool (fast), on once it has results to answer from "
                "(careful with figures and with leaving nothing out); overrides --think")
ap.add_argument("--reasoning-effort", default=None, help="for gpt-oss: low, medium or high")
ap.add_argument("--temperature", type=float, default=0.2)
ap.add_argument("--system-append", default=None, help="a text file added to the system prompt sent to the model (our own-model house rules); "
                "the --dump keeps the app's original prompt, so a student trained on the dump learns the behaviour without the rules")
ap.add_argument("--remind", default=None, help="a text file of short reminders put at the very end of what the model reads, where it follows them best: "
                "parts split by a line of ---: before the first tool call of a message, then one part per number of tool calls made so far "
                "({n} and {used} are filled in; the last part serves every higher count). Like --system-append, only what is sent changes; the --dump keeps the app's messages")
ap.add_argument("--guard", action="store_true", help="our own checks around the model, the same idea as the app's (the code decides, not the model): "
                "a saving tool called when the person only asked a question is sent back once; an answer with an amount that is in no "
                "tool result is sent back once; bold marks and long dashes are taken out of the answer")
ap.add_argument("--log", default="shim.jsonl")
ap.add_argument("--dump", default=None, help="write each tagged request (X-Conv-Id header) and reply in chat format, for training data")
ARGS = ap.parse_args()
APPEND = open(ARGS.system_append).read() if ARGS.system_append else ""
REMIND = [p.strip() for p in open(ARGS.remind).read().split("\n---\n")] if ARGS.remind else []
LOCK = threading.Lock()  # requests run on threads; one writer at a time


def append(path, obj):
    with LOCK, open(path, "a") as f:
        f.write(json.dumps(obj) + "\n")


def text_of(content):
    if isinstance(content, str):
        return content
    return "".join(p.get("text", "") for p in content or [] if p.get("type") in ("input_text", "output_text", "text"))


def to_messages(body):
    msgs = []
    if body.get("instructions"):
        msgs.append({"role": "system", "content": body["instructions"]})
    for item in body.get("input") or []:
        t = item.get("type")
        if t == "function_call":
            call = {"id": item["call_id"], "type": "function", "function": {"name": item["name"], "arguments": item.get("arguments") or "{}"}}
            if msgs and msgs[-1]["role"] == "assistant" and "tool_calls" in msgs[-1]:
                msgs[-1]["tool_calls"].append(call)
            else:
                msgs.append({"role": "assistant", "content": None, "tool_calls": [call]})
        elif t == "function_call_output":
            msgs.append({"role": "tool", "tool_call_id": item["call_id"], "content": item.get("output") or ""})
        elif t == "reasoning":
            continue
        else:  # a message: {role, content} or {type: message, role, content: [...]}
            role = item.get("role", "user")
            if role == "developer":
                role = "system"
            msgs.append({"role": role, "content": text_of(item.get("content"))})
    return msgs


def to_tools(tools):
    out = []
    for t in tools or []:
        if t.get("type") == "function":
            out.append({"type": "function", "function": {"name": t["name"], "description": t.get("description", ""), "parameters": t.get("parameters") or {"type": "object", "properties": {}}}})
    return out


def used_calls(sent):
    """Names of the tools called since the person's last message."""
    used = []
    for m in reversed(sent):
        if m["role"] == "user":
            break
        if m["role"] == "assistant":
            used = [c["function"]["name"] for c in m.get("tool_calls") or []] + used
    return used


def remind(sent):
    """Adds the reminder for this step to the last message the model reads (the person's message, or the last tool result).
    Parts of the file: [0] before the first tool call, [k] after k tool calls (the last part serves every higher count)."""
    if not REMIND or not sent:
        return
    last = sent[-1]
    asked = last_user(sent)
    extra = []
    if last["role"] == "user":
        note = REMIND[0]
    elif last["role"] == "tool":
        used = used_calls(sent)
        part = REMIND[min(len(used), len(REMIND) - 1)] if len(REMIND) > 1 else ""
        note = part.replace("{n}", str(len(used))).replace("{used}", ", ".join(used))
        # Our code reads the person's words; the model is told, not asked, what they did and did not ask for.
        if ORDER_TO_BOOK.search(asked) and not only_a_question(asked) and "find_free_time" in used and not any(WRITE_TOOL.match(u) for u in used):
            extra.append("They asked you to find the time for them, so finish the job: pick the best slot in the result and save it now with create_events (one call), then say what you booked with its day and time.")
    else:
        return
    if only_a_question(asked):
        extra.append("They only asked whether it would fit or work. Look, answer, and save nothing; offer to save it.")
    note = "\n".join([note] + ["- " + e for e in extra]).strip()
    if note:
        last["content"] = (last["content"] or "") + "\n\n<house_reminder>\n" + note + "\n</house_reminder>"


ORDER_TO_BOOK = re.compile(r"\b(find me|book (it|me|a|an|the|that|this|one)|block (out|off|me|a|an|the|some|it)|schedule (it|me|a|an|the|that|this)|put (it|this|that|them) on (my|the) calendar)\b", re.I)
WRITE_TOOL = re.compile(r"^(create|update|delete|add|set|move|mark|log|save|record|remember|make|resolve|complete|schedule|book|cancel|archive|contribute|shift|split)_")
# The person asked someone to do something: an order ("add ...", "find me ...", "block ..."), or "can you / please / go ahead".
ASKS = re.compile(r"\b(can you|could you|will you|would you|please|go ahead|do it|do that|yes|yeah|sure|ok|okay|find me|get me|give me|help me (add|book|block|plan|schedule|set)|i need you to|i want you to|remind me|add|create|put|schedule|book|block|move|reschedule|delete|remove|cancel|set up|log|save|track|mark|update|change|rename|split|record|remember|note|sign me up)\b", re.I)
# ...unless the whole message is only a question about whether something would fit or work.
ONLY_ASKS_IF = re.compile(r"\b(does|would|will|could|can|is|should|do)\s+(that|this|it|i)\b[^.?!]*\?\s*$", re.I)
MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d{1,2})?)")
DECIMAL = re.compile(r"(?<![\d.$,])(\d+\.\d+)(?![\d.])")


def last_user(msgs):
    for m in reversed(msgs):
        if m["role"] == "user":
            return m["content"] or ""
    return ""


def only_a_question(text):
    """True when the person asked whether something fits or works and did not ask for anything to be saved."""
    t = text.strip()
    if not ONLY_ASKS_IF.search(t):
        return False
    return not re.search(r"\b(can you|could you|will you|would you|please|go ahead|add it|book it|put it|schedule it|set it up|block it|save it)\b", t, re.I)


def num(s):
    try:
        return f"{float(s.replace(',', '')):.2f}"
    except ValueError:
        return None


def known_numbers(msgs):
    seen = set()
    for m in msgs:
        if m["role"] not in ("tool", "user"):
            continue
        text = m["content"] if isinstance(m["content"], str) else json.dumps(m["content"])
        for x in re.findall(r"\d[\d,]*(?:\.\d+)?", text or ""):
            v = num(x)
            if v:
                seen.add(v)
        for c in re.findall(r"[Cc]ents\"?:\s*(-?\d+)", text or ""):
            seen.add(f"{abs(int(c)) / 100:.2f}")
    return seen


def guard_note(original, msg):
    """What is wrong with this reply, as one note to send back to the model; None when it is fine."""
    calls = [c["function"]["name"] for c in msg.get("tool_calls") or []]
    writes = [c for c in calls if WRITE_TOOL.match(c)]
    if writes and only_a_question(last_user(original)):
        return ("They only asked whether it would fit or work. They did not ask you to save anything, so do not call " + ", ".join(writes) +
                ". Answer the question from what you have and offer to save it.")
    if calls:
        return None
    text = (msg.get("content") or "").split("</think>")[-1]
    if not any(m["role"] == "tool" for m in original):
        return None
    known = known_numbers(original)
    bad = [m.group(0) for m in MONEY.finditer(text) if num(m.group(1)) not in known] + [m.group(1) for m in DECIMAL.finditer(text) if num(m.group(1)) not in known]
    if bad:
        return ("These figures are not in any result: " + ", ".join(sorted(set(bad))[:6]) + ". Write the answer again using only figures copied exactly "
                "from the results, with cents. Do not add, subtract, round or estimate.")
    return None


def clean(text):
    """The skyling never writes bold marks or long dashes; taking them out is safer than hoping."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\s*\u2014\s*", ", ", text)
    return text.replace("\u202f", " ").replace("\u00a0", " ").replace("\u2011", "-")


def post(req):
    data = json.dumps(req).encode()
    r = urllib.request.Request(ARGS.upstream + "/chat/completions", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=900) as resp:
        return json.loads(resp.read())


def call_upstream(body):
    original = to_messages(body)
    sent = [dict(m) for m in original]
    remind(sent)
    if APPEND:
        if sent and sent[0]["role"] == "system":
            sent[0]["content"] = sent[0]["content"] + "\n" + APPEND
        else:
            sent.insert(0, {"role": "system", "content": APPEND.strip()})
    req = {"model": body["model"], "messages": sent, "max_tokens": body.get("max_output_tokens") or ARGS.max_tokens, "temperature": ARGS.temperature}
    tools = to_tools(body.get("tools"))
    if tools:
        req["tools"] = tools
        req["tool_choice"] = "auto"
        if body.get("parallel_tool_calls") is not None:
            req["parallel_tool_calls"] = bool(body["parallel_tool_calls"])
    think = "off" if ARGS.no_think else ARGS.think
    if ARGS.think_after_tools:
        think = "on" if sent and sent[-1]["role"] == "tool" else "off"
    if think != "default":
        req["chat_template_kwargs"] = {"enable_thinking": think == "on"}
    if ARGS.reasoning_effort:
        req["reasoning_effort"] = ARGS.reasoning_effort
    chat = post(req)
    if ARGS.guard:
        note = guard_note(original, chat["choices"][0]["message"])
        if note:
            again = [dict(m) for m in sent]
            again[-1]["content"] = (again[-1]["content"] or "") + "\n\n<house_check>\n" + note + "\n</house_check>"
            second = post({**req, "messages": again})
            # keep the second reply only if it is clean; otherwise the first stands (never loop)
            if not guard_note(original, second["choices"][0]["message"]):
                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    second.setdefault("usage", {})[k] = (second.get("usage") or {}).get(k, 0) + (chat.get("usage") or {}).get(k, 0)
                chat = second
                chat["guard"] = note[:80]
        m = chat["choices"][0]["message"]
        # One tool call per step: the model then reads each result (and the reminder with the count) before it may call again.
        if len(m.get("tool_calls") or []) > 1:
            m["tool_calls"] = m["tool_calls"][:1]
        # Words written next to a tool call are narration ("Let me check"); the skyling never narrates.
        if m.get("tool_calls"):
            m["content"] = ""
        if m.get("content"):
            m["content"] = clean(m["content"])
    return {**req, "messages": original}, chat


def to_response(body, chat, rid):
    choice = chat["choices"][0]
    msg = choice["message"]
    output = []
    text = msg.get("content") or ""
    # Qwen3 and others may leave a thinking block in the text; the app must never show it.
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    text = text.strip()
    if text:
        output.append({"type": "message", "id": "msg_" + rid, "status": "completed", "role": "assistant",
                       "content": [{"type": "output_text", "text": text, "annotations": []}]})
    for tc in msg.get("tool_calls") or []:
        output.append({"type": "function_call", "id": "fc_" + uuid.uuid4().hex[:12], "call_id": tc.get("id") or "call_" + uuid.uuid4().hex[:12],
                       "name": tc["function"]["name"], "arguments": tc["function"].get("arguments") or "{}", "status": "completed"})
    u = chat.get("usage") or {}
    usage = {"input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0),
             "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0},
             "total_tokens": u.get("total_tokens", 0)}
    cut = choice.get("finish_reason") == "length"
    resp = {"id": "resp_" + rid, "object": "response", "created_at": int(time.time()), "model": body["model"],
            "status": "incomplete" if cut else "completed", "output": output, "usage": usage,
            "incomplete_details": {"reason": "max_output_tokens"} if cut else None, "error": None}
    return text, resp


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def sse(self, obj):
        chunk = f"event: {obj['type']}\ndata: {json.dumps(obj)}\n\n".encode()
        self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
        self.wfile.flush()

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/responses"):
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        rid = uuid.uuid4().hex[:16]
        t0 = time.time()
        try:
            req, chat = call_upstream(body)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:2000]
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            out = json.dumps({"error": {"message": msg, "type": "upstream_error"}}).encode()
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)
            append(ARGS.log, {"rid": rid, "error": msg[:500]})
            return
        text, resp = to_response(body, chat, rid)
        conv = self.headers.get("X-Conv-Id") or "eval"
        if ARGS.dump and conv:
            m = chat["choices"][0]["message"]
            reply = {"role": "assistant", "content": m.get("content") or "", "tool_calls": m.get("tool_calls") or []}
            append(ARGS.dump, {"conv": conv, "rid": rid, "messages": req["messages"], "tools": req.get("tools", []), "reply": reply,
                               "reasoning": m.get("reasoning_content") or m.get("reasoning"), "finish": chat["choices"][0].get("finish_reason"),
                               "usage": chat.get("usage")})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        seq = 0
        self.sse({"type": "response.created", "sequence_number": seq, "response": {**resp, "status": "in_progress", "output": []}})
        if text:
            for i in range(0, len(text), 40):
                seq += 1
                self.sse({"type": "response.output_text.delta", "sequence_number": seq, "item_id": "msg_" + rid, "output_index": 0, "content_index": 0, "delta": text[i:i + 40]})
        seq += 1
        self.sse({"type": "response.incomplete" if resp["status"] == "incomplete" else "response.completed", "sequence_number": seq, "response": resp})
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()
        append(ARGS.log, {"rid": rid, "secs": round(time.time() - t0, 2), "in": resp["usage"]["input_tokens"],
                          "out": resp["usage"]["output_tokens"], "tools": [o["name"] for o in resp["output"] if o["type"] == "function_call"],
                          "text": text[:300], **({"guard": chat["guard"]} if chat.get("guard") else {})})


if __name__ == "__main__":
    print(f"shim on :{ARGS.port} -> {ARGS.upstream}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", ARGS.port), H).serve_forever()
