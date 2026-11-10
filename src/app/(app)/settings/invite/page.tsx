import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card } from "@/components/ui/surface";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { inviteCodeFor, invitedCount } from "@/server/services/invites";
import { SettingsHeader } from "../settings-header";
import { InviteShare } from "./invite-share";
import { FeedbackCard } from "./feedback-card";

export const metadata: Metadata = { title: "Invite and feedback" };

export default async function InvitePage() {
  const user = await requireUser();
  const db = getDb();
  const [code, joined] = [await inviteCodeFor(db, user.id), await invitedCount(db, user.id)];
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  const origin = process.env.APP_URL?.trim().replace(/\/$/, "") || `${proto}://${host}`;
  const link = `${origin}/?invite=${code}`;
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Invite and feedback" />
      <Card className="p-6">
        <h2 className="font-display text-[1.625rem] leading-tight font-medium tracking-tight">Share LifeFlow with friends</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-2">Send your link. Friends who sign up show here.</p>
        <InviteShare link={link} firstName={user.name.split(" ")[0]} />
      </Card>
      <Card className="flex items-center justify-between gap-4 p-5">
        <span className="text-[0.9375rem] text-text-2">Friends who joined</span>
        <span className="tabular font-display text-[1.75rem] leading-none font-medium">{joined}</span>
      </Card>
      <FeedbackCard />
    </div>
  );
}
