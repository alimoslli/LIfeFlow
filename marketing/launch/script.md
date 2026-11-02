# LifeFlow launch set

Everything here uses the real app with the demo account (the assistant is named Sage). Glossy sage-glass 3D (molecule, orbs, ribbon) was generated with Higgsfield (Nano Banana stills, Kling 3.0 loops). The voice is ElevenLabs "Sienna". The music is an original score from `music_launch.py`.

| File | What | Length |
|---|---|---|
| `LifeFlow_Money.mp4` | App video: money | 38.4 s |
| `LifeFlow_Life.mp4` | App video: goals, habits, health, connections | 31.2 s |
| `LifeFlow_Story_Reel.mp4` | Story 2: quick launch reel (music only) | 12 s |
| `story_1_meet.jpg` | Story 1: "Meet LifeFlow" photo | |
| `story_3_web.jpg` | Story 3: "Live on the web" photo (leave room for the link sticker under the arrow) | |

## Video A: "Money, handled." (38.4 s, 100 BPM; cuts land on the beat)

| Time | On screen | Voiceover |
|---|---|---|
| 0.0 | Glass orbs. *Introducing LifeFlow*. "Your money, *finally clear.*" | |
| 2.4 | Phone rises in. Money overview. The $1,842 card pops out. | This is your money. All of it, in one place. |
| 6.6 | Accounts, then Bank connections, then Connect a bank. "Secured by Plaid" badge. Bank card pops. | Connect your bank in seconds. Secured by Plaid, so LifeFlow never sees your bank password. |
| 13.2 | A Cash wallet is added ($120), then "Lunch with Sam, $14.50" is added. Chip: "Or just tell Sage". | Paid in cash? Add it in a tap. Or just tell Sage. |
| 19.8 | Activity: transactions grouped by day. | Every transaction, sorted for you. |
| 22.8 | Budgets. The November budgets card pops. | Set a budget, and see exactly where you stand. |
| 26.4 | Heads up and Next 30 days. Sage's warnings pop. | Sage keeps watch. Like rent that might not clear on the first. |
| 31.2 | Subscriptions: $329.76 per year, then Cancel Netflix steps. | And finds the subscriptions you forgot. |
| 34.2 | Glass molecule. "Money, *handled.*" Then the LifeFlow logo and lifeflowweb.com. | Money, handled. LifeFlow. |

## Video B: "Your whole life, in one flow." (31.2 s)

| Time | On screen | Voiceover |
|---|---|---|
| 0.0 | Glass ribbon. *Introducing LifeFlow*. "Big goals. *Small habits.*" | Big goals. Small habits. One place. |
| 3.6 | Goals: "Run a 5K" is added and its card pops. | Set a goal, and Sage plans the steps, and checks in with you. |
| 8.4 | Habits: "Gym, 3x a week" is added. | Build habits that actually stick. |
| 11.4 | Health: the Sleep (7.3 h) and Steps (8,207) cards pop side by side. | Connect Apple Health, and your sleep, steps and workouts flow right in. |
| 16.8 | Connected accounts: Canvas, then Banks & cards. | Plug in the rest of your life. Your calendar, your classes, your bank. |
| 22.2 | Today: "Good morning, Alex" and the next class (MATH 152). | And every morning, it all comes together on Today. |
| 26.4 | Glass molecule. The LifeFlow logo, then "Your whole life, *in one flow.*" | LifeFlow. Your whole life, in one flow. |

## Story 2: launch reel (12 s, no voice)

The reel runs on glass orbs:

1. "Meet *LifeFlow.*"
2. "Your classes." (next class card)
3. "Your shifts." (week card)
4. "Your money." (available card)
5. "One assistant. *Meet Sage.*"
6. The glass molecule with "Now live", "Your whole life, in one flow.", the logo and lifeflowweb.com.

## Rebuild

In a folder with `rec/`, `cards/`, `shots/`, `g/`, `m/`, `vo/` and `fonts/`:

```bash
python3 build_plans.py
python3 music_launch.py plan_money.json music_money.wav
python3 launch.py plan_money.json v_money.mp4
python3 mix_launch.py plan_money.json v_money.mp4 music_money.wav LifeFlow_Money.mp4
python3 launch.py photos
```
