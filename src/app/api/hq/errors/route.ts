import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { authenticateHq } from "@/server/hq/request";
import { untrustedErrors } from "@/server/hq/untrusted";
import { listErrorGroups } from "@/server/services/hq";

export const dynamic = "force-dynamic";

/**
 * The app's error groups for Customer Success (ADR 0026): newest first, already scrubbed of personal details by
 * recordError. Nothing from feedback or the owner inbox is ever read here. Authenticated by an HQ key (public route in proxy.ts).
 */
export async function GET(req: Request) {
  try {
    await authenticateHq(req);
    const raw = Number(new URL(req.url).searchParams.get("limit"));
    const errors = await listErrorGroups(getDb(), Number.isFinite(raw) && raw > 0 ? raw : 50);
    return NextResponse.json(untrustedErrors(errors));
  } catch (e) {
    return errorResponse(e);
  }
}
