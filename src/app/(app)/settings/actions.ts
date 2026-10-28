"use server";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { endSession, requireUser } from "@/server/auth/current-user";
import { SESSION_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { AuthError, changePassword, deleteAccount, updateAssistant, updatePreferences, updateProfile } from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";
import { decideMemorySuggestion } from "@/server/jarvis/memory-decisions";
import { createMemory, deleteMemory, editMemory, MEMORY_CATEGORIES, setMemoryStatus } from "@/server/services/memory";
import { notificationPrefs, notificationPrefsSchema, removeSubscriptionById } from "@/server/services/push";
import { createHash } from "node:crypto";

const asService = async (fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AuthError) throw new ServiceError(e.message);
    throw e;
  }
};

export async function updateProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("profile.update", async (_s, u) => {
    await updateProfile(getDb(), u.id, {
      name: f.name ?? "",
      timezone: f.timezone ?? "UTC",
      studyTime: f.studyTime as "morning",
      weekStartsOn: f.weekStartsOn as unknown as 0,
      jarvisTone: f.jarvisTone as "balanced",
    });
    return "Saved";
  });
}

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  return mutate("auth.password_changed", async (_s, u) => {
    await asService(() => changePassword(getDb(), u.id, current, next));
    // Sign out every other session.
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await getDb()
      .delete(sessions)
      .where(and(eq(sessions.userId, u.id), ne(sessions.id, createHash("sha256").update(token).digest("hex"))));
    return "Password changed. Other devices were signed out.";
  });
}

export async function signOutOthersAction(): Promise<ActionState> {
  return mutate("auth.sessions_revoked", async (_s, u) => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await getDb()
      .delete(sessions)
      .where(and(eq(sessions.userId, u.id), ne(sessions.id, createHash("sha256").update(token).digest("hex"))));
    return "Signed out of all other sessions.";
  });
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (String(fd.get("confirm") ?? "") !== "DELETE") return { ok: false, error: "Type DELETE to confirm.", at: Date.now() };
  try {
    await deleteAccount(getDb(), user.id, String(fd.get("password") ?? ""));
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Could not delete the account.", at: Date.now() };
  }
  await endSession();
  redirect("/signup");
}

const memoryCategory = (v: string | undefined) =>
  (MEMORY_CATEGORIES as readonly string[]).includes(v ?? "") ? (v as (typeof MEMORY_CATEGORIES)[number]) : undefined;

export async function addMemoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("memory.create", async (s) => {
    const r = await createMemory(
      s,
      { content: f.content ?? "", category: memoryCategory(f.category) ?? "preference", expiresAt: f.expiresAt ? new Date(f.expiresAt) : null },
      "user",
    );
    return r.duplicate ? "Jarvis already remembers that." : "Saved";
  });
}

export async function updateMemoryAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("memory.update", async (s) => {
    await editMemory(s, id, { content: f.content, category: memoryCategory(f.category), expiresAt: f.expiresAt ? new Date(f.expiresAt) : null });
    return "Saved";
  });
}

export async function archiveMemoryAction(id: string, status: "active" | "archived"): Promise<ActionState> {
  return mutate("memory.status", async (s) => {
    await setMemoryStatus(s, id, status);
  });
}

export async function decideMemoryAction(id: string, decision: "keep" | "dismiss"): Promise<ActionState> {
  return mutate(`memory.suggestion.${decision}`, async (s) => {
    await decideMemorySuggestion(s, id, decision);
  });
}

export async function deleteMemoryAction(id: string): Promise<ActionState> {
  return mutate("memory.delete", async (s) => {
    await deleteMemory(s, id);
  });
}

export async function updateAssistantAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  const on = (k: string) => fd.get(k) === "on";
  return mutate("assistant.updated", async (_s, u) => {
    await updateAssistant(
      getDb(),
      u.id,
      { name: f.name ?? "", style: (f.style ?? "friend") as "friend", notes: f.notes, voice: (f.voice ?? "marin") as "marin" },
      {
        frequency: (f.frequency ?? "normal") as "normal",
        quietStart: f.quietStart || "22:00",
        quietEnd: f.quietEnd || "07:00",
        topics: {
          money: on("topic_money"),
          school: on("topic_school"),
          work: on("topic_work"),
          health: on("topic_health"),
          trips: on("topic_trips"),
          habits: on("topic_habits"),
        },
        autonomy: { tasks: on("auto_tasks"), calendar: on("auto_calendar") },
        avatar: (f.avatar ?? "spark") as "spark",
        learning: on("learning"),
        pushLimit: Number(f.pushLimit ?? 3),
      },
    );
    return "Saved. That's how I'll sound from now on.";
  });
}

export async function setMemorySuggestionsAction(enabled: boolean): Promise<ActionState> {
  return mutate("memory.suggestions_setting", async (_s, u) => {
    await updatePreferences(getDb(), u.id, { memorySuggestions: enabled });
  });
}

export async function saveNotificationPrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const on = (k: string) => fd.get(k) === "on";
  return mutate(
    "notifications.preferences",
    async (_s, u) => {
      const notifications = notificationPrefsSchema.parse({ ...notificationPrefs(u.preferences), reminders: on("reminders") });
      await updatePreferences(getDb(), u.id, { notifications });
      return "Notification settings saved.";
    },
    { revalidate: ["/settings/notifications"] },
  );
}

export async function removeDeviceAction(id: string): Promise<ActionState> {
  return mutate(
    "notifications.device_removed",
    async (s) => {
      await removeSubscriptionById(s, id);
      return "Device removed. It won't get notifications.";
    },
    { revalidate: ["/settings/notifications"] },
  );
}
