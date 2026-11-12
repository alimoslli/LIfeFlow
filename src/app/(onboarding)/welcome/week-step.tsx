"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { respondAction } from "@/app/(app)/jarvis/proactive-actions";
import { CompanionGlyph } from "@/components/sky/companion-glyph";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { PixelName } from "@/components/pixel/art";
import { FormError, Input } from "@/components/ui/field";
import type { CompanionKey } from "@/lib/companions";
import type { ClockData, ClockItem } from "@/lib/day-clock";
import { cn } from "@/lib/utils";
import type { FirstThing, WeekFix } from "@/server/services/welcome-week";
import { saveFirstThingAction, skyNowAction, weekFixAction, type SkyResult } from "./actions";

/**
 * "Here's your week so far" (owner, 2026-11-12, proposal (a)): what really landed from their own connections, drawn by the
 * real wheel and timeline above (the same DayClock as Today, opened into the week), listed here in words, with at most one
 * first fix the skyling offers (Yes or Not now, Undo after Yes). With nothing landed: four tiles to save one real thing.
 * Nothing here is made up; with nothing real there is nothing to show.
 */

const DAY = 1440;
const WEEK = 7 * DAY;

/** The week ahead from today: what's really on the sky, nothing someday, nothing done, no recap of the past. */
export function weekItems(clock: ClockData): ClockItem[] {
  return clock.items.filter((i) => i.start >= 0 && i.start < WEEK && !i.someday && !i.done && i.origin !== "day");
}

/** "Today", "Fri": the weekday of a day offset from today, in the person's own time zone (the clock's `days` only reach a few days out). */
export function dayLabel(clock: Pick<ClockData, "base" | "tz">, offset: number): string {
  if (offset === 0) return "Today";
  // noon of that day, so a daylight-saving change can't tip it into the next one
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: clock.tz }).format(new Date(clock.base + offset * DAY * 60_000 + 12 * 3_600_000));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 classes, 2 shifts and 1 due date": only what's there. */
export function weekCounts(items: ClockItem[]): string {
  const n = (f: (i: ClockItem) => boolean) => items.filter(f).length;
  const parts = [
    [n((i) => i.cat === "class"), "class", "classes"],
    [n((i) => i.cat === "work"), "shift", "shifts"],
    [n((i) => i.cat === "due" && i.origin !== "bill"), "due date", "due dates"],
    [n((i) => i.origin === "bill"), "bill", "bills"],
    [n((i) => i.cat === "other" && i.origin !== "bill"), "other thing", "other things"],
  ] as const;
  const out = parts.filter(([c]) => c > 0).map(([c, one, many]) => plural(c, one, many));
  return out.length > 1 ? `${out.slice(0, -1).join(", ")} and ${out[out.length - 1]}` : (out[0] ?? "");
}

const TILES: { kind: "class" | "shift" | "bill" | "todo"; label: string; icon: PixelName; hint: string }[] = [
  { kind: "class", label: "Class", icon: "class", hint: "A class you go to" },
  { kind: "shift", label: "Shift", icon: "shift", hint: "A shift you work" },
  { kind: "bill", label: "Bill", icon: "bill", hint: "A bill that comes up" },
  { kind: "todo", label: "To-do", icon: "todo", hint: "Something to get done" },
];

export function WeekStep({
  clock,
  who,
  skyling,
  onClock,
}: {
  clock: ClockData;
  /** The skyling's name, as the person gave it. */
  who: string;
  skyling: CompanionKey;
  onClock: (c: ClockData) => void;
}) {
  const items = useMemo(() => weekItems(clock), [clock]);
  const landed = items.length > 0;

  // the one first fix, looked for once something has landed
  const [fix, setFix] = useState<WeekFix | null>(null);
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    if (!landed || looked) return;
    let live = true;
    void weekFixAction().then((r) => {
      if (!live) return;
      setLooked(true);
      if (r.ok) setFix(r.fix);
    });
    return () => {
      live = false;
    };
  }, [landed, looked]);

  return (
    <>
      <h1 data-anim className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">
        Here&apos;s your week so far
      </h1>
      <p data-anim className="mt-2 text-[0.9375rem] text-muted">
        {landed
          ? "This is what's on your sky now, drawn above. It's the same one you'll see every day."
          : "Nothing has landed on your sky yet. Add one real thing and watch it appear above."}
      </p>
      {landed ? (
        <Landed items={items} clock={clock} fix={fix} who={who} skyling={skyling} onClock={onClock} onFix={setFix} />
      ) : (
        <FirstThing clock={clock} onClock={onClock} />
      )}
    </>
  );
}

function Landed({
  items,
  clock,
  fix,
  who,
  skyling,
  onClock,
  onFix,
}: {
  items: ClockItem[];
  clock: ClockData;
  fix: WeekFix | null;
  who: string;
  skyling: CompanionKey;
  onClock: (c: ClockData) => void;
  onFix: (f: WeekFix) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // "Not now": the card steps away (the suggestion comes back tomorrow like any other)
  const [hidden, setHidden] = useState(false);
  const shown = items.slice(0, 4);
  const dayOf = (i: ClockItem) => dayLabel(clock, Math.floor(i.start / DAY));

  /** One tap on the card: the existing suggestion buttons (Yes, Not now, Undo), then the sky with what changed. */
  const answer = (response: "do" | "snooze" | "undo") =>
    start(async () => {
      if (!fix) return;
      setError(null);
      const r = await respondAction(fix.id, response);
      if (!r?.ok) return setError(r?.error ?? "That didn't work. Try again.");
      if (response === "snooze") setHidden(true);
      else onFix({ ...fix, status: response === "do" ? "done" : "undone", result: r.message ?? fix.result });
      const sky: SkyResult = await skyNowAction();
      if (sky.ok) onClock(sky.clock);
    });

  return (
    <>
      <p data-anim className="mt-5 text-[1.0625rem] leading-snug font-medium" data-testid="week-counts">
        {weekCounts(items)} in the next 7 days.
      </p>
      <ul data-anim className="mt-3 flex flex-col gap-2" aria-label="Coming up">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-soft">
            <span className="w-12 shrink-0 text-xs font-medium text-muted">{dayOf(i)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium">{i.title}</span>
              <span className="block truncate text-xs text-muted">{i.source}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p data-anim className="mt-2 text-xs text-muted">
          and {items.length - shown.length} more, all on your sky.
        </p>
      )}

      {fix && !hidden && (
        <section data-anim aria-label={`${who}'s first fix`} className="mt-5 flex gap-3 rounded-[1.25rem] bg-surface-2 p-4">
          <CompanionGlyph companion={skyling} className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{who} noticed one thing</p>
            {fix.status === "pending" && (
              <>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-text-2">{fix.body}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => answer("do")}
                    className="min-h-11 rounded-full bg-gradient-to-b from-dawn-1 to-dawn-2 px-5 text-sm font-semibold text-ink-night disabled:opacity-60"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => answer("snooze")}
                    className="min-h-11 rounded-full bg-surface px-5 text-sm font-medium text-text-2 disabled:opacity-60"
                  >
                    Not now
                  </button>
                </div>
              </>
            )}
            {fix.status === "done" && (
              <>
                <p role="status" className="mt-1 text-[0.9375rem] leading-relaxed text-text-2">
                  {fix.result}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => answer("undo")}
                  className="mt-2 min-h-11 rounded-full bg-surface px-5 text-sm font-medium"
                >
                  Undo
                </button>
              </>
            )}
            {fix.status === "undone" && (
              <p role="status" className="mt-1 text-[0.9375rem] leading-relaxed text-text-2">
                {fix.result}
              </p>
            )}
          </div>
        </section>
      )}
      {error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </>
  );
}

/** Nothing landed: four tiles, one real thing, saved the way the forms save it. Then it's on the wheel. */
function FirstThing({ clock, onClock }: { clock: ClockData; onClock: (c: ClockData) => void }) {
  const [kind, setKind] = useState<(typeof TILES)[number]["kind"] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = (fd: FormData) =>
    start(async () => {
      if (!kind) return;
      setError(null);
      const v = (k: string) => String(fd.get(k) ?? "");
      const r = await saveFirstThingAction({
        kind,
        name: v("name"),
        date: v("date"),
        startTime: v("startTime"),
        endTime: v("endTime"),
        amount: v("amount"),
        weekly: fd.get("weekly") === "on",
      } as FirstThing);
      if (!r.ok) return setError(r.error);
      onClock(r.clock);
      setKind(null);
      setNote("Saved. If it's past this week, it's further along the line on your sky.");
    });

  const tile = TILES.find((t) => t.kind === kind);
  return (
    <>
      <ul data-anim className="mt-5 grid grid-cols-2 gap-2.5" aria-label="Add one real thing">
        {TILES.map((t) => (
          <li key={t.kind}>
            <button
              type="button"
              aria-pressed={kind === t.kind}
              onClick={() => {
                setKind(kind === t.kind ? null : t.kind);
                setError(null);
              }}
              className={cn(
                "flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-[1.25rem] px-2 py-3 transition-all duration-300 active:scale-95",
                kind === t.kind ? "bg-gradient-to-b from-dawn-1 to-dawn-2 text-ink-night shadow-lift" : "bg-surface shadow-soft",
              )}
            >
              <PixelIcon name={t.icon} className="h-8 w-8" />
              <span className="text-[0.9375rem] font-medium">{t.label}</span>
              <span className={cn("text-xs", kind === t.kind ? "text-ink-night/75" : "text-muted")}>{t.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {tile && (
        <form
          key={tile.kind}
          action={save}
          className="mt-4 flex flex-col gap-3 rounded-[1.25rem] bg-surface-2 p-4"
          aria-label={`Add a ${tile.label.toLowerCase()}`}
        >
          <Labeled
            label={
              tile.kind === "shift" ? "Where do you work?" : tile.kind === "todo" ? "What needs doing?" : tile.kind === "bill" ? "Which bill?" : "Class name"
            }
          >
            <Input name="name" required maxLength={120} autoComplete="off" className="min-h-11" />
          </Labeled>
          <Labeled label={tile.kind === "bill" ? "Next due day" : tile.kind === "todo" ? "Due day" : tile.kind === "class" ? "First class day" : "Day"}>
            <Input name="date" type="date" required defaultValue={clock.today} className="min-h-11" />
          </Labeled>
          {(tile.kind === "class" || tile.kind === "shift") && (
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Starts">
                <Input name="startTime" type="time" required className="min-h-11" />
              </Labeled>
              <Labeled label="Ends">
                <Input name="endTime" type="time" required className="min-h-11" />
              </Labeled>
            </div>
          )}
          {tile.kind === "class" && (
            <label className="flex min-h-11 items-center gap-2.5 text-sm text-text-2">
              <input type="checkbox" name="weekly" defaultChecked className="h-5 w-5" />
              Every week
            </label>
          )}
          {tile.kind === "bill" && (
            <Labeled label="Amount ($)">
              <Input name="amount" inputMode="decimal" required placeholder="45" className="min-h-11" />
            </Labeled>
          )}
          {error && <FormError message={error} />}
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-full bg-gradient-to-b from-dawn-1 to-dawn-2 px-5 text-sm font-semibold text-ink-night disabled:opacity-60"
          >
            {pending ? "Saving…" : `Save this ${tile.label.toLowerCase()}`}
          </button>
        </form>
      )}
      {note && !tile && (
        <p role="status" className="mt-3 text-sm text-text-2">
          {note}
        </p>
      )}
      {!tile && error && (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      )}
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text-2">{label}</span>
      {children}
    </label>
  );
}
