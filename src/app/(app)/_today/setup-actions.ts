"use server";
import { mutate, type ActionState } from "@/server/actions";
import { keptSchema } from "@/server/services/schedule-photo";
import { setUpSchedule } from "@/server/services/schedule-setup";
import { ServiceError } from "@/server/services/errors";
import { finishSetup } from "@/server/services/setup-first";

/**
 * Setup in the app. The picture was read into a proposal (api/setup/schedule); this saves only what the person kept, through
 * the same service the chat uses (`setUpSchedule`, which never adds a class or job twice). The message says only what was
 * really saved.
 */
export async function saveSchedulePhotoAction(kept: unknown): Promise<ActionState> {
  return mutate("onboarding.schedule_photo", async (s, u) => {
    const d = keptSchema.parse(kept);
    if (!d.classes.length && !d.jobs.length) throw new ServiceError("Tick at least one thing to add.");
    const r = await setUpSchedule(s, u.timezone || "UTC", { classes: d.classes, jobs: d.jobs });
    const classes = r.classes.filter((c) => !c.alreadyOnCalendar).length;
    const shifts = r.jobs.reduce((n, j) => n + j.shiftsAdded, 0);
    const jobs = r.jobs.filter((j) => j.newJob).length;
    if (!classes && !shifts && !jobs) throw new ServiceError("Those are already on your sky.");
    const parts = [classes && `${classes} class${classes === 1 ? "" : "es"}`, shifts && `${shifts} shift${shifts === 1 ? "" : "s"}`].filter(Boolean);
    return parts.length ? `Added ${parts.join(" and ")}.` : "Added your job.";
  });
}

/**
 * "Go to my sky": setup is done. The birthday is still required (`finishOnboarding`), and so is one real connection, read from
 * the account's own rows (`requireFirstConnection`), never from anything the browser says. Skip is gone.
 */
export async function finishSetupAction(): Promise<ActionState> {
  return mutate("onboarding.completed", async (s, u) => {
    await finishSetup(s, u.timezone || "UTC");
  });
}
