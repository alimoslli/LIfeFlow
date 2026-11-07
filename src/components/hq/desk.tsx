"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus, X } from "lucide-react";
import { addDeskTaskAction } from "@/app/admin/hq/actions";
import { pickChatHref } from "./chat-link";

/** One task file, as the page gets it (the link and its prompt are built on the server, in hq/desk.ts). */
export type DeskFileView = {
  id: string;
  title: string;
  who: string;
  status: string;
  kind: "new" | "open";
  /** The web link, and the Claude app's for a phone or tablet (the same once the task has its chat). */
  href: string;
  appHref: string;
  prompt: string;
};

export const DESK_DIALOG_ID = "hq-desk";
/** How long the MacBook takes to open before the chat loads. */
export const OPEN_MS = 1200;

const openDesk = () => (document.getElementById(DESK_DIALOG_ID) as HTMLDialogElement | null)?.showModal();

/** A plain button that opens the desk (on the penthouse plate). */
export function OpenDeskButton({ count, className }: { count: number; className?: string }) {
  return (
    <button type="button" onClick={openDesk} className={className} data-testid="hq-desk-open">
      <FileText className="h-4 w-4" aria-hidden />
      Your desk
      <span className="hq-desk-count tabular">{count}</span>
    </button>
  );
}

/**
 * The CEO's desk (ADR 0029): the pile of task files on the penthouse desk opens a calm list; picking a file plays a short
 * MacBook animation (CSS, transform and opacity only) and then this tab goes to the task's Claude Code chat. A new chat
 * arrives with the first prompt typed in; an existing chat can't be typed into, so the next prompt is copied first.
 * Reduced motion goes straight there. HQ only links: it never starts, reads or drives a chat.
 */
export function Desk({ files, roles }: { files: DeskFileView[]; roles: { role: string; title: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState<{ file: DeskFileView; href: string; copied: boolean } | null>(null);

  useEffect(() => {
    // An existing chat needs the copied prompt; without it, the screen shows the prompt to copy by hand and waits.
    if (!opening || (!opening.copied && opening.file.kind === "open")) return;
    const t = window.setTimeout(() => window.location.assign(opening.href), OPEN_MS);
    return () => window.clearTimeout(t);
  }, [opening]);

  async function pick(file: DeskFileView) {
    // Copied for a new chat too: if the box arrives empty, the owner can paste it.
    let copied = true;
    try {
      await navigator.clipboard.writeText(file.prompt);
    } catch {
      copied = false;
    }
    const href = pickChatHref(file.href, file.appHref);
    dialog.current?.close();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce && (copied || file.kind === "new")) {
      window.location.assign(href);
      return;
    }
    setOpening({ file, href, copied });
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="hq-desk-pile" aria-label={`Your desk: ${files.length} task files`}>
        <span className="sr-only">Your desk</span>
      </button>

      <dialog ref={dialog} id={DESK_DIALOG_ID} className="hq-desk-sheet" aria-labelledby="hq-desk-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="hq-desk-title" className="font-display text-[1.5rem] leading-tight font-medium">
              Your desk
            </h2>
            <p className="mt-0.5 text-sm text-text-2">
              {files.length === 0
                ? "Nothing on your desk."
                : `${files.length} ${files.length === 1 ? "file" : "files"}. Tap one to open its chat with the first prompt ready.`}
            </p>
          </div>
          <form method="dialog">
            <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-2" aria-label="Close">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => pick(f)} className="hq-desk-file" data-kind={f.kind}>
                <span className="hq-desk-file-tab" aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[0.9375rem] font-semibold text-text">{f.title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-text-2">
                    {f.who} · {f.status}
                  </span>
                </span>
                <span className="shrink-0 text-[0.8125rem] font-medium text-accent">{f.kind === "new" ? "Start" : "Open"}</span>
              </button>
            </li>
          ))}
        </ul>

        <details className="mt-4 rounded-2xl bg-surface-2 p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4" aria-hidden /> Add a file to your desk
          </summary>
          <form action={addDeskTaskAction} className="mt-2 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-2">Task</span>
              <input
                name="title"
                required
                minLength={3}
                maxLength={140}
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-[0.9375rem]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-2">Who it&apos;s for</span>
              <select name="role" defaultValue="developer" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-[0.9375rem]">
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-2">First prompt for its chat</span>
              <textarea name="prompt" required maxLength={1500} rows={5} className="rounded-xl border border-border bg-surface px-3 py-2 text-[0.9375rem]" />
            </label>
            <button className="hq-btn-brass inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold">Put it on my desk</button>
          </form>
        </details>
      </dialog>

      {/* On document.body: the penthouse picture is transformed (and filtered at night), which would trap a fixed overlay. */}
      {opening && createPortal(<MacBook file={opening.file} href={opening.href} copied={opening.copied} onClose={() => setOpening(null)} />, document.body)}
    </>
  );
}

/** The MacBook opening: the file slides in, the lid opens, the screen lights with Claude Code and the task. */
function MacBook({ file, href, copied, onClose }: { file: DeskFileView; href: string; copied: boolean; onClose: () => void }) {
  const stuck = !copied && file.kind === "open";
  const line = stuck
    ? "Couldn't copy the prompt. Copy it here, then open the chat."
    : file.kind === "new"
      ? copied
        ? "First prompt typed in and copied. Press send."
        : "Opening your chat with the first prompt typed in…"
      : "Prompt copied. Paste it and send.";
  return (
    <div className="hq-mac-stage" role="status" aria-live="polite" data-testid="hq-macbook">
      <div className="hq-mac">
        <div className="hq-mac-file" aria-hidden />
        <div className="hq-mac-lid">
          <div className="hq-mac-screen">
            <p className="hq-mac-brand">Claude Code</p>
            <p className="hq-mac-title">{file.title}</p>
            <p className="hq-mac-sub">{line}</p>
            {stuck && (
              <>
                <textarea
                  readOnly
                  value={file.prompt}
                  rows={4}
                  className="hq-mac-copy"
                  aria-label="The next prompt"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="mt-2 flex gap-2">
                  <a href={href} className="hq-btn-brass inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold">
                    Open the chat
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-4 text-sm text-white"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="hq-mac-base" aria-hidden />
      </div>
    </div>
  );
}
