import "server-only";
import { proactiveAfterMutation } from "./services/proactive/events";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { SessionUser } from "./auth/sessions";
import { withCurrentUser } from "./auth/current-user";
import type { UserScope } from "./db/with-user";
import { audit } from "./services/audit";
import { ServiceError } from "./services/errors";
import { plainValidation } from "@/lib/validation-message";

/** `undo` is a trash id: the toast's Undo button restores it. */
/** `sun`: the action earned a sun on the skyling's cloud, so a "big" cheer plays the sun (otherwise a star). */
export type ActionState = { ok: boolean; error?: string; message?: string; undo?: string; sun?: boolean; at: number } | null;
export type MutationResult = string | void | { message?: string; undo?: string; sun?: boolean };

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
    return plainValidation(e.issues);
  }
  if (e instanceof ServiceError) return e.message;
  console.error("[action]", e);
  return "Something went wrong. Please try again.";
}

/**
 * Wraps a mutation: authenticates, runs it in the user's RLS scope, audits
 * it, revalidates pages, and converts errors to a form-friendly state.
 */
/** Account, security and privacy changes stay open to people on the waitlist (everything else waits; see current-user.ts). */
const ACCOUNT_ACTIONS = new Set(["profile.update", "ai.consent"]);

export async function mutate(
  name: string,
  fn: (scope: UserScope, user: SessionUser) => Promise<MutationResult>,
  opts: { revalidate?: string[] } = {},
): Promise<ActionState> {
  try {
    const done: { user?: SessionUser } = {};
    const message = await withCurrentUser(
      async (scope, user) => {
        const m = await fn(scope, user);
        await audit(scope, "user", name);
        done.user = user;
        return m;
      },
      { account: name.startsWith("auth.") || ACCOUNT_ACTIONS.has(name) },
    );
    if (done.user) proactiveAfterMutation(name, done.user);
    for (const p of opts.revalidate ?? ["/"]) revalidatePath(p, "layout");
    if (message && typeof message === "object") return { ok: true, message: message.message, undo: message.undo, sun: message.sun, at: Date.now() };
    return { ok: true, message: message || undefined, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: messageOf(e), at: Date.now() };
  }
}
