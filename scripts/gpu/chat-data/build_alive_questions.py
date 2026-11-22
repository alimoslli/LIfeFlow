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
HELP = ["can you just plan my week for me", "plan my day for me", "I have too much going on, fix it", "help me get ahead on {o}",
        "find me time for {o} and put it on my calendar", "I think I'm going to miss {o}", "block time for {o}", "I need a plan for {o} today",
        "I'm overwhelmed, where do I even start and can you set it up", "set aside time to catch up on {o}"]
MONEY = ["i dont think i can cover rent this month", "I'm worried about money this week", "I'm broke until payday, what do I do",
         "I think I'm going to overdraw this week", "I can't afford my bills this month", "money is so tight right now",
         "I overspent this month and I'm panicking", "will I make it to payday?"]
THING = ["gym class", "club meeting", "study group", "dentist appointment", "coffee with a friend", "volunteer shift", "tutoring session", "yoga class"]
DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
HOUR = ["8 AM", "10 AM", "noon", "2 PM", "4 PM", "5 PM", "6 PM", "7 PM"]


def one():
    k = rng.random()
    if k < 0.40:
        return {"text": rng.choice(BEHIND).format(o=rng.choice(OBJ)), "skill": rng.choice(["smart-scheduler", "study-coach", "daily-planner", "exam-prep"])}
    if k < 0.65:
        return {"text": rng.choice(HELP).format(o=rng.choice(OBJ)), "skill": rng.choice(["smart-scheduler", "daily-planner", "weekly-review"])}
    if k < 0.80:
        return {"text": rng.choice(MONEY), "skill": rng.choice(["budget-coach", "paycheck-planner", "purchase-advisor"])}
    return {"text": f"I signed up for a {rng.choice(THING)} {rng.choice(DAY)} at {rng.choice(HOUR)}, put it in my calendar", "skill": "smart-scheduler"}


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
