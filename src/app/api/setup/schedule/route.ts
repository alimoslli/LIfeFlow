import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { AI_CONSENT_NEEDED, aiAllowed } from "@/lib/ai-consent";
import { getSessionUser } from "@/server/auth/current-user";
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
    return NextResponse.json({ error: e instanceof ScheduleReadError ? e.message : "Couldn't read that picture. Try again." }, { status: 503 });
  }
}
