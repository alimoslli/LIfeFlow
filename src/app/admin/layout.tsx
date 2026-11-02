import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/require-admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Owner-only (ADR 0022). Anyone else gets a 404. Pages and actions check again themselves. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[960px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 sm:px-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[1.625rem] leading-tight font-medium">LifeFlow admin</p>
          <p className="truncate text-xs text-muted">Signed in as {admin.email}</p>
        </div>
        <Link href="/" className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-sm text-text-2 hover:text-text">
          Back to app
        </Link>
      </header>
      {children}
    </div>
  );
}
