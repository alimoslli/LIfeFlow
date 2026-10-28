import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { searchEverything } from "@/server/services/search";

export const dynamic = "force-dynamic";

/** Search across to-dos, notes, classes, assignments, events, transactions and goals (⌘K). */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`search:${user.id}`, 120, 60);
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ hits: await withUser(user.id, (s) => searchEverything(s, q)) });
  } catch (e) {
    return errorResponse(e);
  }
}
