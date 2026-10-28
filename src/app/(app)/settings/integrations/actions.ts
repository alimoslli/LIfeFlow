"use server";
import { mutate, type ActionState } from "@/server/actions";
import { disconnectGoogle, GoogleError, syncGoogleCalendar } from "@/server/integrations/google";
import { ServiceError } from "@/server/services/errors";

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
