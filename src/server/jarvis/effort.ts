import type { SkillFile } from "./skills";

/**
 * How hard the model thinks on this turn ("auto" reasoning). Quick lookups and adds stay fast and cheap;
 * advice, decisions and plans think more; files and big multi-part plans think most. One level per turn.
 */
export type Effort = "low" | "medium" | "high";

/** Skills whose answers are judgement calls (plans, money decisions, coaching), not lookups. */
const THINKING_SKILLS = new Set([
  "daily-planner",
  "smart-scheduler",
  "budget-coach",
  "purchase-advisor",
  "savings-goals",
  "paycheck-planner",
  "subscription-hunter",
  "task-breakdown",
  "weekly-review",
  "comparison",
  "career-helper",
  "tutor",
  "writing-helper",
]);

const DEEP =
  /semester|whole (week|month)|all (of )?my (classes|assignments|bills|courses|tasks)|step by step|in detail|thorough|deep dive|long[- ]term|full plan/;
const THINK =
  /\bthe plan\b|\b(do|start( with)?|tackle) first\b|\bbest (to do|thing to do|use)\b|what (should|do|can) i do\b|\bnext\?|should i|help me (decide|plan|figure|choose|budget|save|organi[sz]e|prioriti[sz]e)|\bplan (my|out|a|the)\b|compare|which (one|is better|should)|\bwhy\b|best way|strateg|prioriti|reorgani|figure out|what if|worth it|advice|\bcan i afford|on track|cut back|how (do|can|should) i|study plan|help me (study|prepare|prep)|quiz me|find (me )?(time|\d+ hours?)|reschedul/;

/**
 * Money never goes to the small model (owner's yes and the COO's rule, 2026-11-12: in the paid try-out the small model said
 * "groceries look fine" while the bills were larger than the balance). A low turn runs on the small model
 * (providers/openai.ts), so anything about money is at least medium: its words, a money skill, or a money tool group.
 */
const MONEY =
  /\$|\bmoney\b|\bspen[dt]|afford|budget|\bbills?\b|\bpa(y|id|ying)\b|paycheck|\bearn|\bmake\b|\bcosts?\b|price|balance|\bbank|subscri|charge|\bsav(e|es|ed|ing)\b|\bowe|debt|\brent\b|\bcash\b|zell|venmo|transaction|purchase|bought|\bbuy|refund|\bfees?\b|income|deposit|\bloan|credit|grocer|\btips?\b|\bwage|salary|\bdollars?\b|\bchecking\b|\bsavings\b|\baccounts? balance|\bnet worth/;
/**
 * Money said without a money word (COO review, 2026-11-12): splitting a bill, a currency word or sign, "how much", what's
 * left or coming out, a store, or a bare amount ("is 40 too much for dinner?", "12.50"). An amount is a number of 10 or
 * more, or one with cents, that isn't a time, a date or a count of something else ("at 10", "10:30", "the 15th",
 * "10 pages"). Catching too much only costs a little more; missing one sends a money question to the small model.
 */
const MONEY_TOO =
  /\bsplit|\bquid\b|\bbucks?\b|\beuros?\b|\bpounds?\b|\bpesos?\b|[£€¥₹₩]|\bhow much\b|\bleft (this|for|to|until|till|after|over)\b|\bwhat'?s left\b|\bcoming out\b|\bphone plan\b|\b(target|walmart|costco|trader joe'?s|whole foods|starbucks|amazon|cvs|walgreens|chipotle|doordash|uber ?eats|grubhub|instacart)\b/;
/**
 * More money said plainly (COO review 2, 2026-11-12), and money in the other languages students write in. Over-matching
 * is fine (COO): a word here only sends the turn to the main model.
 */
const MONEY_MORE =
  /\bleft\b|expens|\btotal|\bnet\b|payday|payment|invoice|electric|\butilit|allowance|stipend|tuition|bursar|\baid\b|scholarship|\btax|\bfines?\b|overdraft|\bdebit|\btab\b|wallet|\bfunds?\b|\bafford|\bcheap|expensive|\bworth\b|\bsplurge|\bowing\b|\breimburs|\bpaypal|cash ?app|apple pay|\bvenmo|\bpay ?pal|\binsurance|\bpremium|\bcopay|\bdeductible|\binterest\b|\bapr\b|\bstock|\binvest|crypto|bitcoin|\bdeal\b|discount|coupon|\bsale\b|\btip\b|\bgas money|\bmeal plan|dining dollars|\bswipes?\b|\bpaid\b|\bpayroll|\bcheck\b|cheque/;
const MONEY_ABROAD =
  /dinero|plata|cu[aá]nto (cuesta|es|tengo|gast)|gast[eéoó]|pagar|pago|cuenta|precio|sueldo|salario|ahorr|deuda|factura|renta\b|argent|combien|payer|facture|loyer|salaire|[ée]conomi|dette|geld|kosten|bezahl|rechnung|miete|gehalt|dinheiro|quanto|pagamento|conta\b|soldi|quanto costa|affitto|stipendio|مال|فلوس|كم|ريال|دولار|دينار|راتب|فاتورة|إيجار|पैसे|रुपये|钱|元|块|お金|円|돈|원|деньг|рубл|цена|zł|pieni[ąę]dz|para\b|lira|taka|naira|peso/;
const AMOUNT =
  /(?<![\d:/.-]|\bat )\b(\d{2,}(\.\d{1,2})?|\d+\.\d{2})\b(?![:/-]|\s*(?:a\.?m\b|p\.?m\b|st\b|nd\b|rd\b|th\b|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|pages?|words?|questions?|problems?|chapters?|steps?|%|percent|o'?clock))/;

const MONEY_SKILLS = new Set(["budget-coach", "purchase-advisor", "savings-goals", "paycheck-planner", "subscription-hunter"]);

/**
 * A read-only question about the day, the week or what's due ("what do I need to get done today?", "which day is the
 * hardest?"): our tools have the facts and the small model only words them, so it goes to the small model even when its
 * skill is a planning one (owner's yes, 2026-11-12, from the paid try-out). Asking for a plan or advice is THINK, not this.
 */
const LOOKUP =
  /^(what('s| is| are| do i| have i| did i)|when('s| is| are| do i| does)|how many|do i have|which (day|class|one is due)|am i (free|busy|working)|is (there|anything)|anything)\b/;

/**
 * Low only on a positive signal (COO review 2, 2026-11-12): the question names classes and school, to-dos, shifts or the
 * calendar, and nothing in it is money or a plan. Anything else ("what's the total?", "hi") goes to medium.
 */
const ABOUT_THE_DAY =
  /\b(today|tonight|tomorrow|this (morning|afternoon|evening|week|weekend)|next week|weekend|(mon|tues|wednes|thurs|fri|satur|sun)day|morning|afternoon|evening|overdue|due|deadlines?|class(es)?|course|lecture|lab|exams?|quiz(zes)?|midterms?|finals?|tests?|homework|assignments?|essay|paper|project|readings?|syllabus|canvas|grades?|to-?dos?|tasks?|reminders?|errands?|shifts?|work(ing)?|job|schedule|calendar|events?|meetings?|appointments?|busy|free|hours|get done|finish(ed)?|remind me|add (a|an|it|this|that)|move (it|that|my)|done|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b|\b\d{1,2}\/\d{1,2}\b|\b(at|by) \d{1,2}(:\d{2})?\b|\bthe \d{1,2}(st|nd|rd|th)\b/;

export function chooseEffort(i: { text: string; skills: SkillFile[]; hasFiles: boolean; coachMode: boolean; moneyTools?: boolean }): Effort {
  const t = i.text.toLowerCase().trim();
  if (i.hasFiles || t.length > 600 || DEEP.test(t)) return "high";
  const money =
    !!i.moneyTools ||
    MONEY.test(t) ||
    MONEY_TOO.test(t) ||
    MONEY_MORE.test(t) ||
    MONEY_ABROAD.test(t) ||
    AMOUNT.test(t) ||
    i.skills.some((s) => MONEY_SKILLS.has(s.name));
  if (i.coachMode || THINK.test(t)) return "medium";
  if (money) return "medium";
  if (!ABOUT_THE_DAY.test(t)) return "medium";
  if (i.skills.some((s) => THINKING_SKILLS.has(s.name)) && !LOOKUP.test(t)) return "medium";
  return "low";
}
