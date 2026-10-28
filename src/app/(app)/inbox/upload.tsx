"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Copy, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";

/** Upload a photo or PDF (or take a photo) and Jarvis files it. */
export function InboxUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    for (const f of Array.from(files).slice(0, 5)) fd.append("files", f);
    try {
      const res = await fetch("/api/inbox/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { error?: string; item?: { status: string; summary: string | null; reason: string | null } };
      if (!res.ok) throw new Error(json.error ?? "Couldn't upload.");
      toast(json.item?.status === "filed" ? `Filed: ${json.item.summary ?? "done"}` : (json.item?.reason ?? "Saved to your inbox."));
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't upload.", { tone: "danger" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        aria-label="Photo or PDF to file"
        onChange={(e) => send(e.target.files)}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent font-medium text-accent-text disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {busy ? "Jarvis is reading it…" : "Add a photo or PDF"}
      </button>
    </>
  );
}

export function CopyAddress({ address }: { address: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(address).then(() => toast("Address copied."))}
      className="flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium"
    >
      <Copy className="h-4 w-4" /> Copy
    </button>
  );
}
