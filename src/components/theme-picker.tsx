"use client";
import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, type Accent, type TextSize, type Theme } from "@/lib/theme";
import { setAccentAction, setTextSizeAction, setThemeAction } from "@/app/theme-actions";

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

const SWATCH: Record<Accent, string> = { green: "#2f5d50", blue: "#2f5fa8", purple: "#6a4fa3", pink: "#b0406f", orange: "#b4581f" };

/** The app's accent color. Applies instantly, then saves the choice on this device. */
export function AccentPicker({ initial }: { initial: Accent }) {
  const [accent, setAccent] = useState<Accent>(initial);
  const [, start] = useTransition();
  const choose = (a: Accent) => {
    setAccent(a);
    if (a === "green") document.documentElement.removeAttribute("data-accent");
    else document.documentElement.setAttribute("data-accent", a);
    start(() => setAccentAction(a));
  };
  return (
    <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-3">
      {ACCENTS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={accent === a}
          aria-label={a[0].toUpperCase() + a.slice(1)}
          onClick={() => choose(a)}
          className={cn("h-11 w-11 rounded-full ring-offset-2 ring-offset-bg transition-shadow", accent === a && "ring-2 ring-text")}
          style={{ background: SWATCH[a] }}
        />
      ))}
    </div>
  );
}

const SIZES: { value: TextSize; label: string; sample: string }[] = [
  { value: "default", label: "Default", sample: "text-[1rem]" },
  { value: "large", label: "Large", sample: "text-[1.125rem]" },
  { value: "xlarge", label: "Extra large", sample: "text-[1.25rem]" },
];

/** Text size for the whole app on this device. Applies instantly, then saves the choice. */
export function TextSizePicker({ initial }: { initial: TextSize }) {
  const [size, setSize] = useState<TextSize>(initial);
  const [, start] = useTransition();
  const choose = (t: TextSize) => {
    setSize(t);
    if (t === "default") document.documentElement.removeAttribute("data-text");
    else document.documentElement.setAttribute("data-text", t);
    start(() => setTextSizeAction(t));
  };
  return (
    <div role="radiogroup" aria-label="Text size" className="grid grid-cols-3 gap-2">
      {SIZES.map(({ value, label, sample }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={size === value}
          onClick={() => choose(value)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-sm transition-all",
            size === value ? "bg-hero text-hero-text shadow-lift" : "bg-surface-2 text-text-2 hover:text-text",
          )}
        >
          <span className={cn("font-display leading-none font-medium", sample)} aria-hidden>
            Aa
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}
