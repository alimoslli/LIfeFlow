# LifeFlow launch grid (v3)

The set is nine connected Instagram posts (3:4, 1080×1440). Three of them, the middle column, also have a Reel (9:16, 1080×1920). Each Reel opens on its own grid post and then plays the app.

The assistant is never named; it's always "your assistant". The app is shown with sample data from the demo account, and the class is ECON 101 · Microeconomics · Hamilton Hall 204, 1:00 – 2:15 PM.

## Posting order

Instagram shows the newest post at the top left, so post in this order:

| Post | Where it lands | What it is |
|---|---|---|
| 1 | bottom right | Available now: live on the web, Link in bio |
| 2 | bottom middle | **Reel**: Meet LifeFlow (`LifeFlow_post_2_REEL_launch.mp4`, cover = post 2) |
| 3 | bottom left | One assistant. For all of it. |
| 4 | middle right | Your money coach: Budget smarter. Save faster. Invest more. |
| 5 | center | **Reel**: Money (`LifeFlow_post_5_REEL_money.mp4`, cover = post 5) |
| 6 | middle left | Money: See where every dollar goes. Secured by Plaid. |
| 7 | top right | Today: Your day, already planned. |
| 8 | top middle | **Reel**: Your life (`LifeFlow_post_8_REEL_life.mp4`, cover = post 8) |
| 9 | top left | Your whole life, in one flow. |

For each Reel, upload the 9:16 cover (`post_N_REEL_cover.jpg`) as the cover image; Instagram crops its center to the 3:4 post.

## Grid copy

- **Your whole life, in one flow.** Your finances, classes, work and more, synced to your personal assistant.
- **TODAY · Your day, already planned.** Classes, shifts and deadlines in one calendar. Open the app and know exactly what's next.
- **MONEY · See where every dollar goes.** Every account and every purchase in one clear view. *Secured by Plaid. Read-only. LifeFlow never sees your password.*
- **YOUR MONEY COACH · Budget smarter. Save faster. Invest more.** Your assistant spots overspending and helps you turn it into savings.
- **YOUR PERSONAL ASSISTANT · One assistant. For all of it.**
  - Plans your week
  - Builds your budget
  - Grows your savings
  - Helps you invest more
  - Breaks overspending habits
- **AVAILABLE NOW · Live on the web.** Link in bio. lifeflowweb.com · No download needed.

## Reel scripts (voice: ElevenLabs "Sienna")

### Post 8: Your life (32 s)

| Time | On screen | Voiceover |
|---|---|---|
| 0.0 | Post 8 (the cover) | |
| 1.2 | Today. The ECON 101 card pops out. *Every morning, your day is planned.* | Every morning, your day is already planned. |
| 4.8 | Calendar and Plan. The week card pops out. *Classes, shifts and deadlines.* | Classes, shifts and deadlines, all in one calendar. |
| 9.6 | Goals: "Run a 5K" is added. *Set a goal. Get a plan.* | Set a goal, and your assistant helps you plan it, then checks in. |
| 14.4 | Habits: "Gym, 3x a week" is added. *Habits that actually stick.* | Build habits that actually stick. |
| 17.4 | Health: Sleep and Steps cards pop out. *Sleep, steps, workouts. From Apple Health.* | Connect Apple Health, and your sleep, steps and workouts flow right in. |
| 22.8 | Connected accounts: Canvas, then Banks & cards. *Plug in the rest of your life.* | Plug in your classes and your bank, and everything stays in sync. |
| 27.6 | Glass molecule, the LifeFlow logo. *Your whole life, in one flow.* | LifeFlow. Your whole life, in one flow. |

### Post 5: Money (44 s)

| Time | On screen | Voiceover |
|---|---|---|
| 0.0 | Post 5 (the cover) | |
| 1.2 | Overview: Available now $2,164. *All your money, in one place.* | This is your money. All of it, in one place. |
| 5.4 | Connect a bank, plus the "Secured by Plaid" badge. *Linked in seconds. Secured by Plaid.* | Connect your bank in seconds. Secured by Plaid, so LifeFlow never sees your bank password. |
| 12.0 | A $120 cash wallet is added, then "Lunch with Sam, $14.50". Chip: "Or just tell your assistant". *Paid in cash? Add it in a tap.* | Paid in cash? Add it in a tap, or just tell your assistant. |
| 18.0 | November budgets. *Set a budget. See where you stand.* | Set a budget, and see exactly where you stand. |
| 21.6 | Heads up: rent may not be covered. *Heads up, before it happens.* | It warns you early, like when rent might not clear. |
| 25.8 | Subscriptions: $329.76 a year, plus the cancel steps. *The ones you forgot, found.* | It catches overspending, like the subscriptions you forgot. |
| 30.0 | Savings goal: $150/month gets you there in about 6 months. *Saving for something? Get there sooner.* | Saving for something? See how much sooner you'll get there. |
| 33.6 | Investing: $250/month for 30 years. *Invest a little more. See what it could become.* | And see what investing a little more each month could grow into. |
| 38.4 | Glass molecule. *Budget smarter. Save faster. Invest more.* Then the LifeFlow logo. | Budget smarter. Save faster. Invest more. LifeFlow. |

### Post 2: Meet LifeFlow (20 s)

| Time | On screen | Voiceover |
|---|---|---|
| 0.0 | Post 2 (the cover) | |
| 1.2 | Glass orbs. *Introducing. Meet LifeFlow.* | Meet LifeFlow. The personal assistant for your whole life. |
| 5.4 | *Your classes.* (Today) · *Your shifts.* (Calendar) · *Your money.* (Money) | |
| 9.6 | The assistant. Budget, savings, investing and subscription cards pop out on each word. *One assistant. For all of it.* | It helps you budget, save, invest more, and break the habits that drain your money. |
| 15.6 | Glass molecule. *Now live on the web. Your whole life, in one flow.* lifeflowweb.com · Link in bio | LifeFlow. Your whole life, in one flow. |

The investing figures come from the app's calculator. They're labelled there as illustrations (4%, 6% and 8% a year), not promises.

## Rebuild

Run these in a folder with `rec/`, `cards/`, `shots/`, `g/`, `m/`, `vo/` and `fonts/`:

```bash
python3 make_grid3.py
python3 build_plans.py
python3 music_launch.py plan_reel_money.json music.wav
python3 launch.py plan_reel_money.json video.mp4
python3 mix_launch.py plan_reel_money.json video.mp4 music.wav LifeFlow_post_5_REEL_money.mp4
```

## Problem-solving videos (15 s each)

Every reel from here on shows LifeFlow solving one real, everyday problem: 3 s of problem, about 9 s of the flow that fixes it, 3 s of call to action. The plans are `p_school`, `p_subs`, `p_save` and `p_chat` in `build_plans.py`. The voice lines (Sienna) are sped up 8% (`atempo 1.08`) and need to be 48 kHz mono for `mix_launch.py`.

| Video | Problem | Flow shown | Comment word |
|---|---|---|---|
| `LifeFlow_Problem_school.mp4` | A quiz Friday and a shift tonight | Today, then one calendar, then the clash spotted and time blocked | DUE |
| `LifeFlow_Problem_subs.mp4` | "What is this charge?" | Bank linked (Plaid), then forgotten subscriptions ($329.76 a year), then cancel steps | CANCEL |
| `LifeFlow_Problem_save.mp4` | "How much can I actually spare?" | Available now, then a savings goal and pace, then the investing calculator (an illustration) | START |
| `LifeFlow_Problem_chat.mp4` | Dinner Saturday and a quiz Friday | A real chat: the assistant checks the week, finds the lightest day, adds both to the calendar, then the Plan screen | WEEK |

### How the chat video was recorded

`rec/chat.mp4` and `rec/chat_plan.mp4` are the app's real chat and Plan screens on the demo account. The assistant's actions are real: it called `get_agenda`, `life_load`, `find_free_time` and `create_events`, and the events were saved. There was no OpenAI key in the recording environment, so the assistant's wording came from a small local stand-in (`OPENAI_BASE_URL`) that writes the reply from those real tool results. It is **not** a live AI answer. For a fully live take, record the same prompt with your own key.
