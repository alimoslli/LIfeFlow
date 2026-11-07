import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { authenticateHq, readLimitedBytes } from "@/server/hq/request";
import { HqError } from "@/server/hq/validate";
import { MAX_PREVIEW_BYTES, storePreview } from "@/server/services/hq-files";

export const dynamic = "force-dynamic";

/**
 * Uploads one preview picture for a decision card: the raw png, jpeg or webp bytes as the body (max 2 MB), never a URL.
 * Answers with the picture's id, which the request then lists in its previews. Authenticated by an HQ key (public route in proxy.ts).
 */
export async function POST(req: Request) {
  try {
    const key = await authenticateHq(req);
    await enforceRateLimit(`hq-files:${key.id}`, 120, 3600);
    const bytes = await readLimitedBytes(req, MAX_PREVIEW_BYTES);
    try {
      const f = await storePreview(getDb(), bytes, req.headers.get("content-type"));
      return NextResponse.json({ ok: true, id: f.id, contentType: f.contentType, size: f.size });
    } catch (e) {
      if (e instanceof HqError) throw new HttpError(400, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
