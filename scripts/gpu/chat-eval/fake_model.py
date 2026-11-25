"""A stand-in for the model server, for dry runs without a GPU. It answers the chat-completions calls the translator
(responses_shim.py) makes, with canned behaviour chosen by the person's message: a plain answer, a look at the day, a look
for free time followed by a save, or a call with an invented amount. Some of what it says is wrong on purpose (an offer for
"this evening", a block in the past, a made-up price), so the guard's checks, the retries, the recording, the filter and the
quality-check export are all exercised by a dry run. It is never a teacher: nothing it writes is kept for training.

  python3 scripts/gpu/chat-eval/fake_model.py --port 8000
"""
import argparse, hashlib, json, re, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8000)
ARGS = ap.parse_args()


def text_of(c):
    return c if isinstance(c, str) else json.dumps(c or "")


def reply(body):
    msgs = body.get("messages") or []
    tools = {t["function"]["name"] for t in body.get("tools") or []}
    last = msgs[-1] if msgs else {"role": "user", "content": ""}
    system = " ".join(text_of(m.get("content")) for m in msgs if m["role"] in ("system", "developer"))
    today = (re.search(r"Today is (\d{4}-\d\d-\d\d)", system) or [None, "2026-11-21"])[1]
    asked = next((text_of(m.get("content")) for m in reversed(msgs) if m["role"] == "user"), "").split("<house_")[0].strip()
    pick = int(hashlib.md5(asked.encode()).hexdigest(), 16) % 4
    since = 0
    for m in reversed(msgs):
        if m["role"] == "user":
            break
        since += m["role"] == "tool"

    def call(name, args):
        return {"role": "assistant", "content": "", "tool_calls": [{"id": "call_" + uuid.uuid4().hex[:10], "type": "function",
                                                                    "function": {"name": name, "arguments": json.dumps(args)}}]}

    def say(text):
        return {"role": "assistant", "content": text}

    if "<house_check>" in text_of(last.get("content")):   # sent back by the guard: the second try is clean
        return say("Okay. Tell me what you would like to do next.")
    if last["role"] == "user":
        if pick == 1 and "get_daily_briefing" in tools:
            return call("get_daily_briefing", {})
        if pick == 2 and "find_free_time" in tools:
            return call("find_free_time", {"from": today, "to": today, "minMinutes": 60})
        if pick == 3 and "check_affordability" in tools:
            return call("check_affordability", {"amount": 777, "when": "this_week"})
        return say("Got it. Want me to block study time this evening?")
    if last["role"] == "tool":
        if pick == 2 and since == 1 and "create_events" in tools:
            return call("create_events", {"events": [{"title": "Study block", "date": today, "startTime": "08:00", "endTime": "09:00", "kind": "study"}]})
        if pick == 1:
            return say("You have a study block at 2:15 PM today. Want me to move it?")
        return say("That is looked up. I'll remind you tomorrow.")
    return say("Okay.")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send({"object": "list", "data": [{"id": "fake", "object": "model"}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        m = reply(body)
        self.send({"id": "chatcmpl-" + uuid.uuid4().hex[:12], "object": "chat.completion", "created": int(time.time()), "model": body.get("model", "fake"),
                   "choices": [{"index": 0, "message": m, "finish_reason": "tool_calls" if m.get("tool_calls") else "stop"}],
                   "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}})


ThreadingHTTPServer(("127.0.0.1", ARGS.port), H).serve_forever()
