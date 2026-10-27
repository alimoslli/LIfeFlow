import { BookOpen, Split, Wallet } from "lucide-react";
import { Mark } from "@/components/shell/app-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 pt-10 pb-8 sm:px-10">
        <div className="flex items-center gap-2.5">
          <Mark className="h-9 w-9" />
          <span className="font-display text-[22px] font-medium tracking-tight">LifeFlow</span>
        </div>
        <div className="flex flex-1 items-center">
          <div className="animate-rise mx-auto w-full max-w-sm py-10">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">Your data stays private to your account.</p>
      </div>

      {/* Product preview on larger screens */}
      <aside className="relative hidden overflow-hidden bg-hero lg:block" aria-hidden>
        <svg viewBox="0 0 600 800" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-[0.10]">
          {Array.from({ length: 14 }, (_, i) => (
            <path key={i} d={`M-20 ${520 - i * 22} C 160 ${300 + i * 14}, 360 ${700 - i * 18}, 640 ${260 + i * 16}`} fill="none" stroke="white" strokeWidth="1.4" />
          ))}
        </svg>
        <div className="relative flex h-full flex-col justify-center px-14 xl:px-20">
          <p className="max-w-md font-display text-[44px] leading-[1.06] font-medium tracking-tight text-white">Your whole life, made simple.</p>
          <p className="mt-4 max-w-sm text-[15px] text-white/75">Every morning, LifeFlow tells you what matters — and Jarvis helps you handle it.</p>
          <div className="mt-10 flex max-w-md flex-col gap-3">
            <Preview icon={<Split className="h-[18px] w-[18px]" />} tone="bg-danger-soft text-danger" text="Your library shift overlaps Calculus on Thursday." action="Help me sort it out" />
            <Preview icon={<BookOpen className="h-[18px] w-[18px]" />} tone="bg-warning-soft text-warning" text="Psychology midterm is next Wednesday." action="Plan study time" />
            <Preview icon={<Wallet className="h-[18px] w-[18px]" />} tone="bg-success-soft text-success" text="You've spent 12% less than last month." />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Preview({ icon, tone, text, action }: { icon: React.ReactNode; tone: string; text: string; action?: string }) {
  return (
    <div className="flex gap-3.5 rounded-3xl bg-white/95 p-4 shadow-lift">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <div className="pt-1.5">
        <p className="text-[15px] leading-snug text-[#1b1a17]">{text}</p>
        {action && <p className="mt-2 text-sm font-medium text-[#2f5d50]">✦ {action}</p>}
      </div>
    </div>
  );
}
