"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { AdminError, clearError, deleteUser, resetLimits, setPlan, setSuspended, signOutEverywhere } from "@/server/services/admin";

const enc = encodeURIComponent;

/** Re-checks the admin on every action (a layout isn't enough), runs it, and comes back with a message. Real bugs still throw. */
async function run(back: (msg: string, ok: boolean) => string, fn: () => Promise<string>) {
  let msg = "";
  let ok = true;
  try {
    msg = await fn();
  } catch (e) {
    if (!(e instanceof AdminError)) throw e;
    msg = e.message;
    ok = false;
  }
  revalidatePath("/admin", "layout");
  redirect(back(msg, ok));
}

const userBack = (id: string) => (msg: string, ok: boolean) => `/admin/users/${id}?${ok ? "done" : "error"}=${enc(msg)}`;
const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").slice(0, 200);

export async function signOutAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  await run(userBack(id), async () => {
    await signOutEverywhere(getDb(), admin, id);
    return "Signed out everywhere.";
  });
}

export async function suspendAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  const suspend = field(fd, "suspend") === "1";
  await run(userBack(id), async () => {
    await setSuspended(getDb(), admin, id, suspend);
    return suspend ? "Suspended. They're signed out and can't sign in." : "Unsuspended. They can sign in again.";
  });
}

export async function planAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  const plan = field(fd, "plan");
  await run(userBack(id), async () => {
    await setPlan(getDb(), admin, id, plan);
    return `Plan set to ${plan}.`;
  });
}

export async function deleteAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  const email = field(fd, "confirmEmail");
  await run(
    (msg, ok) => (ok ? `/admin/users?done=${enc(msg)}` : `/admin/users/${id}?error=${enc(msg)}`),
    async () => {
      await deleteUser(getDb(), admin, id, email);
      return "User deleted.";
    },
  );
}

export async function resetLimitsAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  await run(userBack(id), async () => {
    await resetLimits(getDb(), admin, id);
    return "Limits reset. They have today's and this month's full allowance again.";
  });
}

export async function clearErrorAction(fd: FormData) {
  const admin = await requireAdmin();
  const fp = field(fd, "fingerprint");
  await run(
    (msg, ok) => `/admin/errors?${ok ? "done" : "error"}=${enc(msg)}`,
    async () => {
      await clearError(getDb(), admin, fp);
      return "Cleared.";
    },
  );
}
