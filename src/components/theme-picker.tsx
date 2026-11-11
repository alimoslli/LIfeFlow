"use client";
import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { rememberOnDevice, TEXT_COOKIE, THEME_COOKIE, TODAY_COOKIE, type TextSize, type Theme, type TodayMode } from "@/lib/theme";
import { setTextSizeAction, setThemeAction, setTodayModeAction } from "@/app/theme-actions";

/** System is the default: the app follows the phone's own light or dark setting until you pick one. */
const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];
const BAR = { light: "#f6f8fb", dark: "#152643" };

/** System / Light / Dark. Applies instantly (page and the phone's status bar color), then saves the choice. */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [, start] = useTransition();
  const choose = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? BAR.dark : BAR.light));
    rememberOnDevice(THEME_COOKIE, t);
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
    rememberOnDevice(TEXT_COOKIE, t);
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

const MODES: { value: TodayMode; label: string; hint: string }[] = [
  { value: "full", label: "Full sky", hint: "The sky fills the top of the screen" },
  { value: "widget", label: "Widget", hint: "The sky sits in a card" },
];

/** How Today's sky is shown on this device. Saved on the device; Today uses it the next time it opens. */
export function TodayModePicker({ initial }: { initial: TodayMode }) {
  const [mode, setMode] = useState<TodayMode>(initial);
  const [, start] = useTransition();
  const choose = (m: TodayMode) => {
    setMode(m);
    rememberOnDevice(TODAY_COOKIE, m);
    start(() => setTodayModeAction(m));
  };
  return (
    <div role="radiogroup" aria-label="Today's sky" className="grid grid-cols-2 gap-2">
      {MODES.map(({ value, label, hint }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => choose(value)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left text-sm transition-all",
            mode === value ? "bg-hero text-hero-text shadow-lift" : "bg-surface-2 text-text-2 hover:text-text",
          )}
        >
          <span className="font-medium">{label}</span>
          <span className={cn("text-xs", mode === value ? "text-hero-text" : "text-muted")}>{hint}</span>
        </button>
      ))}
    </div>
  );
}
