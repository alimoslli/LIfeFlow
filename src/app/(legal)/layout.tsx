import Link from "next/link";
import { Mark } from "@/components/shell/app-shell";

/** Public, readable layout for the Privacy Policy and Terms of Use. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 pb-20 sm:px-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" />
          <span className="font-display text-[20px] font-medium tracking-tight">LifeFlow</span>
        </Link>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-text">
            Terms
          </Link>
        </nav>
      </header>
      <article className="legal">{children}</article>
    </div>
  );
}
