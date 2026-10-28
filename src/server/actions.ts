import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { SessionUser } from "./auth/sessions";
import { withCurrentUser } from "./auth/current-user";
import type { UserScope } from "./db/with-user";
import { audit } from "./services/audit";
import { ServiceError } from "./services/errors";

/** `undo` is a trash id: the toast's Undo button restores it. */
export type ActionState = { ok: boolean; error?: string; message?: string; undo?: string; at: number } | null;
export type MutationResult = string | void | { message: string; undo?: string };

/** FormData → plain object; blank strings become undefined. */
export function formObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v.trim() === "" ? undefined : v.trim();
  return out;
}

export const formBool = (v: string | undefined) => v === "on" || v === "true" || v === "1";
export const formNum = (v: string | undefined) => (v == null || v === "" ? undefined : Number(v));
export const formCents = (v: string | undefined) => {
  if (v == null) return undefined;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

function messageOf(e: unknown) {
  if (e instanceof ZodError) {
    const i = e.issues[0];
    return `${i.path.length ? `${String(i.path.at(-1))}: ` : ""}${i.message}`;
  }
  if (e instanceof ServiceError) return e.message;
  console.error("[action]", e);
  return "Something went wrong. Please try again.";
}

/**
 * Wraps a mutation: authenticates, runs it in the user's RLS scope, audits
 * it, revalidates pages, and converts errors to a form-friendly state.
 */
export async function mutate(
  name: string,
  fn: (scope: UserScope, user: SessionUser) => Promise<MutationResult>,
  opts: { revalidate?: string[] } = {},
): Promise<ActionState> {
  try {
    const message = await withCurrentUser(async (scope, user) => {
      const m = await fn(scope, user);
      await audit(scope, "user", name);
      return m;
    });
    for (const p of opts.revalidate ?? ["/"]) revalidatePath(p, "layout");
    if (message && typeof message === "object") return { ok: true, message: message.message, undo: message.undo, at: Date.now() };
    return { ok: true, message: message || undefined, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: messageOf(e), at: Date.now() };
  }
}
