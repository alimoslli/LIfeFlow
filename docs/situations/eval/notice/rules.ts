/**
 * The grading rules. Each rule is defined from the made-up person's DATA (shifts, classes, events, assignments, bank lines,
 * what the simulator planted), never from what a detector does, so a detector can be shown to be wrong.
 * See README.md for the plain-words definitions. Pure functions: no database, no app code except date helpers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { addDaysStr, localDateOf, localToInstant } from "@/lib/dates";
import type { Said } from "./replay";

/** Today's clash line carries its pairs' ids in order (soonest first, then the one in its detail): [a, b, a2, b2]. */
const pairsOf = (refs: string[] | undefined) => {
  const r = refs ?? [];
  return Array.from({ length: Math.floor(r.length / 2) }, (_, k) => [r[2 * k], r[2 * k + 1]] as const);
};

export type Shift = { id: string; start: Date; end: Date; knownAt: Date };
export type Block = { id: string; title: string; kind: string; start: Date; end: Date; knownAt: Date };
export type Asg = { id: string; title: string; kind: string; points: number; due: Date; knownAt: Date };
export type Tx = { id: string; account: string; day: string; posted: string; amount: number; kind: string; desc: string; recurring: boolean };
export type Series = { id: string; name: string; kind: string; frequency: string; charges: string[] };
export type Life = {
  tz: string;
  firstDay: string; // first replayed day
  lastDay: string; // "now"
  shifts: Shift[];
  blocks: Block[];
  assignments: Asg[];
  txns: Tx[];
  openingChecking: number;
  series: Series[];
  planted: Set<string>; // ids of things the grader planted
  plantMeta: { id: string; type: string; with?: string; bill_tx?: string; bill?: string }[];
};

export type Result = "caught" | "late" | "missed";
export type Ev = {
  rule: string;
  key: string;
  day: string; // the day it happens (or the first charge, for price changes)
  planted: boolean;
  desc: string;
  /** false when the app could not have known in time (so it is not counted either way) */
  gradable: boolean;
  why?: string;
  result?: Result;
  via?: string;
  leadDays?: number;
  instead: string[];
};
export type FalseAlarm = { rule: string; day: string; what: string; why: string };
export type Grade = { events: Ev[]; falseAlarms: FalseAlarm[]; quiet: { days: number; noisyDays: number; noisy: string[]; kinds: string[] }; extra: Record<string, number> };

const MIN = 60000;
const HOUR = 3600000;

// ---------------------------------------------------------------------------------------------- loading

const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function loadLife(dir: string): Life {
  const meta = J(path.join(dir, "meta.json"));
  const c = (n: string) => J(path.join(dir, "connections", `${n}.json`));
  const plants = J(path.join(dir, "plants.json"));
  const tz: string = meta.time_zone;
  const D = (s: string) => new Date(s);
  const addedAt = new Map<string, Date>();
  for (const p of plants) if (p.added_at) addedAt.set(p.id, new Date(localToInstant(p.added_at.slice(0, 10), p.added_at.slice(11, 16), tz)));
  const moved = new Map<string, any>(plants.filter((p: any) => p.type === "exam_move").map((p: any) => [p.exam_id, p]));
  const work = c("work"), cal = c("calendar"), school = c("school"), bank = c("bank");
  const truth = J(path.join(dir, "truth.json"));
  const announced = (m: any) => new Date(localToInstant(m.announced_at.slice(0, 10), m.announced_at.slice(11, 16), tz));
  const shifts: Shift[] = work.shifts
    .filter((s: any) => s.status !== "cancelled")
    .map((s: any) => ({ id: s.id, start: D(s.starts_at), end: D(s.ends_at), knownAt: s.posted_at ? D(s.posted_at) : new Date(D(s.starts_at).getTime() - 7 * 24 * HOUR) }));
  const blocks: Block[] = cal.events
    .filter((e: any) => !e.all_day && e.kind !== "study" && e.kind !== "work")
    .map((e: any) => {
      const mv = e.kind === "exam" ? [...moved.values()].find((m: any) => m.exam_id.replace(/^exam-/, "ev-exam-") === e.id) : null;
      return { id: e.id, title: e.title, kind: e.kind, start: D(e.starts_at), end: D(e.ends_at), knownAt: mv ? announced(mv) : e.created_at ? D(e.created_at) : new Date(0) };
    });
  const assignments: Asg[] = school.assignments
    .filter((a: any) => a.due_at)
    .map((a: any) => ({ id: a.id, title: a.title, kind: a.kind, points: Number(a.points_possible ?? 0), due: D(a.due_at), knownAt: addedAt.get(a.id) ?? (moved.get(a.id) ? announced(moved.get(a.id)) : new Date(0)) }));
  const rec = new Set<string>(truth.recurring.flatMap((r: any) => r.charges));
  const txns: Tx[] = bank.transactions.map((t: any) => ({
    id: t.id, account: t.account_id, day: t.authorized_date ?? t.date, posted: t.date, amount: t.amount_cents, kind: t.kind, desc: t.description, recurring: rec.has(t.id),
  }));
  const kinds = new Map<string, string>(meta.bills.map((b: any) => [b.id, b.kind]));
  const series: Series[] = truth.recurring.map((r: any) => ({ id: r.bill, name: r.name, kind: kinds.get(r.bill) ?? "bill", frequency: r.frequency, charges: r.charges }));
  const acc = bank.accounts.find((a: any) => a.id === "acc-checking");
  return {
    tz, firstDay: meta.replay_start, lastDay: meta.now.slice(0, 10), shifts, blocks, assignments, txns, openingChecking: acc?.opening_balance_cents ?? 0, series,
    planted: new Set(meta.changes.map((x: any) => x.id)), plantMeta: plants,
  };
}

// ---------------------------------------------------------------------------------------------- small helpers

const day = (life: Life, d: Date) => localDateOf(d, life.tz);
const hourOf = (life: Life, d: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: life.tz }).format(d)) % 24;
const looksOn = (said: Said[], pred: (s: Said) => boolean) => said.filter(pred);
const isPlanted = (life: Life, ...ids: string[]) => ids.some((i) => life.planted.has(i) || life.plantMeta.some((p) => p.with === i && life.planted.has(p.id)));
const gradableDay = (life: Life, x: string) => x >= addDaysStr(life.firstDay, 1) && x <= addDaysStr(life.lastDay, 1);
const lookTime = (life: Life, date: string, time = "20:30") => new Date(localToInstant(date, time, life.tz));
const describe = (s: Said) => `${s.date} ${s.time} ${s.surface === "today" ? "Today: " : ""}${(s.text ?? s.kind).slice(0, 80)}`;

/** What the app said around a day, to show next to a miss. */
function instead(said: Said[], from: string, to: string): string[] {
  const near = said.filter((s) => s.date >= from && s.date <= to && s.kind !== "morning_brief" && s.kind !== "consent");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of near) {
    const k = s.kind + (s.text ?? "").slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(describe(s));
    if (out.length >= 3) break;
  }
  return out.length ? out : ["nothing"];
}

const overlapMin = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => (Math.min(a.end.getTime(), b.end.getTime()) - Math.max(a.start.getTime(), b.start.getTime())) / MIN;

// ---------------------------------------------------------------------------------------------- rule 1: two things at the same time

export function overlapEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  const pairs = new Set<string>(); // every real overlap in the data, graded or not (to tell a false alarm from an unlisted real one)
  const pair = (a: string, b: string) => [a, b].sort().join("|");
  const items = [...life.shifts.map((s) => ({ ...s, title: "shift", kind: "shift" })), ...life.blocks];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (overlapMin(items[i], items[j]) > 0) pairs.add(pair(items[i].id, items[j].id));
  for (const sh of life.shifts)
    for (const b of life.blocks) {
      if (overlapMin(sh, b) < 15) continue;
      const start = new Date(Math.max(sh.start.getTime(), b.start.getTime()));
      const x = day(life, start);
      const known = new Date(Math.max(sh.knownAt.getTime(), b.knownAt.getTime()));
      const ev: Ev = {
        rule: "overlap", key: pair(sh.id, b.id), day: x, planted: isPlanted(life, sh.id, b.id),
        desc: `${b.kind === "exam" ? "Exam" : b.kind === "class" ? "Class" : "Event"} "${b.title}" overlaps a shift on ${x} (${Math.round(overlapMin(sh, b))} min)`, gradable: true, instead: [],
      };
      if (x < addDaysStr(life.firstDay, 1) || x > addDaysStr(life.lastDay, 1)) continue;
      if (known > lookTime(life, addDaysStr(x, -1))) {
        ev.gradable = false;
        ev.why = "the app learned of it less than a day before";
        events.push(ev);
        continue;
      }
      const hit = looksOn(said, (s) => s.surface === "today" && s.kind === "conflict" && pairsOf(s.refs).some(([x, y]) => (x === sh.id && y === b.id) || (x === b.id && y === sh.id)));
      const early = hit.filter((s) => s.date <= addDaysStr(x, -1));
      if (early.length) Object.assign(ev, { result: "caught", via: "Today line", leadDays: Math.round((Date.parse(x) - Date.parse(early[0].date)) / 86400000) });
      else if (hit.length) Object.assign(ev, { result: "late", via: "Today line, only on the day" });
      else ev.result = "missed";
      if (ev.result === "missed") {
        const other = said.find((s) => s.surface === "today" && s.kind === "conflict" && s.date <= addDaysStr(x, -1) && s.date >= addDaysStr(x, -7));
        ev.via = other ? "Today showed a different clash instead (it shows one at a time)" : "Today showed no clash at all";
      }
      if (ev.result !== "caught") ev.instead = instead(said, addDaysStr(x, -2), x);
      events.push(ev);
    }
  return { events, pairs, pair };
}

// ---------------------------------------------------------------------------------------------- rule 2: a deadline right after a long or late shift

const LONG_HOURS = 7;
const LATE_HOUR = 21;
export function deadlineEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  const real = new Set<string>();
  for (const a of life.assignments) {
    if (a.kind === "reading") continue;
    const x = day(life, a.due);
    for (const sh of life.shifts) {
      const sd = day(life, sh.start);
      if (sd !== addDaysStr(x, -1)) continue;
      const long = (sh.end.getTime() - sh.start.getTime()) / HOUR >= LONG_HOURS;
      const late = day(life, sh.end) > sd || hourOf(life, sh.end) >= LATE_HOUR;
      if (!long && !late) continue;
      real.add(`${a.title}|${x}`);
      if (sd < addDaysStr(life.firstDay, 1) || sd > life.lastDay) continue;
      const known = new Date(Math.max(sh.knownAt.getTime(), a.knownAt.getTime()));
      const ev: Ev = {
        rule: "deadline", key: `${a.id}|${sh.id}`, day: sd, planted: isPlanted(life, a.id, sh.id),
        desc: `"${a.title}" is due ${x}; a ${long ? "long" : "late"} shift ends ${hourOf(life, sh.end)}:00 the day before (${sd})`, gradable: true, instead: [],
      };
      if (known > lookTime(life, addDaysStr(sd, -1))) {
        ev.gradable = false;
        ev.why = "the app learned of one of them less than a day before the shift";
        events.push(ev);
        continue;
      }
      const hit = looksOn(said, (s) => s.surface === "message" && s.kind === "deadline_conflict" && s.facts.assignment === a.title);
      const early = hit.filter((s) => s.date <= addDaysStr(sd, -1));
      if (early.length) Object.assign(ev, { result: "caught", via: "message", leadDays: Math.round((Date.parse(sd) - Date.parse(early[0].date)) / 86400000) });
      else if (hit.length) Object.assign(ev, { result: "late", via: "message, only the shift day or after" });
      else ev.result = "missed";
      if (ev.result !== "caught") ev.instead = instead(said, addDaysStr(sd, -2), x);
      events.push(ev);
    }
  }
  return { events, real };
}

// ---------------------------------------------------------------------------------------------- rule 3: a bill larger than the money before payday

export function balanceAt(life: Life, endOfDay: string) {
  return life.openingChecking + life.txns.filter((t) => t.account === "acc-checking" && t.day <= endOfDay).reduce((s, t) => s + t.amount, 0);
}

/** Bills whose amount moves (power, water) are matched loosely: the app says what it expects, the bank shows what came. */
const closeCents = (a: number, b: number) => Math.abs(a - b) <= Math.max(100, 0.35 * Math.max(a, b));

export function billEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  const truthBills: { x: string; cents: number; short: boolean; payFirst: boolean; account: string }[] = [];
  for (const s of life.series) {
    const irregular = s.frequency === "dates"; // paid on set dates: judged when the app says something, but not an event it had to predict
    const ch = s.charges.map((id) => life.txns.find((t) => t.id === id)).filter((t): t is Tx => !!t);
    ch.forEach((t, i) => {
      if (i < 2) return; // the app can only know a bill the person has paid twice before
      const x = t.day;
      if (x < addDaysStr(life.firstDay, 1) || x > life.lastDay) return;
      const B = -t.amount;
      const a0 = balanceAt(life, addDaysStr(x, -2)); // what is in checking when the day before the due day starts
      const incomeNear = life.txns.some((u) => u.account === "acc-checking" && u.kind === "income" && u.amount > 0 && u.day >= addDaysStr(x, -1) && u.day <= x);
      const incomeEarlier = life.txns.some((u) => u.account === "acc-checking" && u.kind === "income" && u.amount > 0 && u.day >= addDaysStr(x, -3) && u.day <= addDaysStr(x, -2));
      truthBills.push({ x, cents: B, short: t.account === "acc-checking" && a0 < B && !incomeNear, payFirst: incomeEarlier, account: t.account });
      if (t.account !== "acc-checking" || !(a0 < B) || incomeNear || irregular) return;
      const planted = life.plantMeta.some((p) => p.type === "bill_squeeze" && p.bill_tx === t.id && life.planted.has(p.id));
      const ev: Ev = {
        rule: "bill", key: t.id, day: x, planted, gradable: true, instead: [],
        desc: `${s.name} $${(B / 100).toFixed(2)} due ${x}, only $${(Math.max(a0, 0) / 100).toFixed(2)} in checking the day before, no pay landing first`,
      };
      const lo = addDaysStr(x, -3), hi = addDaysStr(x, -1);
      const msg = looksOn(said, (m) => m.surface === "message" && m.kind === "bill_short" && closeCents(Number(m.facts.billCents), B) && m.date >= lo && m.date <= hi);
      const today = looksOn(said, (m) => m.surface === "today" && m.kind === "overdraft" && m.date >= lo && m.date <= hi);
      if (msg.length) Object.assign(ev, { result: "caught", via: "bill_short message", leadDays: Math.round((Date.parse(x) - Date.parse(msg[0].date)) / 86400000) });
      else if (today.length) Object.assign(ev, { result: "caught", via: "Today overdraft line (not naming the bill)", leadDays: Math.round((Date.parse(x) - Date.parse(today[0].date)) / 86400000) });
      else ev.result = "missed";
      if (ev.result === "missed") {
        // what a bank's current (posted-only) balance showed the morning before the due day
        const posted = life.openingChecking + life.txns.filter((u) => u.account === "acc-checking" && u.posted <= addDaysStr(x, -1) && u.day <= addDaysStr(x, -2)).reduce((q, u) => q + u.amount, 0);
        ev.via = posted >= B ? "the shortfall came from charges still pending, which the app's cash figure leaves out" : "the app never said the money was short";
      }
      if (ev.result !== "caught") ev.instead = instead(said, lo, x);
      events.push(ev);
    });
  }
  return { events, truthBills };
}

/** A charge of that size did leave checking in the next 4 days but on a bill paid on set dates: judged by the data, never a false alarm. */
function irregularCharge(life: Life, cents: number, from: string) {
  return life.series.some((s) => s.frequency === "dates" && s.charges.some((id) => life.txns.some((t) => t.id === id && closeCents(-t.amount, cents) && t.day >= from && t.day <= addDaysStr(from, 4) && t.amount < 0)));
}

// ---------------------------------------------------------------------------------------------- rule 4: subscriptions

const FAMILIES: [string, RegExp][] = [
  ["video", /netflix|hulu|disney|\bmax\b|hbo|paramount|peacock|prime video|apple tv|crunchyroll/i],
  ["music", /spotify|apple music|youtube music|tidal|pandora|amazon music/i],
  ["cloud", /icloud|google one|dropbox|onedrive/i],
];

export function priceEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  const real: { name: string; x: string; from: number; to: number }[] = [];
  for (const s of life.series) {
    if (s.kind !== "subscription") continue;
    const ch = s.charges.map((id) => life.txns.find((t) => t.id === id)).filter((t): t is Tx => !!t).sort((a, b) => a.day.localeCompare(b.day));
    for (let i = 1; i < ch.length; i++) {
      const from = -ch[i - 1].amount, to = -ch[i].amount;
      if (to - from < 100 || to < from * 1.05) continue; // at least a dollar and 5% more
      const x = ch[i].day;
      real.push({ name: s.name, x, from, to });
      if (x < life.firstDay || x > addDaysStr(life.lastDay, -1)) continue;
      const ev: Ev = {
        rule: "price", key: ch[i].id, day: x, planted: isPlanted(life, ch[i].id, s.id) || life.plantMeta.some((p) => p.type === "price_rise" && p.bill === s.id && life.planted.has(p.id)), gradable: true,
        desc: `${s.name} went from $${(from / 100).toFixed(2)} to $${(to / 100).toFixed(2)} on ${x}`, instead: [],
      };
      const lim = addDaysStr(x, 7);
      const any = looksOn(said, (m) => m.surface === "message" && m.kind === "subscription_price_up" && Number(m.facts.toCents) === to && m.date >= x);
      const hit = any.filter((m) => m.date <= lim);
      if (hit.length) Object.assign(ev, { result: "caught", via: "message", leadDays: -Math.round((Date.parse(hit[0].date) - Date.parse(x)) / 86400000) });
      else if (any.length && any[0].date <= addDaysStr(x, 14)) Object.assign(ev, { result: "late", via: `message, ${Math.round((Date.parse(any[0].date) - Date.parse(x)) / 86400000)} days after the first new charge` });
      else ev.result = "missed";
      if (ev.result === "missed" && lim > life.lastDay) Object.assign(ev, { gradable: false, why: "less than 7 days of replay left after the charge" });
      if (ev.result !== "caught") ev.instead = instead(said, x, lim);
      events.push(ev);
    }
  }
  return { events, real };
}

export function duplicateEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  for (const [fam, re] of FAMILIES) {
    const subs = life.series.filter((s) => s.kind === "subscription" && re.test(s.name));
    if (subs.length < 2) continue;
    // known once two of them each have two charges
    const second = subs.map((s) => s.charges.map((id) => life.txns.find((t) => t.id === id)).filter((t): t is Tx => !!t && t.day <= life.lastDay).sort((a, b) => a.day.localeCompare(b.day))[1]?.day ?? "9999");
    const x = [...second].sort()[1];
    if (x > life.lastDay) continue;
    const start = x < life.firstDay ? life.firstDay : x;
    const lim = addDaysStr(start, 3);
    const names = subs.map((s) => s.name);
    const ev: Ev = {
      rule: "duplicate", key: `${fam}:${names.join("+")}`, day: start, planted: subs.some((s) => life.plantMeta.some((p) => p.type === "dup_sub" && life.planted.has(p.id) && (p as any).name === s.name)),
      desc: `Two ${fam} subscriptions at once: ${names.join(" + ")}`, gradable: start <= addDaysStr(life.lastDay, -3), instead: [],
    };
    const own = looksOn(said, (m) => m.surface !== "money-page" && m.date >= start && m.date <= lim && names.every((n) => (m.text ?? "").toLowerCase().includes(n.toLowerCase())));
    const page = looksOn(said, (m) => m.surface === "money-page" && m.kind === "duplicate_subscription" && m.date <= lim && names.every((n) => ((m.facts.names as string[]) ?? []).some((q) => q.toLowerCase() === n.toLowerCase())));
    if (own.length) Object.assign(ev, { result: "caught", via: "said on its own" });
    else if (page.length) Object.assign(ev, { result: "late", via: "only on the Money page when asked, never said on its own" });
    else ev.result = "missed";
    events.push(ev);
  }
  return events;
}

// ---------------------------------------------------------------------------------------------- rule 5: unusual charge

const norm = (d: string) => d.toLowerCase().replace(/[#*]?\d+/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export function unusualEvents(life: Life, said: Said[]) {
  const events: Ev[] = [];
  const real = new Set<string>();
  const spend = life.txns.filter((t) => t.kind === "expense" && t.amount < 0 && !t.recurring);
  for (const t of spend) {
    if (t.day < life.firstDay || t.day > life.lastDay) continue;
    const prior = spend.filter((u) => u.id !== t.id && norm(u.desc) === norm(t.desc) && u.day < t.day && u.day >= addDaysStr(t.day, -120)).map((u) => -u.amount);
    const A = -t.amount;
    const usual = prior.length >= 3 ? median(prior) : 0;
    const known = usual > 0 && A >= 5000 && A >= usual * 3;
    const oneOff = prior.length === 0 && A >= 25000 && !spend.some((u) => u.id !== t.id && norm(u.desc) === norm(t.desc));
    if (!known && !oneOff) continue;
    real.add(t.id);
    const planted = life.planted.has(t.id);
    const ev: Ev = {
      rule: known ? "unusual" : "oneoff", key: t.id, day: t.day, planted, gradable: t.day <= addDaysStr(life.lastDay, -2),
      desc: known ? `$${(A / 100).toFixed(2)} at "${t.desc}", usually about $${(usual / 100).toFixed(2)} (${(A / usual).toFixed(1)}x)` : `$${(A / 100).toFixed(2)} at "${t.desc}", a merchant never used before`, instead: [],
    };
    const lim = addDaysStr(t.day, 2);
    const hit = looksOn(said, (m) => m.surface === "message" && m.kind === "unusual_spend" && Number(m.facts.amountCents) === A && m.date >= t.day && m.date <= lim);
    if (hit.length) Object.assign(ev, { result: "caught", via: "message" });
    else ev.result = "missed";
    if (ev.result !== "caught") ev.instead = instead(said, t.day, lim);
    events.push(ev);
  }
  return { events, real, usualOf: (t: Tx) => t };
}

// ---------------------------------------------------------------------------------------------- everything together

const WARNING_KINDS = new Set(["bill_short", "deadline_conflict", "trial_ending", "unusual_spend", "subscription_price_up"]);

export function gradeWorld(life: Life, said: Said[], quietWorld: boolean): Grade {
  const o = overlapEvents(life, said);
  const d = deadlineEvents(life, said);
  const b = billEvents(life, said);
  const p = priceEvents(life, said);
  const dup = duplicateEvents(life, said);
  const u = unusualEvents(life, said);
  const events = [...o.events, ...d.events, ...b.events, ...p.events, ...dup, ...u.events];
  const fa: FalseAlarm[] = [];

  // false alarms: said, but the data shows nothing of the kind
  for (const s of said) {
    if (s.surface === "today" && s.kind === "conflict") {
      for (const [x, y] of pairsOf(s.refs))
        if (!o.pairs.has(o.pair(x, y))) fa.push({ rule: "overlap", day: s.date, what: s.text ?? "", why: "the two things don't overlap in the data" });
    }
    if (s.surface === "message" && s.kind === "deadline_conflict") {
      const dueDay = String(s.facts.dueDay);
      const anyReal = [...d.real].some((k) => k.startsWith(`${s.facts.assignment}|`) && new Date(k.split("|")[1] + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) === dueDay);
      if (!anyReal) {
        const a = life.assignments.find((q) => q.title === s.facts.assignment && new Date(day(life, q.due) + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) === dueDay && day(life, q.due) >= s.date);
        const sh = a ? life.shifts.filter((q) => day(life, q.start) === addDaysStr(day(life, a.due), -1)).sort((p, q) => q.end.getTime() - q.start.getTime() - (p.end.getTime() - p.start.getTime()))[0] : null;
        const hrs = sh ? Math.round((sh.end.getTime() - sh.start.getTime()) / HOUR) : 0;
        fa.push({ rule: "deadline", day: s.date, what: String(s.text ?? "").slice(0, 90), why: sh ? `a ${hrs}-hour shift ending ${hourOf(life, sh.end)}:00 (under ${LONG_HOURS} hours and before ${LATE_HOUR}:00)` : "no shift found the day before" });
      }
    }
    if (s.surface === "message" && s.kind === "bill_short") {
      const cents = Number(s.facts.billCents);
      if (addDaysStr(s.date, 4) > life.lastDay) continue; // the days it talks about haven't happened in this replay
      const near = b.truthBills.filter((t) => closeCents(t.cents, cents) && t.x >= s.date && t.x <= addDaysStr(s.date, 4));
      if (near.some((t) => t.short)) continue;
      const charged = life.txns.some((t) => t.account === "acc-checking" && t.amount < 0 && closeCents(-t.amount, cents) && t.day >= s.date && t.day <= addDaysStr(s.date, 4));
      if (!near.length && charged && irregularCharge(life, cents, s.date)) continue;
      const onCheckingNear = near.filter((t) => t.account === "acc-checking");
      const why = near.length
        ? onCheckingNear.length
          ? onCheckingNear.some((t) => t.payFirst) ? "pay landed before the due day and covered it" : "there was enough in checking"
          : "the bill is charged to the credit card, not taken from checking"
        : "no such bill came due";
      fa.push({ rule: "bill", day: s.date, what: String(s.text ?? "").slice(0, 90), why });
    }
    if (s.surface === "message" && s.kind === "subscription_price_up") {
      const to = Number(s.facts.toCents);
      if (!p.real.some((r) => r.to === to && s.date >= r.x)) fa.push({ rule: "price", day: s.date, what: String(s.text ?? "").slice(0, 90), why: "no subscription charge rose by a dollar and 5%" });
    }
    if (s.surface === "message" && s.kind === "unusual_spend") {
      const A = Number(s.facts.amountCents);
      const t = life.txns.find((x) => -x.amount === A && x.day <= s.date && x.day >= addDaysStr(s.date, -3));
      if (!t || !u.real.has(t.id)) fa.push({ rule: "unusual", day: s.date, what: String(s.text ?? "").slice(0, 90), why: "not 3x the usual at that merchant, or under $50" });
    }
  }

  // quiet days: a replayed day with nothing real going on for any rule; any warning then is noise
  const busy = new Set<string>();
  for (const e of events) {
    if (e.rule === "oneoff") continue;
    for (let x = addDaysStr(e.day, e.rule === "bill" ? -21 : -8); x <= addDaysStr(e.day, e.rule === "price" ? 14 : 3); x = addDaysStr(x, 1)) busy.add(x);
  }
  const noisy: string[] = [];
  const noisyKinds: string[] = [];
  let days = 0;
  for (let x = life.firstDay; x <= life.lastDay; x = addDaysStr(x, 1)) {
    if (busy.has(x)) continue;
    days++;
    const loud = said.filter((s) => s.date === x && ((s.surface === "message" && (s.urgent || WARNING_KINDS.has(s.kind))) || (s.surface === "today" && ["conflict", "overdraft"].includes(s.kind) && !(s.kind === "conflict" && pairsOf(s.refs).length > 0 && pairsOf(s.refs).every(([x, y]) => o.pairs.has(o.pair(x, y)))))));
    if (loud.length) {
      noisy.push(`${x} ${describe(loud[0])}`);
      noisyKinds.push(...new Set(loud.map((l) => (l.surface === "today" ? "Today " : "") + l.kind + (l.urgent && l.surface === "message" ? " (marked urgent)" : ""))));
    }
  }
  return { events, falseAlarms: fa, quiet: { days, noisyDays: noisy.length, noisy, kinds: noisyKinds }, extra: { quietWorld: quietWorld ? 1 : 0 } };
}
