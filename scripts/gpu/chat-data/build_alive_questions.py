"""The message bank for the training examples, version 2 (2026-11-25).

What changed and why: eight readers went through the first big generation and dropped 146 of 396 turns. Half of the "wrong
about the clock" mistakes began here, not in the model: "I woke up feeling awful, today is a write-off" was asked at a made-up
9:20 PM, a retired widow said "tell my boss I can't come in", and "take that back" followed turns where nothing had been made.
So every message now says which lives and which hours it fits, and a follow-up is chosen by what the first answer will have done:

  {"text": ..., "skill": ..., "source": "alive" | "voice-..." | "seed" | "teacher-...", "family": ...,
   "needs": ["student", "job", "money"],      # the life must have these (generate.ts checks it against the loaded life)
   "hours": [6, 13] | null,                   # the hours of the day a person would type it; null = any time
   "followUp": "undo that",                   # optional second turn, as the author expected it; generate.ts keeps it only
                                              # when it fits what the skyling really did, and picks every later turn itself
   "needsSkill": "paper-pack"}                # only for a skill this branch's app side does not have yet (it exists on main)

Sources: the families below (generic lines with slots), the written messages in messages/*.json (the four voices: working
students, dorm students, adult learners, first-generation and international students; spoken-style.json: what a person says
out loud after speech-to-text; told-schedule.json: a week or a schedule told or pasted as text in one message;
skill-topups.json and skill-main-only.json: messages for skills the bank barely reached), and the base bank from
build_questions.py (the router pilot's messages), tagged here by their own words. The follow-up lines are messages/after.json,
shared with generate.ts. Made up, generic (no names, no courses), so a
message fits every life that has its traits. No message is a test question (the same list build_questions.py leaves out).

  python3 scripts/gpu/chat-data/build_alive_questions.py --base /root/job/questions.json --out /root/job/questions-alive.json \
      --share 0.6 --total 1500
  python3 scripts/gpu/chat-data/build_alive_questions.py --out /tmp/bank.json --total 1500     # no base bank: only these
"""
import argparse, collections, glob, json, random, re
from pathlib import Path

from skill_route import load_skills, router

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--base", default=None, help="build_questions.py output; left out, the bank is only the families and the written voices")
ap.add_argument("--out", required=True)
ap.add_argument("--share", type=float, default=0.6, help="share of the output that is not from the base bank")
ap.add_argument("--total", type=int, default=1500)
ap.add_argument("--seed", type=int, default=25)
ap.add_argument("--skill-floor", type=int, default=12, help="at least this many different messages reach every skill that has written messages "
                "(they take the place of repeats, so the bank only gets more varied); 0 turns it off")
a = ap.parse_args()
rng = random.Random(a.seed)

OBJ = ["my next exam", "my biggest assignment", "my paper", "my lab report", "my homework this week", "studying", "my project",
       "my reading", "my presentation", "everything due this week", "my midterm", "my problem set", "the assignment due first"]
THING = ["gym class", "club meeting", "study group", "dentist appointment", "coffee with a friend", "volunteer shift", "tutoring session", "yoga class"]
DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
HOUR = ["8 AM", "10 AM", "noon", "2 PM", "4 PM", "5 PM", "6 PM", "7 PM"]

# What the same person types next, by what a good first answer will have done (messages/after.json, shared with generate.ts,
# which picks by what the skyling really did).
_after = json.load(open(HERE / "messages" / "after.json"))
AFTER = {k: v for k, v in _after.items() if not k.startswith("_")}
AFTER["offered"] = AFTER["yes"] + AFTER["no"]

# family: (messages, skills, needs, hours, what the first answer does, weight). Hours are [from, to) on a 24-hour clock; 26 = 2 AM.
FAMILIES = {
    "behind": (["I'm so behind on {o}", "I haven't even started {o}", "I'm freaking out about {o}", "I'm swamped and {o} is not getting done",
                "I keep putting off {o}", "I'm way behind on {o}, help", "ugh {o} is going to sink me", "I'm stressed about {o}",
                "no idea how I'll finish {o}"], ["smart-scheduler", "study-coach", "daily-planner", "exam-prep"], ["student"], None, "made", 9),
    "plan": (["could you map out my week for me", "plan my day for me", "I have too much going on, fix it", "help me get ahead on {o}",
              "find me time for {o} and put it on my calendar", "I think I'm going to miss {o}", "block time for {o}", "I need a plan for {o} today",
              "I'm overwhelmed, where do I even start and can you set it up", "set aside time to catch up on {o}"],
             ["smart-scheduler", "daily-planner", "weekly-review"], ["student"], [6, 21], "made", 6),
    "money_worry": (["rent is going to be a problem this month", "I'm worried about money this week", "I'm broke until payday, what do I do",
                     "I think I'm going to overdraw this week", "I can't afford my bills this month", "money is so tight right now",
                     "I overspent this month and I'm panicking", "will I make it to payday?"],
                    ["budget-coach", "paycheck-planner", "purchase-advisor"], ["money"], None, "offered", 5),
    "signup": ([], ["smart-scheduler"], [], None, "made", 4),   # built from THING, DAY and HOUR below
    "done": (["just submitted {o}!!", "finished {o} finally", "handed in {o} this morning", "ok {o} is done", "got {o} done last night",
              "I did it, {o} is turned in"], ["study-coach", "daily-planner"], ["student"], None, "talked", 4),
    "promise": (["I'll start {o} tonight, I promise", "I swear I'm going to work on {o} after dinner", "I'll do {o} tomorrow morning, promise",
                 "I'm going to start {o} right after class, I promise", "I'll finish {o} by Friday, hold me to it"],
                ["study-coach", "daily-planner"], ["student"], None, "promised", 4),
    "breakdown": (["{o} feels huge, break it down for me", "I don't even know where to start with {o}", "{o} is too big, can you break it down",
                   "where do I even start with {o}"], ["study-coach", "exam-prep"], ["student"], None, "made", 4),
    "sick": (["I woke up feeling awful, today is a write-off", "I have a fever, I'm staying in bed today", "I'm sick and can't make it to anything today",
              "I've got the flu, today is not happening"], ["daily-planner"], [], [6, 13], "offered", 4),
    "now": (["what do I tackle first right now?", "what should I work on first?", "I have an hour free, what now?", "what's next for me today?",
             "where do I start today?"], ["daily-planner"], [], [6, 22], "offered", 4),
    "slide": (["this week is overloaded, what can I push off?", "I can't do it all this week, what can I drop?", "too much going on, what can wait?",
               "something has to give this week, what should it be?"], ["weekly-review", "daily-planner"], ["student"], None, "offered", 4),
    "about": (["heads up, my head is clearest before noon", "fyi I can't study after 9 pm, my brain is done", "just so you know, I hate studying on Sundays",
               "for the record I work best in short bursts", "I'm a night person, mornings are useless for me", "heads up, I always need a break after class"],
              ["memory-manager"], [], None, "remembered", 4),
    "cut": (["I have to spend less every month, where do I start?", "where can I save money this month?", "I'm spending too much, what can I cut?",
             "help me trim my subscriptions", "where is my money going and what can I cut back?"], ["subscription-hunter", "budget-coach"], ["money"], None, "offered", 4),
    "bad": (["pretty sure I tanked my quiz", "I failed my midterm", "I did really badly on {o}", "I messed up {o} and I feel awful"],
            ["study-coach", "exam-prep"], ["student"], None, "offered", 4),
    "life": (["I got the internship!!", "I just got hired for a campus job", "today was rough", "today was the best day", "I'm so nervous about tomorrow",
              "hi", "good morning", "yo"], ["daily-planner"], [], None, "talked", 3),
    # The person has said nothing: they opened the chat and the skyling speaks first. After the read of 2026-11-25 not one of
    # these was left in the training set, so they get a weight of their own.
    "opened": (["[opened the app]"], ["daily-planner"], [], None, "offered", 6),
    # The lines a skyling holds every time (the three reviews of 2026-11-25)
    "graded": (["write my intro paragraph for {o}", "just give me the answer to number 4", "my teacher said AI is allowed, write my discussion post",
                "fix my essay and make it sound better", "rewrite this so it doesn't sound like AI wrote it", "can you just do {o} for me",
                "solve these three problems for my homework", "what's the answer to question 7 on my quiz"],
               ["writing-helper", "tutor", "study-coach"], ["student"], None, "declined", 4),
    "move_money": (["move $200 to savings", "pay my rent for me", "transfer $50 to my roommate", "put $100 toward my credit card",
                    "should I get a cash advance to cover rent?", "can you invest my extra money for me"], ["budget-coach", "savings-goals"], ["money"], None, "declined", 3),
    "pay": (["how much will I make this week?", "I get paid Friday so I can afford it, right?", "how much is my next paycheck going to be?",
             "can I spend my paycheck before it lands?"], ["shift-manager", "paycheck-planner"], ["job"], None, "talked", 3),
    "wipe": (["delete everything from last week", "clear my whole calendar", "remove all my to-dos"], ["app-operator"], [], None, "declined", 2),
    "reach": (["email my professor that I'll be late", "message my landlord about rent", "cancel my gym membership for me", "text my roommate that I'll be home late"],
              ["message-drafter"], [], None, "offered", 3),
    "reach_job": (["text my manager I quit", "tell my boss I can't come in tomorrow", "let my manager know I'm running late"], ["message-drafter"], ["job"], None, "offered", 2),
    "health": (["am I depressed?", "do I have ADHD?", "why am I so tired all the time, is something wrong with me?", "should I be taking something for my anxiety?"],
               ["health-basics", "wellbeing-check-in"], [], None, "offered", 3),
    "secret": (["remember my card number 4111 1111 1111 1111", "save my bank password, it's sunflower22", "keep my social security number for me",
                "remember that my PIN is 4821"], ["memory-manager"], [], None, "declined", 2),
    "who": (["are you an AI?", "what model are you?", "are you chatgpt?", "are you a real person?", "who made you?"], ["daily-planner"], [], None, "talked", 3),
    "crisis": (["I don't want to be here anymore", "sometimes I think everyone would be better off without me", "I can't do this anymore, what's the point"],
               ["wellbeing-check-in"], [], None, None, 2),   # never a second turn
    "decide": (["go out tonight or nah", "should I skip the gym and study tonight?", "movie tonight or get ahead on {o}?", "can I afford to go out this weekend?"],
               ["daily-planner", "purchase-advisor"], [], [10, 21], "offered", 3),
    "decide_nap": (["is it dumb to take a nap right now?"], ["daily-planner"], [], [11, 19], "offered", 1),
    "change": (["my next exam got moved up two days", "my class got cancelled tomorrow, what now?", "is there anything I'm forgetting this week?",
                "which day is going to be the worst this week?"], ["smart-scheduler", "weekly-review"], ["student"], None, "offered", 3),
    "change_job": (["they added me to a shift Tuesday 6 to 9, does that work?", "I picked up an extra shift Saturday morning"], ["shift-manager"], ["job"], None, "offered", 2),
    "change_money": (["I think I got charged twice for something", "is my savings goal still realistic?"], ["transaction-review", "savings-goals"], ["money"], None, "offered", 2),
    # Written messages only (no slot lines), added 2026-11-27 for the parts of the app that had no examples:
    # a week or a schedule told or pasted as text in one message (set_up_schedule, a pasted syllabus list, a pasted shift list)
    "setup": ([], ["smart-scheduler", "syllabus-parser", "shift-manager"], [], None, "made", 4),
    # one message for one skill the bank barely reached; each record names its skill
    "ask": ([], ["tutor"], [], None, "talked", 8),
    # the same for a skill that exists only on main (generate.ts skips these until this branch is rebased)
    "newskill": ([], ["study-coach"], [], None, "talked", 3),
}
WORDS = {"setup": 170, "ask": 110}   # the most words a written message may have; 45 for every other family, 70 for a spoken one
VOICE_FAMILY = {"reach": "reach", "change": "change", "decide": "decide"}   # the written voices use the plain family names
DEFAULT_SKILLS = {k: v[1] for k, v in FAMILIES.items()}

TRAIT = {
    "student": re.compile(r"\b(class|classes|homework|assignment|exam|exams|midterm|finals?|quiz|professor|prof|teacher|campus|dorm|dorms|lecture|semester|"
                          r"syllabus|essay|lab report|problem set|study|studying|gpa|grade|grades|tutor|tutoring|course|courses|major|scholarship|"
                          r"financial aid|school|college|university|paper|presentation|discussion post|reading for)\b", re.I),
    "job": re.compile(r"\b(shift|shifts|boss|manager|work schedule|paycheck|pay ?check|payday|get paid|got paid|coworker|clock in|overtime|my job|at work|"
                      r"from work|after work|before work|my hours)\b", re.I),
    "money": re.compile(r"\b(bank|account|budget|subscription|subscriptions|rent|bills?|afford|spend|spending|spent|savings|overdraw|overdraft|charge|"
                        r"charged|refund|money|broke|credit card|debt)\b|\$\d", re.I),
}
HOURS = [
    (re.compile(r"\b(good morning|just woke up|woke up|this morning|slept through|overslept)\b", re.I), [5, 13]),
    (re.compile(r"\b(good night|can't sleep|cant sleep|still up|up late|going to bed|before bed)\b", re.I), [20, 27]),
    (re.compile(r"\b(today was|day was|what a day|long day)\b", re.I), [15, 27]),
    (re.compile(r"\b(tonight|this evening|after dinner|later tonight)\b", re.I), [10, 21]),
    (re.compile(r"\b(this afternoon|after lunch)\b", re.I), [6, 15]),
    (re.compile(r"\b(lunch|at noon)\b", re.I), [8, 14]),
    (re.compile(r"\b(later today|after class today|rest of (the|my) day|today)\b", re.I), [5, 20]),
]


def tags(text, needs=(), hours=None):
    """Traits and hours a message needs, from its own words, on top of what its author said."""
    need = set(needs) | {k for k, p in TRAIT.items() if p.search(text)}
    if hours is None:
        hours = next((h for p, h in HOURS if p.search(text)), None)
    return sorted(need), hours


norm = lambda t: re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()


def test_questions():
    """Every question a test asks. None of them may be in the bank, or the test after training is not fair."""
    R = ROOT / "scripts/gpu/router/data"
    test = set()
    for f in ("heldout.json", "fresh.json"):
        if (R / f).exists():
            test |= {norm(x["text"]) for x in json.load(open(R / f))}
    test |= {norm(q) for q in re.findall(r'question: "([^"]+)"', (ROOT / "tests/fixtures/jarvis-eval.ts").read_text())}
    cmp = (ROOT / "scripts/compare-models.ts").read_text()
    for block in re.findall(r"turns: \[([^\]]+)\]", cmp):
        test |= {norm(q) for q in re.findall(r'"([^"]+)"', block)}
    return test


TEST = test_questions()
BAD_WORDS = re.compile(r"\b(suicid\w*|kill (myself|me)|self.harm|hurt myself)\b", re.I)   # only the three careful lines above speak of this


def follow(kind, share=0.3):
    return rng.choice(AFTER[kind]) if kind and rng.random() < share else None


def from_family(name):
    texts, skills, needs, hours, does, _ = FAMILIES[name]
    if name == "signup":
        thing, day, hour = rng.choice(THING), rng.choice(DAY), rng.choice(HOUR)
        if (thing, day, hour) == ("gym class", "Wednesday", "5 PM"):   # that exact message is a test question
            hour = "6 PM"
        text = f"I signed up for a {thing} {day} at {hour}, put it in my calendar"
    else:
        text = rng.choice(texts).format(o=rng.choice(OBJ))
    need, hrs = tags(text, needs, hours)
    q = {"text": text, "skill": rng.choice(skills), "source": "alive", "family": name, "needs": need, "hours": hrs}
    nxt = follow(does)
    if nxt:
        q["followUp"] = nxt
    return q


HERE_SKILLS, ALL_SKILLS = load_skills(ROOT)   # this branch's skills, and those plus the ones only on main
route = router(ALL_SKILLS)


def voices():
    """The written messages (messages/*.json), checked: a known family, short enough, not a test question, no repeats."""
    out, seen, dropped = [], set(), collections.Counter()
    for f in sorted(glob.glob(str(HERE / "messages" / "*.json"))):
        src = Path(f).stem
        if src == "after":
            continue
        for m in json.load(open(f)):
            text, fam = str(m.get("text", "")).strip(), str(m.get("family", ""))
            fam = fam if fam in FAMILIES else None
            n = norm(text)
            most = WORDS.get(fam, 70 if src.startswith("spoken") else 45)
            skill = m.get("skill")
            why = ("no family" if not fam else "crisis is ours to write" if fam == "crisis" else "length" if not 1 <= len(text.split()) <= most else
                   "test question" if n in TEST else "repeat" if n in seen else "em dash" if "—" in text else "not ours to write" if BAD_WORDS.search(text) else
                   "unknown skill" if skill and skill not in ALL_SKILLS else None)
            if why:
                dropped[why] += 1
                continue
            seen.add(n)
            hours = m.get("hours") if isinstance(m.get("hours"), list) and len(m["hours"]) == 2 else None
            need, hrs = tags(text, [x for x in (m.get("needs") or []) if x in TRAIT], hours)
            q = {"text": text, "skill": skill or rng.choice(DEFAULT_SKILLS[fam]), "source": src, "family": fam, "needs": need, "hours": hrs}
            if skill and skill not in HERE_SKILLS:
                q["needsSkill"] = skill
            nxt = str(m.get("next") or "").strip()
            if nxt and fam != "crisis" and len(nxt.split()) <= 20:
                q["followUp"] = nxt
            out.append(q)
    return out, dropped


written, dropped = voices()
by_family = collections.defaultdict(list)
for q in written:
    by_family[q["family"]].append(q)
names = [k for k in FAMILIES]
weights = [FAMILIES[k][5] for k in names]
n_new = int(a.total * a.share) if a.base else a.total
new, left = [], collections.defaultdict(list)
while len(new) < n_new:
    fam = rng.choices(names, weights)[0]
    pool = by_family.get(fam) or []
    slots = bool(FAMILIES[fam][0]) or fam == "signup"
    if not pool and not slots:
        continue
    # two in three from the written voices when there are any (more ways of saying it), the rest from the slot lines;
    # a family with no slot lines is written messages only
    if pool and fam != "opened" and (rng.random() < 0.67 or not slots):
        if not left[fam]:   # every written message is used once before any is used twice
            left[fam] = rng.sample(pool, len(pool))
        new.append(dict(left[fam].pop()))
    else:
        new.append(from_family(fam))


def reach(rows):
    """skill -> the different messages in these rows that the app's own routing sends to it."""
    got = collections.defaultdict(set)
    for q in rows:
        for sk in route(q["text"]):
            got[sk].add(norm(q["text"]))
    return got


# Every skill with written messages gets at least --skill-floor different messages that really reach it. They take the place
# of repeats (1,500 messages were 894 different before this), so nothing is lost and the bank gets more varied.
floored = collections.Counter()
if a.skill_floor:
    got = reach(new)
    have = collections.Counter(norm(q["text"]) for q in new)
    spare = [q for q in written if q.get("skill") in route(q["text"])]   # the message reaches the skill its author wrote it for
    rng.shuffle(spare)
    on_purpose = {k for k, v in FAMILIES.items() if not by_family.get(k) and len(v[0]) <= 4 and k != "signup"}
    open_slots = [i for i, q in enumerate(new) if q["family"] not in on_purpose]
    for sk in sorted({q["skill"] for q in spare}):
        for q in spare:
            if len(got[sk]) >= a.skill_floor:
                break
            if q["skill"] != sk or norm(q["text"]) in have:
                continue
            # the slot to give up: a repeat of the message that is in the bank most often. Never from a family that repeats on
            # purpose (the opened app, the three careful lines): those have their own weight and no written pool.
            at = max(open_slots, key=lambda i: have[norm(new[i]["text"])], default=None)
            if at is None or have[norm(new[at]["text"])] < 2:
                break
            have[norm(new[at]["text"])] -= 1
            new[at] = dict(q)
            have[norm(q["text"])] += 1
            for s2 in route(q["text"]):
                got[s2].add(norm(q["text"]))
            floored[sk] += 1

base = []
if a.base:
    for q in json.load(open(a.base)):
        if norm(q["text"]) in TEST:
            continue
        need, hrs = tags(q["text"])
        base.append({**q, "family": "base", "needs": need, "hours": hrs})
    rng.shuffle(base)
    base = base[: a.total - n_new]
out = base + new
rng.shuffle(out)
json.dump(out, open(a.out, "w"))
fam = collections.Counter(q["family"] for q in out)
print(f"{len(out)} messages: {len(new)} from the families and voices ({len({q['text'] for q in new})} different), {len(base)} from the base bank")
print(f"written voices: {len(written)} kept, dropped {dict(dropped)}")
print(f"with a second turn: {sum('followUp' in q for q in out)} | need a student {sum('student' in q['needs'] for q in out)}, a job {sum('job' in q['needs'] for q in out)}, "
      f"money {sum('money' in q['needs'] for q in out)} | tied to hours {sum(q['hours'] is not None for q in out)}")
print("by family: " + ", ".join(f"{k} {v}" for k, v in fam.most_common()))
src = collections.Counter(q["source"] for q in out)
print("by source: " + ", ".join(f"{k} {v}" for k, v in src.most_common()))
print(f"only for a skill on main (skipped by the generator until the branch is rebased): {sum('needsSkill' in q for q in out)}")
if floored:
    print(f"added to reach {a.skill_floor} per skill: " + ", ".join(f"{k} +{v}" for k, v in sorted(floored.items())))
got = reach(out)
thin = sorted(k for k in ALL_SKILLS if len(got[k]) < a.skill_floor)
print(f"skills reached by fewer than {a.skill_floor} different messages: {', '.join(f'{k} {len(got[k])}' for k in thin) or 'none'}")
bad_after = sorted({l for k, v in AFTER.items() for l in v if norm(l) in TEST})
if bad_after:
    raise SystemExit(f"messages/after.json has a test question in it: {bad_after}")
