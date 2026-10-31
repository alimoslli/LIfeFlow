import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge, Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { healthSummary, listHealthTokens } from "@/server/services/health";
import { integrationStatus } from "@/server/services/integrations";
import { AppleHealthCard } from "./apple-health-card";
import { GoogleCard } from "./google-card";
import { BankConnections } from "@/components/finance/bank-connections";
import { listPlaidConnections, plaidConfig } from "@/server/integrations/plaid";
import { disconnectBankAction } from "../../finances/actions";
import { SettingsHeader } from "../settings-header";
import { canvasConnection } from "@/server/integrations/canvas";
import { CanvasCard } from "./canvas-card";

export const metadata: Metadata = { title: "Connected accounts" };

const TONE = { success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning" } as const;

const GOOGLE_RESULT: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google is connected. Your calendar is syncing and your assistant can now help with email." },
  denied: { tone: "warning", text: "You didn't give Google access, so nothing was connected." },
  missing_scopes: { tone: "warning", text: "Some permissions were unchecked. Connect again and keep all boxes checked." },
  failed: { tone: "danger", text: "Couldn't connect Google. Please try again." },
  not_configured: { tone: "warning", text: "Google isn't available yet." },
  use_main_site: { tone: "warning", text: "You're on the main site now. Tap Connect Google again." },
};

export default async function IntegrationsSettings({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google: result } = await searchParams;
  const d = await withCurrentUser(async (s, u) => {
    const [list, keys, health, banks, canvas] = await series(
      () => integrationStatus(s),
      () => listHealthTokens(s),
      () => healthSummary(s, u.timezone, 1),
      () => listPlaidConnections(s),
      () => canvasConnection(s),
    );
    return { list, keys, lastHealth: health.lastReceivedAt, tz: u.timezone, banks, canvas, gmailFiling: u.preferences?.gmailFiling === true };
  });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  const origin = process.env.APP_URL?.trim().replace(/\/$/, "") || `${proto}://${host}`;
  const banner = result ? GOOGLE_RESULT[result] : undefined;
  const google = d.list.find((i) => i.provider === "google");
  return (
    <div className="flex flex-col gap-3">
      <SettingsHeader title="Connected accounts" />
      {banner && <p className={`rounded-2xl px-4 py-3 text-sm ${TONE[banner.tone]}`}>{banner.text}</p>}
      <Group title="School" />
      <CanvasCard
        connection={
          d.canvas
            ? {
                host: d.canvas.host,
                status: d.canvas.status,
                lastSynced: d.canvas.lastSyncedAt ? formatIn(d.canvas.lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
                error: d.canvas.lastError,
              }
            : null
        }
      />
      <Group title="Email & Calendar" />
      {google && (
        <GoogleCard
          filing={d.gmailFiling}
          configured={google.configured}
          connection={
            google.connections[0]
              ? {
                  email: google.connections[0].displayName ?? "Google account",
                  status: google.connections[0].status,
                  lastSynced: google.connections[0].lastSyncedAt ? formatIn(google.connections[0].lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
                  error: google.connections[0].lastError,
                }
              : null
          }
        />
      )}
      <Group title="Money" />
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-medium">Banks & cards</h2>
          <Badge tone={d.banks.some((b) => b.status === "error") ? "danger" : d.banks.length ? "success" : "neutral"}>
            {d.banks.length ? `${d.banks.length} connected` : "Not connected"}
          </Badge>
        </div>
        <p className="mb-4 text-sm text-text-2">Read-only. LifeFlow can&apos;t move money.</p>
        <BankConnections
          configured={!!plaidConfig()}
          disconnect={disconnectBankAction}
          connections={d.banks.map((b) => ({
            id: b.id,
            name: b.displayName ?? "Bank",
            status: b.status,
            lastSynced: b.lastSyncedAt ? formatIn(b.lastSyncedAt, d.tz, "MMM d, h:mm a") : null,
            error: b.lastError,
          }))}
        />
      </Card>
      <Group title="Health" />
      <AppleHealthCard
        keys={d.keys.map((k) => ({
          id: k.id,
          name: k.name,
          created: formatIn(k.createdAt, d.tz, "MMM d"),
          lastUsed: k.lastUsedAt ? formatIn(k.lastUsedAt, d.tz, "MMM d, h:mm a") : null,
        }))}
        url={`${origin}/api/apple-health/ingest`}
        lastReceived={d.lastHealth ? formatIn(d.lastHealth, d.tz, "MMM d, h:mm a") : null}
      />
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <h2 className="mt-3 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>;
}
