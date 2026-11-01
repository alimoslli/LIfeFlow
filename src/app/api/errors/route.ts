import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, errorResponse, HttpError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { recordError } from "@/server/services/error-reports";

export const dynamic = "force-dynamic";

const body = z.object({ message: z.string().min(1).max(2000), route: z.string().min(1).max(500), digest: z.string().max(64).nullish() });

/** Browser errors from the app (components/error-reporter.tsx). Same site only, rate limited. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid report");
    if (!(await rateLimit(getDb(), `errors:ip:${await clientIp()}`, 30, 3600)).allowed) return new NextResponse(null, { status: 204 });
    await recordError(getDb(), { source: "client", ...parsed.data });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
