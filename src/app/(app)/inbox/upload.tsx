"use client";
import { useRouter } from "next/navigation";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { useAppBusy } from "@/lib/app-busy";

/** Upload a photo or PDF (or take a photo) and Jarvis files it. */
export function InboxUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // a photo on its way up: an app update waits (components/pwa/app-updater.tsx)
  useAppBusy(busy);
  // The same pick can arrive twice: a change the browser replays once the page has loaded, and the catch-up below for a
  // file picked before that. It goes up once, so a receipt is never filed twice.
  const sending = useRef<string | null>(null);
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    const key = Array.from(files)
      .map((f) => `${f.name}:${f.size}:${f.lastModified}`)
      .join("|");
    if (sending.current === key) return;
    sending.current = key;
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
      sending.current = null;
    }
  };
  // A file picked before the page finished loading (slow phone) never fired onChange: send it now.
  useEffect(() => {
    const files = input.current?.files;
    if (!files?.length) return;
    const id = setTimeout(() => void send(files), 0);
    return () => clearTimeout(id);
    // Runs once, after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="lf-sb lf-sb-sun w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {busy ? "Reading it…" : "Add a photo or PDF"}
      </button>
    </>
  );
}

export function CopyAddress({ address }: { address: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(address).then(() => toast("Address copied."))} className="lf-sb lf-sb-app lf-sb-sm">
      <PixelIcon name="copy" className="h-4 w-4" /> Copy
    </button>
  );
}
