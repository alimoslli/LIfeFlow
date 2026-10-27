"use server";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { endSession, requireUser } from "@/server/auth/current-user";
import { SESSION_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { AuthError, changePassword, deleteAccount, updatePreferences, updateProfile } from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";
import { decideMemorySuggestion } from "@/server/jarvis/memory-decisions";
import { createMemory, deleteMemory, editMemory, MEMORY_CATEGORIES, setMemoryStatus } from "@/server/services/memory";
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
    await updateProfile(getDb(), u.id, { name: f.name ?? "", timezone: f.timezone ?? "UTC", studyTime: f.studyTime as "morning", weekStartsOn: f.weekStartsOn as unknown as 0, jarvisTone: f.jarvisTone as "balanced" });
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
    await getDb().delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, createHash("sha256").update(token).digest("hex"))));
    return "Password changed. Other devices were signed out.";
  });
}

export async function signOutOthersAction(): Promise<ActionState> {
  return mutate("auth.sessions_revoked", async (_s, u) => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await getDb().delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, createHash("sha256").update(token).digest("hex"))));
    return "Signed out of all other sessions.";
  });
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (String(fd.get("confirm") ?? "") !== "DELETE") return { ok: false, error: 'Type DELETE to confirm.', at: Date.now() };
  try {
    await deleteAccount(getDb(), user.id, String(fd.get("password") ?? ""));
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Could not delete the account.", at: Date.now() };
  }
  await endSession();
  redirect("/signup");
}

const memoryCategory = (v: string | undefined) => (MEMORY_CATEGORIES as readonly string[]).includes(v ?? "") ? (v as (typeof MEMORY_CATEGORIES)[number]) : undefined;

export async function addMemoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  return mutate("memory.create", async (s) => {
    const r = await createMemory(s, { content: f.content ?? "", category: memoryCategory(f.category) ?? "preference", expiresAt: f.expiresAt ? new Date(f.expiresAt) : null }, "user");
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

export async function setMemorySuggestionsAction(enabled: boolean): Promise<ActionState> {
  return mutate("memory.suggestions_setting", async (_s, u) => {
    await updatePreferences(getDb(), u.id, { memorySuggestions: enabled });
  });
}
