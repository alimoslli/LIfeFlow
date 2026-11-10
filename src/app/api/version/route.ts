import { NextResponse } from "next/server";
import { liveBuild } from "@/lib/app-version";

export const dynamic = "force-dynamic";

/**
 * Which build is live. An app left open can run an old copy for days (an installed app stays in memory, and the
 * shell and its scripts are only fetched on a full page load), so it asks here when it comes back to the front and
 * reloads itself when it is behind (components/pwa/app-updater.tsx). Public, and it says nothing about anyone.
 */
export function GET() {
  return NextResponse.json({ v: liveBuild() }, { headers: { "cache-control": "no-store" } });
}
