/**
 * The Jarvis eval: real student questions, the fewest tool calls that answer each
 * one, and the answer we want back. tests/integration/jarvis-eval.test.ts seeds the
 * student below and checks that every question routes to the right skill, that the
 * skill allows the planned tools, that the plan fits the budget, and that the tool
 * results really contain the facts the answer quotes.
 *
 * To add a question: add an entry, run `npx vitest run tests/integration/jarvis-eval.test.ts`
 * (EVAL_PRINT=1 prints the tool results), then write the answer from those results only.
 *
 * The student: Monday Nov 2, 2026, 10 AM in New York. BIO 110 (MWF 10:00-10:50) with
 * Exam 2 on Thursday; ENG 102 with an essay draft due Wednesday; barista shifts at
 * Campus Coffee ($15/hr); six months of a messy real-looking bank feed; an emergency
 * fund goal; one to-do due today.
 */

export const EVAL_NOW = new Date("2026-11-02T15:00:00Z");

export type EvalCase = {
  id: string;
  question: string;
  /** The skill the router must pick first. */
  skill: string;
  /** The minimal tool plan, in order. */
  plan: { tool: string; args: Record<string, unknown> }[];
  /** Most tool calls a good answer needs. */
  budget: number;
  /** Text that must appear in the tool results (the facts the answer quotes). */
  facts: string[];
  /** The answer we want: short, real numbers only, one clear next step. */
  answer: string;
};

export const EVAL: EvalCase[] = [
  {
    id: "today",
    question: "What do I need to get done today?",
    skill: "daily-planner",
    plan: [{ tool: "get_daily_briefing", args: {} }],
    budget: 1,
    facts: ["2026-11-02 10:50", "2026-11-02 16:00", "Return library books", "2026-11-04 23:59", "2026-11-05 10:00"],
    answer:
      "You're in BIO 110 until 10:50, then work at Campus Coffee 4 to 9 PM. One to-do: return the library books. Coming up: your ENG 102 essay draft is due Wednesday at 11:59 PM and BIO 110 Exam 2 is Thursday at 10 AM. Use the 10:50 to 4 gap for the essay draft, and drop the books off on your way to work.",
  },
  {
    id: "afford",
    question: "Can I afford to spend $60 this weekend?",
    skill: "purchase-advisor",
    plan: [{ tool: "check_affordability", args: { amount: 60, byDate: "2026-11-08" } }],
    budget: 1,
    facts: ['"liquidCash":842.17', '"name":"Rent Campus Edge Apts"', '"amount":118.4', '"averageDailySpending":27.8', '"projectedCashAfterPurchase":-498'],
    answer:
      "Not this weekend. You have $842.17 in checking, but rent ($950) usually comes out around the 1st and I don't see it yet. Progressive ($118.40) is due Thursday, plus a few small subscriptions. With your usual $27.80 a day, you'd be about $498 short by Sunday, even before the $60. Check that rent went through, and wait until your next paycheck lands.",
  },
  {
    id: "spending",
    question: "Where did my money go last month?",
    skill: "budget-coach",
    plan: [{ tool: "spending_summary", args: { from: "2026-10-01", to: "2026-10-31" } }],
    budget: 1,
    facts: [
      '"netSpending":2328.26',
      '"income":1304.13',
      '"name":"Housing"',
      '"amount":1052.73',
      '"name":"Starbucks","amount":88.85,"count":14',
      '"name":"Fees & Interest"',
    ],
    answer:
      "In October you spent $2,328.26 and $1,304.13 came in, so you ran $1,024.13 short. The big pieces: Housing $1,052.73 (rent $950, Georgia Power $102.73), Shopping $398.55 (mostly Amazon, $299.20 over 6 orders), Food & Dining $351.57 (Kroger $262.72, Starbucks $88.85 over 14 visits) and Bills & Subscriptions $209.51. You also paid $38 in bank fees. Halving Amazon and Starbucks would save about $194 a month.",
  },
  {
    id: "subscriptions",
    question: "What subscriptions am I paying for?",
    skill: "subscription-hunter",
    plan: [{ tool: "find_subscriptions", args: {} }],
    budget: 1,
    facts: [
      '"subscriptionsYearly":1301.16',
      '"group":"Video streaming","names":["Netflix","Disney+","Hulu"],"yearly":401.64',
      '"name":"Hulu"',
      '"tracked":false',
    ],
    answer:
      "8 subscriptions, $108.43 a month ($1,301.16 a year): Planet Fitness $24.99, OpenAI $20, Netflix $15.49, Amazon Prime $14.99, Spotify $11.99, Disney+ $9.99, Hulu $7.99 and Apple $2.99. Netflix, Disney+ and Hulu do the same job ($401.64 a year together), so dropping one or two is the easiest win. Spotify, Prime and Hulu have offered student plans, worth checking. Your bills are separate: rent $950, Progressive $118.40, Georgia Power about $102.73 (it varies) and T-Mobile $68.12. I found all of these in your bank history. Want me to track them?",
  },
  {
    id: "due",
    question: "What's due this week?",
    skill: "study-coach",
    plan: [{ tool: "list_assignments", args: { view: "week" } }],
    budget: 1,
    facts: ['"title":"Argument essay draft"', "2026-11-04 23:59", '"title":"Exam 2"', "2026-11-05 10:00"],
    answer:
      "Two things: your ENG 102 Argument essay draft is due Wednesday at 11:59 PM, and BIO 110 Exam 2 is Thursday at 10 AM. Want me to block study time for the exam?",
  },
  {
    id: "work",
    question: "How many hours am I working this week and how much will I make?",
    skill: "shift-manager",
    plan: [{ tool: "work_earnings", args: { from: "2026-11-02", to: "2026-11-08" } }],
    budget: 1,
    facts: ['"shiftCount":3', '"scheduledHours":15.5', '"estimatedGross":232.5', '"hourlyRate":15'],
    answer: "15.5 hours over 3 shifts at Campus Coffee. At $15 an hour that's about $232.50 before taxes. It's an estimate until the pay actually lands.",
  },
  {
    id: "hardest",
    question: "Which day this week is going to be the hardest?",
    skill: "smart-scheduler",
    plan: [{ tool: "life_load", args: {} }],
    budget: 1,
    facts: ['"label":"Today","level":"heavy","hours":8.5', '"label":"Wednesday","level":"heavy","hours":7.2', '"label":"Tomorrow","level":"light","hours":3.2'],
    answer:
      "Today (8.5 hours): BIO 110 this morning, about 1.6 hours of Exam 2 prep, and work 4 to 9 PM. Wednesday is close behind (7.2 hours) with work 5 to 10 PM. Tomorrow is light (3.2 hours), so that's the day to get ahead on Exam 2 and the essay.",
  },
  {
    id: "todo",
    question: "Add a to-do to email my advisor by Friday",
    skill: "reminders-follow-up",
    plan: [{ tool: "create_tasks", args: { tasks: [{ title: "Email my advisor", dueDate: "2026-11-06" }] } }],
    budget: 1,
    facts: ['"title":"Email my advisor"', '"due":"2026-11-06"'],
    answer: "Added: Email my advisor, due Friday, Nov 6. It's in your to-dos.",
  },
  {
    id: "goal",
    question: "Am I on track for my savings goal?",
    skill: "savings-goals",
    plan: [{ tool: "list_goals", args: {} }],
    budget: 1,
    facts: ['"saved":350', '"target":1000', '"monthlyNeeded":335.36', '"onTrack":false', '"monthlyPace":0'],
    answer:
      "Not yet. Your emergency fund is at $350 of $1,000 (35%), with $650 to go by Dec 31. That's about $335.36 a month, and nothing has gone in recently. Want me to set up a weekly amount so you hit it?",
  },
  {
    id: "study",
    question: "Find me 2 hours to study for my BIO exam before Thursday",
    skill: "study-coach",
    plan: [
      { tool: "find_free_time", args: { from: "2026-11-02", to: "2026-11-04", minMinutes: 120 } },
      {
        tool: "create_events",
        args: { events: [{ title: "Study for BIO 110 Exam 2", date: "2026-11-03", startTime: "15:00", endTime: "17:00", kind: "study" }] },
      },
    ],
    budget: 2,
    facts: ['"start":"14:15","end":"22:00"', '"start":"2026-11-03 15:00","end":"2026-11-03 17:00"', '"conflicts":[]'],
    answer: "Booked: Study for BIO 110 Exam 2, Tuesday 3 to 5 PM. Tuesday afternoon is wide open and it's two days before the exam. It's on your calendar.",
  },
];
