"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import {
  AdminError,
  acceptFromWaitlist,
  clearError,
  createAnnouncement,
  deleteUser,
  endAnnouncement,
  resetLimits,
  setInboxHandled,
  setPlan,
  setSuspended,
  setWaitlist,
  signOutEverywhere,
} from "@/server/services/admin";

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
    (msg, ok) => (ok ? `/admin/people?done=${enc(msg)}#people` : `/admin/users/${id}?error=${enc(msg)}`),
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
    (msg, ok) => `/admin/app?${ok ? "done" : "error"}=${enc(msg)}#errors`,
    async () => {
      await clearError(getDb(), admin, fp);
      return "Cleared.";
    },
  );
}

export async function inboxHandledAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  const handled = field(fd, "handled") === "1";
  const raw = field(fd, "back");
  const back = /^\/admin\/people(\?[\w=&-]*)?$/.test(raw) ? raw : "/admin/people";
  await run(
    (msg, ok) => `${back}${back.includes("?") ? "&" : "?"}${ok ? "done" : "error"}=${enc(msg)}#feedback`,
    async () => {
      await setInboxHandled(getDb(), admin, id, handled);
      return handled ? "Marked handled." : "Moved back to open.";
    },
  );
}

export async function createAnnouncementAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(
    (msg, ok) => `/admin/people?${ok ? "done" : "error"}=${enc(msg)}#announcements`,
    async () => {
      const days = Number(field(fd, "days")) || undefined;
      await createAnnouncement(getDb(), admin, {
        message: String(fd.get("message") ?? "").slice(0, 400),
        tone: field(fd, "tone"),
        linkUrl: field(fd, "linkUrl"),
        days,
      });
      return "Published. Everyone sees it the next time they open the app.";
    },
  );
}

export async function endAnnouncementAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = field(fd, "id");
  await run(
    (msg, ok) => `/admin/people?${ok ? "done" : "error"}=${enc(msg)}#announcements`,
    async () => {
      await endAnnouncement(getDb(), admin, id);
      return "Ended. The banner is gone.";
    },
  );
}

const waitlistBack = (msg: string, ok: boolean) => `/admin/people?${ok ? "done" : "error"}=${enc(msg)}#waitlist`;
const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Lets in one person or the previewed batch (the exact ids shown), after the confirm box. Safe to press twice. */
export async function acceptWaitlistAction(fd: FormData) {
  const admin = await requireAdmin();
  const ids = fd
    .getAll("id")
    .map((v) => String(v).slice(0, 40))
    .slice(0, 101);
  await run(waitlistBack, async () => {
    const r = await acceptFromWaitlist(getDb(), admin, ids, field(fd, "confirm") === "yes");
    if (!r.accepted) return r.already ? "They were already in. Nothing changed." : "Nobody was let in.";
    return `Let ${plural(r.accepted)} in.${r.already ? ` ${plural(r.already)} already had access.` : ""} Nobody was messaged.`;
  });
}

/** The owner's switch and the launch line. */
export async function waitlistSwitchAction(fd: FormData) {
  const admin = await requireAdmin();
  const on = field(fd, "on") === "1";
  const note = fd.has("launchNote") ? String(fd.get("launchNote") ?? "").slice(0, 400) : undefined;
  await run(waitlistBack, async () => {
    await setWaitlist(getDb(), admin, { on, confirmed: field(fd, "confirm") === "yes", launchNote: note });
    return on ? "The waitlist is on. People you haven't let in see their place in line." : "The waitlist is off. Everyone can use the app.";
  });
}
