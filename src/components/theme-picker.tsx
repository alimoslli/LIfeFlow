"use client";
import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";
import { setThemeAction } from "@/app/theme-actions";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Automatic", icon: Monitor },
];

/** Light / Dark / Automatic. Applies instantly, then saves the choice. */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [, start] = useTransition();
  const choose = (t: Theme) => {
    setTheme(t);
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    start(() => setThemeAction(t));
  };
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-sm transition-all",
            theme === value ? "bg-hero text-hero-text shadow-lift" : "bg-surface-2 text-text-2 hover:text-text",
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}
