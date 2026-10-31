import type { Metadata } from "next";
import { assistantProfile } from "@/lib/assistant";
import { requireUser } from "@/server/auth/current-user";
import { jarvisSettings } from "@/server/services/proactive/engine";
import { updateAssistantAction } from "../actions";
import { AssistantCard } from "../memory/assistant-card";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Jarvis" };

export default async function JarvisSettings() {
  const u = await requireUser();
  const profile = assistantProfile(u.preferences);
  const s = jarvisSettings(u.preferences);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title={profile.name} />
      <AssistantCard
        profile={profile}
        settings={{
          frequency: s.frequency,
          quietStart: s.quietStart,
          quietEnd: s.quietEnd,
          topics: s.topics,
          autonomy: s.autonomy,
          avatar: s.avatar,
          learning: s.learning === true,
          pushLimit: s.pushLimit,
          answerLength: u.preferences?.jarvisTone ?? "balanced",
        }}
        action={updateAssistantAction}
      />
    </div>
  );
}
