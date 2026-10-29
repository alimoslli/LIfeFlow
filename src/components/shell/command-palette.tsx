"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Flag,
  HeartPulse,
  Landmark,
  NotebookPen,
  Plus,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/server/services/search";
import { useShell } from "./app-shell";

type Item = { key: string; title: string; subtitle?: string | null; icon: LucideIcon; run: () => void };

const KIND_ICON: Record<SearchHit["kind"], LucideIcon> = {
  task: CheckSquare,
  note: NotebookPen,
  event: CalendarDays,
  assignment: BookOpen,
  course: BookOpen,
  transaction: Receipt,
  goal: Flag,
};

const PAGES: { title: string; href: string; icon: LucideIcon; words: string }[] = [
  { title: "Today", href: "/", icon: Sun, words: "home brief" },
  { title: "Plan", href: "/plan", icon: CalendarDays, words: "agenda schedule" },
  { title: "To-dos", href: "/tasks", icon: CheckSquare, words: "tasks todo" },
  { title: "Calendar", href: "/calendar", icon: CalendarDays, words: "events" },
  { title: "Classes", href: "/school", icon: BookOpen, words: "school courses assignments" },
  { title: "Notes", href: "/notes", icon: NotebookPen, words: "" },
  { title: "Money", href: "/money", icon: Wallet, words: "available spent income balance" },
  { title: "Transactions", href: "/finances/transactions", icon: Receipt, words: "spending" },
  { title: "Budgets", href: "/finances/budgets", icon: Wallet, words: "" },
  { title: "Goals", href: "/goals", icon: Flag, words: "savings dreams" },
  { title: "Accounts and banks", href: "/finances/accounts", icon: Landmark, words: "plaid connect bank" },
  { title: "Settings", href: "/settings", icon: Settings, words: "profile security passkey" },
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
    if (q.trim().length < 2) return;
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
      term.length >= 2
        ? hits.map((h) => ({ key: `${h.kind}:${h.id}`, title: h.title, subtitle: h.subtitle, icon: KIND_ICON[h.kind], run: () => go(h.href) }))
        : [];
    const ask: Item = {
      key: "ask",
      title: term ? `Ask ${assistantName}: "${q.trim()}"` : `Ask ${assistantName}`,
      icon: Sparkles,
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
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            if (e.target.value.trim().length < 2) setHits([]);
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
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted focus:outline-none"
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
                <span className="line-clamp-1 text-[15px]">{it.title}</span>
                {it.subtitle && <span className="block text-xs text-muted">{it.subtitle}</span>}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
