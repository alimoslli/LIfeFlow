import { SignOutButton } from "@/components/pwa/sign-out-button";
import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-display text-[38px] leading-tight font-medium tracking-tight">You</h1>
        <SignOutButton />
      </div>
      <SettingsTabs />
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
