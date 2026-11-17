/**
 * Transactional email (password resets) through Resend's HTTP API.
 * Configured with RESEND_API_KEY and EMAIL_FROM; without them, nothing is
 * sent and callers say so. A send only counts as done when Resend returns an id.
 */

export type EmailConfig = { apiKey: string; from: string };

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export class EmailError extends Error {}

export async function sendEmail(
  cfg: EmailConfig,
  msg: { to: string; subject: string; text: string; html: string; replyTo?: string },
  fetchImpl: typeof fetch = fetch,
) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(msg.replyTo && { reply_to: msg.replyTo }) }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
  if (!res.ok || !json.id) {
    // Say why the provider refused (e.g. an unverified sending domain), so the error report names the cause. Callers record
    // this through recordError, which scrubs addresses, ids and tokens; the text is bounded here.
    const why = [json.name, json.message]
      .filter((x) => typeof x === "string" && x)
      .join(": ")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    throw new EmailError(`Email provider refused the message (HTTP ${res.status})${why ? `: ${why}` : ""}.`);
  }
  return { id: json.id };
}
