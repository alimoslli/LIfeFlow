import { eq } from "drizzle-orm";
import { z } from "zod";
import { feedback } from "../db/schema";
import type { UserScope } from "../db/with-user";
import { emailConfig, sendEmail } from "../integrations/email";

/**
 * Beta feedback: always saved, and emailed to the owner (FEEDBACK_EMAIL, else ALERT_EMAIL,
 * else LEGAL_CONTACT_EMAIL) with the tester's address as reply-to, so a reply goes straight
 * to them. "Emailed" is only reported when the email provider confirms it.
 */
export const feedbackSchema = z.object({
  kind: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(3, "Tell us a little more").max(2000, "Keep it under 2,000 characters"),
});
const LABEL = { bug: "Bug", idea: "Idea", other: "Feedback" } as const;

export async function sendFeedback(
  scope: UserScope,
  from: { name: string; email: string },
  input: z.input<typeof feedbackSchema>,
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
) {
  const d = feedbackSchema.parse(input);
  const [row] = await scope.tx.insert(feedback).values({ userId: scope.userId, kind: d.kind, message: d.message }).returning({ id: feedback.id });
  const env = deps.env ?? process.env;
  const to = (env.FEEDBACK_EMAIL || env.ALERT_EMAIL || env.LEGAL_CONTACT_EMAIL)?.trim();
  const cfg = emailConfig(env);
  if (!to || !cfg) return { id: row.id, emailed: false };
  const firstLine = d.message.split("\n")[0].slice(0, 60);
  const text = `${d.message}\n\nFrom: ${from.name} <${from.email}> (reply to this email to answer them)`;
  try {
    await sendEmail(
      cfg,
      {
        to,
        subject: `LifeFlow ${LABEL[d.kind].toLowerCase()}: ${firstLine}`,
        text,
        html: `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
        replyTo: from.email,
      },
      deps.fetch,
    );
    await scope.tx.update(feedback).set({ emailedAt: new Date() }).where(eq(feedback.id, row.id));
    return { id: row.id, emailed: true };
  } catch {
    return { id: row.id, emailed: false }; // it's saved either way
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
