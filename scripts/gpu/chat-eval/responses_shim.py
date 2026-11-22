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
ap.add_argument("--system-append", action="append", default=None, help="(can be given more than once) a text file added to the system prompt sent to the model (our own-model house rules); "
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
APPEND = "\n".join(open(f).read() for f in ARGS.system_append) if ARGS.system_append else ""
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


def house_math(sent):
    """Arithmetic our code does so the model never has to (it slips: 8 subscriptions became "7, $84.44 a month"). From the
    tool results of this message: a yearly total as a monthly one, and how many items of each kind a list holds."""
    lines = []
    for m in reversed(sent):
        if m["role"] == "user":
            break
        if m["role"] != "tool":
            continue
        try:
            data = json.loads(m["content"] or "")
        except ValueError:
            continue
        data = data.get("data", data) if isinstance(data, dict) else data
        if not isinstance(data, dict):
            continue
        for k, v in data.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool) and re.search(r"yearly$", k, re.I) and v:
                lines.append(f"{k} {v:,.2f} a year is {v / 12:,.2f} a month")
            if isinstance(v, list) and len(v) > 1 and all(isinstance(i, dict) and isinstance(i.get("kind"), str) for i in v):
                kinds = {}
                for i in v:
                    kinds[i["kind"]] = kinds.get(i["kind"], 0) + 1
                lines.append(f"{k}: " + ", ".join(f"{n} of kind {kind}" for kind, n in kinds.items()))
            # A list of things that each have a next date (bills, subscriptions): in date order, so "what comes out before
            # Tuesday" is reading down a list, not hunting through one (the small ones at the end got left out).
            if isinstance(v, list) and len(v) > 3 and all(isinstance(i, dict) for i in v):
                dk = next((x for x in v[0] if re.fullmatch(r"next\w*Date", x)), None)
                ak = next((x for x in ("amount", "latestAmount") if x in v[0]), None)
                if dk and ak and all(i.get(dk) and i.get("name") for i in v):
                    # money going out only: expected pay is never counted before it lands (owner's rule)
                    rows = sorted((i for i in v if i.get("kind") != "income"), key=lambda i: i[dk])
                    lines.append(f"{k} going out, in date order: " + ", ".join(f"{i['name']} {i.get(dk + 'Weekday', '')} {i[dk]} ${abs(i[ak]):,.2f}" for i in rows))
            # Days with a load level and hours: which are heavy, and the nearest light one (where work can move first).
            if isinstance(v, list) and len(v) > 2 and all(isinstance(i, dict) and "level" in i and isinstance(i.get("hours"), (int, float)) for i in v):
                name = lambda i: f"{i.get('label') or i.get('date')} ({i.get('dateWeekday', '')}) {i['hours']} hours".replace(" ()", "")
                heavy = sorted((i for i in v if i["level"] == "heavy"), key=lambda i: -i["hours"])
                light = next((i for i in v if i["level"] == "light"), None)
                parts = (["heavy: " + ", ".join(name(i) for i in heavy)] if heavy else []) + (["the nearest light day: " + name(light)] if light else [])
                if parts:
                    lines.append(f"{k} by load, " + "; ".join(parts))
            # Free time: each window in a 12-hour clock with its length in hours, so the model never reads out raw minutes
            # or adds them into one total (the owner got "you have 1,249 minutes free", 2026-11-22).
            if isinstance(v, list) and v and all(isinstance(i, dict) and isinstance(i.get("free"), list) for i in v):
                days = []
                for i in v:
                    wins = [f"{clock(w['start'])} to {clock(w['end'])} ({span(w.get('minutes'))})" for w in i["free"] if isinstance(w, dict) and w.get("start") and w.get("end")]
                    if wins:
                        days.append(f"{i.get('weekday') or i.get('dateWeekday') or i.get('date')}: " + ", ".join(wins))
                if days:
                    lines.append("free time, say it as these windows and never as a total: " + "; ".join(days))
    return lines


def clock(hhmm):
    """ "14:15" -> "2:15 PM" (people's clock); anything else is returned as it is. """
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(hhmm))
    if not m:
        return str(hhmm)
    h, mi = int(m.group(1)), m.group(2)
    return f"{(h - 1) % 12 + 1}:{mi} {'AM' if h < 12 else 'PM'}"


def span(minutes):
    """ 310 -> "5 hours 10 minutes" """
    if not isinstance(minutes, (int, float)):
        return "length not given"
    h, mi = divmod(int(minutes), 60)
    return " ".join(x for x in (f"{h} hour{'s' if h != 1 else ''}" if h else "", f"{mi} minutes" if mi else "") if x) or "0 minutes"


RAW_MINUTES = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d{3,}|9\d)\s*(?:minutes|mins?)\b", re.I)


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
        if used and WRITE_TOOL.match(used[-1]):
            extra.append("You just saved something. Say what it is by the title you gave it, with its day and time, and that it is saved.")
    else:
        return
    if only_a_question(asked):
        extra.append("They only asked whether it would fit or work. Look, answer, and save nothing; offer to save it.")
    math = house_math(sent) if last["role"] == "tool" else []
    if math:
        extra.append("Worked out by LifeFlow from the results, use these figures as they are: " + "; ".join(math) + ".")
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


LOOKS = ("get_agenda", "find_free_time", "life_load", "get_daily_briefing", "tonight")
CLAIMS_SAVE = re.compile(r"^\W*(done[.!,]?\s+)?(i('ve| have)?\s+)?(added|booked|saved|scheduled|created|blocked|logged|moved|deleted|removed|marked|updated|rescheduled|cancell?ed|set up|put)\b", re.I)
WORD_LIMIT = 100


def cut_off(msg):
    """A final answer that stops in the middle of a sentence ("... due Wednesday at 11:59 PM, and B")."""
    text = (msg.get("content") or "").split("</think>")[-1].strip()
    return bool(text) and not msg.get("tool_calls") and not re.search(r"[.?!)\"'\u201d\u2019*:]$", text)


def guard_notes(original, msg):
    """What is wrong with this reply, as notes to send back to the model; empty when it is fine."""
    calls = [c["function"]["name"] for c in msg.get("tool_calls") or []]
    writes = [c for c in calls if WRITE_TOOL.match(c)]
    if writes and only_a_question(last_user(original)):
        return ["They only asked whether it would fit or work. They did not ask you to save anything, so do not call " + ", ".join(writes) +
                ". Answer the question from what you have and offer to save it."]
    # Look before you book: a calendar save with no look at the calendar first in this message is sent back, so a clash is
    # caught before it is saved, not after (2026-11-22: it saved a gym class on top of a shift, then warned about it).
    if "create_events" in calls and not any(u in LOOKS for u in used_calls(original)):
        return ["Look before you book: call get_agenda for that day first (or find_free_time), so a clash is caught before anything is saved. "
                "If the time is taken, say so and book nothing."]
    if calls:
        return []
    notes = []
    text = (msg.get("content") or "").split("</think>")[-1].strip()
    if cut_off(msg):
        notes.append("Your answer stopped in the middle of a sentence. Write the whole answer again, complete.")
    # "Added ..." with no saving tool called in this message: nothing was saved, and the skyling never claims what it did not do.
    if CLAIMS_SAVE.search(text) and not any(WRITE_TOOL.match(u) for u in used_calls(original)):
        notes.append("You wrote that you saved something, but you called no saving tool in this message, so nothing was saved. Call the tool now, "
                     "and only say it is saved after the tool result says so.")
    words = len(text.split())
    if words > WORD_LIMIT:
        notes.append(f"Your answer is {words} words and the limit is {WORD_LIMIT}. Write it again shorter: keep the direct answer and every figure, cut the rest.")
    raw = [m.group(0) for m in RAW_MINUTES.finditer(text)]
    if raw:
        notes.append("Nobody talks in minutes like \"" + raw[0] + "\". Say lengths of time in hours and minutes (\"5 hours 10 minutes\"), "
                     "name the actual free windows with their day and clock times, and never add free time up into one total.")
    if any(m["role"] == "tool" for m in original):
        known = known_numbers(original + [{"role": "tool", "content": " ".join(house_math(original))}])
        bad = [m.group(0) for m in MONEY.finditer(text) if num(m.group(1)) not in known] + [m.group(1) for m in DECIMAL.finditer(text) if num(m.group(1)) not in known]
        if bad:
            notes.append("These figures are not in any result: " + ", ".join(sorted(set(bad))[:6]) + ". Use only figures copied exactly from the results, "
                         "with cents. Do not add, subtract, round or estimate.")
    return notes


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
        m = chat["choices"][0]["message"]
        # Stopped mid-sentence: let it finish the sentence it started.
        if cut_off(m):
            try:
                more = post({**req, "messages": sent + [{"role": "assistant", "content": m["content"]}], "continue_final_message": True, "add_generation_prompt": False})
                rest = (more["choices"][0]["message"].get("content") or "")
                if rest.strip() and not more["choices"][0]["message"].get("tool_calls"):
                    m["content"] = m["content"] + rest
                    chat["guard"] = "finished a cut sentence"
            except urllib.error.HTTPError:
                pass
        notes = guard_notes(original, m)
        if notes:
            again = [dict(x) for x in sent]
            again[-1]["content"] = (again[-1]["content"] or "") + "\n\n<house_check>\n" + "\n".join("- " + n for n in notes) + "\n</house_check>"
            # a cut sentence tends to be cut again at the same word: a warmer second try takes another path
            second = post({**req, "messages": again, **({"temperature": 0.7} if cut_off(m) else {})})
            # the second reply is kept only when it has fewer problems; otherwise the first stands (never a loop)
            if len(guard_notes(original, second["choices"][0]["message"])) < len(notes):
                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    second.setdefault("usage", {})[k] = (second.get("usage") or {}).get(k, 0) + (chat.get("usage") or {}).get(k, 0)
                chat = second
                chat["guard"] = notes[0][:80]
        m = chat["choices"][0]["message"]
        # Still cut after both tries: end at the last whole sentence rather than show half a word.
        if cut_off(m):
            whole = re.match(r"(?s)(.*[.?!])\s+\S[^.?!]*$", (m.get("content") or "").strip())
            if whole and len(whole.group(1)) > 40:
                m["content"] = whole.group(1)
                chat["guard"] = "trimmed a cut sentence"
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
