import { LogOut } from "lucide-react";
import { logout } from "../../(auth)/actions";
import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 flex items-end justify-between">
        <h1 className="font-display text-[38px] leading-tight font-medium tracking-tight">You</h1>
        <form action={logout}>
          <button className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm text-text-2 shadow-soft hover:text-text">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
      <SettingsTabs />
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
