"use client";
import Link from "next/link";
import { useState } from "react";
import { History, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bottom sheet listing past conversations (phones). */
export function HistorySheet({ items, activeId }: { items: { id: string; title: string; when: string }[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Past conversations" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-soft">
        <History className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Past conversations">
          <div className="animate-fade-in absolute inset-0 bg-black/25" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-[28px] bg-bg px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="text-[17px] font-semibold">Conversations</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-2 text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {items.length === 0 && <p className="px-2 py-4 text-sm text-muted">No conversations yet.</p>}
            <ul className="flex flex-col gap-1">
              {items.map((c) => (
                <li key={c.id}>
                  <Link href={`/jarvis/${c.id}`} onClick={() => setOpen(false)} className={cn("block rounded-2xl px-3 py-3", c.id === activeId ? "bg-surface shadow-soft" : "active:bg-surface-2")}>
                    <span className="block truncate text-[15px]">{c.title}</span>
                    <span className="block text-xs text-muted">{c.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
