import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { enforceRateLimit } from "@/server/http";
import { sniffMime } from "@/server/uploads";
import { processDocument, saveInboxFile } from "@/server/services/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The phone's share sheet (installed app on Android/Chrome): shared photos, PDFs and text go to the Smart inbox. */
export async function POST(req: Request) {
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  const user = await getSessionUser();
  if (!user) return back("/login?next=/inbox");
  try {
    await enforceRateLimit(`inbox-upload:${user.id}`, 30, 3600);
    const form = await req.formData();
    const text = [form.get("title"), form.get("text"), form.get("url")]
      .filter((x) => typeof x === "string" && x)
      .join("\n")
      .slice(0, 20_000);
    const raw = form
      .getAll("files")
      .filter((f): f is File => f instanceof File)
      .slice(0, 5);
    await withUser(user.id, async (s) => {
      const files: { filename: string; mimeType: string; base64: string }[] = [];
      const ids: string[] = [];
      for (const f of raw) {
        const data = Buffer.from(await f.arrayBuffer());
        const mime = sniffMime(data, f.name);
        if (data.length > 8 * 1024 * 1024 || !mime || !(mime === "application/pdf" || mime.startsWith("image/"))) continue;
        ids.push(await saveInboxFile(s, { filename: f.name, mimeType: mime, data }));
        files.push({ filename: f.name, mimeType: mime, base64: data.toString("base64") });
      }
      if (files.length || text.trim())
        await processDocument(s, user.timezone, todayIn(user.timezone), {
          channel: "share",
          subject: raw[0]?.name ?? "Shared",
          text,
          files,
          attachmentIds: ids,
        });
    });
    return back("/inbox?shared=1");
  } catch {
    return back("/inbox?shared=0");
  }
}
