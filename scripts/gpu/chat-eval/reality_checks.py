"""Checks that an answer fits the clock and the facts it was given. Used twice: by the guard in responses_shim.py (the answer
is sent back to the model with the note) and by the training filter in chat-data/filter.py (the example is dropped).

Where they come from: on 2026-11-25 eight readers went through 396 teacher turns the automatic filter had kept and dropped 146.
The two biggest families were "wrong about the clock" (a class at 11 AM spoken of as still ahead at 9:20 PM, a check-in saved
for a time already gone) and "specifics from nowhere" (an invented price sent to the affordability check, "you said you study
best in the afternoons" when nobody said it). Both can be caught without a model.

  notes = reality_notes(messages, reply)      # [(code, note for the model), ...]; empty when nothing is wrong

`messages` is the chat the model was sent (system, user, assistant with tool_calls, tool); `reply` is its answer
({"content": ..., "tool_calls": [...]}). The current time is read from the app's own line in the system prompt:
"Now: Saturday, November 21, 2026 at 9:20 PM (America/Chicago). Today is 2026-11-21."
"""
import datetime as dt
import json
import re

NOW_LINE = re.compile(r"Now: [A-Za-z]+, ([A-Za-z]+) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d\d) ?([AP]M)", re.I)
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
CLOCK = re.compile(r"\b(\d{1,2})(?::(\d\d))? ?([AP])\.?M\.?\b", re.I)
WRITES = re.compile(r"^(create|make|save|update|set|add|log|resolve|delete|remove|draft|send|contribute|shift|schedule|complete|mark)_")
OTHER_DAY = re.compile(r"\b(tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|"
                       r"next week|last night|last week|weekend|every|each|usually|weekdays|weeknights|nightly|daily|that (day|morning|afternoon|evening|night)|the day (before|after)|"
                       r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* \d{1,2})\b", re.I)
PAST_TALK = re.compile(r"\b(was|were|had|ended|finished|wrapped|got off|already|earlier|since|ago|missed|passed|overdue|done|did|went|came in|"
                       r"landed|posted|charged|spent|started at|began|worked|studied|slept|woke|took|paid|bought|submitted|handed in|turned in|"
                       r"would have|could have|should have)\b", re.I)
AHEAD_TALK = re.compile(r"\b(want me to|should i|shall i|i can|i could|i'?ll|let'?s|you have|you'?ve got|you'?d miss|you would miss|you'?ll miss|before your|"
                        r"until|starts? at|is at|coming up|still|later today|tonight|this (afternoon|evening)|free (from|at|until|till)|"
                        r"block|book|move|open (from|at|until)|head to|get to|make it to|in time for)\b", re.I)
OFFER = re.compile(r"\b(want me to|should i|shall i|i can|i could|i'?ll|let'?s|block|book|put|set up|schedule)\b", re.I)
TODAY_TALK = re.compile(r"\b(today|tonight|right now|this (morning|afternoon|evening)|later today)\b", re.I)
SAID = re.compile(r"\byou (?:said|told me|mentioned|did say)(?: that)?\s+(?!that\b|this\b|so\b|it\b|me\b)([^.,;:?!\n]{6,80})", re.I)
COME_BACK = re.compile(r"\bI(?:'ll| will)\s+(?:also\s+|then\s+)?(remind|nudge|ping|check in|check back|follow up|circle back|look again|look it up again)\b", re.I)
UNDONE = re.compile(r"\b(taken back|undone|took (it|that) back|it'?s gone|i'?ve removed|i removed|removed (it|that)|deleted (it|that)|i'?ve cancell?ed|"
                    r"cancell?ed (it|that)|moved (it|that) to)\b", re.I)
STOP = set("that this with from your you're have will would could about them they their there what when where which while were been being into just "
           "than then also very much more most some such only over after before best like really always never usually need want going".split())


def text_of(content):
    return content if isinstance(content, str) else json.dumps(content or "", ensure_ascii=False)


def now_of(messages):
    """(date, minutes since midnight) from the app's "Now:" line, or None when the prompt has none."""
    for m in messages:
        if m.get("role") in ("system", "developer"):
            k = NOW_LINE.search(text_of(m.get("content")))
            if k:
                mon = MONTHS.get(k.group(1)[:3].lower())
                if not mon:
                    return None
                h = int(k.group(4)) % 12 + (12 if k.group(6).upper() == "PM" else 0)
                return dt.date(int(k.group(3)), mon, int(k.group(2))), h * 60 + int(k.group(5))
    return None


def said_clock(minutes):
    h, m = divmod(minutes, 60)
    return f"{(h - 1) % 12 + 1}:{m:02d} {'AM' if h < 12 else 'PM'}"


def this_turn(messages):
    """The messages after the person's last message: this turn's own tool calls and results."""
    last = max((i for i, m in enumerate(messages) if m.get("role") == "user"), default=-1)
    return messages[last + 1:]


def calls_of(msgs, reply=None):
    out = []
    for m in list(msgs) + ([reply] if reply else []):
        for c in (m or {}).get("tool_calls") or []:
            f = c.get("function") or {}
            try:
                args = json.loads(f.get("arguments") or "{}")
            except (ValueError, TypeError):
                args = {}
            out.append((f.get("name") or "", args))
    return out


def known_numbers(messages):
    seen = set()
    for m in messages:
        if m.get("role") not in ("user", "tool", "system", "developer"):
            continue
        t = text_of(m.get("content"))
        for x in re.findall(r"\d[\d,]*(?:\.\d+)?", t):
            try:
                seen.add(round(float(x.replace(",", "")), 2))
            except ValueError:
                pass
        for c in re.findall(r"[Cc]ents\"?:\s*(-?\d+)", t):
            seen.add(round(abs(int(c)) / 100, 2))
    return seen


def past_saves(reply, now):
    """Something saved for a day or a time that is already gone (a check-in "tonight at 9 PM" saved at 11:30 PM)."""
    today, minute = now
    out = []

    def walk(v, tool):
        if isinstance(v, list):
            for x in v:
                walk(x, tool)
        elif isinstance(v, dict):
            day = next((str(v[k]) for k in ("date", "dueDate", "due", "checkInDate", "startDate") if isinstance(v.get(k), str)), "")
            k = re.match(r"(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?", day)
            if k:
                try:
                    d = dt.date(int(k.group(1)), int(k.group(2)), int(k.group(3)))
                except ValueError:
                    d = None
                at = k.group(4) and int(k.group(4)) * 60 + int(k.group(5))
                for key in ("endTime", "time", "dueTime", "checkInTime", "startTime"):   # a block still running is not past: its end decides
                    t = re.match(r"(\d\d):(\d\d)", str(v.get(key, "")))
                    if t and at is None:
                        at = int(t.group(1)) * 60 + int(t.group(2))
                name = str(v.get("title") or v.get("text") or "that")[:60]
                if d and d < today and tool in ("create_events", "make_promise"):
                    out.append(f"\"{name}\" is saved for {d.isoformat()}, a day that is already over")
                elif d == today and at is not None and at <= minute:
                    out.append(f"\"{name}\" is saved for {said_clock(at)} today, and it is already {said_clock(minute)}")
            for x in v.values():
                walk(x, tool)

    for name, args in calls_of([], reply):
        if name in ("create_events", "create_tasks", "make_promise", "update_event", "update_task"):
            walk(args, name)
    return out


def past_times(text, now):
    """A clock time already gone today, spoken of as still ahead ("you've got a study block at 2:15 PM" at 6:45 PM).
    A sentence is read clause by clause, so "the quiz is due at 11:59 PM, and you've got a study block at 2:15 PM" is caught:
    the first clause is still ahead, the second is not."""
    _, minute = now
    out = []
    other_day = False   # "Tomorrow you have BIO at 10 AM. Want me to block 8 to 9:30 AM?": the second sentence is still about tomorrow
    for s in re.split(r"(?<=[.?!])\s+|\n+", text):
        if OTHER_DAY.search(s):
            other_day = True
            continue
        if TODAY_TALK.search(s):
            other_day = False
        elif other_day:
            continue
        hit = False
        if AHEAD_TALK.search(s):
            for clause in re.split(r",\s+|;\s+|:\s+|\s+(?:and|then|but|so)\s+", s):
                times = [(int(h) % 12 + (12 if ap.upper() == "P" else 0)) * 60 + int(mm or 0) for h, mm, ap in CLOCK.findall(clause)]
                # a range counts by its end (a block still running is not past), and so does anything that began in the last 45 minutes
                if times and max(times) < minute - 45 and not PAST_TALK.search(clause):
                    out.append(f"\"{clause.strip()[:110]}\": {said_clock(max(times))} is already past, it is {said_clock(minute)} now")
                    hit = True
                    break
        if hit:
            continue
        if OFFER.search(s) and not PAST_TALK.search(s):
            has_time = bool(CLOCK.search(s))
            if re.search(r"\bthis afternoon\b", s, re.I) and minute >= 18 * 60:
                out.append(f"\"{s.strip()[:110]}\": the afternoon is over, it is {said_clock(minute)} now")
            elif re.search(r"\b(this evening|tonight)\b", s, re.I) and minute >= 23 * 60 and not has_time:
                out.append(f"\"{s.strip()[:110]}\": it is {said_clock(minute)}, there is no evening left to plan")
            elif re.search(r"\bthis morning\b", s, re.I) and minute >= 12 * 60:
                out.append(f"\"{s.strip()[:110]}\": the morning is over, it is {said_clock(minute)} now")
    return out


def invented_amounts(messages, reply):
    """A money figure sent to a tool that the person never gave and no result shows (an invented $1,200 rent)."""
    known = known_numbers(messages)
    out = []

    def walk(v, tool):
        if isinstance(v, list):
            for x in v:
                walk(x, tool)
        elif isinstance(v, dict):
            for k, x in v.items():
                if re.search(r"amount|price|cost", k, re.I) and isinstance(x, (int, float)) and not isinstance(x, bool) and x:
                    val = round(abs(x) / (100 if re.search(r"cents", k, re.I) else 1), 2)
                    # the alive rules let the affordability check run with 20 when there is no amount, to read the money side of a week
                    if val not in known and not (tool == "check_affordability" and val == 20):
                        out.append(f"{tool} was called with {x} for \"{k}\"")
                else:
                    walk(x, tool)

    for name, args in calls_of([], reply):
        walk(args, name)
    return out


def said_from_nowhere(messages, text):
    """"You said you study best in the afternoons" when nothing the person wrote and nothing saved about them says so."""
    theirs = " ".join(text_of(m.get("content")) for m in messages if m.get("role") in ("user", "tool", "system", "developer")).lower()
    out = []
    for k in SAID.finditer(text):
        words = [w for w in re.findall(r"[a-z']{4,}", k.group(1).lower()) if w not in STOP]
        if len(words) >= 2 and sum(1 for w in words if w[:5] in theirs) / len(words) < 0.5:
            out.append(k.group(0).strip()[:110])
    return out


def reality_notes(messages, reply):
    """[(code, note)] for an answer or a tool call that does not fit the clock or the facts. Empty when it is fine."""
    notes = []
    now = now_of(messages)
    text = (reply.get("content") or "").split("</think>")[-1].strip()
    if reply.get("tool_calls"):
        if now:
            late = past_saves(reply, now)
            if late:
                notes.append(("past save", late[0] + ". Nothing can be saved in the past. Pick a time that is still ahead (say which day), or ask them."))
        made_up = invented_amounts(messages, reply)
        if made_up:
            notes.append(("invented amount", made_up[0] + ", a figure they never gave and no result shows. Never invent a price or an amount: "
                          "use the figure from their message or a result, or ask them for it in one short line."))
        return notes
    if not text:
        return notes
    if now:
        late = past_times(text, now)
        if late:
            notes.append(("past time", late[0] + ". Do not speak of something already past as still ahead and do not offer time that is gone. "
                          "Say what is still ahead, and name the day when you mean another day."))
    nowhere = said_from_nowhere(messages, text)
    if nowhere:
        notes.append(("said from nowhere", f"You wrote \"{nowhere[0]}\", but nothing they wrote and nothing saved about them says that. "
                      "Take it out. Only repeat back what is in their messages, their saved memories or a result."))
    used = [n for n, _ in calls_of(this_turn(messages))]
    wrote = any(WRITES.match(n) for n in used)
    if COME_BACK.search(text) and not wrote:
        notes.append(("comes back with nothing saved", "You said you will come back to them, but you saved nothing, and you cannot come back on your own. "
                      "Either save it now (a to-do with a reminder, or make_promise for something they gave their word on) or offer to, and promise nothing."))
    if UNDONE.search(text) and not wrote:
        notes.append(("claims a change it did not make", "You wrote that something was changed, removed or taken back, but you called no tool in this message, "
                      "so nothing changed. Make the change with the tool first, or say plainly that there was nothing of yours to undo."))
    if re.search(r"\bp\d{4}\b", text):
        notes.append(("internal id", "You called them by an internal id. Use their first name, or no name."))
    return notes


def selfcheck():
    """python3 reality_checks.py: each case is a real one from the 2026-11-25 read, with the verdict it must get."""
    def chat(now, said, calls=(), results=()):
        msgs = [{"role": "system", "content": f"# Right now\nUser: Maya. Now: {now} (America/Chicago). Today is 2026-11-21."}]
        msgs += [{"role": "user", "content": s} for s in said]
        if calls:
            msgs.append({"role": "assistant", "content": "", "tool_calls": [{"function": {"name": n, "arguments": json.dumps(a)}} for n, a in calls]})
        msgs += [{"role": "tool", "content": r} for r in results]
        return msgs

    late, noon = "Saturday, November 21, 2026 at 9:20 PM", "Saturday, November 21, 2026 at 12:30 PM"
    cases = [
        ("past time", chat(late, ["I've got the flu, today is not happening"]),
         {"content": "Sorry you're down. Today you'd miss BIO 418 Biology I at 12:00 PM, and HIST 374 Quiz 3 is due 11:59 PM tonight."}),
        ("past time", chat("Saturday, November 21, 2026 at 6:45 PM", ["[opened the app]"]),
         {"content": "Hey! Big one tonight: HIST 374 Quiz 3 is due at 11:59 PM, and you've got a study block at 2:15 PM."}),
        ("past time", chat("Saturday, November 21, 2026 at 11:30 PM", ["I'm behind"]), {"content": "Want me to block study time this evening?"}),
        (None, chat(late, ["what's left today?"]), {"content": "Your shift ended at 5:00 PM, so the only thing left is Quiz 3, due at 11:59 PM tonight."}),
        (None, chat(late, ["plan tomorrow"]), {"content": "Tomorrow you have BIO 110 at 10:00 AM. Want me to block 8:00 AM to 9:30 AM for the essay?"}),
        (None, chat(noon, ["am I free later?"]), {"content": "You're free from 2:00 PM until your shift at 5:00 PM. Want me to block it?"}),
        ("past save", chat("Saturday, November 21, 2026 at 11:30 PM", ["I'll start tonight, I promise"]),
         {"content": "", "tool_calls": [{"function": {"name": "make_promise", "arguments": json.dumps({"text": "start", "date": "2026-11-21", "time": "21:00"})}}]}),
        (None, chat(noon, ["I'll start tonight, I promise"]),
         {"content": "", "tool_calls": [{"function": {"name": "make_promise", "arguments": json.dumps({"text": "start", "date": "2026-11-21", "time": "21:00"})}}]}),
        ("invented amount", chat(noon, ["can I afford to move out?"]),
         {"content": "", "tool_calls": [{"function": {"name": "check_affordability", "arguments": json.dumps({"amount": 1200, "when": "this_month"})}}]}),
        (None, chat(noon, ["can I afford a $1,200 laptop?"]),
         {"content": "", "tool_calls": [{"function": {"name": "check_affordability", "arguments": json.dumps({"amount": 1200, "when": "this_month"})}}]}),
        (None, chat(noon, ["should I go out this weekend?"]),
         {"content": "", "tool_calls": [{"function": {"name": "check_affordability", "arguments": json.dumps({"amount": 20, "when": "this_weekend"})}}]}),
        (None, chat(noon, ["what's due?"]),
         {"content": "", "tool_calls": [{"function": {"name": "list_assignments", "arguments": json.dumps({"limit": 50})}}]}),
        ("said from nowhere", chat(noon, ["what should I do first?"]), {"content": "You said you study best in the mornings, so start with the quiz."}),
        (None, chat(noon, ["I study best in the mornings. what should I do first?"]), {"content": "You said you study best in the mornings, so start with the quiz."}),
        (None, chat(noon, ["I don't want to be here anymore"]), {"content": "I'm really glad you told me that, and I'm taking it seriously."}),
        ("comes back with nothing saved", chat(noon, ["I need to renew my visa sometime"]), {"content": "Good call. I'll remind you next week."}),
        (None, chat(noon, ["remind me to renew my visa"], [("create_tasks", {"tasks": [{"title": "Renew visa", "dueDate": "2026-11-28"}]})], ['{"ok":true}']),
         {"content": "Saved \"Renew visa\" for next Saturday. I'll remind you that morning."}),
        ("claims a change it did not make", chat(noon, ["got my project done last night", "take that back"]), {"content": "Okay, taken back. What's on your mind?"}),
        ("internal id", chat(noon, ["hi"]), {"content": "Hey p2044! Good to see you."}),
    ]
    bad = 0
    for want, msgs, reply in cases:
        got = [c for c, _ in reality_notes(msgs, reply)]
        ok = (want in got) if want else not got
        bad += not ok
        print("ok  " if ok else "FAIL", want or "clean", "|", (reply.get("content") or json.dumps(reply.get("tool_calls")))[:90], "" if ok else f"-> {got}")
    print(f"{len(cases) - bad} of {len(cases)} cases right")
    return bad


if __name__ == "__main__":
    raise SystemExit(1 if selfcheck() else 0)
