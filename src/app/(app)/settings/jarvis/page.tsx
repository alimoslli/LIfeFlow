import type { Metadata } from "next";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { requireUser } from "@/server/auth/current-user";
import { jarvisSettings } from "@/server/services/proactive/engine";
import { setAiConsentAction, updateAssistantAction } from "../actions";
import { ActionButton } from "@/components/action-form";
import { Card } from "@/components/ui/surface";
import { aiAllowed } from "@/lib/ai-consent";
import { AssistantCard } from "../memory/assistant-card";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Assistant" };

export default async function JarvisSettings() {
  const u = await requireUser();
  const profile = assistantProfile(u.preferences);
  const who = nameAtStart(profile.name);
  const s = jarvisSettings(u.preferences);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title={who} />
      <Card className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="font-medium">Use AI</h2>
          <p className="mt-1 text-sm text-text-2">
            {who} sends your messages and the LifeFlow data it needs to answer to OpenAI. They don&apos;t use it to train their models.{" "}
            {aiAllowed(u.preferences) ? "Turn this off and nothing more is sent; the rest of LifeFlow keeps working." : "It's off, so nothing is sent."}
          </p>
        </div>
        <ActionButton
          action={setAiConsentAction.bind(null, !aiAllowed(u.preferences))}
          confirm={aiAllowed(u.preferences) ? `Turn off AI? ${who} won't be able to chat, text or file emails until you turn it back on.` : undefined}
          className={`flex min-h-11 items-center self-start rounded-full px-5 text-sm font-medium ${aiAllowed(u.preferences) ? "bg-surface-2 text-text" : "bg-accent text-accent-text"}`}
        >
          {aiAllowed(u.preferences) ? "Turn off" : "Allow"}
        </ActionButton>
      </Card>
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
