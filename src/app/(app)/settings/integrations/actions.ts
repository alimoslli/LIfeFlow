"use server";
import { mutate, type ActionState } from "@/server/actions";
import { disconnectGoogle, GoogleError, syncGoogleCalendar } from "@/server/integrations/google";
import { ServiceError } from "@/server/services/errors";
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
