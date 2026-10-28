import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { sniffMime } from "@/server/uploads";
import { processDocument, saveInboxFile } from "@/server/services/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_FILE = 8 * 1024 * 1024;

/** A photo, PDF or pasted text from the Inbox page or the phone's share sheet. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`inbox-upload:${user.id}`, 30, 3600);
    const form = await req.formData();
    const text = String(form.get("text") ?? "").slice(0, 20_000);
    const channel = form.get("channel") === "share" ? "share" : "upload";
    const raw = form
      .getAll("files")
      .filter((f): f is File => f instanceof File)
      .slice(0, 5);
    if (!raw.length && !text.trim()) throw new HttpError(400, "Add a photo, a PDF or some text.");
    const results = await withUser(user.id, async (s) => {
      const files: { filename: string; mimeType: string; base64: string }[] = [];
      const ids: string[] = [];
      for (const f of raw) {
        const data = Buffer.from(await f.arrayBuffer());
        const mime = sniffMime(data, f.name);
        if (data.length > MAX_FILE) throw new HttpError(413, `${f.name} is over 8 MB.`);
        if (!mime || !(mime === "application/pdf" || mime.startsWith("image/"))) throw new HttpError(415, `${f.name}: only photos and PDFs.`);
        ids.push(await saveInboxFile(s, { filename: f.name, mimeType: mime, data }));
        files.push({ filename: f.name, mimeType: mime, base64: data.toString("base64") });
      }
      return processDocument(s, user.timezone, todayIn(user.timezone), { channel, subject: raw[0]?.name ?? "Pasted text", text, files, attachmentIds: ids });
    });
    return NextResponse.json({
      ok: true,
      item: { id: results.id, status: results.status, summary: results.summary, reason: results.reason, filed: results.filed },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
