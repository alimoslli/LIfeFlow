import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { sniffMime } from "@/server/uploads";
import { senderAuthenticated } from "@/server/services/inbox/email-auth";
import { isVerifiedSender, processDocument, recordIgnored, saveInboxFile, userForAddress } from "@/server/services/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type InboundEmail = {
  FromFull?: { Email?: string };
  From?: string;
  ToFull?: { Email?: string }[];
  CcFull?: { Email?: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: { Name: string; Value: string }[];
  Attachments?: { Name?: string; Content?: string; ContentType?: string }[];
};

const MAX_FILE = 8 * 1024 * 1024;
const strip = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

/**
 * Inbound email webhook (Postmark's inbound JSON format). The URL carries a
 * secret: https://<site>/api/inbox/email?key=<INBOX_WEBHOOK_SECRET>.
 * Mail is filed only when it's addressed to a user's forwarding address, comes
 * from one of their verified addresses, and passed SPF or DKIM.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.INBOX_WEBHOOK_SECRET ?? "";
    const key = new URL(req.url).searchParams.get("key") ?? "";
    if (!secret || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) throw new HttpError(401, "Unauthorized");
    const mail = (await req.json().catch(() => null)) as InboundEmail | null;
    if (!mail) throw new HttpError(400, "Invalid email");
    const db = getDb();
    const recipients = [mail.OriginalRecipient, ...(mail.ToFull ?? []).map((t) => t.Email), ...(mail.CcFull ?? []).map((t) => t.Email)].filter(
      (x): x is string => !!x,
    );
    let user = null;
    for (const r of recipients) if ((user = await userForAddress(db, r))) break;
    // Unknown address: accept and drop, so senders can't probe which addresses exist.
    if (!user) return NextResponse.json({ ok: true });
    const from = (mail.FromFull?.Email ?? mail.From ?? "").trim().toLowerCase();
    const subject = (mail.Subject ?? "").slice(0, 300);
    const today = todayIn(user.timezone);
    await withUser(user.id, async (s) => {
      if (!(await isVerifiedSender(s, from))) return recordIgnored(s, from, subject, "Not from one of your verified addresses. Add it in the Inbox settings.");
      if (!senderAuthenticated(mail.Headers ?? [], from))
        return recordIgnored(s, from, subject, "The sending server couldn't prove it was really this address (SPF/DKIM failed).");
      const files: { filename: string; mimeType: string; base64: string }[] = [];
      const ids: string[] = [];
      for (const a of (mail.Attachments ?? []).slice(0, 5)) {
        if (!a.Content) continue;
        const data = Buffer.from(a.Content, "base64");
        const mime = sniffMime(data, a.Name ?? "file");
        if (data.length > MAX_FILE || !mime || !(mime === "application/pdf" || mime.startsWith("image/"))) continue;
        ids.push(await saveInboxFile(s, { filename: a.Name ?? "file", mimeType: mime, data }));
        files.push({ filename: a.Name ?? "file", mimeType: mime, base64: a.Content });
      }
      const text = mail.TextBody?.trim() || strip(mail.HtmlBody ?? "");
      await processDocument(s, user.timezone, today, { channel: "email", from, subject, text, files, attachmentIds: ids });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
