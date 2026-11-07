import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/require-admin";
import { NEW_KEY_COOKIE } from "../shared";

export const dynamic = "force-dynamic";

/** The page showed the new key once; this forgets it. A route (not an action) so the page isn't re-rendered under the owner's eyes. */
export async function POST() {
  await requireAdmin();
  (await cookies()).delete({ name: NEW_KEY_COOKIE, path: "/admin/hq" });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
