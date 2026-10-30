"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Handler = { open: () => void; destroy: () => void };
type PlaidGlobal = {
  create: (o: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
    onExit: (err: { display_message?: string | null; error_message?: string } | null) => void;
  }) => Handler;
};
declare global {
  interface Window {
    Plaid?: PlaidGlobal;
  }
}

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const TOKEN_KEY = "lf-plaid-link-token";

function loadPlaid(): Promise<PlaidGlobal> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn't load")));
    s.onerror = () => reject(new Error("Couldn't load Plaid. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
  return j;
}

/** Shared Link flow: get a token, open Plaid, then exchange (new) or refresh (reconnect). */
function useLink(reconnect?: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const run = useCallback(
    async (token: string, receivedRedirectUri?: string) => {
      const Plaid = await loadPlaid();
      const handler = Plaid.create({
        token,
        receivedRedirectUri,
        onSuccess: async (publicToken, metadata) => {
          setStatus({ ok: true, text: "Connecting and importing your accounts…" });
          try {
            const r = await post<{ name: string; synced: { accounts: number; added: number } | null; note: string | null }>(
              "/api/integrations/plaid/exchange",
              {
                publicToken,
                institutionName: metadata.institution?.name ?? null,
              },
            );
            const connectedLabel = reconnect ? "Reconnected" : `${r.name} connected`;
            setStatus({
              ok: true,
              text: r.synced
                ? `${connectedLabel}: ${r.synced.accounts} account${r.synced.accounts === 1 ? "" : "s"} and ${r.synced.added} transaction${r.synced.added === 1 ? "" : "s"} imported.`
                : `${connectedLabel}. ${r.note ?? ""}`,
            });
            try {
              sessionStorage.removeItem(TOKEN_KEY);
            } catch {}
            router.refresh();
          } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        },
        onExit: (err) => {
          setBusy(false);
          if (err) setStatus({ ok: false, text: err.display_message || "The bank connection didn't finish. You can try again." });
        },
      });
      handler.open();
    },
    [reconnect, router],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { linkToken } = await post<{ linkToken: string }>("/api/integrations/plaid/link-token", reconnect ? { reconnect } : {});
      try {
        sessionStorage.setItem(TOKEN_KEY, linkToken);
      } catch {}
      await run(linkToken);
    } catch (e) {
      setBusy(false);
      setStatus({ ok: false, text: (e as Error).message });
    }
  }, [reconnect, run]);

  return { busy, status, start, run };
}

/**
 * "Connect a bank" with a clear consent note first. Plaid shows the bank's
 * own sign-in; LifeFlow never sees the password and gets read-only access.
 */
export function PlaidLinkButton({
  configured,
  reconnect,
  children,
  className,
}: {
  configured: boolean;
  reconnect?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { busy, status, start } = useLink(reconnect);
  if (!configured)
    return <p className="text-sm text-warning">Bank connections aren&apos;t switched on yet: the server needs PLAID_CLIENT_ID and PLAID_SECRET.</p>;
  return (
    <div className="flex flex-col gap-2">
      {!reconnect && (
        <p className="text-xs text-muted">
          You&apos;ll sign in to your bank inside Plaid. LifeFlow never sees your bank password, gets read-only access (it can&apos;t move money), and you can
          disconnect any time.
        </p>
      )}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 self-start rounded-full bg-accent px-5 text-sm font-medium text-accent-text disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
        {children ?? (reconnect ? "Reconnect" : "Connect a bank")}
      </button>
      {status && (
        <p role="status" className={cn("text-sm", status.ok ? "text-success" : "text-danger")}>
          {status.text}
        </p>
      )}
    </div>
  );
}

/** Resumes Link after an OAuth bank redirects back (PLAID_REDIRECT_URI points here). */
export function PlaidOAuthResume() {
  const { status, run } = useLink();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(TOKEN_KEY);
    } catch {}
    const resume = token ? run(token, window.location.href) : Promise.reject(new Error("no token"));
    resume.catch(() => setMissing(true));
  }, [run]);
  if (missing) return <p className="text-sm text-text-2">This bank sign-in has expired. Go back to Accounts and connect again.</p>;
  return <p className="text-sm text-text-2">{status?.text ?? "Finishing your bank connection…"}</p>;
}
