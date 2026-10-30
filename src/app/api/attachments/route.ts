import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { attachments } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { sniffMime } from "@/server/uploads";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;

/** Uploads a file for Jarvis. Type is decided by content sniffing, never trusted from the client. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`upload:${user.id}`, 40, 3600);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file provided");
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Files must be 5 MB or smaller");
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffMime(buf, file.name);
    if (!mime) throw new HttpError(415, "Unsupported file type. Use a PDF, a photo, or a text file.");
    if (!mime.startsWith("image/") && mime !== "application/pdf" && buf.length > MAX_TEXT_BYTES) throw new HttpError(413, "Text files must be 1 MB or smaller");
    const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "upload";
    const [row] = await withUser(user.id, (s) =>
      s.tx
        .insert(attachments)
        .values({
          userId: s.userId,
          filename,
          mimeType: mime,
          sizeBytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
          dataBase64: buf.toString("base64"),
        })
        .returning({ id: attachments.id, filename: attachments.filename, mimeType: attachments.mimeType }),
    );
    return NextResponse.json(row);
  } catch (e) {
    return errorResponse(e);
  }
}
