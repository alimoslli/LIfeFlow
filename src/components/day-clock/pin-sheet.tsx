"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Sheet } from "@/components/ui/sheet";
import { pinAction } from "@/app/(app)/_today/actions";
import { cn } from "@/lib/utils";
import { pixelPaths } from "./pixel-icons";

const KINDS = [
  { key: "todo", label: "To-do", hint: "Something to do by then" },
  { key: "plan", label: "Plan", hint: "Somewhere to be, for an hour" },
  { key: "goal", label: "Goal", hint: "Something to reach by that day" },
  { key: "milestone", label: "Milestone", hint: "Something that happened" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

/** One of our pixel icons (pixel-icons.ts), with no box around it; an emoji we haven't drawn shows as itself. */
function Px({ e, className }: { e: string; className: string }) {
  const paths = pixelPaths(e);
  if (!paths) return <>{e}</>;
  return (
    <svg viewBox="0 0 12 12" shapeRendering="crispEdges" className={className} aria-hidden>
      {paths.map((p) => (
        <path key={p.fill} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

// The emojis people pin most; any other one can be typed at the start of the name.
const EMOJIS = ["📌", "✈️", "🎂", "💼", "📚", "📝", "🏋️", "🏃", "🍽️", "☕", "🎉", "🩺", "💳", "🛒", "🏠", "🚗", "🎬", "🎓", "🏁", "🎯"];

/** Today's date plus `days`, as YYYY-MM-DD (calendar days, no time zone involved). */
function addDays(today: string, days: number) {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Pin something on the timeline (owner, 2026-11-08): the day and time from where you tapped, an emoji, a name,
 * and what it is. One sheet, one tap to save; it shows on the line right away.
 */
export function PinSheet({ at, today, onClose, onSaved }: { at: number | null; today: string; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={at != null} onClose={onClose} title="Pin to your timeline">
      {at != null && <PinForm key={at} at={at} today={today} onSaved={onSaved} onCancel={onClose} />}
    </Sheet>
  );
}

function PinForm({ at, today, onSaved, onCancel }: { at: number; today: string; onSaved: () => void; onCancel: () => void }) {
  const date0 = addDays(today, Math.floor(at / 1440));
  const [kind, setKind] = useState<Kind>(date0 < today ? "milestone" : "todo");
  const [emoji, setEmoji] = useState("");
  const [date, setDate] = useState(date0);
  const timed = kind === "todo" || kind === "plan";
  const past = date < today;
  return (
    <ActionForm action={pinAction} showSuccess onSuccess={onSaved} className="flex flex-col gap-4 px-5 pt-1 pb-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="emoji" value={emoji} />
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl" aria-hidden>
          <Px e={emoji || "📌"} className="h-10 w-10 drop-shadow-sm" />
        </span>
        <input
          name="title"
          required
          maxLength={180}
          autoFocus
          placeholder={kind === "milestone" ? "What happened?" : kind === "goal" ? "What do you want to reach?" : "What is it?"}
          aria-label="Name"
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-surface px-4 text-[1rem] shadow-soft ring-1 ring-border/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
      </div>
      <div
        role="radiogroup"
        aria-label="Emoji"
        className="lf-hscroll -mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={emoji === e}
            aria-label={e}
            onClick={() => setEmoji(emoji === e ? "" : e)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl",
              emoji === e ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-surface-2",
            )}
          >
            <Px e={e} className="h-7 w-7" />
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="What is it?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.filter((k) => !(k.key === "milestone" && date > today)).map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => setKind(k.key)}
            className={cn(
              "flex min-h-11 flex-col items-start justify-center rounded-2xl px-3 py-2 text-left",
              kind === k.key ? "bg-accent text-accent-text" : "bg-surface text-text-2 shadow-soft ring-1 ring-border/60",
            )}
          >
            <span className="text-sm font-semibold">{k.label}</span>
            <span className={cn("text-xs", kind === k.key ? "opacity-80" : "text-muted")}>{k.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Day
          <input
            type="date"
            name="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value > today && kind === "milestone") setKind("goal");
            }}
            className="min-h-11 rounded-xl bg-surface px-3 text-[0.9375rem] text-text shadow-soft ring-1 ring-border/60"
          />
        </label>
        {timed && (
          <label className="flex w-36 flex-col gap-1 text-xs text-muted">
            Time
            <input
              type="time"
              name="time"
              defaultValue={hhmm(at)}
              className="min-h-11 rounded-xl bg-surface px-3 text-[0.9375rem] text-text shadow-soft ring-1 ring-border/60"
            />
          </label>
        )}
      </div>
      {past && kind !== "milestone" && <p className="text-xs text-muted">That day has passed. A milestone is the way to keep what happened.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-full bg-surface text-[0.9375rem] font-medium text-text-2 shadow-soft">
          Cancel
        </button>
        <button type="submit" className="lf-sb lf-sb-sun flex-[2]">
          Pin it
        </button>
      </div>
    </ActionForm>
  );
}
