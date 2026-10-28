"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, CircleAlert, Undo2, X } from "lucide-react";
import { restoreAction } from "@/app/(app)/trash-actions";
import { cn } from "@/lib/utils";

export type Toast = { id: number; text: string; tone: "success" | "danger" | "info"; undo?: string };

let items: Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a short message at the bottom of the screen. With `undo` (a trash id), offers Undo. */
export function toast(text: string, opts: { tone?: Toast["tone"]; undo?: string } = {}) {
  const t: Toast = { id: next++, text, tone: opts.tone ?? "success", undo: opts.undo };
  items = [...items.slice(-2), t];
  emit();
  return t.id;
}
const dismiss = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** After a delete that navigates away (e.g. a note), the next page shows the Undo toast via ?undo=<trashId>. */
function UndoFromQuery() {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("undo");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    toast("Moved to trash.", { undo: id });
    url.searchParams.delete("undo");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);
  return null;
}

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  return (
    <>
      <UndoFromQuery />
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {list.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ms = t.undo ? 8000 : t.tone === "danger" ? 7000 : 4000;
    const h = setTimeout(() => dismiss(t.id), ms);
    return () => clearTimeout(h);
  }, [t]);
  const Icon = t.tone === "danger" ? CircleAlert : CheckCircle2;
  return (
    <div
      role={t.tone === "danger" ? "alert" : "status"}
      className="lf-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-3 text-sm text-bg shadow-lift"
    >
      <Icon className={cn("h-4 w-4 shrink-0", t.tone === "danger" ? "text-danger" : "text-success")} />
      <span className="min-w-0 flex-1">{t.text}</span>
      {t.undo && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await restoreAction(t.undo!);
            dismiss(t.id);
            toast(r?.ok ? (r.message ?? "Restored.") : (r?.error ?? "Couldn't undo."), { tone: r?.ok ? "success" : "danger" });
            router.refresh();
          }}
          className="flex items-center gap-1 rounded-full bg-bg/15 px-3 py-1 font-medium disabled:opacity-60"
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
      )}
      <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
