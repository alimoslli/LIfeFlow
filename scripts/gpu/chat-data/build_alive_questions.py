"""Adds "alive" messages to the question bank: people describing a problem (behind, stressed, swamped, a money worry, a request
that lands on a shift) instead of asking a question, so a model learns to solve it: book the time, add the to-do, say what it
did, and leave money, deletions and graded work alone (owner, 2026-11-22). Made up, generic (no names, no courses), so they
fit every simulated life. The six test messages of scripts/compare-models.ts (--exam alive) are not reused.

  python3 scripts/gpu/chat-data/build_alive_questions.py --base /root/job/questions.json --out /root/job/questions-alive.json --share 0.4
"""
import argparse, json, random

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--share", type=float, default=0.4, help="share of the output that is alive messages")
ap.add_argument("--total", type=int, default=2400)
a = ap.parse_args()
rng = random.Random(22)

OBJ = ["my next exam", "my biggest assignment", "my paper", "my lab report", "my homework this week", "studying", "my project",
       "my reading", "my presentation", "everything due this week", "my midterm", "my problem set", "the assignment due first"]
BEHIND = ["I'm so behind on {o}", "I haven't even started {o}", "I'm freaking out about {o}", "I'm swamped and {o} is not getting done",
          "I keep putting off {o}", "I'm way behind on {o}, help", "ugh {o} is going to sink me", "I'm stressed about {o}", "no idea how I'll finish {o}"]
HELP = ["could you map out my week for me", "plan my day for me", "I have too much going on, fix it", "help me get ahead on {o}",
        "find me time for {o} and put it on my calendar", "I think I'm going to miss {o}", "block time for {o}", "I need a plan for {o} today",
        "I'm overwhelmed, where do I even start and can you set it up", "set aside time to catch up on {o}"]
MONEY = ["rent is going to be a problem this month", "I'm worried about money this week", "I'm broke until payday, what do I do",
         "I think I'm going to overdraw this week", "I can't afford my bills this month", "money is so tight right now",
         "I overspent this month and I'm panicking", "will I make it to payday?"]
THING = ["gym class", "club meeting", "study group", "dentist appointment", "coffee with a friend", "volunteer shift", "tutoring session", "yoga class"]
DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
HOUR = ["8 AM", "10 AM", "noon", "2 PM", "4 PM", "5 PM", "6 PM", "7 PM"]


# The abilities added on 2026-11-22 (wish, day and trust tests), as generic one-line messages. The test messages themselves are
# not reused. Follow-ups that need an earlier turn (undo, "actually tomorrow", "not now") are not here: the bank is single messages.
DONE = ["just submitted {o}!!", "finished {o} finally", "handed in {o} this morning", "ok {o} is done", "got {o} done last night", "I did it, {o} is turned in"]
PROMISE = ["I'll start {o} tonight, I promise", "I swear I'm going to work on {o} after dinner", "I'll do {o} tomorrow morning, promise",
           "I'm going to start {o} right after class, I promise", "I'll finish {o} by Friday, hold me to it"]
BREAK = ["{o} feels huge, break it down for me", "I don't even know where to start with {o}", "{o} is too big, can you break it down",
         "where do I even start with {o}"]
SICK = ["I woke up feeling awful, today is a write-off", "I have a fever, I'm staying in bed today", "I'm sick and can't make it to anything today",
        "I've got the flu, today is not happening"]
NOW = ["what do I tackle first right now?", "what should I work on first?", "I have an hour free, what now?", "what's next for me today?",
       "where do I start today?"]
SLIDE = ["this week is overloaded, what can I push off?", "I can't do it all this week, what can I drop?", "too much going on, what can wait?",
         "something has to give this week, what should it be?"]
ABOUT = ["heads up, my head is clearest before noon", "fyi I can't study after 9 pm, my brain is done", "just so you know, I hate studying on Sundays",
         "for the record I work best in short bursts", "I'm a night person, mornings are useless for me", "heads up, I always need a break after class"]
CUT = ["I have to spend less every month, where do I start?", "where can I save money this month?", "I'm spending too much, what can I cut?",
       "help me trim my subscriptions", "where is my money going and what can I cut back?"]
BAD = ["pretty sure I tanked my quiz", "I failed my midterm", "I did really badly on {o}", "I messed up {o} and I feel awful"]
LIFE = ["I got the internship!!", "I just got hired for a campus job", "today was rough", "today was the best day", "I'm so nervous about tomorrow",
        "hi", "good morning", "yo", "[opened the app]", "[opened the app]", "[opened the app]"]
NEW = [(DONE, ["study-coach", "daily-planner"]), (PROMISE, ["study-coach", "daily-planner"]), (BREAK, ["study-coach", "exam-prep"]),
       (SICK, ["daily-planner"]), (NOW, ["daily-planner"]), (SLIDE, ["weekly-review", "daily-planner"]), (ABOUT, ["memory-manager"]),
       (CUT, ["subscription-hunter", "budget-coach"]), (BAD, ["study-coach", "exam-prep"]), (LIFE, ["daily-planner"])]


def one():
    k = rng.random()
    if k < 0.45:   # nearly half of the alive share: the newer abilities, spread evenly over the ten kinds
        texts, skills = rng.choice(NEW)
        return {"text": rng.choice(texts).format(o=rng.choice(OBJ)), "skill": rng.choice(skills)}
    k = (k - 0.45) / 0.55
    if k < 0.40:
        return {"text": rng.choice(BEHIND).format(o=rng.choice(OBJ)), "skill": rng.choice(["smart-scheduler", "study-coach", "daily-planner", "exam-prep"])}
    if k < 0.65:
        return {"text": rng.choice(HELP).format(o=rng.choice(OBJ)), "skill": rng.choice(["smart-scheduler", "daily-planner", "weekly-review"])}
    if k < 0.80:
        return {"text": rng.choice(MONEY), "skill": rng.choice(["budget-coach", "paycheck-planner", "purchase-advisor"])}
    thing, day, hour = rng.choice(THING), rng.choice(DAY), rng.choice(HOUR)
    if (thing, day, hour) == ("gym class", "Wednesday", "5 PM"):   # that exact message is a test question
        hour = "6 PM"
    return {"text": f"I signed up for a {thing} {day} at {hour}, put it in my calendar", "skill": "smart-scheduler"}


base = json.load(open(a.base))
n_alive = int(a.total * a.share)
alive, seen = [], 0
while len(alive) < n_alive and seen < n_alive * 20:
    seen += 1
    q = one()
    alive.append({**q, "source": "alive"})  # repeats are fine: every life answers it with its own data
rng.shuffle(base)
out = base[: a.total - n_alive] + alive
rng.shuffle(out)
json.dump(out, open(a.out, "w"))
print(f"{len(out)} questions: {len(alive)} alive ({len({x['text'] for x in alive})} different), {len(out) - len(alive)} from the base bank")
