"use server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NEW_KEY_COOKIE } from "./shared";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { isHqRole } from "@/server/hq/team";
import type { MissionPriority, MissionStatus } from "@/server/hq/types";
import { fromLocalInput } from "@/components/hq/marketing-labels";
import { getSessionUser } from "@/server/auth/current-user";
import { getContent, saveControls, updateContent } from "@/server/services/hq-marketing";
import { HqError, createHqKey, createMission, decideApproval, importSeedAsOwner, removeChat, revokeHqKey, saveChat, updateMission } from "@/server/services/hq";

/* Every action re-checks the admin first (a layout is not enough), runs, refreshes and comes back with ?done= or ?error=. */

const enc = encodeURIComponent;

async function run(back: (msg: string, ok: boolean) => string, fn: () => Promise<string>) {
  let msg = "";
  let ok = true;
  try {
    msg = await fn();
  } catch (e) {
    if (!(e instanceof HqError)) throw e;
    msg = e.message;
    ok = false;
  }
  revalidatePath("/admin", "layout");
  redirect(back(msg, ok));
}

const to = (path: string) => (msg: string, ok: boolean) => `${path}?${ok ? "done" : "error"}=${enc(msg)}`;
const text = (fd: FormData, name: string, max = 200) =>
  String(fd.get(name) ?? "")
    .trim()
    .slice(0, max);
const STATUSES: MissionStatus[] = ["todo", "doing", "waiting", "blocked", "done", "dropped"];
const PRIORITIES: MissionPriority[] = ["high", "normal", "low"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createMissionAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/missions"), async () => {
    const role = text(fd, "role");
    if (!isHqRole(role)) throw new HqError("Pick who it is for.");
    const title = text(fd, "title", 160);
    if (title.length < 3) throw new HqError("Give the mission a short title.");
    const priority = text(fd, "priority") as MissionPriority;
    const dueOn = text(fd, "dueOn");
    await createMission(
      getDb(),
      { kind: "owner", email: admin.email },
      {
        role,
        title,
        detail: text(fd, "detail", 2000) || null,
        priority: PRIORITIES.includes(priority) ? priority : "normal",
        dueOn: DATE.test(dueOn) ? dueOn : null,
      },
    );
    return "Mission added.";
  });
}

export async function updateMissionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = text(fd, "id", 64);
  await run(to(`/admin/hq/missions/${enc(id)}`), async () => {
    const op = text(fd, "op");
    const actor = { kind: "owner", email: admin.email } as const;
    if (op === "status") {
      const status = text(fd, "status") as MissionStatus;
      if (!STATUSES.includes(status)) throw new HqError("Pick a status.");
      const reason = text(fd, "reason", 500);
      const result = text(fd, "result", 2000);
      if (status === "blocked" && !reason) throw new HqError("Say what it is blocked on.");
      await updateMission(getDb(), actor, id, {
        status,
        ...(status === "blocked" ? { blockedReason: reason } : {}),
        ...(status === "done" && result ? { result } : {}),
      });
      return "Status updated.";
    }
    if (op === "progress") {
      await updateMission(getDb(), actor, id, { progress: text(fd, "progress", 1000) || null });
      return "Progress saved.";
    }
    if (op === "link") {
      const url = text(fd, "url", 500);
      const label = text(fd, "label", 80) || url;
      if (!/^(https:\/\/|\/)/.test(url)) throw new HqError("A link must start with https:// or /.");
      const links = JSON.parse(text(fd, "links", 4000) || "[]") as { label: string; url: string }[];
      await updateMission(getDb(), actor, id, { links: [...links.slice(0, 19), { label, url }] });
      return "Link added.";
    }
    throw new HqError("Nothing to change.");
  });
}

export async function decideAction(fd: FormData) {
  const admin = await requireAdmin();
  const decision = text(fd, "decision");
  await run(to("/admin/hq/approvals"), async () => {
    if (decision !== "approved" && decision !== "declined" && decision !== "changes") throw new HqError("Pick Yes, No or Changes.");
    await decideApproval(getDb(), admin, text(fd, "id", 64), decision, text(fd, "note", 500) || null);
    return decision === "approved" ? "You said yes." : decision === "declined" ? "You said no." : "You asked for changes.";
  });
}

export async function saveChatAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    const id = text(fd, "id", 120);
    if (!id) throw new HqError("A chat needs a session id.");
    const role = text(fd, "role");
    await saveChat(getDb(), admin, {
      id,
      role: isHqRole(role) ? role : null,
      title: text(fd, "title", 120) || "Chat",
      isPrimary: fd.get("isPrimary") === "on",
      branch: text(fd, "branch", 160) || null,
    });
    return "Chat saved.";
  });
}

/** Loads docs/hq/seed.json (the real starting list). Owner-only: unlike an agent's import, it may map chats to employees. */
export async function importSeedAction() {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    let seed: unknown;
    try {
      seed = JSON.parse(await readFile(join(process.cwd(), "docs/hq/seed.json"), "utf8"));
    } catch {
      throw new HqError("The starting list isn't available on this server.");
    }
    const r = await importSeedAsOwner(getDb(), admin, seed);
    return r.chats + r.missions + r.approvals
      ? `Imported ${r.chats} chats, ${r.missions} missions and ${r.approvals} approvals.`
      : "Everything on the starting list is already here.";
  });
}

export async function removeChatAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    await removeChat(getDb(), admin, text(fd, "id", 120));
    return "Chat removed from HQ. The chat itself is untouched.";
  });
}

/** The raw key goes to the next page load in a short-lived httpOnly cookie, never in the URL. */
export async function createKeyAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    const name = text(fd, "name", 60);
    if (name.length < 2) throw new HqError("Give the key a name, like “cloud environment”.");
    const { token } = await createHqKey(getDb(), admin, name);
    (await cookies()).set(NEW_KEY_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/admin/hq",
      maxAge: 120,
    });
    return "Key created. Copy it now: it is shown once.";
  });
}

export async function revokeKeyAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    await revokeHqKey(getDb(), admin, text(fd, "id", 64));
    return "Key revoked.";
  });
}

/* --- Marketing and controls (ADR 0025). HQ only records the answer; the next round acts on it. --- */

export async function decideContentAction(fd: FormData) {
  const admin = await requireAdmin();
  const decision = text(fd, "decision");
  await run(to("/admin/hq/marketing"), async () => {
    if (decision !== "approved" && decision !== "declined" && decision !== "changes") throw new HqError("Pick Yes, No or Changes.");
    const id = text(fd, "approvalId", 64);
    if (!id) throw new HqError("This item has no question to answer.");
    await decideApproval(getDb(), admin, id, decision, text(fd, "note", 500) || null);
    return decision === "approved" ? "You said yes." : decision === "declined" ? "You said no." : "You asked for changes.";
  });
}

const CONTENT_ID = /^[0-9a-f-]{20,40}$/i;

export async function updateContentAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = text(fd, "id", 64);
  await run(to(CONTENT_ID.test(id) ? `/admin/hq/marketing/${enc(id)}` : "/admin/hq/marketing"), async () => {
    if (!CONTENT_ID.test(id)) throw new HqError("That item isn't here.");
    const actor = { kind: "owner", email: admin.email } as const;
    const op = text(fd, "op");
    if (op === "drop") {
      await updateContent(getDb(), actor, id, { status: "dropped" });
      return "Dropped. It won't be posted.";
    }
    if (op === "edit") {
      const title = text(fd, "title", 160);
      if (title.length < 3) throw new HqError("Give it a short title.");
      const when = text(fd, "scheduledFor", 40);
      const tz = (await getSessionUser())?.timezone || "UTC";
      const iso = when ? fromLocalInput(when, tz) : null;
      if (when && !iso) throw new HqError("That date and time doesn't look right.");
      if (!(await getContent(getDb(), id))) throw new HqError("That item isn't here.");
      await updateContent(getDb(), actor, id, { title, hook: text(fd, "hook", 400) || null, scheduledFor: iso });
      return "Saved.";
    }
    throw new HqError("Nothing to change.");
  });
}

export async function saveControlsAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(to("/admin/hq/settings"), async () => {
    const raw = text(fd, "creditBudget", 10);
    const creditBudget = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(creditBudget) || creditBudget < 0 || creditBudget > 10000) throw new HqError("Credits must be a whole number from 0 to 10000.");
    const on = (k: string) => fd.get(k) === "on";
    await saveControls(getDb(), admin, {
      autonomous: on("autonomous"),
      rounds: { night: on("night"), research: on("research"), marketing: on("marketing") },
      creditBudget,
    });
    return "Saved";
  });
}
