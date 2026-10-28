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

export async function sendEmail(cfg: EmailConfig, msg: { to: string; subject: string; text: string; html: string }, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok || !json.id) throw new EmailError(`Email provider refused the message (HTTP ${res.status}).`);
  return { id: json.id };
}
