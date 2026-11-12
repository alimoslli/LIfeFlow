import type { MemoryCategory } from "@/server/db/schema";
import type { RetrievableMemory } from "@/server/jarvis/memory-retrieval";

/** The memory picker's labelled cases (tests/unit/memory-retrieval.test.ts), shared with the local-model comparison. */
const at = new Date("2026-10-01T00:00:00Z");
export const mem = (id: string, category: MemoryCategory, content: string): RetrievableMemory => ({
  id,
  category,
  content,
  basis: "stated",
  updatedAt: at,
  lastUsedAt: null,
});

export const M = [
  mem("study", "preference", "Prefers studying in the morning."),
  mem("job", "routine", "Works at the Campus Library, usually Tue/Thu evenings and Saturday mornings."),
  mem("trip", "goal", "Saving for a summer trip to Montréal."),
  mem("food$", "goal", "Wants to keep food spending under $450 a month."),
  mem("car", "routine", "Has a car; drives to campus on Mondays and takes the bus other days."),
  mem("dollars", "instruction", "Show amounts in whole dollars."),
  mem("midterms", "temporary", "Midterm season: extra stressed until mid-November."),
  mem("veg", "fact", "Is vegetarian."),
  mem("bday", "fact", "Sister Maya's birthday is May 3."),
  mem("peanut", "fact", "Allergic to peanuts."),
  mem("lab", "fact", "Biology II lab partner is Jordan."),
  mem("rent", "fact", "Rent is $900, due on the 1st."),
];

/** Labelled cases: what must reach the model, and what must not. */
export const CASES: { q: string; recent?: string[]; must: string[]; never: string[] }[] = [
  { q: "When should I study for my bio exam this week?", must: ["study", "job", "midterms"], never: ["veg", "bday", "peanut", "rent"] },
  { q: "Can I afford a $100 concert this weekend?", must: ["trip", "food$", "rent"], never: ["veg", "bday", "peanut", "lab"] },
  { q: "Any cheap dinner ideas?", must: ["veg", "peanut", "food$"], never: ["job", "car", "bday", "lab"] },
  { q: "What's my sister's birthday?", must: ["bday"], never: ["study", "job", "trip", "food$", "car", "veg", "peanut", "lab", "rent", "midterms"] },
  { q: "How do I get to campus on Monday?", must: ["car"], never: ["veg", "peanut", "rent", "bday"] },
  { q: "hi", must: [], never: ["study", "job", "trip", "food$", "car", "midterms", "veg", "bday", "peanut", "lab", "rent"] },
  { q: "what about next weekend?", recent: ["Can I afford a $100 concert this weekend?"], must: ["trip", "food$"], never: ["veg", "bday", "peanut", "lab"] },
  { q: "Who's my lab partner?", must: ["lab"], never: ["trip", "food$", "rent", "veg", "peanut"] },
  { q: "Plan my week", must: ["study", "job", "car"], never: ["veg", "peanut", "rent", "bday"] },
  { q: "I'm so stressed about midterms", must: ["midterms"], never: ["rent", "veg", "trip"] },
  { q: "How much did I spend on groceries?", must: ["food$"], never: ["bday", "lab", "car"] },
];
