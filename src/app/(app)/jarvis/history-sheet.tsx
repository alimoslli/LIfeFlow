"use client";
import Link from "next/link";
import { useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";

/**
 * The earlier chats, from a sheet that rises from the bottom on phones. It's the shared sheet (a modal dialog in the
 * browser's top layer), so the tab bar can never cover the last chat in the list.
 */
export function HistorySheet({ items, activeId }: { items: { id: string; title: string; when: string }[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Past conversations"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
      >
        <History className="h-5 w-5" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Conversations" label="Past conversations">
        {items.length === 0 && <p className="px-2 py-4 text-sm text-muted">No conversations yet.</p>}
        <ul className="flex flex-col gap-1">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/jarvis?c=${c.id}`}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={cn("block rounded-2xl px-3 py-3", c.id === activeId ? "bg-surface shadow-soft" : "active:bg-surface-2")}
              >
                <span className="line-clamp-2 break-words text-[0.9375rem]">{c.title}</span>
                <span className="block text-xs text-muted">{c.when}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
