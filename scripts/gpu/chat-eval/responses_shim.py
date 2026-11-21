"""A small translator: the app's OpenAI provider speaks the Responses API (streamed); open model servers (vLLM) speak
chat completions best. This takes a Responses request, sends it to the server as chat completions (with tools), and
streams back the few Responses events the app reads: response.output_text.delta and response.completed (with the
message and function_call items and token usage). Stdlib only. Made for the step 2 eval on a rented GPU; not for the app.

  python responses_shim.py --upstream http://127.0.0.1:8000/v1 --port 8100 [--no-think]
"""
import argparse, json, sys, threading, time, uuid, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--upstream", default="http://127.0.0.1:8000/v1")
ap.add_argument("--port", type=int, default=8100)
ap.add_argument("--no-think", action="store_true", help="ask Qwen3-style templates to skip thinking")
ap.add_argument("--max-tokens", type=int, default=2048, help="used when the request has no max_output_tokens")
ap.add_argument("--think", choices=["on", "off", "default"], default="default", help="thinking for templates with a switch (Qwen3, Gemma 4)")
ap.add_argument("--reasoning-effort", default=None, help="for gpt-oss: low, medium or high")
ap.add_argument("--temperature", type=float, default=0.2)
ap.add_argument("--system-append", default=None, help="a text file added to the system prompt sent to the model (our own-model house rules); "
                "the --dump keeps the app's original prompt, so a student trained on the dump learns the behaviour without the rules")
ap.add_argument("--log", default="shim.jsonl")
ap.add_argument("--dump", default=None, help="write each tagged request (X-Conv-Id header) and reply in chat format, for training data")
ARGS = ap.parse_args()
APPEND = open(ARGS.system_append).read() if ARGS.system_append else ""
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


def call_upstream(body):
    original = to_messages(body)
    sent = [dict(m) for m in original]
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
    if think != "default":
        req["chat_template_kwargs"] = {"enable_thinking": think == "on"}
    if ARGS.reasoning_effort:
        req["reasoning_effort"] = ARGS.reasoning_effort
    data = json.dumps(req).encode()
    r = urllib.request.Request(ARGS.upstream + "/chat/completions", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=900) as resp:
        return {**req, "messages": original}, json.loads(resp.read())


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
        conv = self.headers.get("X-Conv-Id")
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
                          "text": text[:300]})


if __name__ == "__main__":
    print(f"shim on :{ARGS.port} -> {ARGS.upstream}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", ARGS.port), H).serve_forever()
