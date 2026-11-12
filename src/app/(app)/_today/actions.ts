"use server";
import { formObject, mutate, type ActionState } from "@/server/actions";
import { addDaysStr, DATE_RE, formatDateStr, TIME_RE, todayIn } from "@/lib/dates";
import { createEvent } from "@/server/services/calendar";
import { createMilestone } from "@/server/services/milestones";
import { createPersonalGoal } from "@/server/services/personal-goals";
import { createTask } from "@/server/services/tasks";
import { ServiceError } from "@/server/services/errors";
import { localDateOf, localTimeOf } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { claimStars, type Star } from "@/server/services/stars";
import { afterAgeLock, saveBirthday } from "@/server/services/onboarding";
import { getDb } from "@/server/db/client";
import { after } from "next/server";
import { audit } from "@/server/services/audit";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { deleteEvent, getEvent } from "@/server/services/calendar";
import { getAssignment } from "@/server/services/school";
import { getShift } from "@/server/services/work";
import type { Block } from "@/app/(app)/plan/block-editor";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * What the editor needs for one thing on the timeline, loaded only when its card's Edit is tapped (the Today page
 * stays one read). The id is the clock item's: "event:<id>:<occurrence start>", "shift:<id>" or "assignment:<id>".
 * Anything else (or a thing that's gone) is null, and the card opens its page instead.
 */
export async function blockForEditAction(itemId: string): Promise<Exclude<Block, { origin: "task" }> | null> {
  const ev = itemId.match(new RegExp(`^event:(${UUID}):(.+)$`));
  const sh = itemId.match(new RegExp(`^shift:(${UUID})$`));
  const as = itemId.match(new RegExp(`^assignment:(${UUID})$`));
  if (!ev && !sh && !as) return null;
  return withCurrentUser(async (s, u): Promise<Exclude<Block, { origin: "task" }>> => {
    const tz = u.timezone;
    if (ev) {
      const e = await getEvent(s, ev[1]);
      const at = new Date(ev[2]);
      const start = Number.isNaN(at.getTime()) ? e.startsAt : at;
      const end = new Date(start.getTime() + (e.endsAt.getTime() - e.startsAt.getTime()));
      return {
        origin: "event",
        id: e.id,
        title: e.title,
        date: localDateOf(start, tz),
        startTime: e.allDay ? null : localTimeOf(start, tz),
        endTime: e.allDay ? null : localTimeOf(end, tz),
        allDay: e.allDay,
        kind: e.kind,
        location: e.location,
        description: e.description,
        repeats: !!e.recurrence,
      };
    }
    if (sh) {
      const x = await getShift(s, sh[1]);
      return {
        origin: "shift",
        id: x.id,
        employerId: x.employerId,
        date: localDateOf(x.startsAt, tz),
        startTime: localTimeOf(x.startsAt, tz),
        endTime: localTimeOf(x.endsAt, tz),
        breakMinutes: x.breakMinutes,
        notes: x.notes,
      };
    }
    const a = await getAssignment(s, as![1]);
    return {
      origin: "assignment",
      id: a.id,
      title: a.title,
      kind: a.kind,
      dueDate: a.dueAt ? localDateOf(a.dueAt, tz) : null,
      dueTime: a.dueAt && !a.dueAllDay ? localTimeOf(a.dueAt, tz) : null,
      description: a.description,
      done: a.status === "done",
    };
  }).catch(() => null);
}

const KINDS = ["todo", "plan", "goal", "milestone"] as const;
type PinKind = (typeof KINDS)[number];

/** "15:00" + 60 minutes = "16:00", never past midnight. */
function plusHour(time: string) {
  const [h, m] = time.split(":").map(Number);
  const end = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/**
 * Pin something on the timeline (owner, 2026-11-08: "I'll just add them on the timeline like a pin"):
 * a to-do with a time, a plan (an event), a goal with its date, or a milestone that happened. Saved through the
 * same services as everywhere else; the chosen emoji leads the title, so it's that thing's icon everywhere.
 */
export async function pinAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const f = formObject(fd);
  const kind = (KINDS as readonly string[]).includes(f.kind ?? "") ? (f.kind as PinKind) : "todo";
  const emoji = (f.emoji ?? "").trim().slice(0, 16);
  const name = (f.title ?? "").trim();
  const title = emoji ? `${emoji} ${name}` : name;
  return mutate("timeline.pin", async (s, u) => {
    if (!name) throw new ServiceError("Give it a name.");
    const date = f.date && DATE_RE.test(f.date) ? f.date : todayIn(u.timezone);
    const time = f.time && TIME_RE.test(f.time) ? f.time : null;
    if (kind === "todo") {
      await createTask(s, u.timezone, { title, priority: "medium", dueDate: date, dueTime: time });
      return `Pinned "${name}".`;
    }
    if (kind === "plan") {
      const start = time ?? "09:00";
      await createEvent(s, u.timezone, { title, date, startTime: start, endTime: plusHour(start), kind: "personal" });
      return `Pinned "${name}".`;
    }
    if (kind === "goal") {
      await createPersonalGoal(s, { title, targetDate: date });
      return `Pinned your goal "${name}".`;
    }
    if (date > todayIn(u.timezone)) throw new ServiceError("A milestone is something that happened. For a future date, pin it as a goal or a plan.");
    await createMilestone(s, { title, when: date });
    return `Pinned "${name}" to your story.`;
  });
}

/** The birthday asked once on Today from accounts made before it was required (owner, 2026-11-10). */
export async function saveBirthdayAction(birthDate: string, confirmed = false): Promise<ActionState | { ok: false; confirm: string; at: number }> {
  let blocked = false;
  try {
    const r = await withCurrentUser(async (s, u) => {
      const out = await saveBirthday(s, u.timezone || "UTC", birthDate, { confirmed });
      if (!out.confirm) await audit(s, "user", out.blocked ? "profile.age_blocked" : "profile.birthday");
      return { ...out, userId: u.id };
    });
    // a finished account sees the date read back before anything is locked or erased
    if (r.confirm) return { ok: false, confirm: r.confirm, at: Date.now() };
    blocked = r.blocked;
    // the lock is committed: now close their bank and Google links where they live (retried by the sync cron if this fails)
    if (blocked) after(() => afterAgeLock(getDb(), r.userId));
    revalidatePath("/", "layout");
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof ServiceError ? e.message : "Couldn't save. Try again.", at: Date.now() };
  }
  // under 13 locks the account (owner, 2026-11-10): straight to the lock screen
  if (blocked) redirect("/welcome");
  return { ok: true, at: Date.now() };
}

/**
 * Claims the stars for what the skyling passed while they were away (owner, 2026-11-10). A client action, called once
 * Today is on screen, so a prefetch of the page never claims them unseen. Nothing to show on any failure.
 */
export async function claimStarsAction(): Promise<Star[]> {
  try {
    return await withCurrentUser((s, u) => claimStars(s, u.timezone || "UTC"));
  } catch (e) {
    unstable_rethrow(e);
    return [];
  }
}

/**
 * "Block it" on something the sky noticed (lib/sky-insights `SkyBlock`): books that free time as a study block, the same
 * event the skyling's "Block it" makes. `undo` carries the new event's id for `unblockTimeAction` (not a trash id).
 */
export async function blockTimeAction(block: { date: string; start: string; end: string; title: string }): Promise<ActionState> {
  const ok =
    DATE_RE.test(block.date) &&
    TIME_RE.test(block.start) &&
    TIME_RE.test(block.end) &&
    block.start < block.end &&
    typeof block.title === "string" &&
    block.title.trim().length > 0 &&
    block.title.length <= 200;
  if (!ok) return { ok: false, error: "That time isn't available anymore.", at: Date.now() };
  return mutate("insight.block", async (s, u) => {
    const today = todayIn(u.timezone);
    if (block.date < today || block.date > addDaysStr(today, 14)) throw new ServiceError("That time isn't available anymore.");
    const ev = await createEvent(s, u.timezone, { title: block.title.trim(), date: block.date, startTime: block.start, endTime: block.end, kind: "study" });
    return {
      message: `Blocked ${clockWords(block.start)} to ${clockWords(block.end)} ${block.date === today ? "today" : formatDateStr(block.date, "EEEE")}.`,
      undo: ev.id,
    };
  });
}

/** Undo for `blockTimeAction`: removes that study block (only a study block, only theirs). */
export async function unblockTimeAction(eventId: string): Promise<ActionState> {
  if (!new RegExp(`^${UUID}$`).test(eventId)) return { ok: false, error: "That block is already gone.", at: Date.now() };
  return mutate("insight.unblock", async (s) => {
    const e = await getEvent(s, eventId);
    if (e.kind !== "study") throw new ServiceError("That block is already gone.");
    await deleteEvent(s, eventId);
    return "Removed the block.";
  });
}

const clockWords = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
