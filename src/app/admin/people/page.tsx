import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/require-admin";
import { AnnouncementsSection } from "../announcements/section";
import { FeedbackSection } from "../feedback/section";
import { UsersSection, type PeopleParams } from "../users/section";
import { AdminTitle, Notice } from "../ui";

export const metadata: Metadata = { title: "People" };

/** People (ADR 0027): the accounts, what they send you, and the banner they all see. Each part loads on its own. */
export default async function People({ searchParams }: { searchParams: Promise<PeopleParams & { done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      <AdminTitle title="People" sub="Accounts only. Their money, messages and tasks stay private." />
      <Notice done={sp.done} error={sp.error} />
      <UsersSection sp={sp} />
      <FeedbackSection sp={sp} />
      <AnnouncementsSection />
    </div>
  );
}
