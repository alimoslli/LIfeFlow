import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-mark";
import { CloseButton } from "./close-button";

/** Public, readable layout for the Privacy Policy, Terms of Use and Academic integrity, with a close button (the installed app has no browser back). */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-20 sm:px-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href="/">
          <BrandLockup markClassName="h-9 w-9" />
        </Link>
        <div className="flex items-center gap-4">
          <nav className="hidden gap-4 text-sm text-muted sm:flex">
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <Link href="/integrity" className="hover:text-text">
              Academic integrity
            </Link>
          </nav>
          <CloseButton />
        </div>
      </header>
      <article className="legal">{children}</article>
    </div>
  );
}
