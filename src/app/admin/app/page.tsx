import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/require-admin";
import { ActivitySection } from "../activity/section";
import { ErrorsSection } from "../errors/section";
import { GrowthSection } from "../growth/section";
import { HealthSection } from "../health/section";
import { AdminTitle, Notice } from "../ui";
import { AiUseSection } from "./ai-use";

export const metadata: Metadata = { title: "App" };

/** App (ADR 0027): how the app is doing. Growth, AI use, errors, health and the log of admin changes. Each part loads on its own. */
export default async function AppPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      <AdminTitle title="App" sub="How LifeFlow is doing." />
      <Notice done={sp.done} error={sp.error} />
      <GrowthSection />
      <AiUseSection />
      <ErrorsSection />
      <HealthSection />
      <ActivitySection />
    </div>
  );
}
