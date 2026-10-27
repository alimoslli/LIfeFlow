import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 font-display text-[32px] leading-tight font-medium tracking-tight">Settings</h1>
      <SettingsTabs />
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
