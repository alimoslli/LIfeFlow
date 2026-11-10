/**
 * Idea clouds (owner, 2026-11-10): little clouds near the chat bar, each one thing you can tell or ask your skyling. They
 * are the feature showcase ("show off what the app does without a whole page for it"): short (about 6 words), chosen from
 * the person's real data (never guessed), what they haven't tried first, and every one maps to a tool that works today.
 * Tapping fills the chat bar with `ask`, ready to send, never sent for them. The skyling then does it for real.
 *
 * Pure: the page gathers the facts (services/idea-clouds.ts) and this picks. Tested in tests/unit/idea-clouds.test.ts.
 */

/** What the person's account has, from real records only. */
export type CloudFacts = {
  /** Has classes or uses School. */
  student: boolean;
  /** Has a job or shifts. */
  worker: boolean;
  /** An assignment is due in the next 7 days. */
  dueSoon: boolean;
  /** An open assignment that's a project. */
  project: boolean;
  /** Shifts coming up. */
  shifts: boolean;
  /** A class meets today. */
  classToday: boolean;
  /** A bank (or account) is connected. */
  bank: boolean;
  /** The Money lock is on: no money cloud at all. */
  moneyLocked: boolean;
  /** Apple Health is sending data. */
  health: boolean;
  /** A short title of the next open assignment, for "I finished ...". */
  nextAssignment?: string;
  /** Features already used (real records, or a cloud tapped before). Used ones show rarely. */
  used: Partial<Record<CloudKey, boolean>>;
  /** Days since the account was made (the first week aims to show each major feature once). */
  ageDays: number;
};

export type CloudKey =
  | "plan_week"
  | "promise"
  | "afford"
  | "free_time"
  | "shift_moved"
  | "syllabus"
  | "bills_week"
  | "subscriptions"
  | "finished"
  | "sleep"
  | "break_project"
  | "first_today"
  | "goal"
  | "quick_win";

type Cloud = {
  key: CloudKey;
  /** What the cloud says, in the skyling's name: about 6 words. */
  say: (name: string, f: CloudFacts) => string;
  /** What lands in the chat bar when tapped (the person's own words, ready to send). */
  ask: (f: CloudFacts) => string;
  /** Shown only when the facts make it useful. */
  when: (f: CloudFacts) => boolean;
  /** The tools that carry it out (tests check each exists in the registry). */
  tools: string[];
  /** One of the major features the first week shows once each. */
  major?: boolean;
  /** Touches money: never while the Money lock is on. */
  money?: boolean;
};

const short = (t?: string) => (t && t.length <= 24 ? t : undefined);

export const CLOUDS: Cloud[] = [
  {
    key: "plan_week",
    say: (n) => `Have ${n} plan my week`,
    ask: () => "Plan my week around what's due.",
    when: (f) => f.dueSoon,
    tools: ["get_agenda", "list_assignments", "find_free_time"],
    major: true,
  },
  {
    key: "promise",
    say: (n) => `Tell ${n} I'll study tonight at 8`,
    ask: () => "I'll study tonight at 8.",
    when: (f) => f.student,
    tools: ["make_promise"],
    major: true,
  },
  {
    key: "afford",
    say: (n) => `Ask ${n}: dinner out tonight?`,
    ask: () => "Can I afford dinner out tonight?",
    when: (f) => f.bank,
    tools: ["tonight", "check_affordability"],
    major: true,
    money: true,
  },
  {
    key: "free_time",
    say: (n) => `Have ${n} find 2 free hours`,
    ask: () => "Find me 2 free hours this week.",
    when: () => true,
    tools: ["find_free_time"],
    major: true,
  },
  {
    key: "shift_moved",
    say: (n) => `Tell ${n} my shift moved`,
    ask: () => "My shift moved to Thursday.",
    when: (f) => f.shifts,
    tools: ["list_shifts", "update_shift"],
  },
  {
    key: "syllabus",
    say: (n) => `Send ${n} your syllabus`,
    ask: () => "Here's my syllabus. Add every due date and exam to the right class.",
    when: (f) => f.student,
    tools: ["read_attachment", "import_assignments"],
    major: true,
  },
  {
    key: "bills_week",
    say: (n) => `Ask ${n} what bills hit this week`,
    ask: () => "What bills hit this week?",
    when: (f) => f.bank,
    tools: ["cash_forecast", "recurring_payments"],
    major: true,
    money: true,
  },
  {
    key: "subscriptions",
    say: (n) => `Have ${n} spot forgotten subscriptions`,
    ask: () => "Find subscriptions I forgot about.",
    when: (f) => f.bank,
    tools: ["find_subscriptions"],
    major: true,
    money: true,
  },
  {
    key: "finished",
    say: (n, f) => `Tell ${n} I finished ${short(f.nextAssignment)}`,
    ask: (f) => `I finished ${short(f.nextAssignment)}.`,
    when: (f) => !!short(f.nextAssignment),
    tools: ["list_assignments", "update_assignment"],
  },
  {
    key: "sleep",
    say: (n) => `Ask ${n} how I slept`,
    ask: () => "How did I sleep this week?",
    when: (f) => f.health,
    tools: ["get_health_summary"],
  },
  {
    key: "break_project",
    say: (n) => `Have ${n} break my project down`,
    ask: () => "Break my project into small steps.",
    when: (f) => f.project,
    tools: ["list_assignments", "create_tasks"],
  },
  {
    key: "first_today",
    say: () => "What should I do first today?",
    ask: () => "What should I do first today?",
    when: () => true,
    tools: ["get_agenda"],
    major: true,
  },
  {
    key: "goal",
    say: (n) => `Tell ${n} a goal: 12 books`,
    ask: () => "My goal: read 12 books this year.",
    when: () => true,
    tools: ["create_personal_goal"],
    major: true,
  },
  {
    key: "quick_win",
    say: (n) => `Ask ${n} for a quick win`,
    ask: () => "Give me a quick win before class.",
    when: (f) => f.classToday,
    tools: ["list_tasks", "list_assignments"],
    major: true,
  },
];

/** A cloud ready to show: what it says, and what lands in the bar. */
export type IdeaCloud = { key: CloudKey; say: string; ask: string };

/** A small, stable shuffle for the day, so the clouds change from day to day but not on every refresh. */
function rank(key: string, seed: number) {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b) >>> 0;
  return h >>> 0;
}

/**
 * The clouds to show (at most `count`), in order. Unused features come first; a used one only fills a gap, and then only
 * one day in three. In the first week the major features take turns so each shows at least once. `day` is the person's
 * local day number (days since the epoch in their time zone), which seeds the order.
 */
export function pickClouds(f: CloudFacts, name: string, day: number, count = 3): IdeaCloud[] {
  const fits = CLOUDS.filter((c) => c.when(f) && !(c.money && f.moneyLocked));
  const order = (cs: Cloud[]) => [...cs].sort((a, b) => rank(a.key, day) - rank(b.key, day));
  const unused = fits.filter((c) => !f.used[c.key]);
  // the first week: the major features first, so each gets its turn
  const fresh = f.ageDays < 7 ? [...order(unused.filter((c) => c.major)), ...order(unused.filter((c) => !c.major))] : order(unused);
  const used = day % 3 === 0 ? order(fits.filter((c) => f.used[c.key])) : [];
  return [...fresh, ...used].slice(0, count).map((c) => ({ key: c.key, say: c.say(name, f), ask: c.ask(f) }));
}
