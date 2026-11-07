import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { AssistantScene } from "@/components/landing/assistant-scene";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 pt-10 pb-8 sm:px-10">
        <BrandLockup markClassName="h-10 w-10" priority />
        <div className="flex flex-1 items-center">
          <div className="animate-rise mx-auto w-full max-w-sm py-10">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">
          Your data stays private to your account. ·{" "}
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
        </p>
      </div>

      {/* Product preview on larger screens */}
      <aside className="relative hidden overflow-hidden bg-hero lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_21%,rgb(197_231_209_/_0.28),transparent_30%),radial-gradient(circle_at_14%_90%,rgb(244_218_169_/_0.18),transparent_40%)]" />
        <svg viewBox="0 0 600 800" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-[0.10]">
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M-20 ${520 - i * 22} C 160 ${300 + i * 14}, 360 ${700 - i * 18}, 640 ${260 + i * 16}`}
              fill="none"
              stroke="white"
              strokeWidth="1.4"
            />
          ))}
        </svg>
        <div className="relative flex h-full items-center justify-center px-10 pt-10 pb-20">
          <div className="w-full max-w-[340px]">
            <AssistantScene tone="hero" />
          </div>
        </div>
      </aside>
    </div>
  );
}
