"use server";
import { mutate, type ActionState } from "@/server/actions";
import { disconnectGoogle, GoogleError, syncGoogleCalendar } from "@/server/integrations/google";
import { ServiceError } from "@/server/services/errors";
import { connectCanvas, disconnectCanvas, markCanvasError, syncCanvas } from "@/server/integrations/canvas";
import { isPro } from "@/server/billing";
import { requireUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { getDb } from "@/server/db/client";
import { updatePreferences } from "@/server/services/accounts";
import { createHealthToken, revokeHealthToken } from "@/server/services/health";

export type HealthKeyState = (ActionState & { token?: string }) | null;

const asService = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GoogleError) throw new ServiceError(e.message);
    throw e;
  }
};

export async function syncGoogleAction(): Promise<ActionState> {
  return mutate("integration.google.synced", async (s, u) => {
    const r = await asService(() => syncGoogleCalendar(s, u.timezone));
    return `Synced ${r.total} event${r.total === 1 ? "" : "s"} from Google Calendar.`;
  });
}

export async function disconnectGoogleAction(): Promise<ActionState> {
  return mutate("integration.google.disconnected", async (s) => {
    await asService(() => disconnectGoogle(s));
    return "Google disconnected.";
  });
}

export async function createHealthKeyAction(_prev: HealthKeyState, fd: FormData): Promise<HealthKeyState> {
  let token: string | undefined;
  const name = String(fd.get("name") ?? "");
  const r = await mutate("integration.apple_health.key_created", async (s) => {
    token = (await createHealthToken(s, name)).token;
    return "Key created. Copy it now: it won't be shown again.";
  });
  return r?.ok ? { ...r, token } : r;
}

export async function revokeHealthKeyAction(id: string): Promise<ActionState> {
  return mutate("integration.apple_health.key_revoked", async (s) => {
    await revokeHealthToken(s, id);
    return "Key revoked. Shortcuts using it will stop working.";
  });
}

export async function connectCanvasAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const r = await mutate("integration.canvas.connected", async (s, u) => {
    if (!isPro(u)) throw new ServiceError("Canvas sync is part of LifeFlow Pro. Upgrade in Settings → Plan.");
    const me = await connectCanvas(s, String(fd.get("url") ?? ""), String(fd.get("token") ?? ""));
    return `Connected to ${me.host}${me.name ? ` as ${me.name}` : ""}.`;
  });
  if (r?.ok) await syncCanvasAction();
  return r;
}

export async function syncCanvasAction(): Promise<ActionState> {
  const r = await mutate("integration.canvas.synced", async (s) => {
    const x = await syncCanvas(s);
    return `Synced ${x.courses} class${x.courses === 1 ? "" : "es"} and ${x.assignments} assignment${x.assignments === 1 ? "" : "s"} from Canvas.`;
  });
  if (r && !r.ok) {
    const u = await requireUser();
    await withUser(u.id, (s) => markCanvasError(s, new ServiceError(r.error ?? "Canvas sync failed."))).catch(() => undefined);
  }
  return r;
}

export async function disconnectCanvasAction(): Promise<ActionState> {
  return mutate("integration.canvas.disconnected", async (s) => {
    await disconnectCanvas(s);
    return "Canvas disconnected. Classes and assignments it added stay.";
  });
}

export async function setGmailFilingAction(on: boolean): Promise<ActionState> {
  return mutate("integration.gmail_filing", async (_s, u) => {
    await updatePreferences(getDb(), u.id, { gmailFiling: on });
    return on ? "Jarvis will file new school, bill and work emails each morning." : "Jarvis won't read your inbox on his own.";
  });
}
