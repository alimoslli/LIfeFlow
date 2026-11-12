import type { MemoryCategory } from "@/server/db/schema";
import type { RetrievableMemory } from "@/server/jarvis/memory-retrieval";

/**
 * Memory picking by meaning (docs/backlog/2026-11-12-local-models.md, Step 0): one made-up student's approved memories and
 * questions where the right memory shares no word with the question ("what should I make for dinner" needs "Is vegetarian").
 * `must` is what has to reach the model, `never` what clearly doesn't belong. Every case is labelled by hand, before any model
 * ran on it. `split` keeps the threshold honest: tune on "dev", report on "test".
 */

const at = new Date("2026-10-01T00:00:00Z");
const mem = (id: string, category: MemoryCategory, content: string): RetrievableMemory => ({
  id,
  category,
  content,
  basis: "stated",
  updatedAt: at,
  lastUsedAt: null,
});

export const MEANING_MEMORIES: RetrievableMemory[] = [
  mem("dollars", "instruction", "Show amounts in whole dollars."),
  mem("veg", "fact", "Is vegetarian."),
  mem("peanut", "fact", "Allergic to peanuts."),
  mem("lactose", "fact", "Lactose intolerant."),
  mem("tea", "preference", "Doesn't drink coffee; prefers tea."),
  mem("gym", "routine", "Goes to the campus gym Monday, Wednesday and Friday at 7 AM."),
  mem("owl", "preference", "Focuses best late at night."),
  mem("sleep", "goal", "Tries to be asleep by 11:30 PM on weeknights."),
  mem("job", "routine", "Works at the Campus Library, Tue/Thu evenings and Saturday mornings."),
  mem("car", "routine", "Has a car; drives to campus on Mondays and takes the bus other days."),
  mem("bike", "routine", "Bikes to work when it isn't raining."),
  mem("bday", "fact", "Sister Maya's birthday is May 3."),
  mem("mom", "routine", "Calls mom every Sunday evening."),
  mem("trip", "goal", "Saving for a summer trip to Montréal."),
  mem("rent", "fact", "Rent is $900, due on the 1st."),
  mem("food$", "goal", "Wants to keep food spending under $450 a month."),
  mem("lab", "fact", "Biology II lab partner is Jordan."),
  mem("dog", "routine", "Has a dog named Biscuit who needs a walk before class."),
  mem("nerves", "fact", "Gets anxious before presentations."),
  mem("major", "fact", "Majoring in nursing."),
  mem("spanish", "goal", "Learning Spanish on Duolingo."),
  mem("roomies", "fact", "Shares an apartment with two roommates and splits the utilities."),
  mem("band", "routine", "Plays guitar in a band that practices Wednesday nights."),
  mem("foodbank", "routine", "Volunteers at the food bank on Saturday afternoons."),
  mem("loans", "fact", "Has federal student loans; repayment starts after graduation."),
];

export type MeaningCase = { q: string; must: string[]; never: string[]; split: "dev" | "test" };

const c = (split: "dev" | "test", q: string, must: string[], never: string[]): MeaningCase => ({ q, must, never, split });

export const MEANING_CASES: MeaningCase[] = [
  c("dev", "What should I make for dinner tonight?", ["veg", "peanut", "lactose"], ["rent", "lab", "loans", "bday"]),
  c("test", "Can you suggest a snack for my study session?", ["peanut"], ["rent", "bday", "loans"]),
  c("dev", "Is it a good idea to grab a latte before class?", ["tea", "lactose"], ["rent", "bday", "lab"]),
  c("test", "Plan my Wednesday morning", ["gym", "dog"], ["bday", "peanut", "loans"]),
  c("dev", "When's the best time for me to write my paper?", ["owl"], ["peanut", "bday", "rent"]),
  c("test", "I have to speak in front of the class Friday and I'm freaking out", ["nerves"], ["peanut", "rent", "trip"]),
  c("dev", "What present should I get for my sister?", ["bday"], ["rent", "peanut", "gym"]),
  c("test", "How do I get to my shift if it pours?", ["bike", "job"], ["peanut", "bday", "loans"]),
  c("dev", "Can I swing a weekend in Chicago?", ["trip"], ["peanut", "lab", "bday"]),
  c("test", "Who am I doing the experiment with this week?", ["lab"], ["rent", "veg", "trip"]),
  c("dev", "Is it okay to stay out late on a Tuesday?", ["sleep"], ["peanut", "bday", "loans"]),
  c("test", "Remind me what family things I have coming up", ["mom", "bday"], ["peanut", "rent", "lab"]),
  c("dev", "What do I owe for the power bill?", ["roomies"], ["peanut", "bday", "lab"]),
  c("test", "How much can I put toward groceries this week?", ["food$"], ["bday", "lab", "nerves"]),
  c("dev", "Help me get ready for my clinical rotation", ["major"], ["peanut", "rent", "trip"]),
  c("test", "Quiz me on some vocab", ["spanish"], ["rent", "peanut", "loans"]),
  c("dev", "Find me a free evening for rehearsal stuff", ["band"], ["peanut", "loans", "bday"]),
  c("test", "Can I give more time to helping out in the community?", ["foodbank"], ["peanut", "lab", "rent"]),
  c("dev", "What happens with my debt once I finish school?", ["loans"], ["peanut", "bday", "lab"]),
  c("test", "Order me some ice cream", ["lactose"], ["rent", "lab", "loans"]),
  c("dev", "Pick a restaurant for Friday night", ["veg", "peanut"], ["lab", "loans", "nerves"]),
  c("test", "I'm wiped out, how do I get more rest?", ["sleep"], ["peanut", "rent", "trip"]),
  c("dev", "Who should I check in with this weekend?", ["mom"], ["peanut", "lab", "loans"]),
  c("test", "Walk me through tomorrow before my 9 AM lecture", ["dog"], ["bday", "loans", "rent"]),
  c("dev", "What's the cheapest way to get around this week?", ["car", "bike"], ["peanut", "bday", "nerves"]),
  c("test", "I want to pick up some extra hours", ["job"], ["peanut", "bday", "veg"]),
  c("dev", "Should I take an evening class on Thursdays?", ["job"], ["peanut", "bday", "lactose"]),
  c("test", "Thinking about a summer abroad", ["trip"], ["peanut", "lab", "rent"]),
  c("dev", "Can I host a dinner party at my place?", ["roomies"], ["loans", "lab", "nerves"]),
  c("test", "Help me pick a breakfast that keeps me full", ["veg", "lactose"], ["rent", "lab", "bday"]),
  c("dev", "My stomach always hurts after pizza", ["lactose"], ["rent", "bday", "trip"]),
  c("test", "What should I bring to the potluck?", ["veg", "peanut"], ["rent", "lab", "loans"]),
  c("dev", "Can I go away for the weekend without worrying about home?", ["dog"], ["lab", "loans", "nerves"]),
  c("test", "How's my money looking for the summer?", ["trip"], ["peanut", "lab", "nerves"]),
  c("dev", "Plan a long study night for anatomy", ["owl", "major"], ["peanut", "bday", "rent"]),
  c("test", "Can I afford new gear for practice?", ["band"], ["peanut", "lab", "bday"]),
  c("dev", "My heart races before speaking up in seminar", ["nerves"], ["rent", "peanut", "loans"]),
  c("test", "Is Sunday night free?", ["mom"], ["peanut", "lab", "loans"]),
  c("dev", "What time should my alarm go off on Friday?", ["gym"], ["peanut", "bday", "loans"]),
  c("test", "Should I get the meal plan at the dining hall?", ["veg", "food$"], ["lab", "bday", "nerves"]),
  c("dev", "Any good apps to learn a language?", ["spanish"], ["rent", "peanut", "lab"]),
  c("test", "Help me split the bills this month", ["roomies", "rent"], ["peanut", "bday", "nerves"]),
  c("dev", "What did I tell you about my career plans?", ["major"], ["peanut", "rent", "bday"]),
  c("test", "Is it bad if I skip my workout tomorrow?", ["gym"], ["peanut", "bday", "loans"]),
  c("dev", "Grab me something from the vending machine", ["peanut"], ["rent", "lab", "loans"]),
  c("test", "How early do I need to leave for campus Monday?", ["car", "dog"], ["peanut", "bday", "loans"]),
  c("dev", "Can I do a cooking class on Wednesday evening?", ["band", "veg"], ["loans", "lab", "rent"]),
  c("test", "What should I get at the coffee shop?", ["tea", "lactose"], ["rent", "lab", "loans"]),
  c("dev", "hey", [], ["veg", "peanut", "rent", "bday", "lab", "loans", "trip", "gym"]),
  c("test", "thanks, that's all", [], ["veg", "peanut", "rent", "bday", "lab", "loans", "trip", "gym"]),
];
