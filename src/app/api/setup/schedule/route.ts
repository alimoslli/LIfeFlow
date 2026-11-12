import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { getSessionUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { recordError } from "@/server/services/error-reports";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { sniffMime } from "@/server/uploads";
import { readSchedulePhoto, ScheduleReadError } from "@/server/services/schedule-photo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_FILE = 8 * 1024 * 1024;

/**
 * Setup in the app: reads one photo or screenshot of a class or work schedule and answers with what it read, to be checked.
 * Nothing is saved and the picture isn't kept; saving is `saveSchedulePhotoAction`, after the person ticks what's right.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (!aiAllowed(user.preferences)) throw new HttpError(403, AI_CONSENT_NEEDED);
    await enforceRateLimit(`setup-schedule:${user.id}`, 20, 3600);
    // refused before the body is read: a picture's limit plus a little for the form around it
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FILE + 64 * 1024) throw new HttpError(413, "That picture is over 8 MB.");
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Add a photo or a screenshot of your schedule.");
    const data = Buffer.from(await file.arrayBuffer());
    if (data.length > MAX_FILE) throw new HttpError(413, "That picture is over 8 MB.");
    const mime = sniffMime(data, file.name);
    if (!mime || !(mime === "application/pdf" || mime.startsWith("image/"))) throw new HttpError(415, "Only a photo, a screenshot or a PDF.");
    const proposal = await readSchedulePhoto(
      { filename: file.name, mimeType: mime, base64: data.toString("base64"), today: todayIn(user.timezone || "UTC") },
      { userId: user.id, door: "upload" },
    );
    return NextResponse.json({ ok: true, proposal });
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    // an unexpected failure is recorded (fixed words and the kind of error only, nothing of the picture or the person's), and
    // the person still gets the calm line
    if (!(e instanceof ScheduleReadError))
      await recordError(getDb(), {
        source: "server",
        route: "setup.schedule",
        message: `Reading a schedule picture failed (${e instanceof Error ? e.name : "unknown"}).`,
      }).catch(() => {});
    return NextResponse.json({ error: e instanceof ScheduleReadError ? e.message : "Couldn't read that picture. Try again." }, { status: 503 });
  }
}
