import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { addDaysStr, formatIn, todayIn } from "@/lib/dates";
import { lifeAreas } from "@/lib/life";
import { withCurrentUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { unreadCount } from "@/server/services/proactive/engine";
import { openTaskCount } from "@/server/services/tasks";
import { listShifts } from "@/server/services/work";
import type { Door } from "@/components/settings/door-grid";

export type EverythingDoors = { doors: Door[] };

/** "Today at 5:00 PM", "Tomorrow at 9:00 AM" or "Thursday": when the next shift starts, never what it pays. */
export function nextShiftLine(startsAt: Date, tz: string, today: string) {
  const day = formatIn(startsAt, tz, "yyyy-MM-dd");
  const at = formatIn(startsAt, tz, "h:mm a");
  if (day === today) return `Today at ${at}`;
  if (day === addDaysStr(today, 1)) return `Tomorrow at ${at}`;
  return `Next shift ${formatIn(startsAt, tz, "EEEE")}`;
}

/**
 * Everything that isn't one of the three places (owner, 2026-11-10, navigation concept A): one short sheet of doors,
 * each with a line about what's happening in it, in place of the rows of pills. Real records only; a door with nothing
 * to say keeps a plain line about what it is.
 */
export async function everythingDoors(now = new Date()): Promise<EverythingDoors> {
  return withCurrentUser(async (s, u) => {
    const tz = u.timezone;
    const today = todayIn(tz);
    const areas = lifeAreas(u.preferences?.lifeStage);
    const name = assistantProfile(u.preferences, tz).name;
    const [todos, unread, shifts] = await series(
      () => openTaskCount(s),
      () => unreadCount(s),
      () => (areas.work ? listShifts(s, tz, today, addDaysStr(today, 14)) : Promise.resolve([])),
    );
    const next = shifts.find((x) => x.status === "scheduled" && x.startsAt.getTime() > now.getTime());
    const doors: Door[] = [
      { href: "/plan", icon: "calendar", label: "Calendar", detail: "Your week and your month" },
      { href: "/tasks", icon: "todo", label: "To-dos", detail: todos ? `${todos} open` : "Nothing open" },
      { href: "/milestones", icon: "goal", label: "Goals and milestones", detail: "What you've done, and what's next" },
      { href: "/habits", icon: "health", label: "Health", detail: "Sleep, steps and workouts" },
      ...(areas.work
        ? [{ href: "/work", icon: "shift", label: "Work", detail: next ? nextShiftLine(next.startsAt, tz, today) : "Shifts and paid hours" } satisfies Door]
        : []),
      { href: "/jarvis/says", icon: "bell", label: "Updates", detail: unread ? `${unread} new` : `What ${name} noticed` },
      { href: "/jarvis/profile", icon: "skyling", label: nameAtStart(name), detail: `What ${name} knows about you` },
      { href: "/settings", icon: "cog", label: "Settings", detail: "You, the look, what's connected" },
    ];
    return { doors };
  });
}
