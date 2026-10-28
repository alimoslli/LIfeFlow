"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Landmark, Loader2, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Badge } from "@/components/ui/surface";
import type { ActionState } from "@/server/actions";
import { PlaidLinkButton } from "./plaid-link";

export type BankConnection = { id: string; name: string; status: string; lastSynced: string | null; error: string | null };

/** Connected banks with sync, reconnect and disconnect, plus "Connect a bank". */
export function BankConnections({
  configured,
  connections,
  disconnect,
}: {
  configured: boolean;
  connections: BankConnection[];
  disconnect: (id: string) => Promise<ActionState>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {connections.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <Landmark className="h-4 w-4 text-accent" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">{c.lastSynced ? `Synced ${c.lastSynced}` : "Not synced yet"}</span>
                  </span>
                </span>
                <Badge tone={c.status === "error" ? "danger" : "success"}>{c.status === "error" ? "Needs attention" : "Connected"}</Badge>
              </div>
              {c.error && <p className="text-sm text-danger">{c.error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {c.status === "error" ? <PlaidLinkButton configured={configured} reconnect={c.id} /> : <SyncButton id={c.id} />}
                <ActionButton
                  action={disconnect.bind(null, c.id) as unknown as (p: ActionState, fd: FormData) => Promise<ActionState>}
                  confirm={`Disconnect ${c.name}? Its synced accounts, transactions and holdings will be removed from LifeFlow.`}
                  title={`Disconnect ${c.name}`}
                  className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-danger"
                >
                  Disconnect
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PlaidLinkButton configured={configured}>{connections.length ? "Connect another bank" : "Connect a bank"}</PlaidLinkButton>
    </div>
  );
}

function SyncButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/integrations/plaid/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id }),
          });
          const j = (await r.json().catch(() => ({}))) as { synced?: { added: number; modified: number }; error?: string };
          setBusy(false);
          setMsg(r.ok ? `Up to date${j.synced?.added ? `, ${j.synced.added} new` : ""}.` : (j.error ?? "Sync failed."));
          router.refresh();
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
      </button>
      {msg && (
        <span role="status" className="text-xs text-muted">
          {msg}
        </span>
      )}
    </span>
  );
}
