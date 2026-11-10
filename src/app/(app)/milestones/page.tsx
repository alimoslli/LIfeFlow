import { AssistantName } from "@/components/assistant-name";
import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, Download, Flag, GraduationCap, Heart, HeartPulse, Plane, PiggyBank, Star, Trash2, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/surface";
import { LIFE, SegmentedNav } from "@/components/ui/segmented-nav";
import { todayIn } from "@/lib/dates";
import { requireUser, withCurrentUser } from "@/server/auth/current-user";
import { moneyLocked } from "@/server/auth/money-lock";
import { MILESTONE_CATEGORIES, type MilestoneCategory } from "@/server/db/schema";
import { lifeTimeline, whenLabel, type TimelineItem } from "@/server/services/milestones";
import { AskJarvisButton } from "../money/money-client";
import { createMilestoneAction, deleteMilestoneAction, updateMilestoneAction } from "./actions";
import { SkylingIcon } from "@/components/skylings/sprite";

export const metadata: Metadata = { title: "Milestones" };

const CATEGORY: Record<MilestoneCategory, { label: string; icon: LucideIcon }> = {
  school: { label: "School", icon: GraduationCap },
  work: { label: "Work", icon: Briefcase },
  money: { label: "Money", icon: PiggyBank },
  health: { label: "Health", icon: HeartPulse },
  travel: { label: "Travel", icon: Plane },
  family: { label: "Family", icon: Heart },
  personal: { label: "Personal", icon: Star },
};

const TELL_JARVIS =
  "I want to tell you about milestones in my life. Ask me one short question at a time about things I've done (school, work, moves, trips, achievements), and add each one to my milestones with the year.";

/** Life milestones: what the user has done, with every reached goal included. Goals in progress are one tap away. */
export default async function MilestonesPage({ searchParams }: { searchParams: Promise<{ imported?: string }> }) {
  const { imported } = await searchParams;
  const locked = await moneyLocked(await requireUser());
  const d = await withCurrentUser(async (s, u) => ({
    items: await lifeTimeline(s, { includeMoney: !locked, tz: u.timezone }),
    year: Number(todayIn(u.timezone).slice(0, 4)),
  }));
  const groups = new Map<string, TimelineItem[]>();
  for (const i of d.items) {
    const k = i.date ? i.date.slice(0, 4) : "No date";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const reached = d.items.filter((i) => i.kind !== "milestone").length;
  const thisYear = d.items.filter((i) => i.date?.startsWith(String(d.year))).length;
  const [facts, ms, goals] = (imported ?? "").split(".").map(Number);

  return (
    <>
      <div className="mb-4">
        <SegmentedNav label="Milestones and goals" items={LIFE} active="milestones" />
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-medium tracking-tight">Milestones</h1>
          <p className="text-sm text-text-2">Everything you&apos;ve done, and every goal you reach.</p>
        </div>
        <AskJarvisButton prompt={TELL_JARVIS}>
          <SkylingIcon className="h-5 w-5" /> Tell <AssistantName /> your story
        </AskJarvisButton>
      </div>

      {imported && (
        <p className="mb-4 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success" role="status">
          Imported{" "}
          {[facts ? `${facts} about you` : "", ms ? `${ms} milestone${ms === 1 ? "" : "s"}` : "", goals ? `${goals} goal${goals === 1 ? "" : "s"}` : ""]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4 max-lg:order-2">
          {d.items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "Milestones", v: d.items.length },
                { k: "Goals reached", v: reached },
                { k: `In ${d.year}`, v: thisYear },
              ].map((x) => (
                <div key={x.k} className="rounded-3xl bg-surface p-4 shadow-soft">
                  <p className="font-display text-[1.75rem] leading-none">{x.v}</p>
                  <p className="mt-1 text-xs text-muted">{x.k}</p>
                </div>
              ))}
            </div>
          )}
          {d.items.length === 0 && (
            <Card>
              <EmptyState icon={<Trophy />} title="Your story starts here">
                Add the things you&apos;ve done: graduating, a first job, moving out, a race you finished. Every goal you reach lands here too.
              </EmptyState>
            </Card>
          )}
          {[...groups.entries()].map(([year, items]) => (
            <section key={year} aria-label={year}>
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{year}</h2>
              <ol className="divide-y divide-border overflow-hidden rounded-3xl bg-surface shadow-soft">
                {items.map((i) => {
                  const C = i.kind === "milestone" ? CATEGORY[i.category] : { label: "Goal reached", icon: i.kind === "money_goal" ? PiggyBank : Flag };
                  const when = whenLabel(i);
                  return (
                    <li key={`${i.kind}-${i.id}`} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                          <C.icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.9375rem] font-medium break-words">{i.title}</p>
                          <p className="text-xs text-muted">{[when, C.label].filter(Boolean).join(" · ")}</p>
                          {i.note && <p className="mt-1 text-sm text-text-2">{i.note}</p>}
                        </div>
                        {i.kind === "milestone" ? (
                          <ActionButton
                            action={deleteMilestoneAction.bind(null, i.id)}
                            confirm={`Delete "${i.title}"?`}
                            title={`Delete ${i.title}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        ) : (
                          <Link
                            href="/goals"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                            aria-label="See goals"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                      {i.kind === "milestone" && (
                        <details className="mt-1 pl-12">
                          <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-accent">Edit</summary>
                          <ActionForm action={updateMilestoneAction.bind(null, i.id)} reset={false} className="mt-2 flex flex-col gap-2">
                            <Input name="title" defaultValue={i.title} required maxLength={200} aria-label="Edit what happened" />
                            <div className="flex gap-2">
                              <Input
                                name="when"
                                defaultValue={i.date ? (i.precision === "day" ? i.date : (when ?? "")) : ""}
                                placeholder="2022 or May 2022"
                                aria-label="Edit when"
                                className="flex-1"
                              />
                              <Select name="category" defaultValue={i.category} aria-label="Edit kind" className="flex-1">
                                {MILESTONE_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {CATEGORY[c].label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <Input name="note" defaultValue={i.note ?? ""} maxLength={500} placeholder="A note (optional)" aria-label="Edit note" />
                            <SubmitButton size="sm">Save</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-4 max-lg:order-1">
          <Card className="p-5">
            <h2 className="font-medium">Add a milestone</h2>
            <ActionForm action={createMilestoneAction} className="mt-3 flex flex-col gap-3">
              <Field label="What happened" htmlFor="ms-title">
                <Input id="ms-title" name="title" required maxLength={200} placeholder="Graduated from high school" />
              </Field>
              <div className="flex gap-3">
                <Field label="When" htmlFor="ms-when" className="flex-1">
                  <Input id="ms-when" name="when" maxLength={40} placeholder="2022 or May 2022" />
                </Field>
                <Field label="Kind" htmlFor="ms-cat" className="flex-1">
                  <Select id="ms-cat" name="category" defaultValue="personal">
                    {MILESTONE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY[c].label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <SubmitButton>Add milestone</SubmitButton>
            </ActionForm>
          </Card>
          <Link href="/jarvis/memory/import" className="flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-5 py-4 shadow-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Download className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium">Import from ChatGPT or another AI</span>
              <span className="block text-xs text-muted">Bring your story, milestones and goals in one paste.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </div>
      </div>
    </>
  );
}
