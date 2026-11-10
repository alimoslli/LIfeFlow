"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { PixelIcon, pixel, type IconLike } from "@/components/pixel/pixel-icon";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/server/services/search";
import { useShell } from "./app-shell";
import { SkylingIcon } from "../skylings/sprite";

type Item = { key: string; title: string; subtitle?: string | null; icon: LucideIcon | IconLike | typeof SkylingIcon; run: () => void };

const KIND_ICON: Record<SearchHit["kind"], IconLike> = {
  task: pixel("todo"),
  note: pixel("note"),
  event: pixel("calendar"),
  assignment: pixel("pencil"),
  course: pixel("class"),
  transaction: pixel("bill"),
  goal: pixel("goal"),
};

// Every place in the app, findable by its name or the words people use for it (LF Main's sweep, 2026-11-10: "bills"
// found nothing). One entry per place: the calendar's week and month are one.
const PAGES: { title: string; href: string; icon: IconLike; words: string }[] = [
  { title: "Today", href: "/", icon: pixel("today"), words: "home brief day sky" },
  { title: "Calendar", href: "/plan", icon: pixel("calendar"), words: "plan agenda schedule events week month" },
  { title: "To-dos", href: "/tasks", icon: pixel("todo"), words: "tasks todo reminders" },
  { title: "Classes", href: "/school", icon: pixel("class"), words: "school courses" },
  { title: "Due", href: "/school#due", icon: pixel("pencil"), words: "assignments exams homework deadlines" },
  { title: "Notes", href: "/notes", icon: pixel("note"), words: "notes ideas projects lecture" },
  { title: "Money", href: "/money", icon: pixel("money"), words: "available spent income balance" },
  { title: "Activity", href: "/finances/transactions", icon: pixel("bill"), words: "transactions spending purchases" },
  { title: "Bills and subscriptions", href: "/finances/bills", icon: pixel("calendar"), words: "bills subscriptions recurring rent" },
  { title: "Accounts and savings", href: "/finances/accounts", icon: pixel("card"), words: "plaid connect bank savings cards" },
  { title: "Goals", href: "/goals", icon: pixel("target"), words: "savings dreams habits" },
  { title: "Milestones", href: "/milestones", icon: pixel("goal"), words: "achievements life story import chatgpt" },
  { title: "Health", href: "/habits", icon: pixel("health"), words: "sleep steps workouts apple health" },
  { title: "Work", href: "/work", icon: pixel("shift"), words: "shifts jobs pay hours" },
  { title: "Updates", href: "/jarvis/says", icon: pixel("bell"), words: "messages noticed inbox filed" },
  { title: "What your skyling knows", href: "/jarvis/memory", icon: pixel("idea"), words: "memory remembers forget" },
  { title: "Settings", href: "/settings", icon: pixel("cog"), words: "profile security passkey notifications connected" },
];

/**
 * ⌘K: jump anywhere, find any record, start a quick add, or ask the
 * assistant. Opens from the search icon on phones.
 */
export function CommandPalette({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (q?: string) => void }) {
  const router = useRouter();
  const { assistantName } = useShell();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => input.current?.focus(), 30);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 1) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).catch(() => null);
      if (r?.ok) setHits(((await r.json()) as { hits: SearchHit[] }).hits);
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    onClose();
    setQ("");
    router.push(href);
  };
  const items: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !term || `${p.title} ${p.words}`.toLowerCase().includes(term)).map((p) => ({
      key: p.href,
      title: p.title,
      icon: p.icon,
      run: () => go(p.href),
    }));
    const quick: Item[] = [
      { key: "add-todo", title: "Add a to-do", icon: Plus, run: () => go("/tasks?add=todo") },
      { key: "add-shift", title: "Add a shift", icon: Plus, run: () => go("/work?add=shift") },
      { key: "log-spending", title: "Log spending", icon: Plus, run: () => go("/money?add=spending") },
    ].filter((x) => !term || x.title.toLowerCase().includes(term));
    const found: Item[] =
      term.length >= 1
        ? hits.map((h) => ({ key: `${h.kind}:${h.id}`, title: h.title, subtitle: h.subtitle, icon: KIND_ICON[h.kind], run: () => go(h.href) }))
        : [];
    const ask: Item = {
      key: "ask",
      title: term ? `Ask ${assistantName}: "${q.trim()}"` : `Ask ${assistantName}`,
      icon: SkylingIcon,
      run: () => {
        onClose();
        setQ("");
        onAsk(q.trim() || undefined);
      },
    };
    return [...found, ...quick, ...pages.slice(0, term ? 6 : 13), ask];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hits, assistantName]);

  return (
    <dialog
      ref={ref}
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search and commands"
      className="m-auto mt-[max(env(safe-area-inset-top),8vh)] w-[min(620px,calc(100vw-1.5rem))] rounded-[24px] bg-bg p-0 text-text shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <PixelIcon name="find" className="h-4 w-4 shrink-0 text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            if (e.target.value.trim().length < 1) setHits([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              items[sel]?.run();
            }
          }}
          placeholder="Search, jump to, or ask…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="lf-palette-list"
          className="h-14 min-w-0 flex-1 bg-transparent text-[1rem] placeholder:text-muted focus:outline-none"
        />
        <button type="button" onClick={onClose} className="tap rounded-full text-sm text-muted">
          Esc
        </button>
      </div>
      <ul id="lf-palette-list" role="listbox" className="max-h-[min(60dvh,460px)] overflow-y-auto p-2">
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === sel}>
            <button
              type="button"
              onMouseEnter={() => setSel(i)}
              onClick={it.run}
              className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left", i === sel && "bg-surface-2")}
            >
              <it.icon className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[0.9375rem]">{it.title}</span>
                {it.subtitle && <span className="block text-xs text-muted">{it.subtitle}</span>}
              </span>
              <PixelIcon name="arrow" className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
