# ADR 0023: Dev's own models (the brain is ours, the words are swappable)

Date: 2026-11-05. Status: accepted (owner: "you're gonna do the most optimal and best thing").

## Context

The owner asked what "training Dev" means if every message goes to the OpenAI API: "how are we putting those data in changing the app if it's just going back to the OpenAI API? That's why I wanted to train my own AI model."

Facts today:

- The language model is OpenAI's, called through the provider-neutral `ModelProvider` (`src/server/jarvis/providers/`). Every request uses `store: false`, and under OpenAI's API terms it doesn't train on API data. It learns nothing from us, so feeding it situations changes nothing.
- Most of what makes Dev useful is not the language model. It is the connections, the one timeline, the checks, and the patterns in a person's own history. All of that is ours.
- The misses the owner hit (subscriptions not caught, pay wrong because scheduled hours aren't worked hours) are brain problems. A better language model doesn't fix them.

## Decision

### 1. Two parts

- **The brain (ours)** produces facts with sources: the timeline, the checks (`services/proactive/detectors.ts` and the vision's general checks), and the learned models below.
- **The words (rented for now)** understand what the person says and word the answer. They never do the math and never invent a fact the brain didn't give.
- The brain never depends on one language model. If the model is swapped, Dev must still give the same answer on the situation library.

### 2. Level 1, now: learned models for the jobs that matter

| Model | Learns | Starts from |
|---|---|---|
| Routines | When this person studies, works out, calls family, eats at home, sleeps; how firm each is | Calendar and timeline history |
| Pay | What actually lands from scheduled hours: worked vs scheduled, call-outs, overtime, taxes, pay dates | Shifts, clock-ins, deposits |
| Bills and subscriptions | Every recurring charge, its real amount and date, price changes, duplicates | Transactions (`recurring-detect.ts`, `subscriptions.ts`) |
| Best time | The best slot for a task: free time, inside the routine window, rest kept, before the deadline | Timeline + routines |
| What helps this person | Which kinds of suggestions they take or ignore | Their reactions, only with `prefs.jarvis.learning` on |

Each model:

- has its design and starting values built from the simulator's made-up lives (`docs/situations/simulator/`). The simulator knows the true routines, pay and bills it planted, so every model can be measured exactly;
- adjusts to each person only from that person's own data, stored in their rows under RLS. What it learned shows in "What Dev knows" with its source, can be corrected, and is deleted with the account;
- returns facts with a confidence and a source, never wording;
- uses the simplest method that passes its tests first (counts, time windows, regression). A heavier method is used only when it beats the simple one on the tests;
- ships only when it reaches its targets.

**First targets** (raise them as the library grows):

| Model | Ships when |
|---|---|
| Bills and subscriptions | Finds at least 97% of recurring charges in the simulator and library, at most 1 wrong in 50 flagged, and catches a price change on the first changed charge |
| Pay | Shown for a person only after it predicts within 3% of the deposit for at least 9 of their last 10 paychecks. Pay is still never counted before it lands. |
| Routines | Recovers at least 90% of the planted routines with no window off by more than an hour, and invents a routine that isn't there in at most 5% of people |
| Best time | In every routine-fit case in the library, the slot is inside the routine window, or it gives the reason for leaving it |
| What helps | Turning it on never makes Dev miss a must-notice in the library |

### 3. Level 2, after the 10-student test: our own language model

- An open model we fine-tune on thousands of situations (simulator plus real ones from people who opted in) and host ourselves, so no user data leaves LifeFlow.
- It replaces the current provider only when it beats it on the whole situation library and the eval (`tests/fixtures/jarvis-eval.ts`) at an acceptable cost per message.
- It needs roughly 5,000 to 10,000 good examples, far more than the 300-case exam. Growing the simulator is how we get there.

### 4. Not doing: a model built from zero

It costs tens to hundreds of millions of dollars and wouldn't make Dev better than level 2.

### 5. Data rules

- **Made-up data** (simulator, situation library): free to use for anything.
- **A person's own data:** used for that person's own learned models only.
- **Shared training on real data:** only with that person's explicit, informed opt-in. It can be withdrawn, personal details are removed, and it's used only when it beats the current system on the tests.
- **Never in shared training, even with opt-in:**
  - Google user data (Google's API rules forbid training general models on it);
  - Apple Health and other health data;
  - the content of emails and messages (the people who wrote them never agreed).

## Consequences

- The training rules in `CLAUDE.md`, `docs/playbook.md`, `docs/jarvis-intelligence.md` and `docs/vision.md` (section 7) now point here.
- Words shown to users stay true today: "never used to train AI without your clear permission".
  - Before level 1 ships, the copy that says the assistant "never trains AI models on your data" (`jarvis/profile`, `jarvis/memory`, `settings/data`) changes to say it learns your patterns from your own data, only for you.
  - Before any opt-in exists, the privacy page changes too.
- The first builds are the bills-and-subscriptions model (step 1 of the order of work) and the routines model, which "find the best time" needs.
